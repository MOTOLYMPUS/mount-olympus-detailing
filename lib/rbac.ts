// ─────────────────────────────────────────────────────────────────────────────
// Role-based access control.
//
// Roles are RANKED, not a set of independent flags: owner ⊃ admin ⊃ manager ⊃
// employee ⊃ customer. `atLeast('manager')` therefore also admits admins and
// owners, and a new tier can be slotted into the ROLES array in lib/models.ts
// without revisiting a single call site.
//
// EXCEPTION: 'customer' is not "the weakest staff role", it is a different kind
// of principal. `isStaff()` is a separate predicate for that reason — a
// customer must never satisfy a staff check just by being rank 0.
// ─────────────────────────────────────────────────────────────────────────────

import { ADMIN_ROLES, ROLES, Role, STAFF_ROLES, User } from './models';

const RANK: Record<Role, number> = ROLES.reduce(
  (acc, role, i) => ({ ...acc, [role]: i }),
  {} as Record<Role, number>
);

export function rank(role: Role): number {
  return RANK[role] ?? 0;
}

/** True when `role` is at least as privileged as `minimum`. */
export function atLeast(role: Role, minimum: Role): boolean {
  return rank(role) >= rank(minimum);
}

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export function isAdmin(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

/** Managers and above can see other people's jobs, revenue, and customers. */
export function canManage(role: Role): boolean {
  return atLeast(role, 'manager');
}

// ── Object-level checks ──────────────────────────────────────────────────────
//
// Role alone is never sufficient for a record-scoped route: an employee may
// read *their* job but not a colleague's, and a customer may read *their*
// appointment but not a stranger's. These helpers encode that pairing so the
// rule lives in one place instead of being retyped in every handler.

export function canViewAppointment(
  user: User,
  appt: { customerId: string; employeeId: string | null }
): boolean {
  if (canManage(user.role)) return true;
  if (user.role === 'employee') return appt.employeeId === user.id;
  return appt.customerId === user.id;
}

export function canEditAppointment(
  user: User,
  appt: { customerId: string; employeeId: string | null }
): boolean {
  if (canManage(user.role)) return true;
  // An employee may update the job they are assigned, but not move the booking.
  if (user.role === 'employee') return appt.employeeId === user.id;
  return appt.customerId === user.id;
}

export function canViewJob(user: User, job: { employeeId: string | null }): boolean {
  if (canManage(user.role)) return true;
  return user.role === 'employee' && job.employeeId === user.id;
}

export function ownsRecord(user: User, record: { userId: string }): boolean {
  return record.userId === user.id || canManage(user.role);
}

// ── Human-readable labels for the admin UI ───────────────────────────────────

export const ROLE_LABEL: Record<Role, string> = {
  customer: 'Customer',
  employee: 'Technician',
  manager: 'Manager',
  admin: 'Administrator',
  owner: 'Owner',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  customer: 'Books services, manages their own vehicles and appointments.',
  employee: 'Sees and completes jobs assigned to them. No revenue access.',
  manager: 'Full schedule, all jobs, all customers, business analytics.',
  admin: 'Everything a manager can do, plus staff, pricing, and settings.',
  owner: 'Unrestricted. Cannot be deactivated by anyone else.',
};

/**
 * Which roles a given actor is allowed to grant. Nobody may grant a role above
 * their own — that is the entire privilege-escalation surface of the admin UI.
 */
export function assignableRoles(actor: Role): Role[] {
  return ROLES.filter((r) => rank(r) < rank(actor) || (actor === 'owner' && r !== 'owner'));
}
