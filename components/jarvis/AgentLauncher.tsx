'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Start an agent by hand.
//
// The keyboard path to everything the voice console does — for a noisy shop, a
// browser with no speech support, or a brief too long and too specific to say
// out loud.
//
// The agent and task lists come from the server as props, generated from the
// registry. Nothing here is hardcoded, so a ninth agent appears in this menu
// with no change to this file.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { buttonClass } from '@/components/ui';

export interface LaunchableAgent {
  name: string;
  label: string;
  purpose: string;
  enabled: boolean;
  tasks: { kind: string; title: string }[];
}

export default function AgentLauncher({ agents }: { agents: LaunchableAgent[] }) {
  const [agentName, setAgentName] = useState(agents[0]?.name ?? '');
  const [kind, setKind] = useState(agents[0]?.tasks[0]?.kind ?? '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const agent = agents.find((a) => a.name === agentName);

  function pickAgent(name: string) {
    setAgentName(name);
    // The previous task kind almost certainly does not exist on the new agent,
    // and posting it would just earn a 400.
    setKind(agents.find((a) => a.name === name)?.tasks[0]?.kind ?? '');
    setMessage(null);
  }

  async function launch(e: React.FormEvent) {
    e.preventDefault();
    if (!agentName || !kind) return;

    setBusy(true);
    setMessage(null);

    try {
      const res = await fetch('/api/jarvis/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agent: agentName, kind, notes }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };

      if (res.ok && data.ok) {
        setMessage({ tone: 'ok', text: data.message ?? 'Queued.' });
        setNotes('');
      } else {
        setMessage({ tone: 'error', text: data.error ?? 'Could not queue that.' });
      }
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  }

  if (!agents.length) return <p className="text-sm text-muted">No agents are registered.</p>;

  return (
    <form onSubmit={launch} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest2 text-subtle">
            Agent
          </span>
          <select
            value={agentName}
            onChange={(e) => pickAgent(e.target.value)}
            className="w-full rounded-sm border border-white/15 bg-charcoal/60 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40"
          >
            {agents.map((a) => (
              <option key={a.name} value={a.name} disabled={!a.enabled}>
                {a.label}
                {a.enabled ? '' : ' (off)'}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest2 text-subtle">
            Task
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-sm border border-white/15 bg-charcoal/60 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40"
          >
            {(agent?.tasks ?? []).map((t) => (
              <option key={t.kind} value={t.kind}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {agent && <p className="text-[12px] text-muted">{agent.purpose}</p>}

      <label className="block">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest2 text-subtle">
          Anything specific? (optional)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Focus on marine customers, keep it short, mention the spring slot…"
          className="w-full rounded-sm border border-white/15 bg-charcoal/60 px-3 py-2 text-sm text-white outline-none transition placeholder:text-subtle focus:border-white/40"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !agent?.enabled} className={buttonClass('primary', 'md')}>
          {busy ? 'Queueing…' : 'Queue it'}
        </button>
        {message && (
          <span className={message.tone === 'ok' ? 'text-sm text-emerald-400' : 'text-sm text-flare'}>
            {message.text}
          </span>
        )}
      </div>

      <p className="text-[11px] text-subtle">
        Queued work runs on the next orchestrator tick. Results appear under Activity, and anything
        that would go out to a customer lands in Approvals first.
      </p>
    </form>
  );
}
