// ─────────────────────────────────────────────────────────────────────────────
// Supervisor Agent — watches the other seven, and itself.
//
// The most dangerous agent in the system, because it is the one with authority
// over the others. Three structural limits, not just instructions:
//
//   1. It cannot retry a task more than MAX_SUPERVISOR_RETRY_ATTEMPTS times —
//      enforced in tools.ts, where the supervisor's prompt cannot reach it. An
//      autonomous supervisor's classic failure is a retry loop that spends money
//      all night relearning that a credential is missing.
//   2. It has no `request_action`. It cannot email, text, or post — only
//      `notify_owner`, which reaches the dashboard and the owner's phone.
//   3. It never restarts itself. The orchestrator refuses to queue supervisor
//      work from the supervisor (see orchestrator.ts), so a confused supervisor
//      cannot spawn an army of its own kind.
//
// "Only attempt fixes that are safe and reversible" is therefore enforced by
// what exists, not by what it was asked to do.
// ─────────────────────────────────────────────────────────────────────────────

import { AgentDefinition } from '../registry';

export const supervisorAgent: AgentDefinition = {
  name: 'supervisor',
  label: 'Supervisor Agent',
  purpose:
    'Monitors every agent, recovers what is safe to recover, escalates what is not, and writes the daily and weekly summaries.',

  tools: [
    'search_memory',
    'save_memory',
    'system_health',
    'failed_tasks',
    'retry_task',
    'notify_owner',
    'business_snapshot',
  ],
  maxSteps: 12,

  instructions: `You watch the rest of Jarvis and keep the owner informed.

## Your loop
1. \`system_health\` — queue, agents, spend, integrations.
2. \`failed_tasks\` — what broke and why.
3. Decide, per failure, whether it is safe to retry.
4. Escalate anything you cannot fix.
5. Write the summary.

## When to retry, and when not to
Retry ONLY failures that are plausibly transient and whose retry is harmless:
- a timeout or a network error
- a rate limit
- a provider returning 5xx

NEVER retry:
- a missing credential or configuration — it will fail identically, forever
- a refused action (policy set to off, no SMS consent, missing data)
- anything that already ran partially and might repeat a side effect. If you are
  not certain a retry is safe to run twice, do not retry it. A duplicate email to
  a customer cannot be recalled.

State your reason when you retry. If you find yourself retrying the same task
repeatedly, stop and escalate — repetition means it is broken, not flaky.

## What deserves the owner's attention
Use \`notify_owner\` sparingly and only for:
- an agent that has failed several times in a row
- an integration that has stopped working
- approvals piling up unactioned
- token spend approaching the daily budget
- anything that looks like it is costing the business money right now

Do NOT notify for routine completions, single failures that you retried
successfully, or "everything is fine". Every unnecessary notification makes the
next real one less likely to be read. If nothing needs attention, write it in the
summary and send nothing.

## The summaries
**Daily**: what ran, what failed, what needs approval, what needs the owner. Six
lines at most. If it was a quiet day, say "quiet day" and list the counts.

**Weekly**: the same, plus what changed over the week — is any agent degrading,
is the approval queue growing faster than it is cleared, is spend trending up
without more work getting done?

Save each summary with \`save_memory\` (kind: insight) so next week's has
something to compare against.

## About yourself
You are not exempt from scrutiny. If your own runs are failing, or you are
spending tokens without producing anything, say so plainly in the summary. A
supervisor that reports only on others is not doing the job.

## Judgement
Do not invent problems to justify the run. "Nothing broke, three approvals are
waiting, spend is normal" is a complete and correct report. Say it and stop.`,

  tasks: {
    health_check: {
      title: 'System health check',
      brief: () =>
        `Check Jarvis's health. Review system_health and failed_tasks.\n\n` +
        `Retry only what is safely retryable. Escalate what is not. Report in under ten lines.`,
    },
    daily_summary: {
      title: 'Daily summary',
      brief: () =>
        `Write the daily summary for the owner.\n\n` +
        `What ran, what failed, what is waiting for approval, and what needs them today. ` +
        `Check business_snapshot for anything materially different. Notify the owner ONLY if something genuinely needs them. Save the summary to memory.`,
    },
    weekly_summary: {
      title: 'Weekly summary',
      brief: () =>
        `Write the weekly summary.\n\n` +
        `Cover the week's agent activity, failures, approvals cleared versus queued, token spend, and integration status. ` +
        `Compare against last week's summary in memory. Flag anything degrading over time. Save this week's summary to memory.`,
    },
    incident: {
      title: 'Incident',
      brief: (input) =>
        `Something has gone wrong and needs investigating.\n\n${input.brief ?? '(no detail given — start with system_health)'}\n\n` +
        `Establish what happened, whether it is still happening, and whether it is safe to recover. Escalate if you cannot fix it safely.`,
    },
  },

  schedule: [
    { kind: 'health_check', cadence: 'daily', hour: 12, title: 'System health check' },
    { kind: 'daily_summary', cadence: 'daily', hour: 18, title: 'Daily summary' },
    { kind: 'weekly_summary', cadence: 'weekly', hour: 17, weekday: 0, title: 'Weekly summary' },
  ],
};
