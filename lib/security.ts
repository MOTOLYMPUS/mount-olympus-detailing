import crypto from 'node:crypto';

/**
 * Hash a client IP before it touches the database.
 *
 * A raw IP is personal data under GDPR; a salted hash still supports rate
 * limiting and abuse investigation without storing it. Set IP_HASH_SALT in the
 * environment — without it the salt is per-process, so limits reset on restart.
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT ?? FALLBACK_SALT;
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

const FALLBACK_SALT = crypto.randomBytes(16).toString('hex');

/**
 * Best-effort client IP. `x-forwarded-for` is only trustworthy behind a proxy
 * that overwrites it — behind one that appends, take the FIRST entry; with no
 * proxy at all this header is fully client-controlled and rate limiting on it
 * is advisory only.
 */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() ?? null;
}

/** Short, human-readable, unambiguous reference (no O/0/I/1). */
export function generateReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return `MOD-${out.slice(0, 3)}-${out.slice(3)}`;
}

export const RATE_LIMIT = {
  /** Max submissions per IP per window. */
  max: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
};
