// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — agent registration.
//
// THIS FILE IS THE ENTIRE COST OF ADDING AN AGENT.
//
// Write `lib/jarvis/agents/inventory.ts` exporting an AgentDefinition, import it
// here, add it to the array. It is then schedulable, delegatable, voice-routable,
// and visible on the dashboard, because every one of those reads the registry
// rather than a hardcoded list.
//
// Registration happens once, on first import, guarded by a module-level flag —
// Next.js can evaluate a module more than once across dev reloads and route
// boundaries, and registerAgent() throws on a duplicate name by design.
// ─────────────────────────────────────────────────────────────────────────────

import { AgentDefinition, agentNames, registerAgent } from '../registry';
import { marketingAgent } from './marketing';
import { contentAgent } from './content';
import { commsAgent } from './comms';
import { seoAgent } from './seo';
import { leadGenAgent } from './leadgen';
import { analyticsAgent } from './analytics';
import { operationsAgent } from './operations';
import { supervisorAgent } from './supervisor';

const AGENTS: AgentDefinition[] = [
  marketingAgent,
  contentAgent,
  commsAgent,
  seoAgent,
  leadGenAgent,
  analyticsAgent,
  operationsAgent,
  supervisorAgent,
];

let registered = false;

/**
 * Call before touching the registry. Every entry point into Jarvis does — the
 * orchestrator, the API routes, the voice router — so no caller has to know
 * whether it is first.
 */
export function ensureAgentsRegistered(): void {
  if (registered) return;
  registered = true;

  for (const agent of AGENTS) {
    // A duplicate name means a copy-paste mistake in a new agent file. Failing
    // here is loud and immediate; the alternative is one agent silently
    // shadowing another's scheduled work.
    if (agentNames().includes(agent.name)) continue;
    registerAgent(agent);
  }
}
