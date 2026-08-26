'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The pricing editor grid.
//
// One editable cell per (service × size). A cell is only "dirty" — and only
// shows a Save button — once its number differs from what is currently stored,
// so the owner can scan the whole table without a wall of buttons. Saving is
// per-cell and explicit: pricing is not the place for a silent save-on-blur
// that fires because someone tabbed away.
//
// After a save the cell knows its new stored value and its default, so it can
// show "overridden · reset" and let the owner revert to the built-in price.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Card, buttonClass } from '@/components/ui';
import { formatCurrency, formatPrice } from '@/lib/pricing';
import { Industry, SizeClass } from '@/lib/types';

export interface PriceCell {
  size: SizeClass;
  label: string;
  defaultPrice: number;
  defaultPriceMax?: number;
  price: number;
  priceMax?: number;
  overridden: boolean;
}

export interface PricingItem {
  id: string;
  name: string;
  kind: 'service' | 'addon';
  cells: PriceCell[];
}

export interface IndustryPricing {
  industry: Industry;
  label: string;
  placeholder: boolean;
  items: PricingItem[];
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

const key = (id: string, size: string) => `${id}__${size}`;

export default function PricingEditor({ data }: { data: IndustryPricing[] }) {
  const [tab, setTab] = useState<Industry>(data[0]?.industry ?? 'automotive');

  // Draft text per cell, and the last-known stored value/override flag per cell.
  // Both are seeded from the server data and only these two maps mutate as the
  // owner edits and saves — the props are never treated as live.
  const seed = useMemo(() => {
    const drafts: Record<string, string> = {};
    const meta: Record<string, { price: number; defaultPrice: number; overridden: boolean }> = {};
    for (const ind of data) {
      for (const item of ind.items) {
        for (const c of item.cells) {
          drafts[key(item.id, c.size)] = String(c.price);
          meta[key(item.id, c.size)] = {
            price: c.price,
            defaultPrice: c.defaultPrice,
            overridden: c.overridden,
          };
        }
      }
    }
    return { drafts, meta };
  }, [data]);

  const [drafts, setDrafts] = useState(seed.drafts);
  const [meta, setMeta] = useState(seed.meta);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const active = data.find((d) => d.industry === tab)!;

  function setDraft(k: string, v: string) {
    // Digits only — a price is a whole number of dollars here.
    setDrafts((d) => ({ ...d, [k]: v.replace(/[^\d]/g, '') }));
    setStatus((s) => ({ ...s, [k]: 'idle' }));
  }

  async function patch(id: string, size: SizeClass, price: number | null) {
    const k = key(id, size);
    setStatus((s) => ({ ...s, [k]: 'saving' }));
    setErrors((e) => ({ ...e, [k]: '' }));
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, size, price }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setStatus((s) => ({ ...s, [k]: 'error' }));
        setErrors((e) => ({ ...e, [k]: body.errors?.price ?? body.error ?? 'Could not save.' }));
        return;
      }
      const def = meta[k].defaultPrice;
      const stored = price === null ? def : price;
      setMeta((m) => ({ ...m, [k]: { ...m[k], price: stored, overridden: price !== null && price !== def } }));
      setDrafts((d) => ({ ...d, [k]: String(stored) }));
      setStatus((s) => ({ ...s, [k]: 'saved' }));
    } catch {
      setStatus((s) => ({ ...s, [k]: 'error' }));
      setErrors((e) => ({ ...e, [k]: 'You appear to be offline.' }));
    }
  }

  return (
    <div>
      {/* Industry tabs */}
      <div role="tablist" aria-label="Industry" className="mb-6 flex flex-wrap gap-2">
        {data.map((d) => (
          <button
            key={d.industry}
            role="tab"
            aria-selected={tab === d.industry}
            onClick={() => setTab(d.industry)}
            className={clsx(
              'rounded-sm px-4 py-2 font-mono text-[12px] uppercase tracking-widest2 transition-colors',
              tab === d.industry
                ? 'bg-flare/15 text-flare'
                : 'border border-white/15 text-muted hover:text-white'
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      {active.placeholder && (
        <p className="mb-5 rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
          {active.label} pricing is still marked <strong>indicative</strong> — customers see an
          &ldquo;confirmed after inspection&rdquo; disclosure on these quotes. Setting real prices
          here does not clear that flag (it lives in code); ask to flip it once the numbers are firm.
        </p>
      )}

      <div className="space-y-4">
        {active.items.map((item) => (
          <Card key={item.id}>
            <div className="mb-4 flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-white">{item.name}</h3>
              {item.kind === 'addon' && (
                <span className="rounded-full border border-white/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                  Add-on
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {item.cells.map((c) => {
                const k = key(item.id, c.size);
                const m = meta[k];
                const draft = drafts[k];
                const dirty = draft !== '' && Number(draft) !== m.price;
                const st = status[k] ?? 'idle';

                return (
                  <div key={k}>
                    <label
                      htmlFor={k}
                      className="mb-1 block font-mono text-[11px] uppercase tracking-widest2 text-subtle"
                    >
                      {c.label}
                    </label>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle">
                          $
                        </span>
                        <input
                          id={k}
                          inputMode="numeric"
                          value={draft}
                          onChange={(e) => setDraft(k, e.target.value)}
                          className={clsx(
                            'w-full rounded-sm border bg-white/[0.04] py-2 pl-7 pr-3 font-mono text-sm text-white outline-none transition-colors',
                            m.overridden ? 'border-flare/40' : 'border-white/20',
                            'focus:border-flare/70'
                          )}
                        />
                      </div>
                      {dirty && (
                        <button
                          type="button"
                          onClick={() => patch(item.id, c.size, Number(draft))}
                          disabled={st === 'saving'}
                          className={buttonClass('primary', 'sm')}
                        >
                          {st === 'saving' ? '…' : 'Save'}
                        </button>
                      )}
                    </div>

                    <p className="mt-1 min-h-[16px] text-[11px] leading-tight text-subtle">
                      {st === 'error' ? (
                        <span className="text-flare">{errors[k]}</span>
                      ) : st === 'saved' ? (
                        <span className="text-emerald-400">✓ Saved</span>
                      ) : m.overridden ? (
                        <>
                          Default{' '}
                          {c.defaultPriceMax
                            ? formatPrice(c.defaultPrice, c.defaultPriceMax)
                            : formatCurrency(c.defaultPrice)}{' '}
                          ·{' '}
                          <button
                            type="button"
                            onClick={() => patch(item.id, c.size, null)}
                            className="underline underline-offset-2 hover:text-white"
                          >
                            reset
                          </button>
                        </>
                      ) : c.defaultPriceMax ? (
                        <>Default range {formatPrice(c.defaultPrice, c.defaultPriceMax)}</>
                      ) : (
                        <>Built-in default</>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
