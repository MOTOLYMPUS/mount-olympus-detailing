// ─────────────────────────────────────────────────────────────────────────────
// Connectors — CRM and calendar.
//
// A DELIBERATE ARCHITECTURAL LINE RUNS THROUGH THIS FILE.
//
// The CRM connector is real and works today, because "remember that this
// customer asked about ceramic coating" writes to Jarvis's own memory and is
// trivially reversible.
//
// The calendar connector does NOT let agents create or move appointments in the
// app's own schedule. That is not an oversight. Booking is governed by
// lib/booking.ts and lib/availability.ts — minimum notice, travel buffers,
// technician conflicts, cancellation windows, deposit rules — and an agent
// writing appointment rows directly would bypass every one of those checks. The
// first double-booked Saturday would be a real customer standing in a driveway.
//
// So agents PROPOSE schedule changes (which reach the owner as an approval
// carrying a deep link into the existing admin UI), and external calendar sync
// is a separate, genuinely external concern that needs OAuth.
// ─────────────────────────────────────────────────────────────────────────────

import { getUser } from '../../repo/users';
import { getAppointment } from '../../repo/appointments';
import { fmtDateTime } from '../time';
import { remember } from '../memory';
import { Connector, ConnectorResult } from './index';
import { credential } from '../vault';

// ── CRM ──────────────────────────────────────────────────────────────────────

async function noteCustomer(payload: Record<string, unknown>): Promise<ConnectorResult> {
  const userId = typeof payload.userId === 'string' ? payload.userId : '';
  const note = typeof payload.note === 'string' ? payload.note.trim() : '';
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';

  if (!userId) return { ok: false, detail: 'A customer note needs a userId.' };
  if (!note) return { ok: false, detail: 'A customer note needs a body.' };

  const user = getUser(userId);
  if (!user) return { ok: false, detail: `No customer with id ${userId}.` };

  // Confidence below 1.0 because an agent inferred this rather than being told
  // it. The dashboard shows such memories as unconfirmed so the owner can
  // correct them before they harden into fact.
  const memory = remember({
    kind: 'customer_note',
    title: title || `Note on ${user.name}`,
    body: note,
    entity: 'user',
    entityId: userId,
    source: typeof payload.agent === 'string' ? payload.agent : 'agent',
    confidence: 0.7,
    tags: ['customer'],
  });

  return {
    ok: true,
    detail: `Noted against ${user.name}: ${memory.title}`,
    data: { memoryId: memory.id },
  };
}

export const crmConnector: Connector = {
  name: 'crm',
  label: 'Customer records (built in)',
  configured: () => true,
  missingCredentials: () => [],
  setupNote: 'Built in — writes to Jarvis memory against the customer record. No credentials needed.',
  actions: {
    noteCustomer: {
      channel: 'crm.write',
      description: "Attach a note to a customer's record. Internal only; the customer never sees it.",
      risk: 'low',
      run: noteCustomer,
    },
  },
};

// ── Calendar ─────────────────────────────────────────────────────────────────

async function proposeChange(payload: Record<string, unknown>): Promise<ConnectorResult> {
  const appointmentId = typeof payload.appointmentId === 'string' ? payload.appointmentId : '';
  const proposal = typeof payload.proposal === 'string' ? payload.proposal.trim() : '';

  if (!appointmentId) return { ok: false, detail: 'A proposal needs an appointmentId.' };
  if (!proposal) return { ok: false, detail: 'Say what should change and why.' };

  const appointment = getAppointment(appointmentId);
  if (!appointment) return { ok: false, detail: `No appointment with id ${appointmentId}.` };

  return {
    ok: true,
    detail: `Proposed for ${fmtDateTime(appointment.startsAt)}: ${proposal}`,
    data: {
      appointmentId,
      // The owner acts on this in the existing admin UI, where every booking
      // rule is enforced. Jarvis's job ends at the recommendation.
      href: `/admin/appointments/${appointmentId}`,
    },
  };
}

const googleToken = () => credential('GOOGLE_CALENDAR_REFRESH_TOKEN');
const googleClientId = () => credential('GOOGLE_CLIENT_ID');
const googleClientSecret = () => credential('GOOGLE_CLIENT_SECRET');

/**
 * NOT IMPLEMENTED — and reports itself so rather than pretending.
 *
 * Google Calendar needs a three-legged OAuth consent flow that a headless agent
 * cannot complete; the owner must click through it once and the refresh token
 * lands in the vault. Until then `configured()` is false, so `perform()` refuses
 * before an approval is ever created and the agent is told to report the gap.
 */
async function syncToGoogle(): Promise<ConnectorResult> {
  return {
    ok: false,
    detail:
      'Google Calendar sync is not implemented yet. See docs/JARVIS.md → Remaining integrations.',
  };
}

export const calendarConnector: Connector = {
  name: 'calendar',
  label: 'Calendar (Google)',
  configured: () => !!(googleToken() && googleClientId() && googleClientSecret()),
  missingCredentials: () =>
    [
      !googleClientId() && 'GOOGLE_CLIENT_ID',
      !googleClientSecret() && 'GOOGLE_CLIENT_SECRET',
      !googleToken() && 'GOOGLE_CALENDAR_REFRESH_TOKEN',
    ].filter(Boolean) as string[],
  setupNote:
    'Create an OAuth client in Google Cloud Console, complete the consent flow once as the owner, and store the refresh token. Appointments in this app are the source of truth; sync is one-way out.',
  actions: {
    // Always available: it writes nothing outside the business.
    proposeChange: {
      channel: 'crm.write',
      description:
        'Recommend a schedule change to the owner. Does NOT move the appointment — booking rules are enforced in the admin UI.',
      risk: 'low',
      requiresCredentials: false,
      run: proposeChange,
    },
    syncOut: {
      channel: 'calendar.write',
      description: "Mirror an appointment into the owner's Google Calendar.",
      risk: 'medium',
      run: syncToGoogle,
    },
  },
};
