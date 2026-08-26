// ─────────────────────────────────────────────────────────────────────────────
// Jobs — the employee-side execution record for an appointment.
//
// TIMING MODEL: `started_at` is stamped once. Pausing records `paused_at`;
// resuming adds the elapsed pause into the `paused_ms` accumulator and clears
// it. Worked duration is therefore
//
//     (completed_at − started_at) − paused_ms
//
// which stays correct across any number of pauses and survives a server
// restart mid-pause, because nothing is held in memory.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, json, nowIso } from '../db';
import { ChecklistItem, Job, JobPhoto, JobStatus, MaterialUse, PhotoKind } from '../models';

function toJob(row: Row): Job {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    employeeId: row.employee_id ?? null,
    status: row.status as JobStatus,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    pausedAt: row.paused_at ?? null,
    pausedMs: row.paused_ms,
    durationMinutes: row.duration_minutes ?? null,
    checklist: json<ChecklistItem[]>(row.checklist, []),
    materials: json<MaterialUse[]>(row.materials, []),
    completionNotes: row.completion_notes,
    signatureData: row.signature_data ?? null,
    signedBy: row.signed_by,
    signedAt: row.signed_at ?? null,
    customerRating: row.customer_rating ?? null,
    customerFeedback: row.customer_feedback,
    revenueCents: row.revenue_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Jobs are created lazily: the row appears the first time an appointment is
 * opened by staff, so a booking that is cancelled before anyone looks at it
 * never leaves an orphan.
 */
export function ensureJob(
  appointmentId: string,
  employeeId: string | null,
  checklist: ChecklistItem[] = []
): Job {
  const existing = getJobByAppointment(appointmentId);
  if (existing) {
    // Keep assignment in sync when a manager reassigns the appointment.
    if (employeeId && existing.employeeId !== employeeId) {
      getDb()
        .prepare(`UPDATE jobs SET employee_id = ?, updated_at = ? WHERE id = ?`)
        .run(employeeId, nowIso(), existing.id);
      return getJob(existing.id)!;
    }
    return existing;
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO jobs (id, appointment_id, employee_id, status, checklist, created_at, updated_at)
       VALUES (?, ?, ?, 'assigned', ?, ?, ?)`
    )
    .run(id, appointmentId, employeeId, JSON.stringify(checklist), now, now);

  return getJob(id)!;
}

export function getJob(id: string): Job | null {
  const row = getDb().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as Row | undefined;
  return row ? toJob(row) : null;
}

export function getJobByAppointment(appointmentId: string): Job | null {
  const row = getDb()
    .prepare(`SELECT * FROM jobs WHERE appointment_id = ?`)
    .get(appointmentId) as Row | undefined;
  return row ? toJob(row) : null;
}

export function listJobsForEmployee(employeeId: string, statuses?: JobStatus[]): Job[] {
  const where = ['employee_id = ?'];
  const values: unknown[] = [employeeId];
  if (statuses?.length) {
    where.push(`status IN (${statuses.map(() => '?').join(', ')})`);
    values.push(...statuses);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC`)
    .all(...(values as any[])) as Row[];
  return rows.map(toJob);
}

// ── State transitions ────────────────────────────────────────────────────────

export function startJob(id: string): Job | null {
  const job = getJob(id);
  if (!job) return null;
  // Idempotent: tapping Start twice must not reset the clock.
  if (job.startedAt) return resumeJob(id);

  getDb()
    .prepare(
      `UPDATE jobs SET status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?`
    )
    .run(nowIso(), nowIso(), id);
  return getJob(id);
}

export function pauseJob(id: string): Job | null {
  const job = getJob(id);
  if (!job || job.status !== 'in_progress') return job;

  getDb()
    .prepare(`UPDATE jobs SET status = 'paused', paused_at = ?, updated_at = ? WHERE id = ?`)
    .run(nowIso(), nowIso(), id);
  return getJob(id);
}

export function resumeJob(id: string): Job | null {
  const job = getJob(id);
  if (!job) return null;

  const extraPause = job.pausedAt ? Date.now() - new Date(job.pausedAt).getTime() : 0;

  getDb()
    .prepare(
      `UPDATE jobs SET status = 'in_progress', paused_at = NULL, paused_ms = ?, updated_at = ?
        WHERE id = ?`
    )
    .run(job.pausedMs + Math.max(0, extraPause), nowIso(), id);
  return getJob(id);
}

export interface CompleteJobInput {
  completionNotes?: string;
  materials?: MaterialUse[];
  checklist?: ChecklistItem[];
  signatureData?: string | null;
  signedBy?: string;
  revenueCents?: number;
}

export function completeJob(id: string, input: CompleteJobInput = {}): Job | null {
  const job = getJob(id);
  if (!job) return null;

  const completedAt = new Date();
  // If a technician forgot to hit Start, fall back to the created timestamp so
  // the job still records *some* honest duration rather than null.
  const startedMs = new Date(job.startedAt ?? job.createdAt).getTime();
  const pausedMs =
    job.pausedMs + (job.pausedAt ? completedAt.getTime() - new Date(job.pausedAt).getTime() : 0);
  const durationMinutes = Math.max(
    0,
    Math.round((completedAt.getTime() - startedMs - pausedMs) / 60000)
  );

  getDb()
    .prepare(
      `UPDATE jobs SET
         status = 'completed',
         completed_at = ?,
         paused_at = NULL,
         paused_ms = ?,
         duration_minutes = ?,
         completion_notes = COALESCE(?, completion_notes),
         materials = COALESCE(?, materials),
         checklist = COALESCE(?, checklist),
         signature_data = COALESCE(?, signature_data),
         signed_by = COALESCE(?, signed_by),
         signed_at = CASE WHEN ? IS NOT NULL THEN ? ELSE signed_at END,
         revenue_cents = COALESCE(?, revenue_cents),
         updated_at = ?
       WHERE id = ?`
    )
    .run(
      completedAt.toISOString(),
      pausedMs,
      durationMinutes,
      input.completionNotes ?? null,
      input.materials ? JSON.stringify(input.materials) : null,
      input.checklist ? JSON.stringify(input.checklist) : null,
      input.signatureData ?? null,
      input.signedBy ?? null,
      input.signatureData ?? null,
      completedAt.toISOString(),
      input.revenueCents ?? null,
      nowIso(),
      id
    );

  return getJob(id);
}

export function updateJob(
  id: string,
  patch: {
    checklist?: ChecklistItem[];
    materials?: MaterialUse[];
    completionNotes?: string;
    employeeId?: string | null;
    customerRating?: number;
    customerFeedback?: string;
  }
): Job | null {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.checklist !== undefined) {
    sets.push('checklist = ?');
    values.push(JSON.stringify(patch.checklist));
  }
  if (patch.materials !== undefined) {
    sets.push('materials = ?');
    values.push(JSON.stringify(patch.materials));
  }
  if (patch.completionNotes !== undefined) {
    sets.push('completion_notes = ?');
    values.push(patch.completionNotes);
  }
  if (patch.employeeId !== undefined) {
    sets.push('employee_id = ?');
    values.push(patch.employeeId);
  }
  if (patch.customerRating !== undefined) {
    sets.push('customer_rating = ?');
    values.push(Math.min(5, Math.max(1, patch.customerRating)));
  }
  if (patch.customerFeedback !== undefined) {
    sets.push('customer_feedback = ?');
    values.push(patch.customerFeedback);
  }

  if (!sets.length) return getJob(id);

  sets.push('updated_at = ?');
  values.push(nowIso(), id);
  getDb()
    .prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`)
    .run(...(values as any[]));
  return getJob(id);
}

// ── Photos ───────────────────────────────────────────────────────────────────

function toPhoto(row: Row): JobPhoto {
  return {
    id: row.id,
    jobId: row.job_id,
    kind: row.kind as PhotoKind,
    url: row.url,
    caption: row.caption,
    uploadedBy: row.uploaded_by ?? null,
    createdAt: row.created_at,
  };
}

export function addJobPhoto(input: {
  jobId: string;
  kind: PhotoKind;
  url: string;
  caption?: string;
  uploadedBy?: string | null;
}): JobPhoto {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO job_photos (id, job_id, kind, url, caption, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.jobId, input.kind, input.url, input.caption ?? '', input.uploadedBy ?? null, nowIso());
  const row = getDb().prepare(`SELECT * FROM job_photos WHERE id = ?`).get(id) as Row;
  return toPhoto(row);
}

export function listJobPhotos(jobId: string): JobPhoto[] {
  const rows = getDb()
    .prepare(`SELECT * FROM job_photos WHERE job_id = ? ORDER BY created_at ASC`)
    .all(jobId) as Row[];
  return rows.map(toPhoto);
}

export function deleteJobPhoto(id: string): void {
  getDb().prepare(`DELETE FROM job_photos WHERE id = ?`).run(id);
}

/** Before/after photos across a customer's whole history, for their gallery. */
export function listPhotosForCustomer(customerId: string, limit = 60): (JobPhoto & { appointmentId: string })[] {
  const rows = getDb()
    .prepare(
      `SELECT p.*, j.appointment_id
         FROM job_photos p
         JOIN jobs j ON j.id = p.job_id
         JOIN appointments a ON a.id = j.appointment_id
        WHERE a.customer_id = ?
        ORDER BY p.created_at DESC LIMIT ?`
    )
    .all(customerId, limit) as Row[];
  return rows.map((r) => ({ ...toPhoto(r), appointmentId: r.appointment_id }));
}

// ── Employee performance ─────────────────────────────────────────────────────

export interface EmployeeStats {
  employeeId: string;
  name: string;
  jobsCompleted: number;
  revenue: number;
  averageJobValue: number;
  minutesWorked: number;
  averageCompletionMinutes: number;
  averageRating: number | null;
  ratingCount: number;
}

/**
 * One query per metric would mean five round trips per employee. This joins
 * jobs to appointments once and aggregates in SQL.
 */
export function employeeStats(fromIso: string, toIso: string): EmployeeStats[] {
  const rows = getDb()
    .prepare(
      `SELECT u.id   AS employee_id,
              u.name AS name,
              COUNT(j.id)                            AS jobs_completed,
              COALESCE(SUM(a.quoted_total), 0)       AS revenue,
              COALESCE(SUM(j.duration_minutes), 0)   AS minutes_worked,
              COALESCE(AVG(j.duration_minutes), 0)   AS avg_minutes,
              AVG(j.customer_rating)                 AS avg_rating,
              COUNT(j.customer_rating)               AS rating_count
         FROM users u
         LEFT JOIN jobs j
                ON j.employee_id = u.id
               AND j.status = 'completed'
               AND j.completed_at >= ? AND j.completed_at < ?
         LEFT JOIN appointments a ON a.id = j.appointment_id
        WHERE u.role IN ('employee', 'manager', 'admin', 'owner')
        GROUP BY u.id
        ORDER BY revenue DESC`
    )
    .all(fromIso, toIso) as Row[];

  return rows.map((r) => {
    const jobs = Number(r.jobs_completed);
    const revenue = Number(r.revenue);
    return {
      employeeId: r.employee_id,
      name: r.name,
      jobsCompleted: jobs,
      revenue,
      averageJobValue: jobs ? Math.round(revenue / jobs) : 0,
      minutesWorked: Number(r.minutes_worked),
      averageCompletionMinutes: Math.round(Number(r.avg_minutes)),
      averageRating: r.avg_rating === null ? null : Number(r.avg_rating),
      ratingCount: Number(r.rating_count),
    };
  });
}

export function statsForEmployee(
  employeeId: string,
  fromIso: string,
  toIso: string
): EmployeeStats | null {
  return employeeStats(fromIso, toIso).find((s) => s.employeeId === employeeId) ?? null;
}

/** Overall customer satisfaction across the business. */
export function satisfaction(fromIso: string, toIso: string): { average: number | null; count: number } {
  const row = getDb()
    .prepare(
      `SELECT AVG(customer_rating) AS avg, COUNT(customer_rating) AS n
         FROM jobs WHERE completed_at >= ? AND completed_at < ?`
    )
    .get(fromIso, toIso) as { avg: number | null; n: number };
  return { average: row.avg === null ? null : Number(row.avg), count: Number(row.n) };
}
