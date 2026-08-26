// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — encrypted secret storage.
//
// WHY THIS EXISTS. Connector credentials (a Google Calendar refresh token, a
// Facebook page token) are obtained by the owner clicking through a consent
// screen at runtime. They cannot come from .env, because .env is written before
// the app starts and editing it means a restart. They must not be stored in
// plaintext next to the business data either.
//
// AES-256-GCM, key from JARVIS_SECRET_KEY. GCM rather than CBC so a tampered
// ciphertext fails loudly at decrypt instead of returning garbage that the
// connector would then send to a third party as a credential.
//
// HONEST LIMIT: the key sits in the environment on the same machine as the
// database, so this protects against a leaked database file, a backup copied to
// the wrong place, or someone reading the table — not against an attacker who
// already has the whole machine. That is the realistic threat for a
// single-owner local install, and pretending otherwise would be worse than
// saying it plainly here.
//
// Env vars used:
//   JARVIS_SECRET_KEY — 64 hex characters (32 bytes). Generate with
//                       `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, nowIso } from '../db';
import { ensureJarvisSchema } from './schema';
import { logWarn } from './logs';

const ALGORITHM = 'aes-256-gcm';

function key(): Buffer | null {
  const raw = process.env.JARVIS_SECRET_KEY?.trim();
  if (!raw) return null;
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    // Wrong-length key is a configuration mistake that would otherwise surface
    // as an opaque crypto error at the moment a connector is first used.
    console.error('[jarvis/vault] JARVIS_SECRET_KEY must be 64 hex characters; ignoring it.');
    return null;
  }
  return Buffer.from(raw, 'hex');
}

export function vaultConfigured(): boolean {
  return key() !== null;
}

/**
 * Store a credential. Throws rather than silently storing plaintext when no key
 * is configured — a vault that quietly degrades is not a vault.
 */
export function putSecret(
  name: string,
  value: string,
  opts: { hint?: string; updatedBy?: string | null } = {}
): void {
  const k = key();
  if (!k) {
    throw new Error(
      'Cannot store a credential: JARVIS_SECRET_KEY is not set. See docs/JARVIS.md → Security.'
    );
  }
  ensureJarvisSchema();

  const iv = crypto.randomBytes(12); // 96 bits, the GCM standard
  const cipher = crypto.createCipheriv(ALGORITHM, k, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  getDb()
    .prepare(
      `INSERT INTO jarvis_secrets (name, ciphertext, iv, tag, hint, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag,
         hint = excluded.hint, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    )
    .run(
      name,
      ciphertext.toString('base64'),
      iv.toString('base64'),
      tag.toString('base64'),
      opts.hint ?? maskHint(value),
      opts.updatedBy ?? null,
      nowIso()
    );
}

/**
 * Read a credential. Returns null — never throws — when absent or undecryptable,
 * because every caller is a connector whose correct response to "no credential"
 * is to report itself unconfigured, exactly as lib/notify.ts does.
 */
export function getSecret(name: string): string | null {
  const k = key();
  if (!k) return null;
  ensureJarvisSchema();

  const row = getDb().prepare(`SELECT * FROM jarvis_secrets WHERE name = ?`).get(name) as
    | Row
    | undefined;
  if (!row) return null;

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, k, Buffer.from(row.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Almost always means the key was rotated without re-entering credentials.
    logWarn('vault', `Could not decrypt secret "${name}" — was JARVIS_SECRET_KEY changed?`);
    return null;
  }
}

/**
 * Resolve a credential from the vault, falling back to the environment.
 *
 * The order matters: a value the owner entered in the dashboard is more recent
 * than one baked into .env at deploy time, so the vault wins.
 */
export function credential(name: string): string | null {
  return getSecret(name) ?? process.env[name]?.trim() ?? null;
}

export function deleteSecret(name: string): void {
  ensureJarvisSchema();
  getDb().prepare(`DELETE FROM jarvis_secrets WHERE name = ?`).run(name);
}

export interface SecretSummary {
  name: string;
  hint: string;
  updatedAt: string;
  /** True when the value is present in .env instead of the vault. */
  fromEnv: boolean;
}

/**
 * For the dashboard's credentials panel. Returns metadata only — the values
 * themselves have no read path that reaches the UI.
 */
export function listSecrets(): SecretSummary[] {
  ensureJarvisSchema();
  const rows = getDb()
    .prepare(`SELECT name, hint, updated_at FROM jarvis_secrets ORDER BY name`)
    .all() as Row[];
  return rows.map((r) => ({
    name: r.name,
    hint: r.hint,
    updatedAt: r.updated_at,
    fromEnv: false,
  }));
}

/** `sk-ant-…7f2a` — enough to tell two keys apart, not enough to use one. */
function maskHint(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
