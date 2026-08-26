// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — dates, in the business's own timezone.
//
// lib/timezone.ts takes an explicit timezone on every call, which is right: it
// forces the caller to say whose clock they mean, and stops UTC leaking into a
// customer-facing time. But Jarvis's answer is always the same — the business's
// configured timezone — and threading it through every agent tool would be
// noise that invites someone to pass the wrong one.
//
// So these wrappers bind it once, reading the live setting rather than caching
// it, because an operator who changes the timezone should not need a restart to
// see agents agree with the admin UI.
// ─────────────────────────────────────────────────────────────────────────────

import { getSchedulingConfig } from '../repo/settings';
import { formatDate, formatDateTime, formatTime, todayIso } from '../timezone';

export function tz(): string {
  return getSchedulingConfig().timezone;
}

export const today = (): string => todayIso(tz());
export const fmtDate = (instant: Date | string): string => formatDate(instant, tz());
export const fmtDateTime = (instant: Date | string): string => formatDateTime(instant, tz());
export const fmtTime = (instant: Date | string): string => formatTime(instant, tz());
