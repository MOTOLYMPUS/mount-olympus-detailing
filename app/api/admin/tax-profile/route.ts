// ─────────────────────────────────────────────────────────────────────────────
// GET   /api/admin/tax-profile — the business tax profile
// PATCH /api/admin/tax-profile — change it
//
// Admin-only, like every expense route: this is the owner's tax data. Same
// allow-list shape as /api/admin/settings — each field has a coercer, unknown
// fields are ignored, and an invalid value fails the save with a field error
// rather than being written.
//
// These figures organise records for the owner's tax preparer; they are not tax
// advice. The mileage rate in particular is editable because the IRS sets a new
// one every year (and occasionally mid-year).
// ─────────────────────────────────────────────────────────────────────────────

import { fail, ok, str, withAuth } from '@/lib/api';
import { getTaxProfile, setSetting } from '@/lib/repo/settings';
import { AUDIT, audit } from '@/lib/repo/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Coercer = (raw: unknown) => unknown | undefined;

const text = (max: number): Coercer => (raw) => (typeof raw === 'string' ? str(raw, max) : undefined);

/** EIN: nine digits, stored as XX-XXXXXXX. Blank is allowed (filing under an SSN). */
const coerceEin: Coercer = (raw) => {
  if (typeof raw !== 'string') return undefined;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length !== 9) return undefined;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
};

const coerceNaics: Coercer = (raw) => {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return /^\d{6}$/.test(v) ? v : undefined;
};

const coerceMethod: Coercer = (raw) => (raw === 'cash' || raw === 'accrual' ? raw : undefined);

const coerceDate: Coercer = (raw) => {
  if (raw === '' || raw === null) return '';
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))
    ? raw
    : undefined;
};

/**
 * { "2025": 700, ... } — mills per mile. The whole map is replaced on save, so
 * removing a year in the editor removes it here. $5.000/mile is far above any
 * rate the IRS has published; a larger figure is a typo.
 */
const coerceRates: Coercer = (raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [year, value] of Object.entries(raw as Record<string, unknown>)) {
    const y = Number(year);
    const mills = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return undefined;
    if (!Number.isFinite(mills) || mills < 0 || mills > 5000) return undefined;
    out[String(y)] = Math.round(mills);
  }
  return out;
};

const FIELDS: Record<string, { key: string; coerce: Coercer; label: string }> = {
  baseAddress: { key: 'tax_base_address', coerce: text(200), label: 'business address' },
  legalName: { key: 'tax_legal_name', coerce: text(120), label: 'legal business name' },
  ein: { key: 'tax_ein', coerce: coerceEin, label: 'EIN (nine digits)' },
  naicsCode: { key: 'tax_naics', coerce: coerceNaics, label: 'NAICS code (six digits)' },
  accountingMethod: { key: 'tax_accounting_method', coerce: coerceMethod, label: 'accounting method' },
  businessStartDate: { key: 'tax_business_start_date', coerce: coerceDate, label: 'start date' },
  mileageRates: { key: 'tax_mileage_rates', coerce: coerceRates, label: 'mileage rates' },
};

export const GET = withAuth('admin', async () => ok({ profile: getTaxProfile() }));

export const PATCH = withAuth('admin', async ({ user, body, ipHash }) => {
  const b = (body ?? {}) as Record<string, unknown>;

  // Validate everything before writing anything, so a bad EIN does not leave
  // the address saved and the rest not.
  const pending: [string, unknown][] = [];
  for (const [field, { key, coerce, label }] of Object.entries(FIELDS)) {
    if (!(field in b)) continue;
    const value = coerce(b[field]);
    if (value === undefined) return fail(`Check the ${label}.`, 400, { [field]: 'Not valid.' });
    pending.push([key, value]);
  }
  if (!pending.length) return fail('Nothing to update.', 400);

  for (const [key, value] of pending) setSetting(key, value);

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.SETTINGS_UPDATE,
    entity: 'settings',
    meta: { keys: pending.map(([k]) => k) },
    ipHash,
  });

  return ok({ profile: getTaxProfile() });
});
