// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — the voice brain.
//
// The server half of the voice loop. The browser hears the wake phrase,
// transcribes speech, and posts the text here; this decides what to do and
// returns a sentence to speak back.
//
// WRITTEN FOR THE EAR, NOT THE EYE. Everything about this file follows from one
// fact: the owner is standing in a driveway holding a polisher, listening. So —
//   • a fast, small model (VOICE_MODEL), because latency is the whole experience;
//   • hard brevity rules, because a spoken paragraph cannot be skimmed;
//   • no markdown, no lists, no numbers read as digit soup;
//   • long work is DELEGATED and acknowledged in one sentence, never performed
//     while the owner waits.
//
// Jarvis answers directly when it can do so in one or two tool calls, and hands
// off to a specialist agent when the work is real. It is a concierge, not a
// ninth agent — it has no scheduled work and no task kinds of its own.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { getDb, nowIso } from '../db';
import { User } from '../models';
import { business } from '../business';
import { fmtDate, today } from './time';
import { ensureJarvisSchema } from './schema';
import { VOICE_MODEL, WAKE_PHRASE } from './config';
import { runAgentLoop } from './llm';
import { makeExecutor, toolDefinitions } from './tools';
import { pinnedMemory, renderMemories } from './memory';
import { allAgents } from './registry';
import { ensureAgentsRegistered } from './agents';
import { log } from './logs';
import { pendingCount } from './approvals';
import { queueDepth } from './queue';

/**
 * Tools available while the owner waits. Deliberately the fast read-only ones
 * plus the two that end a turn cleanly: `delegate_task` for real work, and
 * `save_memory` for "remember that…".
 *
 * `request_action` is NOT here. Composing a customer email is not a
 * conversational turn, and a spoken instruction is far too easy to
 * mis-transcribe to be one tool call away from a real send.
 */
const VOICE_TOOLS = [
  'business_snapshot',
  'revenue_report',
  'list_appointments',
  'list_customers',
  'get_customer',
  'service_catalogue',
  'employee_performance',
  'recent_leads',
  'search_memory',
  'save_memory',
  'delegate_task',
];

/**
 * Kept tight on purpose. Every extra round trip is another second of the owner
 * standing there in silence; past this, the honest move is to hand off.
 */
const VOICE_MAX_STEPS = 4;

export interface VoiceTurn {
  /** What Jarvis says out loud. */
  reply: string;
  /** Set when the turn produced a task. */
  taskId?: string;
  agent?: string;
  tokens: number;
  durationMs: number;
}

function systemPrompt(): string {
  ensureAgentsRegistered();

  const roster = allAgents()
    .map((a) => `- ${a.name}: ${a.purpose}\n  can do: ${Object.keys(a.tasks).join(', ')}`)
    .join('\n');

  const memories = pinnedMemory();

  return `You are Jarvis, the voice of ${business.name}. You are speaking with the owner.

Today is ${fmtDate(today())}.

## YOU ARE BEING LISTENED TO, NOT READ
Your reply is spoken aloud by a text-to-speech voice. That governs everything:

- One to three sentences. Almost never more. If the honest answer is long,
  give the headline and offer the detail: "Revenue's about forty-two hundred
  this month, up from last. Want the breakdown?"
- No markdown. No bullet points, no asterisks, no headings, no numbered lists.
  They are read aloud as punctuation and sound like nonsense.
- Speak numbers the way a person would. "About forty-two hundred dollars", not
  "$4,183.00". "Just under twenty percent", not "19.7%". Round. Being listenable
  matters more than being exact to the cent — offer the exact figure if asked.
- No preamble. Never "Certainly!", never "I'd be happy to help", never repeat
  the question back. Answer it.
- Names and times spoken naturally: "Tuesday at ten", not "2026-07-28T10:00:00".

## WHAT TO DO WITH A REQUEST
Decide between three things.

1. ANSWER IT YOURSELF — if one or two tool calls will do it. Anything about
   today's numbers, the schedule, a customer, or a price. Just look it up and
   say the answer.

2. HAND IT OFF — if it is real work: writing, campaigns, analysis, audits,
   customer messages. Use \`delegate_task\` with the right agent and a brief
   that captures what the owner actually asked for, in their words. Then say
   ONE sentence confirming it: "I've put the Content Agent on a blog post about
   winter prep — I'll have it for you shortly." Do not describe the work you
   are about to have done. Do not list steps.

3. ASK — if you genuinely cannot tell what they meant. One short question.
   Prefer a sensible assumption over an interrogation; you can be corrected.

The agents you can hand work to:
${roster}

## SPEECH RECOGNITION IS IMPERFECT
The words you receive came from a microphone and may be wrong. Detailing terms
get mangled — "ceramic coating" may arrive as "ceramic coding", a customer's
name may be misspelt. Infer what was obviously meant and carry on.

But if a misheard word would change something that matters — a name on a
message, a price, an amount of money — confirm it before acting. Never guess at
a detail you are about to act on.

## WHAT YOU MUST NOT DO
- Never state a price you did not read from \`service_catalogue\`.
- Never state a revenue figure you did not read from a tool.
- Never send anything to a customer from a voice turn. If the owner asks you to
  message someone, hand it to the comms agent to draft, and say it will be
  waiting for their approval.
- Never claim you did something you only queued.

## WHAT YOU KNOW ABOUT THIS BUSINESS
${memories.length ? renderMemories(memories) : '(Nothing recorded yet — if the owner tells you how they want things done, save it.)'}

If the owner states a preference, a goal, or a fact about the business, save it
with \`save_memory\` and confirm in a few words: "Got it, I'll remember that."`;
}

/**
 * Handle one spoken turn. Never throws — a voice interface that returns a 500
 * is a voice interface that goes silent, which is indistinguishable from broken
 * hardware to someone standing across the shop.
 */
export async function ask(input: {
  transcript: string;
  user: User;
  /** Prior turns, oldest first, for pronoun resolution ("what about last month?"). */
  history?: { role: 'user' | 'assistant'; content: string }[];
}): Promise<VoiceTurn> {
  ensureJarvisSchema();
  ensureAgentsRegistered();

  const started = Date.now();
  const transcript = input.transcript.trim().slice(0, 2000);

  if (!transcript) {
    return { reply: "I didn't catch that.", tokens: 0, durationMs: 0 };
  }

  // Answered locally: no model call, no latency, and correct even with no API
  // key configured. These are the questions asked most often.
  const quick = quickAnswer(transcript);
  if (quick) {
    record({ userId: input.user.id, transcript, reply: quick, intent: 'quick', durationMs: Date.now() - started });
    return { reply: quick, tokens: 0, durationMs: Date.now() - started };
  }

  interface Delegation {
    taskId: string;
    agent: string;
  }
  // Held in a box rather than a bare `let`: the assignment happens inside the
  // executor closure below, which TypeScript's control-flow analysis cannot
  // see, so a plain variable stays narrowed to `null` at every later read.
  const delegation: { current: Delegation | null } = { current: null };

  const executor = makeExecutor(VOICE_TOOLS, {
    agent: 'jarvis',
    taskId: null,
    // Voice can reach every agent — it is the owner speaking, and the owner may
    // ask for anything.
    canDelegateTo: allAgents().map((a) => a.name),
  });

  const result = await runAgentLoop({
    system: systemPrompt(),
    prompt: buildTurn(transcript, input.history ?? []),
    tools: toolDefinitions(VOICE_TOOLS),
    model: VOICE_MODEL(),
    maxSteps: VOICE_MAX_STEPS,
    maxTokens: 600,
    execute: async (name, args) => {
      const output = await executor(name, args);
      if (name === 'delegate_task') {
        // Captured for the UI, which links the spoken confirmation to the task
        // it created. Parsed from the tool's own text so there is one source of
        // truth for whether the delegation actually happened.
        const match = /task ([0-9a-f-]{36})/i.exec(output);
        const agent = typeof args.agent === 'string' ? args.agent : '';
        if (match) delegation.current = { taskId: match[1], agent };
      }
      return output;
    },
  });

  const durationMs = Date.now() - started;

  if (!result.ok || !result.text.trim()) {
    const reply = result.error?.includes('ANTHROPIC_API_KEY')
      ? "I can't think right now — my API key isn't set up. Everything else still works."
      : "Something went wrong on my end. Try me again.";
    log({ agent: 'jarvis', level: 'error', message: 'Voice turn failed', meta: { error: result.error } });
    record({ userId: input.user.id, transcript, reply, intent: 'error', durationMs });
    return { reply, tokens: result.tokens, durationMs };
  }

  const reply = speakable(result.text);

  record({
    userId: input.user.id,
    transcript,
    reply,
    intent: delegation.current ? 'delegate' : 'answer',
    agent: delegation.current?.agent,
    taskId: delegation.current?.taskId,
    durationMs,
  });

  return {
    reply,
    taskId: delegation.current?.taskId,
    agent: delegation.current?.agent,
    tokens: result.tokens,
    durationMs,
  };
}

function buildTurn(transcript: string, history: { role: string; content: string }[]): string {
  if (!history.length) return transcript;

  // Only the last few turns. A voice conversation that carries twenty turns of
  // context costs more per turn and answers no better.
  const recent = history.slice(-6);
  return [
    'Earlier in this conversation:',
    ...recent.map((h) => `${h.role === 'user' ? 'Owner' : 'You'}: ${h.content}`),
    '',
    `Owner now says: ${transcript}`,
  ].join('\n');
}

/**
 * Strip anything that would be read aloud as punctuation soup. The prompt asks
 * the model not to produce markdown; this guarantees it, because one stray
 * asterisk spoken as "asterisk" undermines the whole illusion.
 */
function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_#`]/g, '')
    .replace(/^\s*[-•]\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Questions worth answering without a model call. Each pattern is deliberately
 * narrow — a false match here would answer a different question than the one
 * asked, which is worse than being slow.
 */
function quickAnswer(transcript: string): string | null {
  const t = transcript.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  if (/^(are you there|you there|jarvis|hello|hey|hi)$/.test(t)) {
    return 'I\'m here.';
  }
  if (/^(thanks|thank you|cheers|nice one|got it)( jarvis)?$/.test(t)) {
    return 'Anytime.';
  }
  if (/\b(stop|never mind|nevermind|cancel that|forget it)\b/.test(t) && t.split(' ').length <= 3) {
    return 'Okay.';
  }
  if (/what (can you do|do you do)|what are your (capabilities|agents)/.test(t)) {
    return 'I can tell you how the business is doing, look up customers and the schedule, and put my agents on marketing, content, customer messages, SEO, leads, analytics, and operations. Just ask.';
  }
  if (/how many (things|items)? ?(are )?(waiting|pending)|what needs (my )?approval/.test(t)) {
    const pending = pendingCount();
    return pending === 0
      ? 'Nothing needs your approval right now.'
      : `${pending} ${pending === 1 ? 'item is' : 'items are'} waiting for your approval.`;
  }
  if (/what.{0,15}(working on|in the queue|queued)/.test(t)) {
    const depth = queueDepth();
    if (depth.running === 0 && depth.queued === 0) {
      return `Nothing running. ${depth.doneToday} ${depth.doneToday === 1 ? 'task' : 'tasks'} finished today.`;
    }
    return `${depth.running} running, ${depth.queued} queued, ${depth.doneToday} done today.`;
  }

  return null;
}

// ── Transcript log ───────────────────────────────────────────────────────────

function record(input: {
  userId: string;
  transcript: string;
  reply: string;
  intent: string;
  agent?: string;
  taskId?: string;
  durationMs: number;
}): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO jarvis_voice (id, user_id, transcript, intent, agent, task_id, reply, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        input.userId,
        input.transcript,
        input.intent,
        input.agent ?? '',
        input.taskId ?? null,
        input.reply,
        input.durationMs,
        nowIso()
      );
  } catch (e) {
    console.error('[jarvis/voice] failed to record turn', e);
  }
}

export interface VoiceRecord {
  id: string;
  transcript: string;
  reply: string;
  intent: string;
  agent: string;
  taskId: string | null;
  createdAt: string;
}

export function recentVoiceTurns(limit = 30): VoiceRecord[] {
  ensureJarvisSchema();
  const rows = getDb()
    .prepare(`SELECT * FROM jarvis_voice ORDER BY created_at DESC LIMIT ?`)
    .all(Math.min(limit, 200)) as Record<string, any>[];
  return rows.map((r) => ({
    id: r.id,
    transcript: r.transcript,
    reply: r.reply,
    intent: r.intent,
    agent: r.agent,
    taskId: r.task_id,
    createdAt: r.created_at,
  }));
}

/** Exposed to the client so the wake phrase is configured in exactly one place. */
export const wakePhrase = WAKE_PHRASE;
