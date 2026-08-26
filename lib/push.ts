// ─────────────────────────────────────────────────────────────────────────────
// Web Push, implemented from the RFCs directly against node:crypto — no
// `web-push` package, no dependencies at all (this project takes none beyond
// next/react/react-dom/framer-motion/clsx).
//
//   RFC 8292 — VAPID: identifies this server to the push service with a
//   short-lived ES256 JWT, signed by a P-256 key pair we control.
//   RFC 8291 — Message Encryption for Web Push: the actual notification body
//   is encrypted end-to-end so the push service (Google/Mozilla/Microsoft)
//   never sees plaintext, using ECDH against the browser subscription's
//   public key plus the "aes128gcm" content-coding from RFC 8188.
//
// GRACEFUL DEGRADATION (mirrors lib/notify.ts): with VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY / VAPID_SUBJECT absent, every send is skipped and logged
// rather than throwing. A notification is never lost because push wasn't
// configured — notifyUser() always writes the durable notifications row
// first; push is strictly a best-effort extra delivery channel on top of it.
//
// Required env vars — see scripts/generate-vapid.mjs to produce them:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: URI)
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { createNotification, listSubscriptions, markSubscriptionFailed } from './repo/notifications';
import { AppNotification, PushSubscriptionRecord } from './models';

// ── Config ───────────────────────────────────────────────────────────────────

const vapidPublicKeyEnv = () => process.env.VAPID_PUBLIC_KEY?.trim();
const vapidPrivateKeyEnv = () => process.env.VAPID_PRIVATE_KEY?.trim();
const vapidSubjectEnv = () => process.env.VAPID_SUBJECT?.trim();

export const pushConfigured = (): boolean =>
  !!(vapidPublicKeyEnv() && vapidPrivateKeyEnv() && vapidSubjectEnv());

/** The public key the client hands to `PushManager.subscribe({ applicationServerKey })`. */
export function getVapidPublicKeyForClient(): string | null {
  return vapidPublicKeyEnv() ?? null;
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // how long the push service should keep retrying delivery
const VAPID_JWT_TTL_SECONDS = 12 * 60 * 60; // RFC 8292 recommends the token expire within 24h; well under that

// ── base64url ────────────────────────────────────────────────────────────────
// Every wire format here — VAPID keys, subscription keys, the JWT itself —
// uses base64url (RFC 4648 §5: '+'→'-', '/'→'_', no padding), never plain
// base64. Node's Buffer only speaks plain base64, so both directions are
// small hand conversions.

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(str: string): Buffer {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

// ── ECDSA DER → JOSE conversion ──────────────────────────────────────────────
//
// `crypto.sign()` on an EC key produces a DER-encoded ASN.1 SEQUENCE of two
// INTEGERs (r, s) by default. A JWS/JOSE signature (what the VAPID JWT
// requires) is instead the fixed-width concatenation r||s — 32 bytes each for
// P-256, 64 bytes total. DER integers are variable-length, sign-padded (a
// leading 0x00 byte when the high bit would otherwise read as negative), so
// this walks the ASN.1 structure by hand and re-packs each integer to a fixed
// 32-byte, unsigned, big-endian field.

function readDerInteger(der: Buffer, offset: number): { bytes: Buffer; next: number } {
  if (der[offset] !== 0x02) throw new Error('malformed ECDSA signature: expected INTEGER tag');
  offset += 1;
  const len = der[offset];
  offset += 1;
  // P-256 (r,s) integers are at most 33 bytes, always well under the 128-byte
  // threshold where DER length switches to multi-byte "long form" — a single
  // length byte is all we need to handle.
  return { bytes: der.subarray(offset, offset + len), next: offset + len };
}

function toFixedWidth(bytes: Buffer, width: number): Buffer {
  let b = bytes;
  while (b.length > width && b[0] === 0x00) b = b.subarray(1); // strip DER's sign-guard byte
  if (b.length > width) throw new Error('ECDSA signature integer too large for field width');
  if (b.length === width) return Buffer.from(b);
  const out = Buffer.alloc(width);
  b.copy(out, width - b.length);
  return out;
}

function derSignatureToJose(der: Buffer, componentWidth = 32): Buffer {
  let offset = 0;
  if (der[offset] !== 0x30) throw new Error('malformed ECDSA signature: expected SEQUENCE tag');
  offset += 1;
  let seqLen = der[offset];
  offset += 1;
  if (seqLen & 0x80) {
    const lenBytes = seqLen & 0x7f;
    seqLen = 0;
    for (let i = 0; i < lenBytes; i++) {
      seqLen = (seqLen << 8) | der[offset];
      offset += 1;
    }
  }

  const r = readDerInteger(der, offset);
  const s = readDerInteger(der, r.next);

  return Buffer.concat([toFixedWidth(r.bytes, componentWidth), toFixedWidth(s.bytes, componentWidth)]);
}

// ── VAPID key pair ───────────────────────────────────────────────────────────

/**
 * Generates a fresh P-256 key pair in the raw formats this module (and
 * `PushManager.subscribe`) actually consume: a 65-byte uncompressed EC point
 * for the public key, a 32-byte scalar for the private key — both
 * base64url-encoded strings, ready to drop straight into `.env.local`.
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  const pubJwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const privJwk = privateKey.export({ format: 'jwk' }) as { d: string };

  const rawPublic = Buffer.concat([
    Buffer.from([0x04]), // uncompressed point marker
    base64urlToBuffer(pubJwk.x),
    base64urlToBuffer(pubJwk.y),
  ]);
  const rawPrivate = base64urlToBuffer(privJwk.d);

  return { publicKey: base64url(rawPublic), privateKey: base64url(rawPrivate) };
}

/**
 * Reconstructs a signing-capable EC private key object from the raw scalar we
 * store in `VAPID_PRIVATE_KEY` — `crypto.sign` needs a proper key object, not
 * a bare 32-byte scalar, and a JWK private key needs the public (x, y) point
 * alongside the private (d) scalar even though only d is secret.
 */
function vapidPrivateKeyObject(): crypto.KeyObject {
  const rawPublic = base64urlToBuffer(vapidPublicKeyEnv()!);
  const rawPrivate = base64urlToBuffer(vapidPrivateKeyEnv()!);

  if (rawPublic.length !== 65 || rawPublic[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY is not a valid uncompressed P-256 point');
  }

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(rawPublic.subarray(1, 33)),
    y: base64url(rawPublic.subarray(33, 65)),
    d: base64url(rawPrivate),
  };
  return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
}

/** Signs a compact ES256 JWT — the VAPID token proving this server's identity to the push service. */
function signVapidJwt(audience: string, subject: string): string {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + VAPID_JWT_TTL_SECONDS,
    sub: subject,
  };

  const signingInput = `${base64url(Buffer.from(JSON.stringify(header)))}.${base64url(
    Buffer.from(JSON.stringify(payload))
  )}`;

  const der = crypto.sign('sha256', Buffer.from(signingInput), vapidPrivateKeyObject());
  const jose = derSignatureToJose(der);

  return `${signingInput}.${base64url(jose)}`;
}

// ── RFC 8291 payload encryption (aes128gcm) ──────────────────────────────────

const RECORD_SIZE = 4096; // single-record messages only — plenty for a notification title/body/url
const GCM_TAG_LENGTH = 16;

function hmacSha256(key: Buffer, data: Buffer): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/**
 * HKDF-Expand for exactly one block. Every value this module derives (the
 * 32-byte IKM, the 16-byte CEK, the 12-byte nonce) fits within one HMAC-SHA-256
 * output, so the general multi-block HKDF-expand loop (RFC 5869 §2.3) isn't
 * needed — this is T(1) = HMAC(PRK, info || 0x01), truncated to `length`.
 */
function hkdfExpandOnce(prk: Buffer, info: Buffer, length: number): Buffer {
  const t = hmacSha256(prk, Buffer.concat([info, Buffer.from([0x01])]));
  return t.subarray(0, length);
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Encrypts `plaintext` per RFC 8291 into the RFC 8188 "aes128gcm" wire format:
 * a header (salt | record size | key id length | key id) followed by one AEAD
 * record. This is the exact byte layout the push service forwards untouched
 * to the browser, which reverses these same steps using the subscription's
 * private key to recover the plaintext.
 */
function encryptPayload(subscription: PushSubscriptionKeys, plaintext: string): Buffer {
  const uaPublic = base64urlToBuffer(subscription.p256dh);
  const authSecret = base64urlToBuffer(subscription.auth);

  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error('subscription p256dh must be an uncompressed P-256 point');
  }
  if (authSecret.length !== 16) {
    throw new Error('subscription auth secret must be 16 bytes');
  }

  // A fresh ECDH key pair per message: RFC 8291 requires the sender's ECDH
  // key be single-use, so intercepted messages can't be linked to each other
  // via a reused public key.
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // raw uncompressed point, 65 bytes
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  // RFC 8291 §3.4 — combine the ECDH secret with the subscription's auth
  // secret to derive the IKM that feeds the (standard, RFC 8188) aes128gcm
  // key derivation below. `key_info` binds the derived key to both parties'
  // public values so it can't be replayed against a different subscription.
  const prkKey = hmacSha256(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'ascii'), uaPublic, asPublic]);
  const ikm = hkdfExpandOnce(prkKey, keyInfo, 32);

  // RFC 8188 §2.1 — derive the actual content-encryption key and nonce from
  // that IKM plus a random salt (unique per message).
  const salt = crypto.randomBytes(16);
  const prk = hmacSha256(salt, ikm);
  const cek = hkdfExpandOnce(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16);
  const nonce = hkdfExpandOnce(prk, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12);

  // RFC 8188 §2 record padding: a 0x02 delimiter marks this as the (only,
  // therefore last) record. No padding bytes beyond the delimiter — nothing
  // here needs traffic-analysis resistance beyond the format's own minimum.
  const padded = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([0x02])]);
  if (padded.length + GCM_TAG_LENGTH > RECORD_SIZE) {
    throw new Error('push payload too large for a single aes128gcm record');
  }

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // aes128gcm header (RFC 8188 §2.1): salt(16) | rs(4, BE) | idlen(1) | keyid(idlen)
  const header = Buffer.alloc(16 + 4 + 1 + asPublic.length);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  asPublic.copy(header, 21);

  return Buffer.concat([header, ciphertext, authTag]);
}

// ── Sending ──────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

export type PushSendStatus = 'sent' | 'skipped:not-configured' | 'gone' | string; // 'error: <detail>'

export interface PushSendResult {
  status: PushSendStatus;
  /** True only for a 404/410 from the push service — the subscription is dead, not just temporarily unreachable. */
  permanent?: boolean;
}

/**
 * Sends one push message to one subscription. Never throws: every failure
 * mode — missing config, a bad subscription, the push service being down —
 * resolves to a status string instead, matching lib/notify.ts's contract so
 * callers never need a try/catch around a notification send.
 */
export async function sendPush(
  subscription: PushSubscriptionKeys,
  payload: PushPayload
): Promise<PushSendResult> {
  if (!pushConfigured()) {
    console.warn(
      '[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT not fully set — push skipped. ' +
        'Run scripts/generate-vapid.mjs to produce them.'
    );
    return { status: 'skipped:not-configured' };
  }

  try {
    const body = encryptPayload(subscription, JSON.stringify(payload));
    const audience = new URL(subscription.endpoint).origin;
    const jwt = signVapidJwt(audience, vapidSubjectEnv()!);

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        TTL: String(DEFAULT_TTL_SECONDS),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: `vapid t=${jwt}, k=${vapidPublicKeyEnv()}`,
      },
      // Node 24's Buffer is typed Buffer<ArrayBufferLike>, which the DOM
      // fetch BodyInit union no longer accepts directly — wrap in a plain
      // Uint8Array view (same fix used in app/api/files/[...key]/route.ts).
      body: new Uint8Array(body),
    });

    if (res.ok) return { status: 'sent' };

    // 404/410 is the push service's way of saying this endpoint will never
    // work again (browser uninstalled, permission revoked) — anything else
    // (5xx, a transient 429) is the push service itself having a bad moment
    // and is worth retrying next time, not a reason to delete the subscription.
    if (res.status === 404 || res.status === 410) {
      return { status: 'gone', permanent: true };
    }
    return { status: `error: push service responded ${res.status}` };
  } catch (e) {
    console.error('[push] send failed', e);
    return { status: `error: ${String(e).slice(0, 200)}` };
  }
}

/**
 * Fans a push out to every subscription a user has registered. Best-effort
 * and total: one dead or slow subscription never blocks or fails the others.
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!pushConfigured()) {
    console.warn(`[push] not configured — skipping push fanout for user ${userId}`);
    return;
  }

  const subscriptions: PushSubscriptionRecord[] = listSubscriptions(userId);
  if (subscriptions.length === 0) return;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const result = await sendPush(sub, payload);
      if (result.permanent) {
        // Deletes the row (see lib/repo/notifications.ts) — a 404/410 means
        // it will never succeed again, so there's nothing to gain by keeping it.
        markSubscriptionFailed(sub.endpoint, true);
      }
      // Any other failure (not configured is already handled above; network
      // errors, 5xx) is left alone rather than disabling the subscription —
      // it's the push *service* having a bad moment, not evidence the
      // subscription itself is bad, and the next notification will simply
      // try it again.
    })
  );
}

/**
 * The single entry point the rest of the app should call to notify a user of
 * something. ALWAYS writes the durable notification row first — that's the
 * record of truth the in-app bell reads — and only then makes a best-effort
 * attempt to also push it. A push failure (or push never having been
 * configured at all) must never prevent the notification from existing.
 */
export async function notifyUser(
  userId: string,
  input: { kind: string; title: string; body?: string; url?: string | null }
): Promise<AppNotification> {
  const notification = createNotification({
    userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    url: input.url,
  });

  try {
    await pushToUser(userId, {
      title: input.title,
      body: input.body ?? '',
      url: input.url ?? undefined,
      tag: input.kind,
    });
  } catch (e) {
    // pushToUser is already all-Promise.allSettled internally and shouldn't
    // reach here, but notifyUser's contract is "never throws" full stop.
    console.error(`[push] notifyUser push fanout threw for user ${userId}`, e);
  }

  return notification;
}
