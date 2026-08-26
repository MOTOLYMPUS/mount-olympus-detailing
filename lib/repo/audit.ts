// ─────────────────────────────────────────────────────────────────────────────
// Audit log.
//
// Append-only by convention: there is no update or delete here, and none
// should be added. Writes never throw — an audit failure must not take down
// the operation being audited, but it is logged loudly so it cannot pass
// unnoticed.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, json, nowIso } from '../db';
import { AuditEntry } from '../models';

export interface AuditInput {
  actorId?: string | null;
  actorRole?: string;
  action: string;
  entity?: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ipHash?: string | null;
}

/**
 * Actions worth recording. Not exhaustive — any string is accepted — but
 * naming them here keeps the vocabulary consistent across call sites.
 */
export const AUDIT = {
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  REGISTER: 'auth.register',
  PASSWORD_RESET_REQUEST: 'auth.password_reset_request',
  PASSWORD_RESET: 'auth.password_reset',
  PASSWORD_CHANGE: 'auth.password_change',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DEACTIVATE: 'user.deactivate',
  ROLE_CHANGE: 'user.role_change',
  APPOINTMENT_CREATE: 'appointment.create',
  APPOINTMENT_UPDATE: 'appointment.update',
  APPOINTMENT_CANCEL: 'appointment.cancel',
  APPOINTMENT_ASSIGN: 'appointment.assign',
  JOB_START: 'job.start',
  JOB_COMPLETE: 'job.complete',
  ESTIMATE_ACCEPT: 'estimate.accept',
  ESTIMATE_DECLINE: 'estimate.decline',
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_REFUND: 'payment.refund',
  SETTINGS_UPDATE: 'settings.update',
  EXPORT: 'report.export',
} as const;

export function audit(input: AuditInput): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log (id, actor_id, actor_role, action, entity, entity_id, meta, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        input.actorId ?? null,
        input.actorRole ?? '',
        input.action,
        input.entity ?? '',
        input.entityId ?? null,
        JSON.stringify(redact(input.meta ?? {})),
        input.ipHash ?? null,
        nowIso()
      );
  } catch (e) {
    console.error('[audit] write failed', input.action, e);
  }
}

/**
 * Belt and braces: the audit log is a place credentials would be especially
 * damaging, so anything that looks like a secret is stripped even though no
 * current call site passes one.
 */
const SENSITIVE = /pass|secret|token|authorization|card|cvv|ssn|signature/i;

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = SENSITIVE.test(k) ? '[redacted]' : v;
  }
  return out;
}

function toEntry(row: Row): AuditEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    meta: json<Record<string, unknown>>(row.meta, {}),
    createdAt: row.created_at,
  };
}

export function listAudit(opts: { limit?: number; actorId?: string; action?: string } = {}): AuditEntry[] {
  const where: string[] = [];
  const values: unknown[] = [];
  if (opts.actorId) {
    where.push('actor_id = ?');
    values.push(opts.actorId);
  }
  if (opts.action) {
    where.push('action = ?');
    values.push(opts.action);
  }
  values.push(opts.limit ?? 200);

  const rows = getDb()
    .prepare(
      `SELECT * FROM audit_log${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(...(values as any[])) as Row[];
  return rows.map(toEntry);
}
