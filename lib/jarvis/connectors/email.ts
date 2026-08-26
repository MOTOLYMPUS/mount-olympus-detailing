// ─────────────────────────────────────────────────────────────────────────────
// Connector — email, via Resend.
//
// Same provider and the same plain-`fetch` style as lib/notify.ts, but a
// separate module on purpose: lib/notify.ts sends *transactional* mail the app
// owes the customer (booking confirmed, password reset), while this sends mail
// an *agent* composed. Those need different guardrails, and merging them would
// put agent-generated text one refactor away from the password-reset path.
//
// Credentials: RESEND_API_KEY, MAIL_FROM — shared with the rest of the app, and
// also readable from the runtime vault so the owner can set them without a
// restart.
// ─────────────────────────────────────────────────────────────────────────────

import { business } from '../../business';
import { Connector, ConnectorResult } from './index';
import { credential } from '../vault';

const apiKey = () => credential('RESEND_API_KEY');
const from = () => credential('MAIL_FROM');

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Agents write plain text; customers get something that looks like it came from
 * a business. Deliberately minimal HTML — no tracking pixels, no images, no
 * external CSS, all of which hurt deliverability for a small sender.
 */
function wrap(bodyText: string): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="margin:0;font-size:13px;color:#6b7280">
      ${esc(business.name)}${business.phone ? ` · ${esc(business.phone)}` : ''}
    </p>
  </div></body></html>`;
}

interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

/**
 * Validated at send time rather than trusted from the payload. The payload was
 * written by a model; a malformed address would be a 422 from Resend at the
 * moment the owner approved, which is far too late to be useful.
 */
function readPayload(payload: Record<string, unknown>): EmailPayload | string {
  const to = typeof payload.to === 'string' ? payload.to.trim() : '';
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return `"${to}" is not a valid email address.`;
  if (!subject) return 'An email needs a subject.';
  if (!body) return 'An email needs a body.';
  if (body.length > 20_000) return 'That email body is unreasonably long.';

  return {
    to,
    subject: subject.slice(0, 200),
    body,
    replyTo: typeof payload.replyTo === 'string' ? payload.replyTo : undefined,
  };
}

async function send(payload: Record<string, unknown>): Promise<ConnectorResult> {
  const parsed = readPayload(payload);
  if (typeof parsed === 'string') return { ok: false, detail: parsed };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: from(),
      to: [parsed.to],
      subject: parsed.subject,
      html: wrap(parsed.body),
      text: parsed.body,
      ...(parsed.replyTo ? { reply_to: parsed.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    return { ok: false, detail: `Resend rejected the send (${res.status}): ${(await res.text()).slice(0, 200)}` };
  }

  const data = (await res.json()) as { id?: string };
  return {
    ok: true,
    detail: `Email sent to ${parsed.to}: "${parsed.subject}"`,
    data: { id: data.id ?? null, to: parsed.to },
  };
}

/**
 * A campaign is many individual sends, not one send with many recipients: a
 * shared To: line would expose every customer's address to every other
 * customer. Recipients are capped so an agent cannot mail the whole list on a
 * bad inference — a genuinely large campaign should go through a real ESP.
 */
const MAX_CAMPAIGN_RECIPIENTS = 200;

async function sendCampaign(payload: Record<string, unknown>): Promise<ConnectorResult> {
  const recipients = Array.isArray(payload.recipients)
    ? payload.recipients.filter((r): r is string => typeof r === 'string')
    : [];

  if (!recipients.length) return { ok: false, detail: 'No recipients were given.' };
  if (recipients.length > MAX_CAMPAIGN_RECIPIENTS) {
    return {
      ok: false,
      detail: `${recipients.length} recipients exceeds the ${MAX_CAMPAIGN_RECIPIENTS} cap for agent-sent campaigns.`,
    };
  }

  let sent = 0;
  const failures: string[] = [];

  for (const to of recipients) {
    const result = await send({ ...payload, to });
    if (result.ok) sent++;
    else failures.push(to);
    // Resend's default rate limit is low enough that a tight loop trips it.
    await new Promise((r) => setTimeout(r, 120));
  }

  return {
    ok: sent > 0,
    detail: `Campaign sent to ${sent}/${recipients.length} recipients${
      failures.length ? `; failed for ${failures.slice(0, 5).join(', ')}` : ''
    }.`,
    data: { sent, failed: failures.length },
  };
}

export const emailConnector: Connector = {
  name: 'email',
  label: 'Email (Resend)',
  configured: () => !!(apiKey() && from()),
  missingCredentials: () =>
    [!apiKey() && 'RESEND_API_KEY', !from() && 'MAIL_FROM'].filter(Boolean) as string[],
  setupNote:
    'Create an API key at resend.com, verify your sending domain, then set RESEND_API_KEY and MAIL_FROM.',
  actions: {
    send: {
      channel: 'email.customer',
      description: 'Send one email to one customer.',
      risk: 'medium',
      run: send,
    },
    campaign: {
      channel: 'email.marketing',
      description: 'Send a marketing email to a list of recipients, one message each.',
      risk: 'high',
      run: sendCampaign,
    },
  },
};
