// ─────────────────────────────────────────────────────────────────────────────
// Authentication.
//
// Server-only. Deliberately dependency-free — scrypt, timing-safe comparison
// and random tokens all come from `node:crypto`, which is a better-audited
// primitive set than anything we would add to package.json.
//
// DESIGN
//   • Passwords: scrypt (memory-hard) with a per-password random salt. The
//     stored string carries its own parameters, so the cost can be raised later
//     without invalidating existing hashes.
//   • Sessions: a 256-bit random token lives in an httpOnly cookie. Only its
//     SHA-256 is stored, so a database leak does not yield usable sessions.
//   • Reset tokens: same construction, single use, 60-minute expiry.
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: server-only. `node:crypto` and `next/headers` both fail to resolve in a
// client bundle, so importing this from a client component is a build error
// rather than a silent leak — the same guarantee the `server-only` package
// gives, without adding a dependency.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  createSession,
  findSessionUser,
  getUser,
  revokeAllSessions,
  revokeSession,
  setPasswordHash,
} from './repo/users';
import { Role, User } from './models';

export const SESSION_COOKIE = 'mod_session';
const SESSION_DAYS = 30;

// ── Password hashing ─────────────────────────────────────────────────────────

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize('NFKC'),
      salt,
      SCRYPT.keylen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 },
      (err, derived) => (err ? reject(err) : resolve(derived))
    );
  });
}

/** Format: `scrypt$N$r$p$saltB64$hashB64` — self-describing, so cost can change. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Always runs the full KDF, even for a malformed stored hash, so the response
 * time of "user exists with a broken hash" matches "user exists".
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password.normalize('NFKC'),
      salt,
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
      (err, out) => (err ? reject(err) : resolve(out))
    );
  }).catch(() => null);

  if (!derived || derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/**
 * Burn roughly the same CPU as a real verification when the email is unknown.
 * Without this, a "no such user" reply returns in microseconds and the login
 * endpoint becomes a user-enumeration oracle.
 */
export async function fakeVerify(): Promise<void> {
  await scrypt('decoy-password', Buffer.alloc(16)).catch(() => null);
}

export interface PasswordPolicyResult {
  ok: boolean;
  message?: string;
}

/**
 * Length over composition rules — NIST SP 800-63B guidance. A 12-character
 * passphrase beats "P@ss1!" and is far likelier to be remembered.
 */
export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < 10) {
    return { ok: false, message: 'Use at least 10 characters.' };
  }
  if (password.length > 200) {
    return { ok: false, message: 'That password is too long.' };
  }
  const common = [
    'password', '1234567890', 'qwertyuiop', 'letmein123', 'welcome123',
    'detailing1', 'iloveyou12', 'adminadmin',
  ];
  if (common.some((c) => password.toLowerCase().includes(c))) {
    return { ok: false, message: 'That password is too easy to guess.' };
  }
  return { ok: true };
}

// ── Tokens ───────────────────────────────────────────────────────────────────

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Session lifecycle ────────────────────────────────────────────────────────

export interface StartSessionInput {
  userId: string;
  ipHash: string | null;
  userAgent: string;
}

/** Creates the DB row and returns the raw token for the caller to set as a cookie. */
export function startSession(input: StartSessionInput): { token: string; expiresAt: Date } {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  createSession({
    userId: input.userId,
    tokenHash: hashToken(token),
    expiresAt: expiresAt.toISOString(),
    ipHash: input.ipHash,
    userAgent: input.userAgent,
  });

  return { token, expiresAt };
}

const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  // Lax rather than Strict: Strict would drop the cookie on the return leg of
  // an email link ("view your appointment"), logging the customer out mid-flow.
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  expires,
});

export function attachSessionCookie(res: NextResponse, token: string, expires: Date): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(expires));
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(new Date(0)), maxAge: 0 });
  return res;
}

/**
 * The current user, or null. Safe to call from server components, route
 * handlers, and server actions.
 */
export async function getSessionUser(): Promise<User | null> {
  // Next 15: cookies() is async.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const found = findSessionUser(hashToken(token));
  return found?.user ?? null;
}

export async function endCurrentSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) revokeSession(hashToken(token));
}

/**
 * Change a password and invalidate every other session. A password change is
 * how a user responds to a suspected compromise, so leaving other devices
 * signed in would defeat the point.
 */
export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const hash = await hashPassword(newPassword);
  setPasswordHash(userId, hash);
  revokeAllSessions(userId);
}

// ── Convenience guards used by server components ─────────────────────────────

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('unauthenticated');
  return user;
}

export class AuthError extends Error {
  constructor(public kind: 'unauthenticated' | 'forbidden') {
    super(kind);
    this.name = 'AuthError';
  }
}

/** Re-exported so callers do not need a second import for a role check. */
export function userById(id: string): User | null {
  return getUser(id);
}

export type { Role, User };
