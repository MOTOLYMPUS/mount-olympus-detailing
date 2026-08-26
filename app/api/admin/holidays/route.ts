// ─────────────────────────────────────────────────────────────────────────────
// GET/POST/DELETE /api/admin/holidays — days the business is closed.
//
// A holiday is consumed by lib/availability.ts through `holidaySet()`, which is
// a Set of 'YYYY-MM-DD' strings. The date format is therefore validated exactly,
// not parsed leniently: `new Date('next tuesday')` is Invalid Date, and an
// Invalid Date silently formatted into the set would produce a key that never
// matches, i.e. a holiday that quietly does nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, isIsoDate, ok, str, withAuth } from '@/lib/api';
import { addHoliday, listHolidays, removeHoliday } from '@/lib/repo/settings';
import { AUDIT, audit } from '@/lib/repo/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('manager', async () => {
  // Managers read it — the schedule screen needs to explain an empty day.
  return NextResponse.json({ ok: true, holidays: listHolidays() });
});

export const POST = withAuth('admin', async ({ user, body, ipHash }) => {
  const b = (body ?? {}) as Record<string, unknown>;

  const date = str(b.date, 10);
  if (!isIsoDate(date)) {
    return fail('Use a date in YYYY-MM-DD form.', 400, { date: 'Pick a date.' });
  }
  // Reject 2026-02-31: the regex accepts it but the calendar does not.
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return fail('That date does not exist.', 400, { date: 'Pick a real date.' });
  }

  addHoliday(date, str(b.label, 120) || 'Closed');

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.SETTINGS_UPDATE,
    entity: 'holiday',
    meta: { added: date },
    ipHash,
  });

  return ok({ holidays: listHolidays() }, { status: 201 });
});

export const DELETE = withAuth('admin', async ({ user, query, ipHash }) => {
  const id = str(query.get('id'), 60);
  if (!id) return fail('Which holiday?', 400);

  const holiday = listHolidays().find((h) => h.id === id);
  if (!holiday) return fail('That holiday is not in the list.', 404);

  removeHoliday(id);

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.SETTINGS_UPDATE,
    entity: 'holiday',
    meta: { removed: holiday.date },
    ipHash,
  });

  return ok({ holidays: listHolidays() });
});
