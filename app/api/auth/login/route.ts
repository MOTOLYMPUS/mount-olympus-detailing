// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
//
// Three things here are deliberate and should not be "simplified":
//
//  1. The failure message is identical for an unknown email, a wrong password,
//     and a deactivated account. Anything more specific enumerates accounts.
//  2. `fakeVerify()` runs when the email is unknown, so the response time does
//     not reveal whether an address exists.
//  3. Rate limiting is applied to BOTH the IP and the submitted email. Limiting
//     only by IP lets a botnet spray one account; limiting only by email lets
//     one attacker lock a victim out. Doing both bounds each independently.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { attachSessionCookie, fakeVerify, startSession, verifyPassword } from '@/lib/auth';
import { findCredentials, getUser, touchLogin } from '@/lib/repo/users';
import { AUDIT, audit } from '@/lib/repo/audit';
import { consume, reset } from '@/lib/ratelimit';
import { clientIp, hashIp } from '@/lib/security';
import { fail } from '@/lib/api';
import { toPublicUser } from '@/lib/models';
import { validEmail } from '@/lib/validation-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC = 'That email and password combination is not recognised.';

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { ok: false, error: 'Too many sign-in attempts. Please try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

export async function POST(req: NextRequest) {
  const ipHash = hashIp(clientIp(req.headers));

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON.', 400);
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const email = validEmail(b.email);
  const password = typeof b.password === 'string' ? b.password : '';

  const byIp = consume('login', `ip:${ipHash ?? 'anonymous'}`);
  if (!byIp.ok) return tooMany(byIp.retryAfter);

  if (!email || !password) {
    await fakeVerify();
    return fail(GENERIC, 401);
  }

  // Hash the email for the limiter key so the rate-limit table never holds a
  // plaintext address for an account that may not even exist.
  const emailKey = `email:${crypto.createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
  const byEmail = consume('login', emailKey);
  if (!byEmail.ok) return tooMany(byEmail.retryAfter);

  const credentials = findCredentials(email);

  if (!credentials) {
    await fakeVerify();
    audit({ action: AUDIT.LOGIN_FAILED, entity: 'user', meta: { reason: 'no-account' }, ipHash });
    return fail(GENERIC, 401);
  }

  const valid = await verifyPassword(password, credentials.passwordHash);

  // The password is checked BEFORE the active flag. Short-circuiting on
  // `active` would answer "is this a real deactivated account?" without a
  // correct password.
  if (!valid || !credentials.active) {
    audit({
      actorId: credentials.id,
      action: AUDIT.LOGIN_FAILED,
      entity: 'user',
      entityId: credentials.id,
      meta: { reason: valid ? 'inactive' : 'bad-password' },
      ipHash,
    });
    return fail(GENERIC, 401);
  }

  const user = getUser(credentials.id);
  if (!user) return fail(GENERIC, 401);

  const { token, expiresAt } = startSession({
    userId: user.id,
    ipHash,
    userAgent: req.headers.get('user-agent') ?? '',
  });

  touchLogin(user.id);
  reset('login', emailKey);
  reset('login', `ip:${ipHash ?? 'anonymous'}`);

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.LOGIN,
    entity: 'user',
    entityId: user.id,
    ipHash,
  });

  const res = NextResponse.json({ ok: true, user: toPublicUser(user) });
  return attachSessionCookie(res, token, expiresAt);
}
