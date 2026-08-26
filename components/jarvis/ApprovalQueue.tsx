'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The approval queue.
//
// THE PAYLOAD IS SHOWN IN FULL, ALWAYS. Not a summary, not the first line, not
// a truncated preview — the exact text that will be sent, in the exact fields
// the connector will receive. An approval screen that hides what it is
// approving is theatre, and the owner would learn to click through it.
//
// Rejection is one click and needs no reason. Approval is the deliberate act;
// saying no should never be the harder path.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import clsx from 'clsx';
import { Badge, Card, EmptyState, buttonClass } from '@/components/ui';
import { relativeTime } from '@/lib/timezone';

export interface ApprovalView {
  id: string;
  agent: string;
  channel: string;
  action: string;
  summary: string;
  payload: Record<string, unknown>;
  risk: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

export default function ApprovalQueue({
  approvals,
  canDecide,
}: {
  approvals: ApprovalView[];
  canDecide: boolean;
}) {
  // Decided items are hidden optimistically rather than by refetching: the
  // owner works through a queue, and a full reload after each decision loses
  // their place in it.
  const [resolved, setResolved] = useState<Record<string, string>>({});

  const remaining = approvals.filter((a) => !resolved[a.id]);

  if (!approvals.length) {
    return (
      <EmptyState
        title="Nothing waiting"
        description="When an agent drafts something that would reach a customer or the public, it lands here for your yes."
      />
    );
  }

  return (
    <div className="space-y-4">
      {remaining.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          canDecide={canDecide}
          onResolved={(text) => setResolved((prev) => ({ ...prev, [approval.id]: text }))}
        />
      ))}

      {Object.entries(resolved).map(([id, text]) => (
        <p key={id} className="rounded-sm border border-white/10 px-4 py-2 text-sm text-muted">
          {text}
        </p>
      ))}
    </div>
  );
}

function ApprovalCard({
  approval,
  canDecide,
  onResolved,
}: {
  approval: ApprovalView;
  canDecide: boolean;
  onResolved: (text: string) => void;
}) {
  const [busy, setBusy] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approved' | 'rejected') {
    setBusy(decision);
    setError(null);

    try {
      const res = await fetch('/api/jarvis/approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: approval.id, decision }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };

      if (res.ok && data.ok) {
        onResolved(
          decision === 'approved'
            ? `Approved — ${data.message ?? 'sent.'}`
            : `Rejected — nothing was sent. (${approval.summary})`
        );
      } else {
        setError(data.error ?? 'That did not work.');
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{approval.summary}</p>
          <p className="mt-1 font-mono text-[11px] text-subtle">
            {approval.agent} · {approval.action} · {relativeTime(approval.createdAt)}
            {approval.expiresAt && ` · expires ${relativeTime(approval.expiresAt)}`}
          </p>
        </div>
        <Badge tone={approval.risk === 'high' ? 'danger' : approval.risk === 'low' ? 'neutral' : 'warning'}>
          {approval.risk} risk
        </Badge>
      </div>

      <PayloadView payload={approval.payload} />

      {error && <p className="mt-3 text-sm text-flare">{error}</p>}

      {canDecide ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide('approved')}
            className={buttonClass('primary', 'sm')}
          >
            {busy === 'approved' ? 'Sending…' : 'Approve & send'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide('rejected')}
            className={buttonClass('secondary', 'sm')}
          >
            {busy === 'rejected' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-[12px] text-subtle">
          Only an administrator or the owner can approve outgoing work.
        </p>
      )}
    </Card>
  );
}

/**
 * Render the payload as labelled fields rather than raw JSON. The owner is
 * reading an email before it goes to a customer, and braces and escaped
 * newlines actively hide typos.
 */
function PayloadView({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(
    // `agent` is stamped on by the tool layer for attribution and is noise here.
    ([key, value]) => key !== 'agent' && value !== undefined && value !== null && value !== ''
  );

  if (!entries.length) {
    return <p className="text-sm text-muted">No content — check the agent that produced this.</p>;
  }

  return (
    <dl className="space-y-3 rounded-sm border border-white/10 bg-obsidian/50 p-4">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="font-mono text-[10px] uppercase tracking-widest2 text-subtle">{key}</dt>
          <dd
            className={clsx(
              'mt-1 whitespace-pre-wrap text-sm text-white',
              // Long bodies get a readable measure; short fields stay inline.
              String(value).length > 120 && 'leading-relaxed'
            )}
          >
            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
