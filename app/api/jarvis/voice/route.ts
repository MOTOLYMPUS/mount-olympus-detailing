// ─────────────────────────────────────────────────────────────────────────────
// POST /api/jarvis/voice — one spoken turn.
//
// The browser does the listening (wake phrase, speech-to-text) and the speaking
// (text-to-speech); this endpoint is the thinking in between. It receives text,
// never audio — no recording is uploaded, stored, or transmitted anywhere.
//
// Manager and above. Jarvis reads revenue, customer records, and employee
// performance, so this is deliberately stricter than the customer-facing
// assistant in app/api/assistant.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, fail, withAuth, text } from '@/lib/api';
import { ask } from '@/lib/jarvis/voice';

interface Body {
  transcript?: unknown;
  history?: unknown;
}

export const POST = withAuth<Body>(
  'manager',
  async ({ user, body }) => {
    const transcript = text(body?.transcript, 2000);
    if (!transcript) return fail('Nothing was said.', 400);

    // Only role and content survive; anything else the client sends is dropped
    // before it can reach a prompt.
    const history = Array.isArray(body?.history)
      ? (body.history as unknown[])
          .slice(-10)
          .map((h) => {
            const turn = h as { role?: unknown; content?: unknown };
            return {
              role: turn.role === 'assistant' ? ('assistant' as const) : ('user' as const),
              content: text(turn.content, 1000),
            };
          })
          .filter((h) => h.content)
      : [];

    const turn = await ask({ transcript, user, history });

    return ok({
      reply: turn.reply,
      taskId: turn.taskId ?? null,
      agent: turn.agent ?? null,
      durationMs: turn.durationMs,
    });
  },
  // Shares the assistant's budget shape. A stuck wake-word detector firing in a
  // loop is the realistic abuse case, and it is the owner's own money.
  { limit: 'assistant' }
);
