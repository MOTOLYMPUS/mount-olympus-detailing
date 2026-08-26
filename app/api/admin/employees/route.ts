// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/employees — the staff list (managers need it to assign work)
// POST /api/admin/employees — hire someone
//
// ⚠️ THIS IS THE PRIVILEGE-ESCALATION SURFACE OF THE WHOLE APP. Every rule
// below exists to stop an account granting itself, or a confederate, more power
// than it has:
//
//   1. `assignableRoles(actor.role)` is the ONLY source of permitted roles.
//      It excludes the actor's own rank and everything above it, and it never
//      contains 'owner'. A manager cannot mint an admin; an admin cannot mint
//      an owner; nobody can mint an owner at all.
//   2. The role is checked against that list, not against a hand-written
//      condition, so adding a tier to ROLES cannot silently open a hole here.
//   3. The initial password is generated SERVER-SIDE and returned exactly once.
//      Letting the admin choose it would mean a human-picked password on an
//      account that can see every customer's address.
//
// GET is 'manager' because assigning a technician needs the list; POST is
// 'admin' because hiring is not a scheduling decision.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { fail, int, ok, str, withAuth } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { createUser, getUserByEmail, listUsers } from '@/lib/repo/users';
import { listShifts } from '@/lib/repo/settings';
import { assignableRoles } from '@/lib/rbac';
import { Role, STAFF_ROLES, isRole, toPublicUser } from '@/lib/models';
import { AUDIT, audit } from '@/lib/repo/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A 16-character token from an unambiguous alphabet — long enough that it is
 * never brute-forced, readable enough to be dictated over the phone once, and
 * comfortably past `checkPasswordPolicy`'s 10-character floor.
 */
function initialPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export const GET = withAuth('manager', async ({ query }) => {
  const includeInactive = query.get('all') === '1';
  const staff = listUsers({
    roles: STAFF_ROLES,
    activeOnly: !includeInactive,
    search: query.get('q') ?? undefined,
    limit: 200,
  });

  // Never the raw User — `hourlyRate` and `notes` are not the assign-a-job
  // dropdown's business, and this endpoint is reachable by every manager.
  return NextResponse.json({
    ok: true,
    employees: staff.map((u) => ({ ...toPublicUser(u), shifts: listShifts(u.id).length })),
  });
});

export const POST = withAuth('admin', async ({ user: actor, body, ipHash }) => {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  if (!name) return fail('A name is required.', 400, { name: 'Who is this?' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail('That email address does not look right.', 400, { email: 'Enter a valid email.' });
  }

  const role = b.role;
  if (!isRole(role)) return fail('Unknown role.', 400, { role: 'Choose a role.' });
  if (role === 'customer') {
    return fail('Customers register themselves.', 400, { role: 'Choose a staff role.' });
  }
  if (!assignableRoles(actor.role).includes(role as Role)) {
    // Deliberately explicit: an admin who tries to create an owner should be
    // told the rule, not left guessing at a generic 403.
    return fail('You cannot grant a role at or above your own.', 403, {
      role: 'Choose a role below yours.',
    });
  }

  if (getUserByEmail(email)) {
    return fail('Someone already uses that email address.', 409, {
      email: 'That address is already registered.',
    });
  }

  const password = initialPassword();
  const created = createUser({
    email,
    passwordHash: await hashPassword(password),
    name,
    phone: str(b.phone, 40),
    role: role as Role,
    address: str(b.address, 200),
    // Stored in cents. `null` for salaried staff rather than 0, which would
    // read as "works for free" in the payroll report.
    hourlyRate: b.hourlyRate === undefined || b.hourlyRate === null
      ? null
      : Math.max(0, int(b.hourlyRate, 0)),
  });

  audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: AUDIT.USER_CREATE,
    entity: 'user',
    entityId: created.id,
    // The password is NOT recorded — see the redaction list in lib/repo/audit.ts.
    meta: { email, role },
    ipHash,
  });

  // The only time this value is ever transmitted. It is not stored anywhere
  // recoverable, so an admin who loses it must trigger a password reset.
  return ok({ employee: toPublicUser(created), initialPassword: password }, { status: 201 });
});
