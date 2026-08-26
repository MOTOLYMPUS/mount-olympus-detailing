// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — the agent reasoning loop.
//
// Claude over the Messages API with tool use, called with plain `fetch` exactly
// as lib/ai.ts and lib/notify.ts call their providers. No SDK: one fewer
// dependency to keep current, and the request shape is visible in this file
// rather than behind an abstraction.
//
// HOW THIS DIFFERS FROM lib/ai.ts. That file answers one customer question in
// one round trip. This one runs a multi-step loop: the model calls tools, reads
// results, and calls more tools until it has an answer. That difference is why
// the two are not merged — the failure modes, cost profile, and safety
// requirements have almost nothing in common.
//
// EVERY LOOP IS BOUNDED. Three independent ceilings, because an unbounded agent
// loop is both a runaway bill and an infinite task:
//   • MAX_STEPS      — tool round trips per run
//   • MAX_TOKENS     — output tokens per round trip
//   • TIMEOUT_MS     — wall clock for a single HTTP call
//
// Required env vars:
//   ANTHROPIC_API_KEY  — without it, runAgentLoop reports a clean failure and
//                        the orchestrator surfaces "AI is not configured"
//   JARVIS_MODEL       — optional override, see config.ts
// ─────────────────────────────────────────────────────────────────────────────

import { AGENT_MODEL } from './config';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Tool round trips. Past this, a task is stuck rather than thorough. */
const MAX_STEPS = 12;
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 120_000;

/** Retries apply only to 429 and 5xx — a 400 will fail identically forever. */
const MAX_RETRIES = 3;

const apiKey = () => process.env.ANTHROPIC_API_KEY?.trim();

export function llmConfigured(): boolean {
  return !!apiKey();
}

// ── Wire types ───────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface TokenUsage {
  input: number;
  output: number;
  get total(): number;
}

// ── Tool execution contract ──────────────────────────────────────────────────

/**
 * A tool's implementation. Returning a string keeps the contract narrow: the
 * model reads text, so a tool that wants to return structure serialises it
 * itself and controls exactly how it reads.
 */
export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>
) => Promise<string> | string;

export interface AgentLoopInput {
  system: string;
  /** Opening user turn — the task, rendered. */
  prompt: string;
  tools?: ToolDefinition[];
  execute?: ToolExecutor;
  model?: string;
  maxSteps?: number;
  maxTokens?: number;
  /** Called after each step. Used by the orchestrator to extend a task lease. */
  onStep?: (step: number) => void;
  /** Aborts the loop between steps — cooperative cancellation. */
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  ok: boolean;
  /** The model's final prose. Empty when the loop failed. */
  text: string;
  /** Every tool call made, in order — the audit trail for what an agent did. */
  toolCalls: { name: string; input: Record<string, unknown>; output: string; isError: boolean }[];
  tokens: number;
  steps: number;
  error?: string;
  /** True when the loop hit MAX_STEPS with the model still wanting to continue. */
  truncated?: boolean;
}

// ── The loop ─────────────────────────────────────────────────────────────────

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentLoopResult> {
  const empty: AgentLoopResult = { ok: false, text: '', toolCalls: [], tokens: 0, steps: 0 };

  if (!apiKey()) {
    return {
      ...empty,
      error:
        'ANTHROPIC_API_KEY is not set. Jarvis can queue and schedule work, but agents cannot reason without it.',
    };
  }

  const maxSteps = input.maxSteps ?? MAX_STEPS;
  const messages: ApiMessage[] = [{ role: 'user', content: input.prompt }];
  const toolCalls: AgentLoopResult['toolCalls'] = [];
  let tokens = 0;
  let finalText = '';

  for (let step = 1; step <= maxSteps; step++) {
    if (input.signal?.aborted) {
      return { ...empty, toolCalls, tokens, steps: step - 1, error: 'Cancelled' };
    }
    input.onStep?.(step);

    let response: ApiResponse;
    try {
      response = await callApi({
        model: input.model ?? AGENT_MODEL(),
        system: input.system,
        messages,
        tools: input.tools ?? [],
        maxTokens: input.maxTokens ?? MAX_TOKENS,
      });
    } catch (e) {
      return {
        ...empty,
        toolCalls,
        tokens,
        steps: step - 1,
        error: e instanceof Error ? e.message : 'Model call failed',
      };
    }

    tokens += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    const blocks = response.content ?? [];
    const text = blocks
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (text) finalText = text;

    const requests = blocks.filter(
      (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use'
    );

    // No tools requested — the model is done and `finalText` is the answer.
    if (response.stop_reason !== 'tool_use' || requests.length === 0) {
      return { ok: true, text: finalText, toolCalls, tokens, steps: step };
    }

    messages.push({ role: 'assistant', content: blocks });

    // Tools run sequentially, not in parallel. Several of them write to the
    // database, and a deterministic order makes a replayed log actually
    // reproduce what happened.
    const results: ContentBlock[] = [];
    for (const request of requests) {
      let output: string;
      let isError = false;
      try {
        output = input.execute
          ? await input.execute(request.name, request.input ?? {})
          : `No executor is registered for tool "${request.name}".`;
      } catch (e) {
        // A thrown tool is reported back to the model rather than killing the
        // run: "that failed, try something else" is usually recoverable, and a
        // hard failure here would discard all prior work in the loop.
        isError = true;
        output = `Tool error: ${e instanceof Error ? e.message : String(e)}`;
      }

      const trimmed = truncate(output, 24_000);
      toolCalls.push({ name: request.name, input: request.input ?? {}, output: trimmed, isError });
      results.push({
        type: 'tool_result',
        tool_use_id: request.id,
        content: trimmed,
        ...(isError ? { is_error: true } : {}),
      });
    }

    messages.push({ role: 'user', content: results });
  }

  // Ran out of steps. Partial work is still returned — an agent that gathered
  // eight useful findings and then hit the ceiling should not report nothing.
  return {
    ok: true,
    text: finalText,
    toolCalls,
    tokens,
    steps: maxSteps,
    truncated: true,
  };
}

/**
 * A single-shot call with no tools. Used by the voice router and by agents that
 * only need the model to write, not to investigate.
 */
export async function runPrompt(
  system: string,
  prompt: string,
  opts: { model?: string; maxTokens?: number } = {}
): Promise<{ ok: boolean; text: string; tokens: number; error?: string }> {
  const result = await runAgentLoop({
    system,
    prompt,
    model: opts.model,
    maxTokens: opts.maxTokens,
    maxSteps: 1,
  });
  return { ok: result.ok, text: result.text, tokens: result.tokens, error: result.error };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  content?: ContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

async function callApi(args: {
  model: string;
  system: string;
  messages: ApiMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
}): Promise<ApiResponse> {
  let lastError = 'Model call failed';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey()!,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: args.model,
          max_tokens: args.maxTokens,
          system: args.system,
          messages: args.messages,
          ...(args.tools.length ? { tools: args.tools } : {}),
        }),
        signal: controller.signal,
      });

      if (res.ok) return (await res.json()) as ApiResponse;

      const body = await res.text();
      lastError = `Model API ${res.status}: ${body.slice(0, 300)}`;

      // 4xx other than rate limiting is a bug in the request; retrying it just
      // spends the same money to get the same error.
      if (res.status !== 429 && res.status < 500) throw new Error(lastError);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        lastError = `Model call timed out after ${TIMEOUT_MS / 1000}s`;
      } else if (e instanceof Error && e.message.startsWith('Model API 4')) {
        throw e; // non-retryable, already shaped
      } else if (e instanceof Error) {
        lastError = e.message;
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempt < MAX_RETRIES) {
      // 1s, 2s — jittered so a burst of agents retrying does not resynchronise
      // into a second thundering herd against the same rate limit.
      const delay = 1000 * attempt + Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error(lastError);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} characters]`;
}
