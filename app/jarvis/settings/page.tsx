// ─────────────────────────────────────────────────────────────────────────────
// /jarvis/settings — autonomy, agents, limits, and integration status.
//
// Owner-only, matching the API. Everything here changes what the agents are
// allowed to do without asking.
// ─────────────────────────────────────────────────────────────────────────────

import { Card, CardTitle, PageHeader } from '@/components/ui';
import PolicyEditor from '@/components/jarvis/PolicyEditor';
import { requireRolePage } from '@/lib/guards';
import { CHANNELS, CHANNEL_LABEL, disabledAgents, getPolicy } from '@/lib/jarvis/config';
import { allAgents } from '@/lib/jarvis/registry';
import { ensureAgentsRegistered } from '@/lib/jarvis/agents';
import { connectorStatuses } from '@/lib/jarvis/connectors';
import { vaultConfigured } from '@/lib/jarvis/vault';
import { llmConfigured } from '@/lib/jarvis/llm';
import { cronSecret } from '@/lib/jarvis/config';

export const dynamic = 'force-dynamic';

export default function JarvisSettingsPage() {
  requireRolePage('owner', '/jarvis/settings');
  ensureAgentsRegistered();

  const policy = getPolicy();
  const off = disabledAgents();

  return (
    <>
      <PageHeader
        eyebrow="Jarvis"
        title="Settings"
        description="What the agents may do on their own, and what always comes to you first."
      />

      <PolicyEditor
        policy={{
          channels: policy.channels,
          approvalTtlHours: policy.approvalTtlHours,
          dailyTokenBudget: policy.dailyTokenBudget,
          maxConcurrentTasks: policy.maxConcurrentTasks,
        }}
        channels={CHANNELS.map((c) => ({ id: c, label: CHANNEL_LABEL[c] }))}
        agents={allAgents().map((a) => ({
          name: a.name,
          label: a.label,
          purpose: a.purpose,
          enabled: !off.includes(a.name),
          tasks: Object.keys(a.tasks),
          schedule: (a.schedule ?? []).map((s) => ({
            kind: s.kind,
            cadence: s.cadence,
            hour: s.hour,
            title: s.title,
          })),
        }))}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Integrations</CardTitle>
          <ul className="divide-y divide-white/5">
            {connectorStatuses().map((connector) => (
              <li key={connector.name} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-white">{connector.label}</p>
                  <span
                    className={
                      connector.configured
                        ? 'font-mono text-[11px] text-emerald-400'
                        : 'font-mono text-[11px] text-subtle'
                    }
                  >
                    {connector.configured ? 'connected' : 'not connected'}
                  </span>
                </div>
                {!connector.configured && (
                  <p className="mt-1 font-mono text-[10px] text-subtle">
                    needs {connector.missing.join(', ')}
                  </p>
                )}
                <p className="mt-1 text-[12px] text-muted">{connector.setupNote}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>System</CardTitle>
          <ul className="space-y-3 text-sm">
            <SystemRow
              label="Agent reasoning"
              ok={llmConfigured()}
              detail={
                llmConfigured()
                  ? 'ANTHROPIC_API_KEY is set.'
                  : 'ANTHROPIC_API_KEY is missing — agents cannot reason.'
              }
            />
            <SystemRow
              label="Credential vault"
              ok={vaultConfigured()}
              detail={
                vaultConfigured()
                  ? 'JARVIS_SECRET_KEY is set; credentials can be stored encrypted.'
                  : 'JARVIS_SECRET_KEY is missing — credentials must come from .env instead.'
              }
            />
            <SystemRow
              label="Scheduled runs"
              ok={!!cronSecret()}
              detail={
                cronSecret()
                  ? 'A cron secret is set. Point a scheduler at POST /api/jarvis/tick.'
                  : 'No JARVIS_CRON_SECRET or CRON_SECRET — scheduled work only runs when you press Run now.'
              }
            />
          </ul>
          <p className="mt-4 text-[12px] text-muted">
            Setup for each of these is in <code>docs/JARVIS.md</code>.
          </p>
        </Card>
      </div>
    </>
  );
}

function SystemRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li>
      <div className="flex items-center justify-between gap-3">
        <span className="text-white">{label}</span>
        <span className={ok ? 'font-mono text-[11px] text-emerald-400' : 'font-mono text-[11px] text-amber-400'}>
          {ok ? 'ready' : 'not set up'}
        </span>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">{detail}</p>
    </li>
  );
}
