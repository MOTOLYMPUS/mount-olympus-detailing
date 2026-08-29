// ─────────────────────────────────────────────────────────────────────────────
// Password reset and change.
//
//   POST /api/auth/password           { email }                  → request a link
//   PUT  /api/auth/password           { token, password }        → complete reset
//   PATCH /api/auth/password          { current, password }      → change while signed in
//
// The request step ALWAYS reports success, whether or not the address is
// registered. A reset form that says "no such account" is a free account
// enumeration tool, and it is the one endpoint anyone can hit unauthenticated.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import {
  changePassword,
  checkPasswordPolicy,
  clearSessionCookie,
  fakeVerify,
  generateToken,
  getSessionUser,
  hashToken,
  verifyPassword,
} from '@/lib/auth';
import {
  consumePasswordReset,
  createPasswordReset,
  findCredentials,
  getUserByEmail,
} from '@/lib/repo/users';
import { AUDIT, audit } from '@/lib/repo/audit';
import { consume } from '@/lib/ratelimit';
import { clientIp, hashIp } from '@/lib/security';
import { fail, str } from '@/lib/api';
import { validEmail } from '@/lib/validation-account';
import { sendPasswordResetEmail } from '@/lib/notify-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESET_TTL_MINUTES = 60;

// ── Request a reset link ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ipHash = hashIp(clientIp(req.headers));

  const limit = consume('passwordReset', ipHash ?? 'anonymous');
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON.', 400);
  }

  const email = validEmail((body as Record<string, unknown>)?.email);

  if (email) {
    const user = getUserByEmail(email);
    if (user && user.active) {
      const token = generateToken();
      createPasswordReset(
        user.id,
        hashToken(token),
        new Date(Date.now() + RESET_TTL_MINUTES * 60_000).toISOString()
      );

      // Never fatal: if email is not configured the token still exists and the
      // owner can be told out of band. Failing the request would tell the
      // caller the account exists.
      await sendPasswordResetEmail(user, token).catch((e) =>
        console.error('[password] reset email failed', e)
      );

      audit({
        actorId: user.id,
        action: AUDIT.PASSWORD_RESET_REQUEST,
        entity: 'user',
        entityId: user.id,
        ipHash,
      });
    }
  }

  // Identical response in every branch, including invalid email format.
  return NextResponse.json({
    ok: true,
    message: 'If that address has an account, a reset link is on its way.',
  });
}

// ── Complete a reset ─────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const ipHash = hashIp(clientIp(req.headers));

  const limit = consume('passwordReset', `complete:${ipHash ?? 'anonymous'}`);
  if (!limit.ok) return fail('Too many attempts. Please try again later.', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON.', 400);
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const token = str(b.token, 200);
  const password = typeof b.password === 'string' ? b.password : '';

  const policy = checkPasswordPolicy(password);
  if (!policy.ok) return fail('Please check the form.', 400, { password: policy.message! });

  const userId = consumePasswordReset(hashToken(token));
  if (!userId) {
    return fail('That reset link has expired or already been used. Please request a new one.', 400);
  }

  // changePassword revokes every session — including any the attacker who
  // prompted the reset may hold.
  await changePassword(userId, password);

  audit({
    actorId: userId,
    action: AUDIT.PASSWORD_RESET,
    entity: 'user',
    entityId: userId,
    ipHash,
  });

  // Sign the current browser out too: the user must log in with the new
  // password, which proves they know it before they get a session.
  return clearSessionCookie(
    NextResponse.json({ ok: true, message: 'Password updated. Please sign in.' })
  );
}

// ── Change while signed in ───────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return fail('Please sign in.', 401);

  const ipHash = hashIp(clientIp(req.headers));

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON.', 400);
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const current = typeof b.current === 'string' ? b.current : '';
  const password = typeof b.password === 'string' ? b.password : '';

  const policy = checkPasswordPolicy(password);
  if (!policy.ok) return fail('Please check the form.', 400, { password: policy.message! });

  // Re-authenticate. A hijacked session must not be able to lock the real owner
  // out by changing the password without knowing it.
  const credentials = findCredentials(user.email);
  if (!credentials) {
    await fakeVerify();
    return fail('Something went wrong. Please sign in again.', 401);
  }

  if (!(await verifyPassword(current, credentials.passwordHash))) {
    return fail('Please check the form.', 400, { current: 'That is not your current password.' });
  }

  await changePassword(user.id, password);

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.PASSWORD_CHANGE,
    entity: 'user',
    entityId: user.id,
    ipHash,
  });

  // Every session is gone, including this one, so the cookie must go too.
  return clearSessionCookie(
    NextResponse.json({
      ok: true,
      message: 'Password changed. You have been signed out everywhere — please sign in again.',
    })
  );
}

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ ok: true, signedIn: !!user, userId: user?.id ?? null });
}
