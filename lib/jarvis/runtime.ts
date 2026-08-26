// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — running one task.
//
// The bridge between a queue row and a model call. Every agent runs through this
// function; none of them has execution logic of its own. That is why a new agent
// needs no runtime work, and why a change to how tool access is enforced applies
// to all eight at once.
//
// The sequence, and why each step is where it is:
//   1. Resolve the agent + task kind          — an unknown kind is a permanent
//                                               failure, not something to retry
//   2. Check the agent is enabled             — the owner's off switch, honoured
//                                               before a single token is spent
//   3. Build the prompt from live data        — memory read now, not at boot
//   4. Run the loop with a scoped executor    — tool access enforced per run
//   5. Record result, tokens, health          — even on failure, especially then
// ─────────────────────────────────────────────────────────────────────────────

import { agentEnabled } from './config';
import { runAgentLoop } from './llm';
import { AgentDefinition, buildAgentSystemPrompt, getAgent } from './registry';
import { JarvisTask, complete, fail, heartbeat } from './queue';
import { log, recordAgentRun } from './logs';
import { makeExecutor, toolDefinitions } from './tools';
import { ensureAgentsRegistered } from './agents';

export interface RunOutcome {
  ok: boolean;
  summary: string;
  tokens: number;
  error?: string;
}

/**
 * Execute a claimed task to completion, updating the queue as it goes.
 *
 * Never throws. The orchestrator's loop must survive any single task, including
 * one that fails in a way nobody anticipated — an exception escaping here would
 * take down the tick and strand every other queued task behind it.
 */
export async function runTask(task: JarvisTask, signal?: AbortSignal): Promise<RunOutcome> {
  ensureAgentsRegistered();

  const agent = getAgent(task.agent);
  if (!agent) {
    // Permanently unrunnable: retries cannot conjure a missing agent. Failing
    // it out to max attempts immediately avoids three pointless retry cycles.
    const error = `No agent named "${task.agent}" is registered.`;
    fail(task.id, error);
    return { ok: false, summary: '', tokens: 0, error };
  }

  if (!agentEnabled(agent.name)) {
    const error = `The ${agent.label} is switched off. Turn it back on in Jarvis settings to run this.`;
    fail(task.id, error);
    return { ok: false, summary: '', tokens: 0, error };
  }

  const kind = agent.tasks[task.kind];
  if (!kind) {
    const error = `${agent.label} does not know how to do "${task.kind}". Known kinds: ${Object.keys(
      agent.tasks
    ).join(', ')}.`;
    fail(task.id, error);
    return { ok: false, summary: '', tokens: 0, error };
  }

  log({ taskId: task.id, agent: agent.name, level: 'info', message: `Running: ${task.title}` });

  const started = Date.now();
  const result = await runAgentLoop({
    system: buildAgentSystemPrompt(agent),
    prompt: buildBrief(agent, task, kind.brief(task.input)),
    tools: toolDefinitions(agent.tools),
    execute: makeExecutor(agent.tools, {
      agent: agent.name,
      taskId: task.id,
      canDelegateTo: agent.delegatesTo ?? [],
    }),
    maxSteps: agent.maxSteps,
    signal,
    // A long research run can outlive its lease; each step pushes the lease out
    // so the reaper does not hand a live task to a second worker.
    onStep: () => heartbeat(task.id),
  });

  const tokens = result.tokens;
  const durationMs = Date.now() - started;

  if (!result.ok) {
    const error = result.error ?? 'The agent run failed for an unknown reason.';
    fail(task.id, error, { tokens });
    recordAgentRun(agent.name, { ok: false, error, tokens });
    return { ok: false, summary: '', tokens, error };
  }

  // A loop that ends with no prose has done nothing useful, even if every tool
  // call succeeded. Treating it as success would put an empty report in front of
  // the owner and mark the work done.
  if (!result.text.trim()) {
    const error = 'The agent finished without producing a report.';
    fail(task.id, error, { tokens });
    recordAgentRun(agent.name, { ok: false, error, tokens });
    return { ok: false, summary: '', tokens, error };
  }

  complete(
    task.id,
    {
      summary: result.text,
      steps: result.steps,
      truncated: result.truncated ?? false,
      // Tool names only — full arguments would put drafted customer emails into
      // the task result, where they would be duplicated in every dashboard read.
      toolsUsed: result.toolCalls.map((c) => c.name),
      durationMs,
    },
    { tokens }
  );
  recordAgentRun(agent.name, { ok: true, tokens });

  if (result.truncated) {
    log({
      taskId: task.id,
      agent: agent.name,
      level: 'warn',
      message: 'Hit the step limit — the report may be incomplete.',
    });
  }

  return { ok: true, summary: result.text, tokens };
}

/**
 * The opening user turn: the task kind's brief, plus anything the owner said
 * when they queued it.
 *
 * The owner's own words are appended verbatim and labelled, rather than merged
 * into the brief, so a spoken instruction ("keep it short, we're slammed this
 * week") is never lost inside a template.
 */
function buildBrief(agent: AgentDefinition, task: JarvisTask, brief: string): string {
  const parts = [brief];

  const from = typeof task.input.from === 'string' ? task.input.from : null;
  if (from && from !== agent.name) {
    parts.push(`\n---\nThis was handed to you by the ${from} agent.`);
  }

  const spoken = typeof task.input.spokenRequest === 'string' ? task.input.spokenRequest : null;
  if (spoken) {
    parts.push(
      `\n---\nThe owner asked for this out loud, in these words:\n"${spoken}"\n` +
        `Answer what they actually asked. If their words conflict with the brief above, follow their words.`
    );
  }

  const notes = typeof task.input.notes === 'string' ? task.input.notes : null;
  if (notes) parts.push(`\n---\nAdditional notes from the owner:\n${notes}`);

  return parts.join('\n');
}
