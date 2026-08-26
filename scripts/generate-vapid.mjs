// ─────────────────────────────────────────────────────────────────────────────
// Prints a fresh VAPID (RFC 8292) key pair and the exact .env.local lines to
// paste in to turn on Web Push (lib/push.ts).
//
// This duplicates the small key-derivation piece of lib/push.ts's
// `generateVapidKeys()` rather than importing it, because this is a plain
// .mjs script run directly by `node` with no build step — importing a .ts
// file isn't possible without a compiler in the loop, and the project takes
// no new dependencies (no ts-node). The logic is ~15 lines; kept identical to
// lib/push.ts on purpose, so keep the two in sync if either changes.
//
// Run:  "C:\Program Files\nodejs\node.exe" scripts/generate-vapid.mjs
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(str) {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  const pubJwk = publicKey.export({ format: 'jwk' });
  const privJwk = privateKey.export({ format: 'jwk' });

  const rawPublic = Buffer.concat([
    Buffer.from([0x04]),
    base64urlToBuffer(pubJwk.x),
    base64urlToBuffer(pubJwk.y),
  ]);
  const rawPrivate = base64urlToBuffer(privJwk.d);

  return { publicKey: base64url(rawPublic), privateKey: base64url(rawPrivate) };
}

function main() {
  const { publicKey, privateKey } = generateVapidKeys();

  console.log('Generated a new VAPID key pair.\n');
  console.log(`Public key  (${publicKey.length} chars): ${publicKey}`);
  console.log(`Private key (${privateKey.length} chars): ${privateKey}\n`);
  console.log('Add these lines to .env.local:\n');
  console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
  console.log(`VAPID_SUBJECT=mailto:Luis.rodriguez621@outlook.com`);
  console.log(
    '\nNEXT_PUBLIC_VAPID_PUBLIC_KEY is intentionally not set here — the client fetches the ' +
      'public key from GET /api/push/vapid instead, so there is exactly one place (this env var) ' +
      'that needs to change if the key pair is ever rotated.'
  );
  console.log(
    '\n⚠️  Treat VAPID_PRIVATE_KEY like any other secret: keep it out of version control, and ' +
      'rotating it invalidates every existing push subscription (browsers will need to re-subscribe).'
  );
}

main();
