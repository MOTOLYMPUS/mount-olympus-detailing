#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Create the first owner account.
//
//   node scripts/create-admin.mjs "Luis Rodriguez" luis@example.com
//
// The chicken-and-egg problem: /api/admin/employees requires an admin session,
// and there is no admin yet. This script is the only way in, and it is
// deliberately a LOCAL COMMAND rather than a web route — a bootstrap endpoint
// that creates an owner is a backdoor forever, even when it "checks whether any
// admin exists first" (that check is racy, and it survives into production).
//
// The password is generated, printed once, and never stored in plaintext. Sign
// in and change it.
//
// Run with the same env as the app so DATABASE_PATH points at the same file:
//   DATABASE_PATH=./data.sqlite node scripts/create-admin.mjs "Name" email
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [, , nameArg, emailArg, roleArg] = process.argv;

if (!nameArg || !emailArg) {
  console.error('Usage: node scripts/create-admin.mjs "Full Name" email@example.com [owner|admin]');
  process.exit(1);
}

const role = roleArg === 'admin' ? 'admin' : 'owner';
const email = emailArg.trim().toLowerCase();

if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
  console.error(`✗ "${email}" does not look like an email address.`);
  process.exit(1);
}

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'data.sqlite');

if (!fs.existsSync(DB_PATH)) {
  console.error(
    `✗ No database at ${DB_PATH}.\n` +
      `  Start the app once (npm run dev) so the schema is created, then re-run this.`
  );
  process.exit(1);
}

// ── Password ─────────────────────────────────────────────────────────────────
// Generated, not chosen: a bootstrap password typed on a command line ends up
// in shell history. 20 characters from a 62-symbol alphabet is ~119 bits.
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Must match lib/auth.ts exactly — same format string, same parameters.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

function referralCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
const now = new Date().toISOString();
const password = generatePassword();
const passwordHash = hashPassword(password);

if (existing) {
  // Promote rather than refuse — the common case is "I registered through the
  // website first and now need to be the owner".
  db.prepare(
    `UPDATE users SET role = ?, password_hash = ?, active = 1, deactivated_at = NULL, updated_at = ?
      WHERE id = ?`
  ).run(role, passwordHash, now, existing.id);

  console.log(`\n✓ Promoted the existing account to ${role} and reset its password.`);
  printCredentials(email, password);
} else {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, name, phone, created_at, updated_at, hired_at, email_verified)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, 1)`
  ).run(id, email, passwordHash, role, nameArg, now, now, now);

  db.prepare(
    `INSERT OR IGNORE INTO loyalty_accounts (user_id, points, lifetime_points, tier, referral_code, updated_at)
     VALUES (?, 0, 0, 'bronze', ?, ?)`
  ).run(id, referralCode(), now);

  console.log(`\n✓ Created the ${role} account.`);
  printCredentials(email, password);
}

db.close();

function printCredentials(email, password) {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────┐');
  console.log('  │  SIGN IN AT  /login                                     │');
  console.log('  └─────────────────────────────────────────────────────────┘');
  console.log('');
  console.log(`     Email:    ${email}`);
  console.log(`     Password: ${password}`);
  console.log('');
  console.log('  This password is shown ONCE and is not recoverable.');
  console.log('  Change it from Profile & settings after you sign in.');
  console.log('');
}
