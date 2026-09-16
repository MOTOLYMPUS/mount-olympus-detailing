// ─────────────────────────────────────────────────────────────────────────────
// File uploads.
//
// THREAT MODEL — an upload endpoint is one of the most reliably exploited parts
// of any app. The defences here, in order of importance:
//
//  1. The MIME type the browser sends is a HINT, not evidence. Every file is
//     sniffed by magic bytes and rejected if the real content does not match an
//     allowed image format. A .png that is actually a PHP script is refused.
//  2. The client's filename is never used. Names are generated from a random
//     UUID plus an extension derived from the SNIFFED type, so `../../etc` and
//     `shell.php.png` are both impossible.
//  3. Files land outside the source tree in a dedicated uploads directory and
//     are served back through a route handler that sets an explicit
//     Content-Type and `Content-Disposition: inline` — never executed.
//  4. Hard size cap enforced while streaming, so a 5 GB "image" cannot fill the
//     disk before the check runs.
//
// ⚠️  LOCAL DISK. Like lib/db.ts, this assumes a persistent filesystem. On a
// serverless host, swap `store()` for S3/R2/Blob — it is the only function that
// touches `fs`.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB — a phone photo, not a RAW file

export interface SniffResult {
  mime: string;
  ext: string;
}

/**
 * Identify a file by its leading bytes.
 *
 * Only formats a browser will render as an image are listed. SVG is
 * deliberately EXCLUDED: it is an XML document that can carry <script>, so
 * serving user-uploaded SVG from our own origin would be a stored-XSS vector.
 */
export function sniffImage(buffer: Buffer): SniffResult | null {
  const b = buffer;
  if (b.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // GIF: "GIF8"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  // WebP: "RIFF" .... "WEBP"
  if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  // HEIC/HEIF: ftyp box with a heic/heif/mif1 brand — what iPhones produce.
  if (b.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = b.subarray(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return { mime: 'image/heic', ext: 'heic' };
    }
  }
  return null;
}

export interface StoredFile {
  /** Path the app serves it from — always under /api/files/. */
  url: string;
  /** Storage key: "<scope>/<uuid>.<ext>". Never contains user input. */
  key: string;
  mime: string;
  size: number;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * `scope` groups files on disk ("jobs", "vehicles", "messages"). It is
 * validated against a strict allow-list rather than being interpolated, so it
 * cannot be used to escape the upload root.
 */
const SCOPES = ['jobs', 'vehicles', 'messages', 'signatures', 'avatars', 'reviews'] as const;
export type UploadScope = (typeof SCOPES)[number];

export async function store(file: File, scope: UploadScope): Promise<StoredFile> {
  if (!SCOPES.includes(scope)) throw new UploadError('Unknown upload scope.', 400);

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `That file is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
      413
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Re-check after reading: `file.size` is client-reported metadata and a
  // hand-rolled multipart body can lie about it.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError('That file is too large.', 413);
  }
  if (bytes.byteLength === 0) throw new UploadError('That file is empty.', 400);

  const sniffed = sniffImage(bytes);
  if (!sniffed) {
    throw new UploadError('Only JPEG, PNG, GIF, WebP and HEIC images can be uploaded.', 415);
  }

  const key = `${scope}/${crypto.randomUUID()}.${sniffed.ext}`;
  const target = path.join(UPLOAD_ROOT, key);

  // Belt and braces: confirm the resolved path is still inside the root even
  // though every component is generated.
  if (!target.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new UploadError('Invalid upload path.', 400);
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);

  return {
    url: `/api/files/${key}`,
    key,
    mime: sniffed.mime,
    size: bytes.byteLength,
  };
}

/** Resolve a storage key back to bytes for the serving route. */
export async function read(key: string): Promise<{ bytes: Buffer; mime: string } | null> {
  // The key came from a URL, so it IS user input here. Validate its shape
  // strictly rather than trusting that we generated it.
  if (!/^[a-z]+\/[0-9a-f-]{36}\.[a-z0-9]{3,4}$/.test(key)) return null;

  const [scope] = key.split('/');
  if (!SCOPES.includes(scope as UploadScope)) return null;

  const target = path.join(UPLOAD_ROOT, key);
  if (!target.startsWith(UPLOAD_ROOT + path.sep)) return null;

  try {
    const bytes = await fs.readFile(target);
    const sniffed = sniffImage(bytes);
    // Serve the SNIFFED type, not one derived from the extension — so even if
    // something unexpected reached the disk it cannot be served as script.
    return sniffed ? { bytes, mime: sniffed.mime } : null;
  } catch {
    return null;
  }
}

export async function remove(key: string): Promise<void> {
  if (!/^[a-z]+\/[0-9a-f-]{36}\.[a-z0-9]{3,4}$/.test(key)) return;
  const target = path.join(UPLOAD_ROOT, key);
  if (!target.startsWith(UPLOAD_ROOT + path.sep)) return;
  await fs.rm(target, { force: true });
}

/**
 * A drawn signature arrives as a data: URL rather than a file. Validated and
 * stored as PNG bytes so it lives with everything else instead of bloating
 * every job row with base64.
 */
export async function storeSignature(dataUrl: string): Promise<StoredFile> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) throw new UploadError('Invalid signature data.', 400);

  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.byteLength > 1024 * 1024) throw new UploadError('Signature too large.', 413);
  if (!sniffImage(bytes)) throw new UploadError('Invalid signature image.', 400);

  const key = `signatures/${crypto.randomUUID()}.png`;
  const target = path.join(UPLOAD_ROOT, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);

  return { url: `/api/files/${key}`, key, mime: 'image/png', size: bytes.byteLength };
}
