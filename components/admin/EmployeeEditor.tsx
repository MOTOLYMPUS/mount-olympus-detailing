'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Edit one staff member: role, activation, pay, weekly shifts, time off, and a
// password reset.
//
// EVERY CONTROL HERE IS COSMETIC SECURITY. The rank rule ("you may only change
// someone strictly below you") is enforced in app/api/admin/employees/[id],
// which is the only thing standing between a curious manager and an admin
// account. `editable` merely stops this screen offering an action that will be
// refused — hiding a button is not a permission.
//
// THE SHIFT EDITOR POSTS THE WHOLE WEEK. `replaceShifts` deletes and reinserts,
// so a partial post would silently wipe the days it left out. The seven rows
// are therefore always sent, with an unchecked day sent as… nothing: rows are
// filtered out client-side and server-side, which is how "closed on Sunday" is
// expressed.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, CardTitle, buttonClass } from '@/components/ui';
import { EmployeeShift, Role, TimeOff, User } from '@/lib/models';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/rbac';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DayRow {
  enabled: boolean;
  start: string;
  end: string;
}

/** 'HH:mm' ⇄ minutes from midnight, which is what the schema stores. */
function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export default function EmployeeEditor({
  employee,
  shifts,
  timeOff,
  assignable,
  editable,
}: {
  employee: User;
  shifts: EmployeeShift[];
  timeOff: TimeOff[];
  /** Roles the SIGNED-IN admin may grant — already filtered server-side. */
  assignable: Role[];
  /** False when the target is at or above the actor's rank. */
  editable: boolean;
}) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [role, setRole] = useState<string>(employee.role);
  const [rate, setRate] = useState(employee.hourlyRate === null ? '' : String(employee.hourlyRate / 100));

  const [days, setDays] = useState<DayRow[]>(() =>
    WEEKDAYS.map((_, weekday) => {
      // Only the FIRST shift per weekday is editable here. The schema allows a
      // split shift (two rows for one day) and this editor cannot express one —
      // stated plainly rather than silently discarding the second row.
      const shift = shifts.find((s) => s.weekday === weekday);
      return {
        enabled: !!shift,
        start: toTime(shift?.startMin ?? 8 * 60),
        end: toTime(shift?.endMin ?? 17 * 60),
      };
    })
  );

  const [offStart, setOffStart] = useState('');
  const [offEnd, setOffEnd] = useState('');
  const [offReason, setOffReason] = useState('');

  async function send(body: unknown, method: 'PATCH' | 'POST' = 'PATCH', success = 'Saved.') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/employees/${employee.id}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That did not save.');
        return false;
      }
      setNotice(success);
      router.refresh();
      return true;
    } catch {
      setError('We could not reach the server.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!editable) {
    return (
      <Alert tone="warning" title="Read only">
        {employee.name} holds the {ROLE_LABEL[employee.role]} role, which is at or above your own.
        Nobody may change someone at or above their own rank — that rule is what stops two
        administrators locking each other out, and it applies to owners absolutely.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && !error && <Alert tone="positive">{notice}</Alert>}

      {/* ── Role & status ── */}
      <Card>
        <CardTitle>Role and status</CardTitle>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="role"
              className="font-mono text-[11px] uppercase tracking-widest2 text-subtle"
            >
              Role
            </label>
            <select
              id="role"
              className="input-field"
              value={role}
              disabled={busy}
              onChange={(e) => setRole(e.target.value)}
            >
              {/* The current role is included even when it is not assignable,
                  so the select is never blank; submitting it unchanged is a
                  no-op the API accepts. */}
              {!assignable.includes(employee.role) && (
                <option value={employee.role}>{ROLE_LABEL[employee.role]} (current)</option>
              )}
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <p className="text-[12px] leading-snug text-subtle">
              {ROLE_DESCRIPTION[role as Role] ?? 'Choose a role below your own.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="rate"
              className="font-mono text-[11px] uppercase tracking-widest2 text-subtle"
            >
              Hourly rate (USD)
            </label>
            <input
              id="rate"
              className="input-field"
              inputMode="decimal"
              value={rate}
              disabled={busy}
              placeholder="Blank for salaried"
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className={buttonClass('primary', 'sm')}
            onClick={() =>
              send({
                role,
                hourlyRate: rate.trim() === '' ? null : Math.round(Number(rate) * 100),
              })
            }
          >
            Save role and pay
          </button>

          <button
            type="button"
            disabled={busy}
            className={buttonClass(employee.active ? 'danger' : 'secondary', 'sm')}
            onClick={() => {
              if (
                employee.active &&
                !window.confirm(
                  `Deactivate ${employee.name}? They are signed out everywhere immediately and cannot sign back in.`
                )
              ) {
                return;
              }
              void send(
                { active: !employee.active },
                'PATCH',
                employee.active ? 'Deactivated and signed out.' : 'Reactivated.'
              );
            }}
          >
            {employee.active ? 'Deactivate' : 'Reactivate'}
          </button>

          <button
            type="button"
            disabled={busy}
            className={buttonClass('secondary', 'sm')}
            onClick={() =>
              send(
                { action: 'reset_password' },
                'POST',
                'A single-use reset link has been emailed to them. It expires in an hour.'
              )
            }
          >
            Send password reset
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-subtle">
          A reset link goes to their own inbox — you never see or set their password, so an
          administrator cannot end up knowing a colleague&rsquo;s live credentials.
        </p>
      </Card>

      {/* ── Weekly shifts ── */}
      <Card>
        <CardTitle>Weekly shifts</CardTitle>

        <ul className="space-y-2">
          {WEEKDAYS.map((label, weekday) => {
            const row = days[weekday];
            return (
              <li key={label} className="flex flex-wrap items-center gap-3">
                <label className="flex w-32 shrink-0 items-center gap-2 text-sm text-white">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-apex"
                    checked={row.enabled}
                    disabled={busy}
                    onChange={(e) =>
                      setDays((d) =>
                        d.map((x, i) => (i === weekday ? { ...x, enabled: e.target.checked } : x))
                      )
                    }
                  />
                  {label}
                </label>

                <input
                  type="time"
                  className="input-field max-w-[8rem]"
                  value={row.start}
                  disabled={busy || !row.enabled}
                  aria-label={`${label} start`}
                  onChange={(e) =>
                    setDays((d) => d.map((x, i) => (i === weekday ? { ...x, start: e.target.value } : x)))
                  }
                />
                <span className="text-subtle">to</span>
                <input
                  type="time"
                  className="input-field max-w-[8rem]"
                  value={row.end}
                  disabled={busy || !row.enabled}
                  aria-label={`${label} end`}
                  onChange={(e) =>
                    setDays((d) => d.map((x, i) => (i === weekday ? { ...x, end: e.target.value } : x)))
                  }
                />
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          disabled={busy}
          className={buttonClass('primary', 'sm', 'mt-4')}
          onClick={() =>
            send({
              shifts: days
                .map((row, weekday) => ({
                  weekday,
                  startMin: toMinutes(row.start),
                  endMin: toMinutes(row.end),
                  enabled: row.enabled,
                }))
                .filter((row) => row.enabled && row.endMin > row.startMin)
                .map(({ weekday, startMin, endMin }) => ({ weekday, startMin, endMin })),
            })
          }
        >
          Save shifts
        </button>

        <p className="mt-3 text-[12px] leading-relaxed text-subtle">
          These are the hours the availability engine will offer this technician. One block per day
          — a split shift is supported by the database but not by this editor.
        </p>
      </Card>

      {/* ── Time off ── */}
      <Card>
        <CardTitle>Time off</CardTitle>

        {timeOff.length === 0 ? (
          <p className="py-2 text-[13px] text-subtle">None booked.</p>
        ) : (
          <ul className="mb-4 space-y-1.5">
            {timeOff.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-muted">
                  {new Date(t.startsAt).toLocaleString()} → {new Date(t.endsAt).toLocaleString()}
                  {t.reason ? ` · ${t.reason}` : ''}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  className={buttonClass('ghost', 'sm')}
                  onClick={() => send({ action: 'remove_time_off', timeOffId: t.id }, 'POST', 'Removed.')}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="off-start" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              From
            </label>
            <input
              id="off-start"
              type="datetime-local"
              className="input-field"
              value={offStart}
              disabled={busy}
              onChange={(e) => setOffStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="off-end" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              To
            </label>
            <input
              id="off-end"
              type="datetime-local"
              className="input-field"
              value={offEnd}
              disabled={busy}
              onChange={(e) => setOffEnd(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="off-reason" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Reason
            </label>
            <input
              id="off-reason"
              className="input-field"
              value={offReason}
              disabled={busy}
              onChange={(e) => setOffReason(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          disabled={busy || !offStart || !offEnd}
          className={buttonClass('secondary', 'sm', 'mt-3')}
          onClick={async () => {
            const okResult = await send(
              {
                action: 'add_time_off',
                startsAt: new Date(offStart).toISOString(),
                endsAt: new Date(offEnd).toISOString(),
                reason: offReason,
              },
              'POST',
              'Time off booked. The scheduler will stop offering these hours.'
            );
            if (okResult) {
              setOffStart('');
              setOffEnd('');
              setOffReason('');
            }
          }}
        >
          Add time off
        </button>
      </Card>
    </div>
  );
}
