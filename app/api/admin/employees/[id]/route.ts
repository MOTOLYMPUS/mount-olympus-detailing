// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/employees/:id — role, activation, hourly rate, weekly shifts
// POST  /api/admin/employees/:id — { action: 'reset_password' | 'add_time_off' }
//
// THE RANK RULE, stated once and applied to every branch:
//
//     an actor may only modify someone STRICTLY BELOW their own rank.
//
// Equal rank is refused as well as higher. Without that, two admins could
// deactivate each other, and an admin could demote the person who hired them.
// The self case is refused too, so nobody can lock themselves out of the only
// account that can undo it.
//
// THE OWNER RULE follows from the rank rule for free: nothing outranks 'owner',
// so no request can ever deactivate or demote an owner — including an owner's
// own request. That is deliberate. Ownership changes hands out-of-band.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, int, ok, str, withAuth } from '@/lib/api';
import { generateToken, hashToken } from '@/lib/auth';
import {
  createPasswordReset,
  getUser,
  revokeAllSessions,
  updateUser,
} from '@/lib/repo/users';
import { addTimeOff, listShifts, listTimeOff, replaceShifts, removeTimeOff } from '@/lib/repo/settings';
import { sendPasswordResetEmail } from '@/lib/notify-account';
import { assignableRoles, rank } from '@/lib/rbac';
import { Role, isRole } from '@/lib/models';
import { AUDIT, audit } from '@/lib/repo/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESET_TTL_MINUTES = 60;

export const PATCH = withAuth('admin', async ({ user: actor, params, body, ipHash }) => {
  const target = getUser(params.id);
  if (!target) return fail('That person is not in the system.', 404);

  // The single gate. Everything below it is already known to be permitted.
  if (rank(actor.role) <= rank(target.role)) {
    return fail('You cannot change someone at or above your own role.', 403);
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Parameters<typeof updateUser>[1] = {};
  const changed: string[] = [];

  // ── Role ───────────────────────────────────────────────────────────────────
  if (b.role !== undefined) {
    if (!isRole(b.role)) return fail('Unknown role.', 400, { role: 'Choose a role.' });
    if (!assignableRoles(actor.role).includes(b.role as Role)) {
      return fail('You cannot grant a role at or above your own.', 403, {
        role: 'Choose a role below yours.',
      });
    }
    patch.role = b.role as Role;
    changed.push('role');
  }

  // ── Activation ─────────────────────────────────────────────────────────────
  if (b.active !== undefined) {
    patch.active = b.active === true;
    changed.push('active');
  }

  // ── Pay ────────────────────────────────────────────────────────────────────
  if (b.hourlyRate !== undefined) {
    patch.hourlyRate = b.hourlyRate === null ? null : Math.max(0, int(b.hourlyRate, 0));
    changed.push('hourlyRate');
  }

  if (typeof b.name === 'string') patch.name = str(b.name, 120);
  if (typeof b.phone === 'string') patch.phone = str(b.phone, 40);
  if (typeof b.address === 'string') patch.address = str(b.address, 200);
  if (typeof b.notes === 'string') patch.notes = str(b.notes, 2000);

  // ── Weekly shifts ──────────────────────────────────────────────────────────
  // `replaceShifts` takes the WHOLE week, so the editor posts every row it
  // knows about. A partial post would silently delete the days it omitted,
  // which is why this is an explicit array rather than a merge.
  let shiftsWritten = false;
  if (Array.isArray(b.shifts)) {
    const shifts = (b.shifts as unknown[])
      .slice(0, 40)
      .map((raw) => {
        const s = (raw ?? {}) as Record<string, unknown>;
        return {
          weekday: Math.min(6, Math.max(0, int(s.weekday, 0))),
          startMin: Math.min(1440, Math.max(0, int(s.startMin, 0))),
          endMin: Math.min(1440, Math.max(0, int(s.endMin, 0))),
        };
      })
      .filter((s) => s.endMin > s.startMin);

    replaceShifts(target.id, shifts);
    shiftsWritten = true;
    changed.push('shifts');
  }

  if (!Object.keys(patch).length && !shiftsWritten) {
    return fail('Nothing to update.', 400);
  }

  const updated = Object.keys(patch).length ? updateUser(target.id, patch) : target;

  // Deactivation must take effect NOW, not when the cookie expires in 30 days.
  // `findSessionUser` also filters on `active = 1`, so this is belt and braces
  // — and the belt is what stops a revoked technician finishing their shift
  // with a live session.
  if (patch.active === false) revokeAllSessions(target.id);

  audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: patch.role ? AUDIT.ROLE_CHANGE : patch.active === false ? AUDIT.USER_DEACTIVATE : AUDIT.USER_UPDATE,
    entity: 'user',
    entityId: target.id,
    meta: { changed, role: patch.role, active: patch.active },
    ipHash,
  });

  return ok({ employee: updated, shifts: listShifts(target.id) });
});

export const POST = withAuth('admin', async ({ user: actor, params, body, ipHash }) => {
  const target = getUser(params.id);
  if (!target) return fail('That person is not in the system.', 404);
  if (rank(actor.role) <= rank(target.role)) {
    return fail('You cannot change someone at or above your own role.', 403);
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const action = str(b.action, 30);

  // ── Password reset ─────────────────────────────────────────────────────────
  if (action === 'reset_password') {
    // The admin never sees or sets the new password. A single-use token goes to
    // the employee's own inbox, exactly as the self-service flow does — so an
    // administrator cannot end up knowing a staff member's live credentials.
    const token = generateToken();
    createPasswordReset(
      target.id,
      hashToken(token),
      new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString()
    );

    const status = await sendPasswordResetEmail(target, token);

    audit({
      actorId: actor.id,
      actorRole: actor.role,
      action: AUDIT.PASSWORD_RESET_REQUEST,
      entity: 'user',
      entityId: target.id,
      meta: { initiatedBy: 'admin' },
      ipHash,
    });

    return ok({ sent: true, delivery: status });
  }

  // ── Time off ───────────────────────────────────────────────────────────────
  if (action === 'add_time_off') {
    const startsAt = str(b.startsAt, 40);
    const endsAt = str(b.endsAt, 40);
    if (!startsAt || !endsAt || Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) {
      return fail('Please give a start and end.', 400);
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      return fail('Time off must end after it starts.', 400, { endsAt: 'Must be after the start.' });
    }

    const entry = addTimeOff({
      employeeId: target.id,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      reason: str(b.reason, 200),
    });
    return ok({ timeOff: entry }, { status: 201 });
  }

  if (action === 'remove_time_off') {
    const id = str(b.timeOffId, 60);
    // Confirm the entry belongs to THIS employee before deleting; the id alone
    // would otherwise let an admin remove anyone's leave by guessing.
    const owned = listTimeOff({ employeeId: target.id }).some((t) => t.id === id);
    if (!owned) return fail('That time off is not on this record.', 404);
    removeTimeOff(id);
    return ok({ removed: id });
  }

  return fail('Unknown action.', 400);
});
