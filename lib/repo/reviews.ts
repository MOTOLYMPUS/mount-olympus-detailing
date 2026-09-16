// ─────────────────────────────────────────────────────────────────────────────
// Customer reviews — one per appointment, upserted.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, json, nowIso } from '../db';
import { Review } from '../models';

function toReview(row: Row): Review {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    userId: row.user_id,
    rating: row.rating,
    comment: row.comment ?? '',
    photoUrls: json<string[]>(row.photo_urls, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getReviewForAppointment(appointmentId: string): Review | null {
  const row = getDb().prepare(`SELECT * FROM reviews WHERE appointment_id = ?`).get(appointmentId) as
    | Row
    | undefined;
  return row ? toReview(row) : null;
}

/** Create or replace the review for an appointment. */
export function upsertReview(input: {
  appointmentId: string;
  userId: string;
  rating: number;
  comment: string;
  photoUrls: string[];
}): Review {
  const now = nowIso();
  const rating = Math.min(5, Math.max(1, Math.round(input.rating)));
  getDb()
    .prepare(
      `INSERT INTO reviews (id, appointment_id, user_id, rating, comment, photo_urls, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(appointment_id) DO UPDATE SET
         rating = excluded.rating, comment = excluded.comment,
         photo_urls = excluded.photo_urls, updated_at = excluded.updated_at`
    )
    .run(
      crypto.randomUUID(),
      input.appointmentId,
      input.userId,
      rating,
      input.comment,
      JSON.stringify(input.photoUrls),
      now,
      now
    );
  return getReviewForAppointment(input.appointmentId)!;
}

export function listReviews(opts: { userId?: string; limit?: number } = {}): Review[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM reviews${opts.userId ? ' WHERE user_id = ?' : ''}
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(...([opts.userId, opts.limit ?? 100].filter((v) => v !== undefined) as any[])) as Row[];
  return rows.map(toReview);
}
