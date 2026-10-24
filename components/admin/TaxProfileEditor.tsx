'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The business tax profile editor.
//
// Every value is re-validated by /api/admin/tax-profile; the patterns here are
// a courtesy. Mileage rates are mills per mile on the wire (700 = $0.700) and
// dollars in the browser — the conversion lives in this file only.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, CardTitle, buttonClass } from '@/components/ui';
import type { TaxProfile } from '@/lib/repo/settings';

const LABEL = 'font-mono text-[11px] uppercase tracking-widest2 text-subtle';
const HINT = 'text-[12px] leading-snug text-subtle';

function TextField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
  placeholder,
  type = 'text',
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className="input-field"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

interface RateRow {
  year: string;
  dollars: string;
}

const toRows = (rates: Record<string, number>): RateRow[] =>
  Object.entries(rates)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, mills]) => ({ year, dollars: (mills / 1000).toFixed(3) }));

export default function TaxProfileEditor({ profile }: { profile: TaxProfile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [baseAddress, setBaseAddress] = useState(profile.baseAddress);
  const [legalName, setLegalName] = useState(profile.legalName);
  const [ein, setEin] = useState(profile.ein);
  const [naics, setNaics] = useState(profile.naicsCode);
  const [method, setMethod] = useState(profile.accountingMethod);
  const [startDate, setStartDate] = useState(profile.businessStartDate);
  const [rates, setRates] = useState<RateRow[]>(() => toRows(profile.mileageRates));

  async function save() {
    const mileageRates: Record<string, number> = {};
    for (const r of rates) {
      const year = r.year.trim();
      if (!year && !r.dollars.trim()) continue;
      const dollars = Number(r.dollars);
      if (!/^\d{4}$/.test(year) || !Number.isFinite(dollars) || dollars < 0) {
        setError('Each mileage rate needs a four-digit year and a dollar amount, e.g. 2025 and 0.700.');
        return;
      }
      mileageRates[year] = Math.round(dollars * 1000);
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/tax-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseAddress,
          legalName,
          ein,
          naicsCode: naics,
          accountingMethod: method,
          businessStartDate: startDate,
          mileageRates,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That did not save.');
        return;
      }
      setEin(data.profile.ein);
      setRates(toRows(data.profile.mileageRates));
      setNotice('Tax profile saved.');
      router.refresh();
    } catch {
      setError('We could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && !error && <Alert tone="positive">{notice}</Alert>}

      <Card>
        <CardTitle>Business</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="tax-address"
            className="sm:col-span-2"
            label="Business address (trip base)"
            hint="Where every job trip starts and ends. For a home-based mobile business this is your home, which is also the principal place of business."
            value={baseAddress}
            placeholder="Street, City, ST ZIP"
            disabled={busy}
            onChange={setBaseAddress}
          />
          <TextField
            id="tax-name"
            label="Legal business name"
            hint="As registered with the state (LLC name)."
            value={legalName}
            disabled={busy}
            onChange={setLegalName}
          />
          <TextField
            id="tax-ein"
            label="EIN"
            hint="Leave blank if you file under your SSN."
            value={ein}
            placeholder="12-3456789"
            disabled={busy}
            onChange={setEin}
          />
          <TextField
            id="tax-naics"
            label="Principal business code (NAICS)"
            hint="811190 covers car washes and detailing. Confirm against the Schedule C instructions."
            value={naics}
            disabled={busy}
            onChange={setNaics}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tax-method" className={LABEL}>
              Accounting method
            </label>
            <select
              id="tax-method"
              className="input-field"
              value={method}
              disabled={busy}
              onChange={(e) => setMethod(e.target.value as TaxProfile['accountingMethod'])}
            >
              <option value="cash">Cash</option>
              <option value="accrual">Accrual</option>
            </select>
            <p className={HINT}>Cash counts income when paid and expenses when paid.</p>
          </div>
          <TextField
            id="tax-start"
            type="date"
            label="Date business started"
            hint="The day you first bought supplies, advertised, or took a job."
            value={startDate}
            disabled={busy}
            onChange={setStartDate}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>IRS standard mileage rate</CardTitle>
        <p className="mb-4 text-[13px] leading-relaxed text-muted">
          Business miles in a vehicle on the standard-mileage method are multiplied by that year&rsquo;s
          rate. The IRS announces each year&rsquo;s rate in December.
        </p>
        <ul className="space-y-2">
          {rates.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3">
              <input
                className="input-field max-w-[7rem]"
                inputMode="numeric"
                placeholder="Year"
                aria-label={`Rate ${i + 1} tax year`}
                value={r.year}
                disabled={busy}
                onChange={(e) =>
                  setRates((rows) => rows.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))
                }
              />
              <div className="relative max-w-[9rem]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle">$</span>
                <input
                  // Inline: `.input-field` sets its own padding after the
                  // utilities, so a `pl-*` class would lose to it.
                  style={{ paddingLeft: '1.75rem' }}
                  className="input-field"
                  inputMode="decimal"
                  placeholder="0.700"
                  aria-label={`Rate ${i + 1} dollars per mile`}
                  value={r.dollars}
                  disabled={busy}
                  onChange={(e) =>
                    setRates((rows) => rows.map((x, j) => (j === i ? { ...x, dollars: e.target.value } : x)))
                  }
                />
              </div>
              <span className="text-[12px] text-subtle">per mile</span>
              <button
                type="button"
                className={buttonClass('ghost', 'sm')}
                disabled={busy}
                onClick={() => setRates((rows) => rows.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={buttonClass('secondary', 'sm', 'mt-3')}
          disabled={busy}
          onClick={() => setRates((rows) => [{ year: String(new Date().getFullYear()), dollars: '' }, ...rows])}
        >
          Add a year
        </button>
      </Card>

      <button type="button" className={buttonClass('primary', 'md')} disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save tax profile'}
      </button>
    </div>
  );
}
