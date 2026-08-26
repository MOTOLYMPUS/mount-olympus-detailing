// ─────────────────────────────────────────────────────────────────────────────
// Page-level guards for server components.
//
// lib/api.ts guards API ROUTES; this guards PAGES. Both exist because they fail
// differently: an API returns 401 JSON, a page redirects to the sign-in screen
// with a `next` parameter so the user lands where they were going.
//
// ⚠️ These are the SECOND line of defence, not the first. Never rely on a page
// guard to protect data — the API the page calls must check independently, or a
// direct fetch bypasses it entirely.
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from 'next/navigation';
import { getSessionUser } from './auth';
import { Role, User } from './models';
import { atLeast, isStaff } from './rbac';

/** Redirects to sign-in if there is no session. */
export function requirePage(next?: string): User {
  const user = getSessionUser();
  if (!user) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  }
  return user;
}

/**
 * Send each role to the screen that is actually theirs. A technician who opens
 * /admin gets their own dashboard rather than a bare 403 — being told "no" is
 * useless when there is an obvious right answer.
 */
export function homeFor(role: Role): string {
  if (atLeast(role, 'manager')) return '/admin';
  if (role === 'employee') return '/staff';
  return '/app';
}

export function requireStaffPage(next?: string): User {
  const user = requirePage(next);
  if (!isStaff(user.role)) redirect('/app');
  return user;
}

export function requireRolePage(minimum: Role, next?: string): User {
  const user = requirePage(next);
  if (!atLeast(user.role, minimum)) redirect(homeFor(user.role));
  return user;
}

/** Signed-in users have no business on /login or /register. */
export function redirectIfSignedIn(): void {
  const user = getSessionUser();
  if (user) redirect(homeFor(user.role));
}
