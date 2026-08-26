// ─────────────────────────────────────────────────────────────────────────────
// GET /api/jarvis/status — everything the dashboard renders, in one call.
//
// One endpoint rather than six, because the dashboard shows them together and
// six parallel requests would each pay the session lookup and open the same
// database. The payload is small — counts and recent rows, never full task
// results.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, withAuth } from '@/lib/api';
import { orchestratorStatus } from '@/lib/jarvis/orchestrator';
import { agentMetrics, agentStates, listEvents } from '@/lib/jarvis/logs';
import { listTasks } from '@/lib/jarvis/queue';
import { listApprovals } from '@/lib/jarvis/approvals';
import { connectorStatuses } from '@/lib/jarvis/connectors';
import { memoryCounts } from '@/lib/jarvis/memory';
import { recentVoiceTurns } from '@/lib/jarvis/voice';
import { llmConfigured } from '@/lib/jarvis/llm';
import { vaultConfigured } from '@/lib/jarvis/vault';
import { getPolicy } from '@/lib/jarvis/config';

export const dynamic = 'force-dynamic';

export const GET = withAuth('manager', async () => {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  return ok({
    status: orchestratorStatus(),
    policy: getPolicy(),
    agentStates: agentStates(),
    metrics: agentMetrics(dayAgo),
    recentTasks: listTasks({ limit: 20 }),
    pendingApprovals: listApprovals({ status: 'pending', limit: 20 }),
    connectors: connectorStatuses(),
    memory: memoryCounts(),
    voice: recentVoiceTurns(10),
    events: listEvents({ limit: 30 }),
    system: {
      // Surfaced so the dashboard can say "agents cannot think yet" rather than
      // leaving the owner to wonder why every task fails.
      aiConfigured: llmConfigured(),
      vaultConfigured: vaultConfigured(),
    },
  });
});
