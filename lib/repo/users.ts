// ─────────────────────────────────────────────────────────────────────────────
// Users, sessions, and password resets.
//
// The password hash is deliberately absent from the `User` interface. Only
// `findCredentials()` returns it, and only lib/auth.ts calls that — so there is
// no path by which a hash reaches a serialiser, a log line, or an API response.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, bool, flag, getDb, nowIso } from '../db';
import { Role, User, isRole } from '../models';

function toUser(row: Row): User {
  return {
    id: row.id,
    email: row.email,
    role: isRole(row.role) ? row.role : 'customer',
    name: row.name,
    phone: row.phone,
    smsConsent: bool(row.sms_consent),
    emailVerified: bool(row.email_verified),
    active: bool(row.active),
    address: row.address ?? '',
    notes: row.notes ?? '',
    hourlyRate: row.hourly_rate ?? null,
    hiredAt: row.hired_at ?? null,
    deactivatedAt: row.deactivated_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at ?? null,
  };
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  role?: Role;
  smsConsent?: boolean;
  address?: string;
  hourlyRate?: number | null;
}

export function createUser(input: CreateUserInput): User {
  const now = nowIso();
  const id = crypto.randomUUID();

  getDb()
    .prepare(
      `INSERT INTO users (id, email, password_hash, role, name, phone, sms_consent,
                          address, hourly_rate, hired_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.email.trim().toLowerCase(),
      input.passwordHash,
      input.role ?? 'customer',
      input.name,
      input.phone ?? '',
      flag(input.smsConsent),
      input.address ?? '',
      input.hourlyRate ?? null,
      input.role && input.role !== 'customer' ? now : null,
      now,
      now
    );

  return getUser(id)!;
}

export function getUser(id: string): User | null {
  const row = getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id) as Row | undefined;
  return row ? toUser(row) : null;
}

export function getUserByEmail(email: string): User | null {
  const row = getDb()
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(email.trim().toLowerCase()) as Row | undefined;
  return row ? toUser(row) : null;
}

/**
 * The ONLY function that returns a password hash. Kept separate from
 * `getUserByEmail` so that reaching a hash requires deliberately calling a
 * differently-named function.
 */
export function findCredentials(
  email: string
): { id: string; passwordHash: string; active: boolean; role: Role } | null {
  const row = getDb()
    .prepare(`SELECT id, password_hash, active, role FROM users WHERE email = ?`)
    .get(email.trim().toLowerCase()) as Row | undefined;
  if (!row) return null;
  return {
    id: row.id,
    passwordHash: row.password_hash,
    active: bool(row.active),
    role: isRole(row.role) ? row.role : 'customer',
  };
}

export function setPasswordHash(userId: string, passwordHash: string): void {
  getDb()
    .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(passwordHash, nowIso(), userId);
}

export function touchLogin(userId: string): void {
  getDb().prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(nowIso(), userId);
}

export interface UpdateUserInput {
  name?: string;
  phone?: string;
  smsConsent?: boolean;
  address?: string;
  notes?: string;
  role?: Role;
  active?: boolean;
  hourlyRate?: number | null;
  email?: string;
}

/**
 * Partial update. Only keys explicitly present in `patch` are written, so a
 * caller that forgets a field never blanks it.
 */
export function updateUser(id: string, patch: UpdateUserInput): User | null {
  const columns: Record<keyof UpdateUserInput, string> = {
    name: 'name',
    phone: 'phone',
    smsConsent: 'sms_consent',
    address: 'address',
    notes: 'notes',
    role: 'role',
    active: 'active',
    hourlyRate: 'hourly_rate',
    email: 'email',
  };

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const key of Object.keys(patch) as (keyof UpdateUserInput)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    sets.push(`${columns[key]} = ?`);
    if (key === 'smsConsent' || key === 'active') values.push(flag(value as boolean));
    else if (key === 'email') values.push(String(value).trim().toLowerCase());
    else values.push(value as string | number | null);
  }

  // Deactivating stamps the date so reports can show tenure.
  if (patch.active === false) {
    sets.push('deactivated_at = ?');
    values.push(nowIso());
  } else if (patch.active === true) {
    sets.push('deactivated_at = ?');
    values.push(null);
  }

  if (sets.length === 0) return getUser(id);

  sets.push('updated_at = ?');
  values.push(nowIso(), id);

  getDb()
    .prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .run(...(values as any[]));

  return getUser(id);
}

export interface ListUsersOptions {
  roles?: Role[];
  activeOnly?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export function listUsers(opts: ListUsersOptions = {}): User[] {
  const where: string[] = [];
  const values: unknown[] = [];

  if (opts.roles?.length) {
    where.push(`role IN (${opts.roles.map(() => '?').join(', ')})`);
    values.push(...opts.roles);
  }
  if (opts.activeOnly) where.push('active = 1');
  if (opts.search) {
    where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)');
    const q = `%${opts.search}%`;
    values.push(q, q, q);
  }

  const sql =
    `SELECT * FROM users` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY name COLLATE NOCASE ASC LIMIT ? OFFSET ?`;

  values.push(opts.limit ?? 200, opts.offset ?? 0);

  const rows = getDb()
    .prepare(sql)
    .all(...(values as any[])) as Row[];
  return rows.map(toUser);
}

export function countUsers(roles?: Role[]): number {
  const sql = roles?.length
    ? `SELECT COUNT(*) AS n FROM users WHERE role IN (${roles.map(() => '?').join(', ')})`
    : `SELECT COUNT(*) AS n FROM users`;
  const row = getDb()
    .prepare(sql)
    .get(...((roles ?? []) as any[])) as { n: number };
  return Number(row.n);
}

/** New customer registrations inside a window — feeds the growth chart. */
export function countUsersCreatedBetween(startIso: string, endIso: string, role?: Role): number {
  const sql = role
    ? `SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ? AND role = ?`
    : `SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?`;
  const args: unknown[] = role ? [startIso, endIso, role] : [startIso, endIso];
  const row = getDb()
    .prepare(sql)
    .get(...(args as any[])) as { n: number };
  return Number(row.n);
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export function createSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: string;
  ipHash: string | null;
  userAgent: string;
}): string {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, ip_hash, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.userId,
      input.tokenHash,
      nowIso(),
      input.expiresAt,
      input.ipHash,
      input.userAgent.slice(0, 400)
    );
  return id;
}

/** Resolves a cookie token hash to its user, or null if expired/revoked. */
export function findSessionUser(tokenHash: string): { user: User; sessionId: string } | null {
  const row = getDb()
    .prepare(
      `SELECT s.id AS session_id, u.*
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > ?
          AND u.active = 1`
    )
    .get(tokenHash, nowIso()) as Row | undefined;

  if (!row) return null;
  return { user: toUser(row), sessionId: row.session_id };
}

export function revokeSession(tokenHash: string): void {
  getDb()
    .prepare(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ?`)
    .run(nowIso(), tokenHash);
}

/** Used on password change and on employee deactivation. */
export function revokeAllSessions(userId: string): void {
  getDb()
    .prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
    .run(nowIso(), userId);
}

export function purgeExpiredSessions(): void {
  getDb().prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(nowIso());
}

// ── Password resets ──────────────────────────────────────────────────────────

export function createPasswordReset(userId: string, tokenHash: string, expiresAt: string): void {
  getDb()
    .prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(crypto.randomUUID(), userId, tokenHash, nowIso(), expiresAt);
}

export function consumePasswordReset(tokenHash: string): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, user_id FROM password_resets
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`
    )
    .get(tokenHash, nowIso()) as Row | undefined;

  if (!row) return null;

  db.prepare(`UPDATE password_resets SET used_at = ? WHERE id = ?`).run(nowIso(), row.id);
  return row.user_id;
}
