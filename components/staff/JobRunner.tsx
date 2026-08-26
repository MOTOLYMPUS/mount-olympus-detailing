'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The job runner — what a technician actually works from.
//
// THE CLOCK IS NOT REACT STATE. `startedAt`, `pausedAt` and `pausedMs` live in
// the database (see lib/repo/jobs.ts); this component only re-derives elapsed
// time from them once a second. That is the whole reason a refresh, a locked
// phone, a dropped connection or a redeploy mid-job cannot lose or inflate the
// recorded duration — there is no in-memory counter to lose. The interval here
// is a rendering detail, not the source of truth.
//
// EVERY MUTATION GOES THROUGH THE API. The component holds an optimistic copy
// so a checklist tick feels instant, but the server response replaces it. When
// a save fails the optimistic value is rolled back and an error is shown —
// silently keeping a tick the server rejected is worse than not ticking it,
// because the technician would leave believing the work was recorded.
//
// SIGNATURE: pointer events, so one code path serves mouse, stylus and finger.
// A canvas is fundamentally unusable by keyboard or screen reader, so the
// TYPED NAME field — not the drawing — is the record of who signed. The drawing
// is supporting evidence. That ordering is what makes this screen completable
// without a mouse.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Alert,
  Badge,
  Card,
  CardTitle,
  StatusBadge,
  buttonClass,
} from '@/components/ui';
import { ChecklistItem, Job, JobPhoto, MaterialUse, PhotoKind } from '@/lib/models';
import { formatCurrency } from '@/lib/pricing';

// ── Elapsed time ─────────────────────────────────────────────────────────────

/**
 * Worked milliseconds = wall time since start, minus every paused interval.
 * While paused, `pausedAt` grows at the same rate as `now`, so the number
 * naturally freezes without a special case.
 */
function elapsedMs(job: Job, now: number): number {
  if (!job.startedAt) return 0;
  const since = now - new Date(job.startedAt).getTime();
  const paused = job.pausedMs + (job.pausedAt ? now - new Date(job.pausedAt).getTime() : 0);
  return Math.max(0, since - paused);
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Signature pad ────────────────────────────────────────────────────────────

/**
 * Black ink on a white ground rather than the app's dark palette: a signature
 * ends up attached to an invoice and printed, and an inverted signature on
 * paper looks like a redaction.
 */
function SignaturePad({
  onChange,
  disabled,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const prime = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111111';
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Size the BACKING STORE to the device pixel ratio so the stroke is not a
    // blurry two-pixel smear on a phone.
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    ctx?.scale(ratio, ratio);
    prime();
    // Re-priming scales the context again, so this runs once per mount only.
  }, [prime]);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // Capture the pointer so a stroke that leaves the canvas still finishes
    // cleanly instead of leaving `drawing` stuck true.
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pointFrom(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty.current = true;
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* the pointer may already be gone; nothing to release */
    }
    if (dirty.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  }

  function clear() {
    dirty.current = false;
    prime();
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        // touch-none stops the browser scrolling the page instead of drawing.
        className="h-40 w-full touch-none rounded-sm border border-white/20 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        aria-label="Customer signature area. Not usable with a keyboard — use the typed name field instead."
        role="img"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-subtle">
          Optional. The typed name below is the record of who signed.
        </p>
        <button type="button" onClick={clear} disabled={disabled} className={buttonClass('ghost', 'sm')}>
          Clear
        </button>
      </div>
    </div>
  );
}

// ── Runner ───────────────────────────────────────────────────────────────────

interface Props {
  initialJob: Job;
  initialPhotos: JobPhoto[];
  customerName: string;
  quotedTotal: number;
  /** Managers see money; technicians do not. */
  showMoney: boolean;
}

export default function JobRunner({
  initialJob,
  initialPhotos,
  customerName,
  quotedTotal,
  showMoney,
}: Props) {
  const router = useRouter();

  const [job, setJob] = useState<Job>(initialJob);
  const [photos, setPhotos] = useState<JobPhoto[]>(initialPhotos);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [notes, setNotes] = useState(initialJob.completionNotes);
  const [materials, setMaterials] = useState<MaterialUse[]>(initialJob.materials);
  const [signature, setSignature] = useState<string | null>(null);
  const [signedBy, setSignedBy] = useState(initialJob.signedBy || customerName);
  const [photoKind, setPhotoKind] = useState<PhotoKind>('before');

  const done = job.status === 'completed';

  // ── Clock ──────────────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // No interval at all when the clock cannot move — an idle tab of completed
    // jobs should not wake the CPU once a second.
    if (job.status !== 'in_progress') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [job.status]);
  useEffect(() => setNow(Date.now()), [job.startedAt, job.pausedAt, job.pausedMs, job.status]);

  const elapsed = elapsedMs(job, now);

  // ── Transport ──────────────────────────────────────────────────────────────

  const call = useCallback(
    async (url: string, method: string, body?: unknown): Promise<any | null> => {
      setError('');
      try {
        const res = await fetch(url, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setError(data.error ?? 'That did not save. Please try again.');
          return null;
        }
        return data;
      } catch {
        setError('No connection. Your change was not saved — try again when you have signal.');
        return null;
      }
    },
    []
  );

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const data = await call(`/api/jobs/${job.id}`, 'PATCH', body);
      if (data?.job) setJob(data.job as Job);
      return !!data;
    },
    [call, job.id]
  );

  // ── Status transitions ─────────────────────────────────────────────────────

  async function transition(action: 'start' | 'pause' | 'resume') {
    setBusy(true);
    const data = await call(`/api/jobs/${job.id}/status`, 'POST', { action });
    if (data?.job) setJob(data.job as Job);
    setBusy(false);
  }

  async function complete() {
    setBusy(true);
    setNotice('');
    const data = await call(`/api/jobs/${job.id}/status`, 'POST', {
      action: 'complete',
      completionNotes: notes,
      signatureData: signature,
      signedBy,
    });
    if (data?.job) {
      setJob(data.job as Job);
      setNotice('Job closed. The customer has been emailed and their points awarded.');
      // The appointment status changed too, so the surrounding server-rendered
      // page is now stale.
      router.refresh();
    }
    setBusy(false);
  }

  // ── Checklist ──────────────────────────────────────────────────────────────

  async function toggle(index: number) {
    const previous = job.checklist;
    const next: ChecklistItem[] = previous.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    );
    // Optimistic: the tick has to feel instantaneous on a phone.
    setJob((j) => ({ ...j, checklist: next }));
    const okResult = await patch({ checklist: next });
    if (!okResult) setJob((j) => ({ ...j, checklist: previous }));
  }

  const checklistDone = job.checklist.filter((i) => i.done).length;

  // ── Materials ──────────────────────────────────────────────────────────────

  function updateMaterial(index: number, field: keyof MaterialUse, value: string) {
    setMaterials((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        if (field === 'qty') return { ...row, qty: Number(value) || 0 };
        if (field === 'costCents') {
          // The technician types dollars; the column stores cents.
          return { ...row, costCents: Math.round((Number(value) || 0) * 100) };
        }
        return { ...row, [field]: value };
      })
    );
  }

  const materialsTotal = useMemo(
    () => materials.reduce((sum, m) => sum + m.costCents * (m.qty || 0), 0),
    [materials]
  );

  async function saveDetails() {
    setBusy(true);
    const okResult = await patch({ materials, completionNotes: notes });
    if (okResult) setNotice('Saved.');
    setBusy(false);
  }

  // ── Photos ─────────────────────────────────────────────────────────────────

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError('');

    const form = new FormData();
    form.set('scope', 'jobs');
    Array.from(files)
      .slice(0, 10)
      .forEach((f) => form.append('file', f));

    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That upload failed.');
        setBusy(false);
        return;
      }

      // Two steps by design: /api/uploads owns the bytes, this route owns the
      // record. Each stored file is attached in turn so one bad frame does not
      // discard the rest of the batch.
      for (const file of data.files as { url: string }[]) {
        const attached = await call(`/api/jobs/${job.id}/photos`, 'POST', {
          kind: photoKind,
          url: file.url,
        });
        if (attached?.photo) setPhotos((p) => [...p, attached.photo as JobPhoto]);
      }
    } catch {
      setError('That upload failed. Check your connection.');
    }
    setBusy(false);
  }

  async function removePhoto(id: string) {
    const data = await call(`/api/jobs/${job.id}/photos?photo=${encodeURIComponent(id)}`, 'DELETE');
    if (data) setPhotos((p) => p.filter((photo) => photo.id !== id));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger" title="Not saved">{error}</Alert>}
      {notice && !error && <Alert tone="positive">{notice}</Alert>}

      {/* ── Timer & transitions ── */}
      <Card>
        <CardTitle action={<StatusBadge status={job.status} />}>Time on job</CardTitle>

        {/* THE TIMER IS READ AT ARM'S LENGTH, IN SUNLIGHT, ONE-HANDED.
            So: 5xl instead of 4xl, tabular-nums so the digits do not jitter as
            the seconds roll, and a colour that carries the state — white while
            running, amber while paused, muted once recorded. A technician
            glancing at their phone on a driveway should know whether the clock
            is running without reading the badge.

            Zero animation on this card. Not a pulse, not a fade. This is the
            screen the business's time records come from. */}
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={clsx(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              job.status === 'in_progress'
                ? 'bg-emerald-400'
                : job.status === 'paused'
                  ? 'bg-amber-400'
                  : done
                    ? 'bg-white/30'
                    : 'bg-white/20'
            )}
          />
          <p
            className={clsx(
              'font-mono text-5xl font-bold tabular-nums tracking-tightest',
              job.status === 'paused' ? 'text-amber-300' : done ? 'text-muted' : 'text-white'
            )}
            // The clock changes every second; announcing each tick would make a
            // screen reader unusable. The status badge carries the state change.
            aria-live="off"
          >
            {formatClock(elapsed)}
          </p>
        </div>

        <p className="mt-2 text-[13px] text-subtle">
          {job.startedAt
            ? `Started, ${Math.round(job.pausedMs / 60000)} min paused`
            : 'Not started yet'}
          {job.durationMinutes !== null && ` · recorded ${job.durationMinutes} min`}
        </p>

        {!done && (
          <div className="mt-4">
            {/* One line naming the next action, above the button that performs
                it. The old version showed a bare "Pause" with no indication of
                what state the job was in or what came next. */}
            <p className="mb-2 font-mono text-[11px] uppercase tracking-widest2 text-muted">
              {job.status === 'assigned'
                ? 'Clock is not running'
                : job.status === 'in_progress'
                  ? 'Clock running'
                  : 'Paused — time is not accruing'}
            </p>

            <div className="flex flex-wrap gap-2">
              {job.status === 'assigned' && (
                // Full width on a phone: a one-handed tap should not have to
                // find a small target.
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => transition('start')}
                  className={buttonClass('primary', 'md', 'w-full sm:w-auto')}
                >
                  {busy ? 'Starting…' : 'Start job'}
                </button>
              )}
              {job.status === 'in_progress' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => transition('pause')}
                  className={buttonClass('secondary', 'md', 'w-full sm:w-auto')}
                >
                  {busy ? 'Pausing…' : 'Pause'}
                </button>
              )}
              {job.status === 'paused' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => transition('resume')}
                  className={buttonClass('primary', 'md', 'w-full sm:w-auto')}
                >
                  {busy ? 'Resuming…' : 'Resume'}
                </button>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ── Checklist ── */}
      <Card>
        <CardTitle
          action={
            <span className="font-mono text-[11px] text-muted">
              {checklistDone} / {job.checklist.length}
            </span>
          }
        >
          Checklist
        </CardTitle>

        {job.checklist.length === 0 ? (
          <p className="py-3 text-[13px] text-subtle">
            No checklist was generated for these services.
          </p>
        ) : (
          <ul className="space-y-1">
            {job.checklist.map((item, index) => (
              <li key={`${item.id}-${index}`}>
                <label
                  className={clsx(
                    'flex cursor-pointer items-start gap-3 rounded-sm px-2 py-2.5 transition-colors hover:bg-white/5',
                    done && 'cursor-default opacity-70'
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-apex"
                    checked={item.done}
                    disabled={done || busy}
                    onChange={() => toggle(index)}
                  />
                  <span className={clsx('text-sm', item.done ? 'text-subtle line-through' : 'text-white')}>
                    {item.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Materials ── */}
      <Card>
        <CardTitle
          action={
            showMoney ? (
              <span className="font-mono text-[11px] text-muted">
                {formatCurrency(materialsTotal / 100)} of {formatCurrency(quotedTotal)}
              </span>
            ) : undefined
          }
        >
          Materials used
        </CardTitle>

        <div className="space-y-2">
          {materials.map((row, index) => (
            <div key={index} className="grid grid-cols-12 gap-2">
              <input
                className="input-field col-span-5"
                placeholder="Product"
                value={row.name}
                disabled={done}
                aria-label={`Material ${index + 1} name`}
                onChange={(e) => updateMaterial(index, 'name', e.target.value)}
              />
              <input
                className="input-field col-span-2"
                placeholder="Qty"
                inputMode="decimal"
                value={row.qty || ''}
                disabled={done}
                aria-label={`Material ${index + 1} quantity`}
                onChange={(e) => updateMaterial(index, 'qty', e.target.value)}
              />
              <input
                className="input-field col-span-2"
                placeholder="Unit"
                value={row.unit}
                disabled={done}
                aria-label={`Material ${index + 1} unit`}
                onChange={(e) => updateMaterial(index, 'unit', e.target.value)}
              />
              <input
                className="input-field col-span-2"
                placeholder="Cost $"
                inputMode="decimal"
                value={row.costCents ? (row.costCents / 100).toString() : ''}
                disabled={done}
                aria-label={`Material ${index + 1} unit cost in dollars`}
                onChange={(e) => updateMaterial(index, 'costCents', e.target.value)}
              />
              <button
                type="button"
                disabled={done}
                aria-label={`Remove material ${index + 1}`}
                onClick={() => setMaterials((rows) => rows.filter((_, i) => i !== index))}
                className={buttonClass('ghost', 'sm', 'col-span-1')}
              >
                ✕
              </button>
            </div>
          ))}

          {!done && (
            <button
              type="button"
              onClick={() =>
                setMaterials((rows) => [...rows, { name: '', qty: 1, unit: 'ea', costCents: 0 }])
              }
              className={buttonClass('secondary', 'sm')}
            >
              Add material
            </button>
          )}
        </div>
      </Card>

      {/* ── Photos ── */}
      <Card>
        <CardTitle>Photos</CardTitle>

        {!done && (
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="flex gap-1.5">
              {(['before', 'progress', 'after'] as PhotoKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setPhotoKind(kind)}
                  aria-pressed={photoKind === kind}
                  className={clsx(
                    'rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest2 transition-colors',
                    photoKind === kind
                      ? 'border-apex bg-apex/10 text-white'
                      : 'border-white/20 text-muted hover:border-white/50'
                  )}
                >
                  {kind}
                </button>
              ))}
            </div>

            <label className={buttonClass('secondary', 'sm', 'cursor-pointer')}>
              Add {photoKind} photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  void upload(e.target.files);
                  // Reset so re-picking the same file fires change again.
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        )}

        {photos.length === 0 ? (
          <p className="py-3 text-[13px] text-subtle">
            No photos yet. Before-and-after shots are what customers share.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <li
                key={photo.id}
                className="relative overflow-hidden rounded-sm border border-white/10 bg-black/30"
              >
                {/* Plain <img>: these are user uploads served from our own
                    /api/files route, which next/image cannot optimise without
                    a remotePatterns config, and optimising a job photo buys
                    nothing. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.caption || `${photo.kind} photo`}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />

                {/* A gradient foot under the kind badge. A phone camera in a
                    bright bay produces near-white frames, and a `neutral` badge
                    with white text was unreadable on top of one. */}
                <span
                  className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-obsidian/85 to-transparent"
                  aria-hidden="true"
                />
                <span className="absolute left-1.5 top-1.5">
                  <Badge tone={photo.kind === 'after' ? 'positive' : 'neutral'}>{photo.kind}</Badge>
                </span>

                {!done && (
                  // ALWAYS VISIBLE, not hover-revealed. This screen is used on
                  // a phone, where there is no hover — the previous
                  // `opacity-0 group-hover:opacity-100` meant the delete
                  // control could not be found at all on the device it is
                  // actually used on. A solid pill keeps it legible over any
                  // photo instead.
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    aria-label={`Delete ${photo.kind} photo`}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-obsidian/85 font-mono text-[12px] text-white transition-colors duration-200 hover:border-apex hover:bg-apex/20"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Completion ── */}
      <Card>
        <CardTitle>Handover</CardTitle>

        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="completion-notes"
              className="font-mono text-[11px] uppercase tracking-widest2 text-subtle"
            >
              Completion notes
            </label>
            <textarea
              id="completion-notes"
              className="input-field resize-y"
              rows={4}
              maxLength={4000}
              value={notes}
              disabled={done}
              placeholder="Anything the customer should know, or the next technician should read."
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {!done && (
            <>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="signed-by"
                  className="font-mono text-[11px] uppercase tracking-widest2 text-subtle"
                >
                  Signed by (typed name)
                </label>
                <input
                  id="signed-by"
                  className="input-field"
                  value={signedBy}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => setSignedBy(e.target.value)}
                />
              </div>

              <SignaturePad onChange={setSignature} disabled={done} />
            </>
          )}

          {done && job.signatureData && (
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                Signature
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={job.signatureData}
                alt={`Signature of ${job.signedBy || 'the customer'}`}
                className="h-28 rounded-sm bg-white p-1"
              />
              <p className="mt-1 text-[12px] text-subtle">
                {job.signedBy || 'Unnamed'} · {job.signedAt ? new Date(job.signedAt).toLocaleString() : ''}
              </p>
            </div>
          )}

          {!done && (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <button type="button" disabled={busy} onClick={saveDetails} className={buttonClass('secondary')}>
                Save progress
              </button>
              <button
                type="button"
                disabled={busy || !job.startedAt}
                onClick={complete}
                className={buttonClass('primary')}
                title={job.startedAt ? undefined : 'Start the job before completing it'}
              >
                Complete job
              </button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
