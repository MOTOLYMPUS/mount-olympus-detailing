// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — connectors: the ONLY way anything reaches the outside world.
//
// Agents have no `fetch`, no mail client, and no file writer of their own. When
// an agent wants to act, it calls `perform()` here, and this file decides —
// from the approval policy in config.ts — whether that happens now, waits for
// the owner, or is refused. Concentrating it in one function is what makes the
// safety property checkable: there is exactly one place to audit.
//
//     agent → perform() ─┬─ policy 'auto'    → connector runs
//                        ├─ policy 'approve' → approval row, task pauses
//                        └─ policy 'off'     → refused, agent told not to retry
//
// ADDING A CONNECTOR is a three-step change with no edits elsewhere: write a
// module exporting a `Connector`, list it in CONNECTORS below, and add its
// channel to CHANNELS in config.ts. Nothing in the agents, orchestrator, or
// dashboard needs to know it exists.
// ─────────────────────────────────────────────────────────────────────────────

import { Channel, channelMode } from '../config';
import { Approval, markExecuted, requestApproval, Risk } from '../approvals';
import { log } from '../logs';
import { emailConnector } from './email';
import { smsConnector } from './sms';
import { crmConnector, calendarConnector } from './internal';
import { websiteConnector } from './website';
import { socialConnector, accountingConnector, paymentsConnector } from './external';

// ── Contract ─────────────────────────────────────────────────────────────────

export interface ConnectorResult {
  ok: boolean;
  /** One line, shown in the dashboard and fed back to the agent. */
  detail: string;
  data?: Record<string, unknown>;
}

export interface ConnectorAction {
  /** Which approval policy governs this action. */
  channel: Channel;
  description: string;
  /** Highest risk band this action can carry; used to sort the approval queue. */
  risk?: Risk;
  /**
   * Set false for actions that touch nothing external. A connector can be
   * half-configured — the calendar connector's "propose a change" action needs
   * no Google credentials even though its sync action does — and without this
   * flag one missing credential would disable both.
   */
  requiresCredentials?: boolean;
  run: (payload: Record<string, unknown>) => Promise<ConnectorResult>;
}

export interface Connector {
  name: string;
  label: string;
  /** False when credentials are missing — the action is then never attempted. */
  configured: () => boolean;
  /** Env var or vault key names the owner still has to supply. */
  missingCredentials: () => string[];
  /** Docs link or one-line setup note, surfaced in the dashboard. */
  setupNote: string;
  actions: Record<string, ConnectorAction>;
}

export const CONNECTORS: Connector[] = [
  emailConnector,
  smsConnector,
  crmConnector,
  calendarConnector,
  websiteConnector,
  socialConnector,
  accountingConnector,
  paymentsConnector,
];

export function getConnector(name: string): Connector | null {
  return CONNECTORS.find((c) => c.name === name) ?? null;
}

export function findAction(connector: string, action: string): ConnectorAction | null {
  return getConnector(connector)?.actions[action] ?? null;
}

// ── perform() ────────────────────────────────────────────────────────────────

export interface PerformInput {
  connector: string;
  action: string;
  payload: Record<string, unknown>;
  /** Human-readable one-liner. This is what the owner reads before approving. */
  summary: string;
  agent: string;
  taskId?: string | null;
  risk?: Risk;
}

export type PerformOutcome =
  | { status: 'done'; detail: string; data?: Record<string, unknown> }
  | { status: 'awaiting_approval'; approvalId: string; detail: string }
  | { status: 'refused'; detail: string };

export async function perform(input: PerformInput): Promise<PerformOutcome> {
  const action = findAction(input.connector, input.action);
  if (!action) {
    return { status: 'refused', detail: `No such action: ${input.connector}.${input.action}` };
  }

  const connector = getConnector(input.connector)!;
  const mode = channelMode(action.channel);

  if (mode === 'off') {
    return {
      status: 'refused',
      detail: `The owner has turned off ${action.channel}. Do not retry this; report it instead.`,
    };
  }

  // Credentials are checked BEFORE the approval is written. Queuing an approval
  // the system cannot honour would waste the owner's attention and then fail at
  // the moment they said yes — the worst possible time to discover it.
  if (action.requiresCredentials !== false && !connector.configured()) {
    const missing = connector.missingCredentials().join(', ');
    return {
      status: 'refused',
      detail: `${connector.label} is not connected yet (missing: ${missing}). Draft the work and report that it could not be sent.`,
    };
  }

  if (mode === 'approve') {
    const approval = requestApproval({
      taskId: input.taskId ?? null,
      agent: input.agent,
      channel: action.channel,
      action: `${input.connector}.${input.action}`,
      summary: input.summary,
      payload: input.payload,
      risk: input.risk ?? action.risk ?? 'medium',
    });
    return {
      status: 'awaiting_approval',
      approvalId: approval.id,
      detail: 'Queued for the owner to approve. Do not attempt to send it another way.',
    };
  }

  return runAction(connector, input.action, input.payload, input.agent, input.taskId ?? null);
}

async function runAction(
  connector: Connector,
  actionName: string,
  payload: Record<string, unknown>,
  agent: string,
  taskId: string | null
): Promise<PerformOutcome> {
  const action = connector.actions[actionName]!;
  try {
    const result = await action.run(payload);
    log({
      taskId,
      agent,
      level: result.ok ? 'info' : 'error',
      message: `${connector.name}.${actionName}: ${result.detail}`,
      meta: { channel: action.channel },
    });
    return result.ok
      ? { status: 'done', detail: result.detail, data: result.data }
      : { status: 'refused', detail: result.detail };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    log({
      taskId,
      agent,
      level: 'error',
      message: `${connector.name}.${actionName} threw: ${detail}`,
    });
    return { status: 'refused', detail: `That failed: ${detail}` };
  }
}

// ── Execution of an approved request ─────────────────────────────────────────

/**
 * Run what the owner approved, using the payload EXACTLY as it was shown to
 * them. Nothing is re-generated here — if an agent could regenerate the message
 * at send time, the approval would be meaningless.
 */
export async function executeApproval(approval: Approval): Promise<ConnectorResult> {
  const [connectorName, actionName] = approval.action.split('.');
  const connector = getConnector(connectorName ?? '');
  const action = connector?.actions[actionName ?? ''];

  if (!connector || !action) {
    const detail = `Connector "${approval.action}" no longer exists.`;
    markExecuted(approval.id, { ok: false, result: detail });
    return { ok: false, detail };
  }

  if (action.requiresCredentials !== false && !connector.configured()) {
    const detail = `${connector.label} is not connected (missing: ${connector.missingCredentials().join(', ')}).`;
    markExecuted(approval.id, { ok: false, result: detail });
    return { ok: false, detail };
  }

  try {
    const result = await action.run(approval.payload);
    markExecuted(approval.id, { ok: result.ok, result: result.detail });
    log({
      taskId: approval.taskId,
      agent: approval.agent,
      level: result.ok ? 'info' : 'error',
      message: `Executed approval: ${result.detail}`,
      meta: { approvalId: approval.id, action: approval.action },
    });
    return result;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    markExecuted(approval.id, { ok: false, result: detail });
    return { ok: false, detail };
  }
}

// ── Status, for the dashboard's integrations panel ───────────────────────────

export interface ConnectorStatus {
  name: string;
  label: string;
  configured: boolean;
  missing: string[];
  setupNote: string;
  actions: { name: string; channel: Channel; description: string; mode: string }[];
}

export function connectorStatuses(): ConnectorStatus[] {
  return CONNECTORS.map((c) => ({
    name: c.name,
    label: c.label,
    configured: c.configured(),
    missing: c.missingCredentials(),
    setupNote: c.setupNote,
    actions: Object.entries(c.actions).map(([name, a]) => ({
      name,
      channel: a.channel,
      description: a.description,
      mode: channelMode(a.channel),
    })),
  }));
}
