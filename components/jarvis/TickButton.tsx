'use client';

// ─────────────────────────────────────────────────────────────────────────────
// "Run now" — fires one orchestrator tick.
//
// Exists because the scheduled tick is external (Task Scheduler or cron, see
// docs/JARVIS.md), and waiting fifteen minutes to find out whether an agent
// works is a miserable way to set the system up.
//
// The page is reloaded rather than polled on completion: a tick changes tasks,
// events, metrics, and approvals all at once, and the server component already
// renders every one of those correctly.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass } from '@/components/ui';

export default function TickButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);

    try {
      const res = await fetch('/api/jarvis/tick', { method: 'POST' });
      const data = (await res.json()) as {
        ok?: boolean;
        claimed?: number;
        completed?: number;
        failed?: number;
        scheduled?: number;
        note?: string;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setResult(data.error ?? 'The tick failed.');
      } else {
        const parts = [
          `${data.completed ?? 0} completed`,
          (data.failed ?? 0) > 0 ? `${data.failed} failed` : null,
          (data.scheduled ?? 0) > 0 ? `${data.scheduled} newly scheduled` : null,
          data.claimed === 0 ? 'nothing was waiting' : null,
        ].filter(Boolean);
        setResult([parts.join(', '), data.note].filter(Boolean).join(' — '));
        router.refresh();
      }
    } catch {
      setResult('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={run} disabled={busy} className={buttonClass('secondary', 'sm')}>
        {busy ? 'Running…' : 'Run now'}
      </button>
      {result && <span className="text-[11px] text-subtle">{result}</span>}
    </div>
  );
}
