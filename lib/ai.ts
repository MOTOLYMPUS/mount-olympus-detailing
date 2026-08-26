// ─────────────────────────────────────────────────────────────────────────────
// The AI detailing assistant — Claude, over the Messages API.
//
// Called with plain `fetch` against https://api.anthropic.com/v1/messages, the
// same way lib/notify.ts calls Resend and Twilio. No SDK, no dependency.
//
// GRACEFUL DEGRADATION (mirrors lib/notify.ts): with ANTHROPIC_API_KEY absent
// the assistant does not throw and does not 500 — it returns a canned reply
// pointing the customer at the phone number and the estimate form. A missing
// key degrades the feature, it never breaks the page.
//
// THE WHOLE POINT OF buildSystemPrompt(): the prompt is assembled AT RUNTIME
// from data/pricing and lib/industries, so every number the assistant quotes
// comes from the app's own price tables. A model quoting detailing prices from
// memory would be confidently wrong and the business would have to honour it.
// When the tables change, the prompt changes with them — there is no second
// copy of the price list to drift.
//
// Required env vars:
//   ANTHROPIC_API_KEY                       (without it: canned fallback)
//   ANTHROPIC_MODEL   — optional override, defaults to claude-sonnet-5
// ─────────────────────────────────────────────────────────────────────────────

import { allAddOns, allServices, pricingIsPlaceholder } from '@/data/pricing';
import { business } from './business';
import { industryList, sizeLabel } from './industries';
import { formatHours, formatPrice } from './pricing';
import { User } from './models';
import { markEscalated } from './repo/assistant';
import { sendEscalation } from './notify-account';
import { Industry, ServiceDef } from './types';

// ── Config ───────────────────────────────────────────────────────────────────

const apiKey = () => process.env.ANTHROPIC_API_KEY?.trim();

/** Current model id. Overridable so a model bump needs no code change. */
const MODEL = () => process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Hard ceiling on the reply. A chat answer that needs more is the wrong shape. */
const MAX_TOKENS = 1024;

/**
 * Only the last N turns are sent. Without a cap, a long-lived conversation
 * re-sends its entire history on every message and the per-message cost grows
 * without bound — this is the single biggest cost control in the file.
 */
const MAX_HISTORY_MESSAGES = 20;

/** Wall-clock budget for one call. Past this the customer would have given up. */
const TIMEOUT_MS = 30_000;

export function aiConfigured(): boolean {
  return !!apiKey();
}

// ── Escalation token ─────────────────────────────────────────────────────────

/**
 * The model emits this bare token on its own line when it cannot answer
 * confidently. A sentinel token rather than tool-use because it needs no extra
 * round trip and degrades safely: if the model never emits it, the customer
 * still gets a normal answer.
 */
const ESCALATE_TOKEN = '[[ESCALATE]]';

/** Strip the token (and the blank line it leaves) from what the customer sees. */
function stripEscalationToken(reply: string): string {
  return reply
    .split('\n')
    .filter((line) => line.trim() !== ESCALATE_TOKEN)
    .join('\n')
    .replace(/\[\[ESCALATE\]\]/g, '') // belt and braces: mid-line emission
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── System prompt, built from the real catalogue ─────────────────────────────

function describeService(svc: ServiceDef): string {
  const lines: string[] = [];
  lines.push(`  - ${svc.name} (id: ${svc.id})`);
  lines.push(`    ${svc.shortDescription}`);
  if (svc.includes?.length) {
    lines.push(`    Includes: ${svc.includes.join('; ')}`);
  }
  lines.push(`    Estimated time: ${formatHours(svc.estimatedHours)}`);

  // Price PER SIZE CLASS. A service with no entry for a size is not offered at
  // that size at all (see lib/pricing.ts) — say so rather than implying a price.
  const priceParts = Object.entries(svc.prices).map(
    ([size, price]) => `${sizeLabel(size as never)}: ${formatPrice(price.price, price.priceMax)}`
  );
  lines.push(
    priceParts.length
      ? `    Price by size — ${priceParts.join(' | ')}`
      : `    Price: not published for any size — must be quoted in person`
  );
  if (svc.addOnIds?.length) {
    lines.push(`    Available add-ons: ${svc.addOnIds.join(', ')}`);
  }
  return lines.join('\n');
}

function describeIndustry(industry: Industry): string {
  const cfg = industryList.find((i) => i.id === industry)!;
  const services = allServices.filter((s) => s.industry === industry);
  const addOns = allAddOns.filter((a) => a.industry === industry);

  const out: string[] = [];
  out.push(`### ${cfg.label} (${cfg.nounPlural})`);
  out.push(`Categories we serve: ${cfg.vehicleTypes.map((t) => t.label).join(', ')}.`);
  out.push(`${cfg.sizeLabel} options: ${cfg.sizes.map((s) => s.label).join(', ')}.`);

  if (pricingIsPlaceholder[industry]) {
    out.push(
      `!! PRICING NOT FINALISED for ${cfg.label}. The figures below are indicative ` +
        `placeholders. You MUST say so and MUST NOT present them as a firm quote — ` +
        `offer to have the team confirm a real price instead.`
    );
  }

  out.push('Services:');
  out.push(services.map(describeService).join('\n'));

  if (addOns.length) {
    out.push('Add-ons:');
    out.push(
      addOns
        .map((a) => {
          const priceParts = Object.entries(a.prices).map(
            ([size, price]) =>
              `${sizeLabel(size as never)}: ${formatPrice(price.price, price.priceMax)}`
          );
          return (
            `  - ${a.name} (id: ${a.id}) — ${a.description}\n` +
            `    Adds ${formatHours(a.estimatedHours)}. ` +
            (priceParts.length ? `Price by size — ${priceParts.join(' | ')}` : 'Price on request')
          );
        })
        .join('\n')
    );
  }

  return out.join('\n');
}

/**
 * Assemble the full system prompt from live data. Exported so it can be
 * inspected and tested without making an API call — see scripts/.
 */
export function buildSystemPrompt(): string {
  const hours = business.hours.map((h) => `${h.days}: ${h.time}`).join(' · ');

  return `You are the assistant for ${business.name}, a mobile detailing business serving automotive, marine, and aviation customers.

## Business facts
- Business name: ${business.name}
- Phone (call or text): ${business.phone}
- Email: ${business.email}
- Hours: ${hours}
- Service area: ${business.serviceArea}
- Customers can request an estimate on the website, or book directly from their account at /app/book.

## THE CATALOGUE — this is your ONLY source of prices
Everything below is generated from the business's own live price tables. Quote
prices ONLY from this list. Never estimate, average, extrapolate, or recall a
price from anywhere else. If a customer asks about something not listed here, or
about a size class with no price shown, say you do not have a published price for
that and offer to have the team quote it.

${(['automotive', 'marine', 'aviation'] as Industry[]).map(describeIndustry).join('\n\n')}

## How to help
- Explain what each service is, in plain language, and explain the differences
  between services when someone is choosing between them.
- Explain the craft when asked: paint correction (machine polishing to remove
  swirls and scratches rather than filling them), ceramic coatings (a semi-
  permanent hydrophobic layer, what it does and does not protect against),
  interior detailing, gelcoat restoration on marine hulls (oxidation removal and
  sealing), and approved aviation dry wash (waterless cleaning suitable for
  aircraft on a ramp or in a hangar).
- Recommend a maintenance schedule when it is relevant — how often a wash,
  interior refresh, decontamination, or coating top-up makes sense for the
  customer's usage, storage, and climate.
- Recommend services based on what the customer tells you about their vehicle
  type, its condition, and their goals. Ask a clarifying question when the answer
  genuinely depends on the answer.
- Explain how booking works: pick a service and size, choose a time, and the
  business confirms. Final pricing is confirmed after an in-person inspection.

## Tone and sales
Be direct, warm, and concise. Answer the question that was asked.

DO NOT end every message with a pitch to book or request an estimate. That reads
as spam and erodes trust. Suggest booking or an estimate only when it is
genuinely the next useful step — for example when the customer has settled on a
service, or when their question can only be answered by seeing the vehicle. When
someone is just learning about ceramic coatings, teach them and stop.

## When to hand over to a human
Emit the bare token ${ESCALATE_TOKEN} on its own line, at the end of your reply,
when you cannot answer confidently. Always escalate for:
- anything about a SPECIFIC existing booking, appointment, or job
- any complaint about work already done
- any refund or billing dispute
- any legal, insurance, liability, or warranty question
- any price you cannot find in the catalogue above

When you escalate, still write a short helpful reply first: acknowledge the
question, say you are passing it to the team, and mention ${business.phone} for
anything urgent. Do not explain the token or mention that you are emitting it.`;
}

// ── The call ─────────────────────────────────────────────────────────────────

export interface AssistantMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskAssistantInput {
  messages: AssistantMessageInput[];
  user: User | null;
  /** Present for signed-in users; lets a hand-over be recorded on the thread. */
  conversationId?: string | null;
}

export interface AskAssistantResult {
  reply: string;
  escalated: boolean;
}

/**
 * Every failure mode — unconfigured, non-200, 429, timeout, malformed body —
 * resolves to a friendly reply rather than an exception. The chat UI has one
 * job: show a message. It should never have to render a stack trace.
 */
function fallbackReply(reason: string): AskAssistantResult {
  console.warn(`[ai] falling back to canned reply — ${reason}`);
  return {
    reply:
      `I can't reach the assistant right now, but the team can help directly.\n\n` +
      `Call or text ${business.phone}, or request an estimate on the site and ` +
      `we'll come back to you with real pricing for your vehicle.`,
    escalated: false,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function askAssistant({
  messages,
  user,
  conversationId,
}: AskAssistantInput): Promise<AskAssistantResult> {
  if (!aiConfigured()) {
    return fallbackReply('ANTHROPIC_API_KEY is not set');
  }

  // Trim to the most recent turns and drop empties. The API rejects a blank
  // content block, and a conversation must start on a user turn.
  const trimmed = messages
    .filter((m) => m.content.trim().length > 0)
    .slice(-MAX_HISTORY_MESSAGES);

  while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift();
  if (!trimmed.length) {
    return { reply: 'What would you like to know?', escalated: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let raw: string;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey()!,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      if (res.status === 429) {
        return {
          reply:
            `We're getting a lot of questions at the moment — give me a minute and ` +
            `try again. If it's urgent, call or text ${business.phone}.`,
          escalated: false,
        };
      }
      return fallbackReply(
        `Anthropic ${res.status}${isRetryableStatus(res.status) ? ' (retryable)' : ''}: ${detail}`
      );
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
    };

    // Only text blocks are shown. Any other block type (thinking, tool use)
    // is model machinery, not an answer.
    raw = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text!)
      .join('')
      .trim();

    if (!raw) return fallbackReply('empty response body');
  } catch (e) {
    // AbortError from the timeout lands here alongside network failures; both
    // mean the same thing to the customer.
    const aborted = e instanceof Error && e.name === 'AbortError';
    return fallbackReply(aborted ? `timed out after ${TIMEOUT_MS}ms` : String(e).slice(0, 200));
  } finally {
    clearTimeout(timer);
  }

  const escalated = raw.includes(ESCALATE_TOKEN);
  const reply = stripEscalationToken(raw);

  if (escalated) {
    // Fire and forget on the notification, but never let a failing mailer turn
    // a successful answer into a 500 — the customer already has their reply.
    const question = [...trimmed].reverse().find((m) => m.role === 'user')?.content ?? '';
    const transcript = trimmed.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

    try {
      if (conversationId) markEscalated(conversationId);
    } catch (e) {
      console.error('[ai] could not mark conversation escalated', e);
    }

    try {
      await sendEscalation(user, question, `${transcript}\n\nASSISTANT: ${reply}`);
    } catch (e) {
      console.error('[ai] escalation notification failed', e);
    }
  }

  return {
    reply: reply || 'I have passed this to the team — they will be in touch.',
    escalated,
  };
}
