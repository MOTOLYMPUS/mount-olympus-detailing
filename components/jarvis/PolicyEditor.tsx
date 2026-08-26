'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Autonomy settings.
//
// The most consequential screen in Jarvis: it decides whether an agent may
// email a customer without a human reading it first.
//
// So the wording is blunt rather than neutral. "Automatic" is described as
// "sends without asking you", not as "enabled" — a toggle whose consequence is
// only obvious in hindsight is a badly designed toggle. Switching a customer
// channel to automatic asks for confirmation, and payments cannot be switched
// at all (the server enforces that independently; here it is simply not
// offered).
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';
import { Card, CardTitle } from '@/components/ui';

type Mode = 'auto' | 'approve' | 'off';

export interface PolicyView {
  channels: Record<string, Mode>;
  approvalTtlHours: number;
  dailyTokenBudget: number;
  maxConcurrentTasks: number;
}

export interface AgentView {
  name: string;
  label: string;
  purpose: string;
  enabled: boolean;
  tasks: string[];
  schedule: { kind: string; cadence: string; hour: number; title: string }[];
}

const MODE_LABEL: Record<Mode, string> = {
  auto: 'Sends without asking you',
  approve: 'Drafts it, waits for your yes',
  off: 'Not allowed at all',
};

/** Channels where automatic means a real person receives something. */
const REACHES_A_PERSON = new Set([
  'email.customer',
  'sms.customer',
  'email.marketing',
  'sms.marketing',
  'social.post',
]);

/** The server refuses to automate this one; not offering it avoids a dead control. */
const LOCKED = new Set(['payment.write']);

export default function PolicyEditor({
  policy,
  channels,
  agents,
}: {
  policy: PolicyView;
  channels: { id: string; label: string }[];
  agents: AgentView[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, key: string) {
    setSaving(key);
    setError(null);
    try {
      const res = await fetch('/api/jarvis/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setError(data.error ?? 'Could not save that.');
      else router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(null);
    }
  }

  function setChannel(channel: string, mode: Mode) {
    if (mode === 'auto' && REACHES_A_PERSON.has(channel)) {
      const label = channels.find((c) => c.id === channel)?.label ?? channel;
      if (
        !confirm(
          `Let agents send ${label.toLowerCase()} with no review?\n\n` +
            `Anything they write goes straight out. You will see it in Activity afterwards, not before.`
        )
      ) {
        return;
      }
    }
    void post({ channels: { [channel]: mode } }, channel);
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-sm border border-apex/40 bg-apex/5 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}

      <Card>
        <CardTitle>What agents may do on their own</CardTitle>
        <ul className="divide-y divide-white/5">
          {channels.map((channel) => {
            const mode = policy.channels[channel.id] ?? 'approve';
            const locked = LOCKED.has(channel.id);

            return (
              <li key={channel.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-white">{channel.label}</p>
                  <p className="mt-0.5 text-[12px] text-subtle">
                    {locked
                      ? 'Always requires you. Agents have no path to move money.'
                      : MODE_LABEL[mode]}
                  </p>
                </div>

                {!locked && (
                  <div className="flex gap-1">
                    {(['auto', 'approve', 'off'] as Mode[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        disabled={saving === channel.id}
                        onClick={() => setChannel(channel.id, option)}
                        className={clsx(
                          'rounded-sm border px-3 py-1.5 text-[11px] transition-colors',
                          mode === option
                            ? option === 'auto'
                              ? 'border-amber-500/60 text-amber-300'
                              : 'border-white/40 text-white'
                            : 'border-white/10 text-subtle hover:border-white/30 hover:text-white'
                        )}
                      >
                        {option === 'auto' ? 'Automatic' : option === 'approve' ? 'Ask me' : 'Off'}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle>Agents</CardTitle>
        <ul className="divide-y divide-white/5">
          {agents.map((agent) => (
            <li key={agent.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm text-white">{agent.label}</p>
                <p className="mt-0.5 text-[12px] text-muted">{agent.purpose}</p>
                {agent.schedule.length > 0 && (
                  <p className="mt-1 font-mono text-[10px] text-subtle">
                    runs {agent.schedule.map((s) => `${s.cadence} at ${s.hour}:00`).join(' · ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={saving === agent.name}
                onClick={() => post({ agent: agent.name, enabled: !agent.enabled }, agent.name)}
                className={clsx(
                  'rounded-sm border px-3 py-1.5 text-[11px] transition-colors',
                  agent.enabled
                    ? 'border-emerald-500/40 text-emerald-400'
                    : 'border-white/10 text-subtle hover:border-white/30'
                )}
              >
                {agent.enabled ? 'On' : 'Off'}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Limits</CardTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void post(
              {
                dailyTokenBudget: Number(form.get('dailyTokenBudget')),
                approvalTtlHours: Number(form.get('approvalTtlHours')),
                maxConcurrentTasks: Number(form.get('maxConcurrentTasks')),
              },
              'limits'
            );
          }}
          className="grid gap-4 sm:grid-cols-3"
        >
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest2 text-subtle">
              Daily token budget
            </span>
            <input
              name="dailyTokenBudget"
              type="number"
              min={0}
              step={100_000}
              defaultValue={policy.dailyTokenBudget}
              className="w-full rounded-sm border border-white/15 bg-charcoal/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            />
            <span className="mt-1 block text-[11px] text-subtle">
              Agents stop when reached. 0 removes the cap.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest2 text-subtle">
              Approvals expire after
            </span>
            <input
              name="approvalTtlHours"
              type="number"
              min={1}
              max={720}
              defaultValue={policy.approvalTtlHours}
              className="w-full rounded-sm border border-white/15 bg-charcoal/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            />
            <span className="mt-1 block text-[11px] text-subtle">
              Hours. Stale drafts are never sent.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest2 text-subtle">
              Tasks per tick
            </span>
            <input
              name="maxConcurrentTasks"
              type="number"
              min={1}
              max={10}
              defaultValue={policy.maxConcurrentTasks}
              className="w-full rounded-sm border border-white/15 bg-charcoal/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            />
            <span className="mt-1 block text-[11px] text-subtle">How much runs per tick.</span>
          </label>

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={saving === 'limits'}
              className="rounded-sm border border-white/25 px-5 py-2 text-sm font-medium text-white transition-colors hover:border-white/60 disabled:opacity-50"
            >
              {saving === 'limits' ? 'Saving…' : 'Save limits'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
