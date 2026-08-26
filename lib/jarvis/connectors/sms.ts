// ─────────────────────────────────────────────────────────────────────────────
// Connector — SMS, via Twilio.
//
// ⚠️  CONSENT IS ENFORCED HERE, NOT UPSTREAM.
//
// Texting a customer who has not given TCPA consent is a legal violation with
// statutory damages per message, and "the agent should have known better" is
// not a defence. So this connector re-checks `smsConsent` on the customer
// record at send time, even though the agent was told the rule in its prompt
// and even though the owner approved the draft. A model that hallucinated a
// phone number, or a stale approval whose customer has since opted out, both
// fail closed here.
//
// The check is by user id where one is given. An agent that supplies a bare
// phone number with no matching customer record cannot send at all — there is
// no way to verify consent for an address the business does not know.
//
// Credentials: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.
// ─────────────────────────────────────────────────────────────────────────────

import { getUser } from '../../repo/users';
import { toE164 } from '../../validation';
import { Connector, ConnectorResult } from './index';
import { credential } from '../vault';

const sid = () => credential('TWILIO_ACCOUNT_SID');
const token = () => credential('TWILIO_AUTH_TOKEN');
const from = () => credential('TWILIO_PHONE_NUMBER');

/** Two segments. Past this the customer is being paragraphed at, and billed for. */
const MAX_LENGTH = 320;

interface Resolved {
  to: string;
  body: string;
}

/**
 * Resolve a recipient and prove consent. Returns an error string rather than
 * throwing so every refusal reaches the agent as readable text it can act on.
 */
function resolveRecipient(payload: Record<string, unknown>): Resolved | string {
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!body) return 'A text needs a body.';
  if (body.length > MAX_LENGTH) {
    return `That message is ${body.length} characters; keep agent-sent texts under ${MAX_LENGTH}.`;
  }

  const userId = typeof payload.userId === 'string' ? payload.userId : '';
  if (!userId) {
    return 'Texts must name the customer by userId so consent can be verified. Sending to a bare phone number is not allowed.';
  }

  const user = getUser(userId);
  if (!user) return `No customer with id ${userId}.`;
  if (!user.active) return `${user.name}'s account is deactivated; not texting them.`;
  if (!user.smsConsent) {
    return `${user.name} has not consented to SMS. Send an email instead — texting them would be a TCPA violation.`;
  }

  const to = toE164(user.phone);
  if (!to) return `${user.name} has no usable phone number on file.`;

  return { to, body };
}

async function send(payload: Record<string, unknown>): Promise<ConnectorResult> {
  const resolved = resolveRecipient(payload);
  if (typeof resolved === 'string') return { ok: false, detail: resolved };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid()}/Messages.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${sid()}:${token()}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: resolved.to, From: from()!, Body: resolved.body }),
  });

  if (!res.ok) {
    return { ok: false, detail: `Twilio rejected the send (${res.status}): ${(await res.text()).slice(0, 200)}` };
  }

  const data = (await res.json()) as { sid?: string };
  return {
    ok: true,
    detail: `Text sent to ${resolved.to}.`,
    data: { sid: data.sid ?? null },
  };
}

/**
 * Bulk SMS. Capped hard and low: an SMS campaign is the most expensive and most
 * complained-about thing this system can do, and every recipient is
 * consent-checked individually by reusing send() rather than a faster bulk path.
 */
const MAX_CAMPAIGN_RECIPIENTS = 50;

async function sendCampaign(payload: Record<string, unknown>): Promise<ConnectorResult> {
  const userIds = Array.isArray(payload.userIds)
    ? payload.userIds.filter((u): u is string => typeof u === 'string')
    : [];

  if (!userIds.length) return { ok: false, detail: 'No recipients were given.' };
  if (userIds.length > MAX_CAMPAIGN_RECIPIENTS) {
    return {
      ok: false,
      detail: `${userIds.length} recipients exceeds the ${MAX_CAMPAIGN_RECIPIENTS} cap for agent-sent SMS campaigns.`,
    };
  }

  let sent = 0;
  const skipped: string[] = [];

  for (const userId of userIds) {
    const result = await send({ userId, body: payload.body });
    if (result.ok) sent++;
    else skipped.push(result.detail);
    await new Promise((r) => setTimeout(r, 150));
  }

  return {
    ok: sent > 0,
    detail: `Texted ${sent}/${userIds.length}. ${skipped.length} skipped (usually no consent).`,
    data: { sent, skipped: skipped.length, reasons: skipped.slice(0, 5) },
  };
}

export const smsConnector: Connector = {
  name: 'sms',
  label: 'SMS (Twilio)',
  configured: () => !!(sid() && token() && from()),
  missingCredentials: () =>
    [
      !sid() && 'TWILIO_ACCOUNT_SID',
      !token() && 'TWILIO_AUTH_TOKEN',
      !from() && 'TWILIO_PHONE_NUMBER',
    ].filter(Boolean) as string[],
  setupNote:
    'Buy a number at twilio.com, then set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER. US A2P 10DLC registration is required before campaign traffic will deliver.',
  actions: {
    send: {
      channel: 'sms.customer',
      description: 'Text one customer. Requires their userId; consent is verified at send time.',
      risk: 'medium',
      run: send,
    },
    campaign: {
      channel: 'sms.marketing',
      description: 'Text a list of customers by userId. Each is consent-checked individually.',
      risk: 'high',
      run: sendCampaign,
    },
  },
};
