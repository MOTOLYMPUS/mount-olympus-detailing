'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Teach Jarvis, and correct it.
//
// PINNING IS THE IMPORTANT CONTROL. A pinned memory goes into every agent's
// system prompt on every run, so pinning "we never discount, we compete on
// quality" changes what all eight agents write from that moment on. That is
// enormous leverage, and the UI says so rather than presenting a quiet
// checkbox.
//
// Memories an agent wrote about itself are marked unconfirmed. Surfacing those
// for correction is the whole reason confidence is stored — otherwise a guess
// quietly becomes what the business believes.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';
import { Badge, Card, CardTitle, EmptyState, buttonClass } from '@/components/ui';
import { relativeTime } from '@/lib/timezone';

export interface MemoryView {
  id: string;
  kind: string;
  title: string;
  body: string;
  tags: string[];
  source: string;
  pinned: boolean;
  confidence: number;
  updatedAt: string;
}

const KINDS = [
  'brand',
  'goal',
  'sop',
  'project',
  'preference',
  'campaign',
  'insight',
  'customer_note',
  'employee_note',
  'pricing_note',
  'fact',
];

export default function MemoryEditor({
  memories,
  canEdit,
}: {
  memories: MemoryView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState('preference');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/jarvis/memory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, title, body, pinned }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (res.ok && data.ok) {
        setTitle('');
        setBody('');
        setPinned(false);
        router.refresh();
      } else {
        setError(data.error ?? 'Could not save that.');
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function togglePin(memory: MemoryView) {
    await fetch('/api/jarvis/memory', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: memory.id, pinned: !memory.pinned }),
    });
    router.refresh();
  }

  async function remove(memory: MemoryView) {
    // A pinned memory shapes every agent's behaviour; deleting one by accident
    // is a silent, hard-to-notice regression in everything they write.
    if (!confirm(`Forget "${memory.title}"?`)) return;
    await fetch(`/api/jarvis/memory?id=${encodeURIComponent(memory.id)}`, { method: 'DELETE' });
    router.refresh();
  }

  const pinnedCount = memories.filter((m) => m.pinned).length;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {memories.length === 0 ? (
          <EmptyState
            title="Jarvis knows nothing yet"
            description="Tell it how you write, what you are aiming for, and how you like things done. Pinned memories reach every agent."
          />
        ) : (
          memories.map((memory) => (
            <Card key={memory.id}>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{memory.title}</p>
                  <p className="mt-1 font-mono text-[11px] text-subtle">
                    {memory.kind} · {memory.source} · {relativeTime(memory.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {memory.confidence < 0.8 && <Badge tone="warning">unconfirmed</Badge>}
                  {memory.pinned && <Badge tone="info">pinned</Badge>}
                </div>
              </div>

              {memory.body && (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
                  {memory.body}
                </p>
              )}

              {canEdit && (
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => togglePin(memory)}
                    className="text-[11px] text-subtle underline transition hover:text-white"
                  >
                    {memory.pinned ? 'Unpin' : 'Pin to every agent'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(memory)}
                    className="text-[11px] text-subtle underline transition hover:text-flare"
                  >
                    Forget
                  </button>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      <div className="space-y-6">
        {canEdit && (
          <Card>
            <CardTitle>Teach Jarvis</CardTitle>
            <form onSubmit={save} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                  Kind
                </span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="w-full rounded-sm border border-white/15 bg-charcoal/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                  Title
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="How we talk about price"
                  className="w-full rounded-sm border border-white/15 bg-charcoal/60 px-3 py-2 text-sm text-white outline-none placeholder:text-subtle focus:border-white/40"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                  Detail
                </span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder="We never lead with a discount. If someone asks why we cost more, explain what is included…"
                  className="w-full rounded-sm border border-white/15 bg-charcoal/60 px-3 py-2 text-sm text-white outline-none placeholder:text-subtle focus:border-white/40"
                />
              </label>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[12px] text-muted">
                  Pin this — every agent reads it on every run.
                  {pinnedCount >= 20 && (
                    <span className="block text-flare">
                      {pinnedCount} already pinned. Past about 25 the oldest stop being included.
                    </span>
                  )}
                </span>
              </label>

              {error && <p className="text-sm text-flare">{error}</p>}

              <button type="submit" disabled={busy || !title.trim()} className={buttonClass('primary', 'sm')}>
                {busy ? 'Saving…' : 'Remember this'}
              </button>
            </form>
          </Card>
        )}

        <Card>
          <CardTitle>What belongs here</CardTitle>
          <p className="text-[13px] leading-relaxed text-muted">
            Standing facts: how you write, what you are aiming for, how a job should be run, what a
            campaign achieved.
          </p>
          <p className={clsx('mt-3 text-[13px] leading-relaxed text-muted')}>
            Not customers, appointments, jobs, or revenue — those live in the business database and
            agents read them directly. Anything here marked{' '}
            <span className="text-amber-400">unconfirmed</span> was an agent&rsquo;s inference.
            Correct it or delete it.
          </p>
        </Card>
      </div>
    </div>
  );
}
