# Project Olympus AI — Jarvis

A voice-first AI layer over the Mount Olympus Detailing platform. You talk to it;
it looks things up, and it puts eight specialist agents to work. Anything that
would reach a customer or the public is drafted and waits for your approval.

Jarvis is **not** a separate application. It reads the same SQLite database as
the rest of the site, uses the same login, the same roles, and the same audit
log. An agent that reports on revenue is reading the real `appointments` table,
not a copy.

---

## Contents

1. [What works today](#1-what-works-today)
2. [Installation](#2-installation)
3. [Architecture](#3-architecture)
4. [Folder structure](#4-folder-structure)
5. [The agents](#5-the-agents)
6. [Safety model](#6-safety-model)
7. [Voice](#7-voice)
8. [Memory](#8-memory)
9. [Configuration](#9-configuration)
10. [Scheduling](#10-scheduling)
11. [Integrations and credentials](#11-integrations-and-credentials)
12. [Adding a ninth agent](#12-adding-a-ninth-agent)
13. [Deployment](#13-deployment)
14. [Troubleshooting](#14-troubleshooting)
15. [Production readiness](#15-production-readiness)

---

## 1. What works today

**Working end to end, verified:**

- Wake-phrase voice loop in the browser — "Hey Jarvis" → speech → answer spoken back
- Task queue with atomic claiming, duplicate suppression, retry backoff, and crash recovery
- Orchestrator that schedules, prioritises, runs, retries, and escalates
- All eight agents, registered and runnable, reading real business data
- Approval queue — nothing outbound sends without a human yes
- Business memory with full-text search
- Owner dashboard: console, approvals, activity, memory, settings
- Email (Resend) and SMS (Twilio) connectors, with SMS consent enforced at send time
- Website content drafts written to `content/drafts/`
- Encrypted credential vault, audit logging, role-based access

**Declared but not implemented** — these report themselves as unconfigured
rather than failing mysteriously; see [§11](#11-integrations-and-credentials):

- Facebook / Instagram / Google Business Profile publishing (needs OAuth + app review)
- Google Calendar sync (needs OAuth consent flow)
- QuickBooks sync (needs OAuth)
- Agent write access to payments — **intentionally permanent**, see [§6](#6-safety-model)

**Known limits, stated plainly:**

- Agents have **no web access**. The SEO and Lead Generation agents reason from
  your own data and are instructed to label everything else as an assumption.
- Browser speech recognition is **not offline** — see [§7](#7-voice).
- There is no inventory tracking, so the Operations Agent says so rather than
  inventing stock levels.

---

## 2. Installation

Jarvis is part of the existing app. If the site already runs, you need one
environment variable and nothing else.

### Minimum

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Then:

```bash
npm run dev
```

Open **http://localhost:3000/jarvis** as a manager, admin, or owner account.
Press **Start listening** and say "Hey Jarvis, how's the business doing?"

Without the key everything else still works — the queue, the scheduler, the
dashboard, the approval flow — but agents cannot reason and voice replies fail
with a clear message rather than silence.

### Recommended

```bash
# .env.local

# Agent reasoning
ANTHROPIC_API_KEY=sk-ant-...

# Encrypts credentials added through the dashboard.
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JARVIS_SECRET_KEY=<64 hex characters>

# Lets a scheduler run the orchestrator. Generate the same way.
JARVIS_CRON_SECRET=<random string>
```

### Verify

```bash
npm run verify:jarvis
```

43 checks against a throwaway database. No API key needed, no network calls, no
cost. It covers the things whose failure would be silent and expensive:
duplicate suppression, atomic claiming, retry and terminal failure, stall
recovery, approval gating, SMS consent, secret encryption, and log redaction.

---

## 3. Architecture

```
   ┌──────────────┐   speech    ┌───────────────────┐
   │   Browser    │────text────►│  /api/jarvis/voice│
   │ wake word +  │◄───text─────│   lib/jarvis/     │
   │  STT + TTS   │             │     voice.ts      │
   └──────────────┘             └─────────┬─────────┘
                                          │ delegate
                                          ▼
   ┌──────────────┐            ┌────────────────────┐
   │  Scheduler   │───tick────►│    ORCHESTRATOR    │
   │ (cron/Task   │            │  orchestrator.ts   │
   │  Scheduler)  │            └─────────┬──────────┘
   └──────────────┘                      │ claim
                                         ▼
                              ┌────────────────────┐
                              │    TASK QUEUE      │
                              │     queue.ts       │
                              └─────────┬──────────┘
                                        │
                                        ▼
                              ┌────────────────────┐
                              │      RUNTIME       │
                              │    runtime.ts      │
                              │  (Claude + tools)  │
                              └───┬────────────┬───┘
                                  │            │
                     read         │            │  act
                                  ▼            ▼
                    ┌──────────────────┐  ┌──────────────────┐
                    │      TOOLS       │  │   CONNECTORS     │
                    │    tools.ts      │  │  connectors/     │
                    │ revenue, jobs,   │  │                  │
                    │ customers, memory│  │  ┌────────────┐  │
                    └────────┬─────────┘  │  │  POLICY    │  │
                             │            │  │  check     │  │
                             ▼            │  └─────┬──────┘  │
                    ┌──────────────────┐  └────────┼─────────┘
                    │  SQLite (shared  │           │
                    │  with the app)   │      ┌────┴─────┐
                    └──────────────────┘      │          │
                                          auto│          │approve
                                              ▼          ▼
                                        ┌────────┐  ┌──────────┐
                                        │  SEND  │  │ APPROVAL │
                                        └────────┘  │  QUEUE   │
                                                    └────┬─────┘
                                                         │ owner says yes
                                                         ▼
                                                    ┌────────┐
                                                    │  SEND  │
                                                    └────────┘
```

### The decisions worth knowing

**One database, shared with the app.** An agent recommending a promotion needs
to read revenue. A second database would mean cross-database joins, two backup
stories, and two chances to be out of sync.

**A tick, not a daemon.** The orchestrator is an idempotent function you call on
a schedule. A long-lived worker loop inside Next.js would be restarted on every
deploy, possibly replicated, and supervised by nothing. A tick that claims a
bounded batch and returns is crash-safe and works identically whether triggered
by Task Scheduler, a cron ping, or a button.

**Agents are data, not classes.** An agent is a name, a list of tool names, some
instructions, and its task kinds. All execution is shared in `runtime.ts`. That
is why adding one is a file and a line — see [§12](#12-adding-a-ninth-agent).

**Agents never call each other.** They enqueue tasks. The orchestrator decides
what runs, which is what makes priority, deduplication, and retry possible at
all.

**One way out.** Every outbound action goes through `perform()` in
`connectors/index.ts`. There is exactly one place to audit the safety property.

---

## 4. Folder structure

```
lib/jarvis/
  schema.ts         Tables. Applied lazily, idempotent.
  config.ts         Approval policy, budgets, models. Deny-by-default.
  queue.ts          The task queue. Atomic claim, dedupe, retry, lease recovery.
  orchestrator.ts   tick() — schedule, claim, run, escalate.
  runtime.ts        Runs one task: prompt → tool loop → result.
  registry.ts       Agent definition type + the shared prompt preamble.
  llm.ts            Claude Messages API with tool use. Bounded three ways.
  tools.ts          Everything an agent can do. The complete surface.
  memory.ts         Business memory + FTS5 search.
  approvals.ts      The approval queue.
  voice.ts          The voice brain — routes, answers, delegates.
  speech.ts         Provider seam for swapping in local Whisper/Piper.
  notify.ts         Owner notifications, with repeat suppression.
  logs.ts           Activity log, agent health, metrics.
  vault.ts          AES-256-GCM credential storage.
  time.ts           Dates bound to the business timezone.

  agents/
    index.ts        Registration. ← the only file a new agent touches
    marketing.ts  content.ts  comms.ts  seo.ts
    leadgen.ts    analytics.ts  operations.ts  supervisor.ts

  connectors/
    index.ts        perform() — the policy gate. The safety spine.
    email.ts        Resend. Working.
    sms.ts          Twilio. Working, consent enforced here.
    internal.ts     CRM notes (working) + calendar (proposals only).
    website.ts      Content drafts to disk. Working.
    external.ts     Social, accounting, payments. Declared, not implemented.

app/jarvis/         Console, approvals, activity, memory, settings
app/api/jarvis/     voice, tasks, approvals, status, settings, memory, tick
components/jarvis/  VoiceConsole, ApprovalQueue, AgentLauncher, MemoryEditor,
                    PolicyEditor, TickButton
scripts/
  verify-jarvis.cjs Offline verification (43 checks)
  jarvis-tick.cjs   Tick runner for a scheduler
content/drafts/     Agent-written copy awaiting your review
```

---

## 5. The agents

| Agent | Does | Can delegate to | Scheduled |
|---|---|---|---|
| **Marketing** | Campaigns, promotions, seasonal offers, referrals | Content | Monthly |
| **Content** | Blog, social, email/SMS copy, service descriptions, FAQs | — | Weekly |
| **Customer Communication** | Replies, follow-ups, reminders, review requests | — | — |
| **SEO** | Metadata, internal linking, local SEO, technical hygiene | Content | Monthly |
| **Lead Generation** | Funnel analysis, segments, seasonal and geographic opportunity | Marketing, Content | Weekly |
| **Analytics** | Revenue, conversion, retention, LTV, productivity | — | Weekly + monthly |
| **Operations** | Schedule, workload, bottlenecks, business health | — | Daily |
| **Supervisor** | Watches the others, retries what is safe, escalates, summarises | — | Daily ×2 + weekly |

Each has hard constraints written into its instructions, chosen for what would
actually go wrong:

- **Marketing** must state the margin cost and break-even of any discount. A
  model asked for "a promotion" will happily propose 30% off.
- **Content** may never invent a testimonial, a review count, or a
  certification, and may never state a price it did not read from the catalogue.
- **Communication** may never offer a refund, discount, or re-do — not even to
  defuse a complaint.
- **SEO** has no rank data and is required to say so instead of producing
  authoritative-looking invented metrics.
- **Analytics** must refuse to call a trend from a handful of jobs, and cannot
  report profit because it cannot see costs.
- **Operations** cannot move an appointment; booking rules live in
  `lib/booking.ts` and an agent writing rows directly would bypass every one.
- **Supervisor** cannot retry a task more than six times — enforced in
  `tools.ts`, where its own prompt cannot reach.

---

## 6. Safety model

Four independent layers. Each is meant to hold if the others fail.

**1. Capability.** An agent can only do what a tool lets it. There are two write
tools: `save_memory` and `request_action`. No agent can edit a customer, move an
appointment, change a price, or move money — not because it was told not to, but
because no tool exists.

**2. Policy.** `request_action` routes through `perform()`, which consults the
approval policy. Default: everything customer-facing or public requires
approval. Deny-by-default — an unrecognised setting means "ask".

**3. Enforcement at the point of action.** The SMS connector re-checks TCPA
consent on the customer record at send time, even though the agent was told the
rule and the owner approved the draft. A legal constraint should not rest on a
model following an instruction.

**4. Permanent limits.** `payment.write` cannot be set to automatic — the
setting is refused in `config.ts` and the connector refuses unconditionally.
Two mechanisms, because one bad refund outweighs any convenience.

**Audit.** Every approval decision, policy change, and memory write goes to the
existing `audit_log` with actor, role, and before/after values.

### The approval queue

An agent that wants to send something writes a row containing the **exact
arguments the connector will receive**, and stops. The dashboard renders that
payload in full — not a summary of it. What you read is what goes out.

Approvals expire (default 72 hours). A three-day-old reminder for an appointment
that already happened must not be sendable.

---

## 7. Voice

**How it works.** The browser listens continuously for "Hey Jarvis" using the
Web Speech API. Nothing is processed until the wake phrase. After it, speech is
transcribed, POSTed as text to `/api/jarvis/voice`, and the reply is spoken back.
The microphone is suspended while speaking so Jarvis cannot hear itself.

**Jarvis answers directly** when one or two lookups will do — revenue, the
schedule, a customer, a price. **It delegates** real work to an agent and
confirms in one sentence.

### ⚠️ It is not offline

In Chrome and Edge, `SpeechRecognition` streams microphone audio to Google's
speech service. Nothing is recorded or stored, and only text reaches your
server — but the audio does leave the machine. The console says so on screen.

**To make it genuinely local**, `lib/jarvis/speech.ts` documents the path:

1. Install Python 3.11 with **openWakeWord** (ships with a "hey jarvis" model),
   **faster-whisper** (`base.en` is enough), and **Piper** for speech.
2. Run them behind a small local HTTP service exposing `/transcribe` and `/speak`.
3. Implement the two interfaces in `speech.ts` against it.
4. Set `JARVIS_SPEECH_PROVIDER=local`.

Nothing else changes — `voice.ts` takes text and returns text and does not care
where either came from.

**Browser support:** Chrome and Edge on desktop. Safari and Firefox lack usable
continuous recognition. The typed input beside the microphone does everything
voice does and always works.

---

## 8. Memory

What belongs: brand voice, goals, SOPs, standing preferences, campaign results,
agent findings.

What does not: customers, vehicles, appointments, jobs, revenue. Those are real
tables with real constraints, and agents read them through tools. A copy here
would be a second, stale, unconstrained version of the business.

**Pinned memories are injected into every agent's prompt, every run.** Pinning
"we never lead with a discount" changes what all eight agents write from that
moment. Capped at 25 — past that, prompts crowd out the actual task.

**Confidence.** Agent-written memories default to 0.7 and show as
*unconfirmed*. Owner-written ones are 1.0. This is how a guess is stopped from
quietly becoming what the business believes.

Search is SQLite FTS5 — not embeddings. A few hundred short documents written by
one business is exactly where keyword search wins, and an embedding index would
add a model dependency and a rebuild step for no measurable gain.

---

## 9. Configuration

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Agent reasoning and voice |
| `JARVIS_SECRET_KEY` | Recommended | Encrypts vault credentials (64 hex chars) |
| `JARVIS_CRON_SECRET` | Recommended | Authorises scheduled ticks (falls back to `CRON_SECRET`) |
| `JARVIS_MODEL` | No | Agent model. Default `claude-sonnet-5` |
| `JARVIS_VOICE_MODEL` | No | Voice model. Default `claude-haiku-4-5-20251001` |
| `NEXT_PUBLIC_JARVIS_WAKE_PHRASE` | No | Default `hey jarvis` |
| `JARVIS_DRAFTS_DIR` | No | Default `content/drafts` |
| `JARVIS_SPEECH_PROVIDER` | No | `browser` (default) or `local` |

Email and SMS reuse the app's existing `RESEND_API_KEY`, `MAIL_FROM`, and
`TWILIO_*` variables.

### Behaviour — set in the dashboard, not in env

`/jarvis/settings`, owner only. Per-channel autonomy (Automatic / Ask me / Off),
agent on-off switches, daily token budget, approval expiry, tasks per tick.

Behaviour is stored in the database rather than the environment so you can
change autonomy from the dashboard without a redeploy.

---

## 10. Scheduling

Nothing runs on its own until something calls the tick. Three options.

**Windows Task Scheduler** (this machine):

```
Program:   node
Arguments: scripts/jarvis-tick.cjs
Start in:  C:\Users\Luisr\OneDrive\Desktop\apex-detailing-site\detailing-site
Trigger:   every 15 minutes
```

**cron** (a Linux host):

```cron
*/15 * * * * curl -sf -X POST https://your-domain/api/jarvis/tick \
  -H "Authorization: Bearer $JARVIS_CRON_SECRET"
```

**By hand:** the **Run now** button on `/jarvis/activity`.

A tick reclaims stalled tasks, expires old approvals, queues due scheduled work,
and runs up to `maxConcurrentTasks` tasks. It is idempotent — calling it twice
does nothing twice.

Scheduled work is deduplicated by period key (`analytics:weekly_summary:2026-W30`),
enforced by a unique index. There is no scheduler state to drift, and a machine
that was asleep at 7am runs the job late rather than never.

---

## 11. Integrations and credentials

| Integration | Status | Needs |
|---|---|---|
| **Email** (Resend) | ✅ Working | `RESEND_API_KEY`, `MAIL_FROM` |
| **SMS** (Twilio) | ✅ Working | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| **CRM notes** | ✅ Working | Built in |
| **Website drafts** | ✅ Working | Built in |
| **Calendar proposals** | ✅ Working | Built in |
| **Google Calendar sync** | ⛔ Not implemented | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN` |
| **Facebook / Instagram** | ⛔ Not implemented | `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN` |
| **Google Business Profile** | ⛔ Not implemented | `GOOGLE_BUSINESS_REFRESH_TOKEN` |
| **QuickBooks** | ⛔ Not implemented | `QUICKBOOKS_REALM_ID`, `QUICKBOOKS_REFRESH_TOKEN` |
| **Payments (agent write)** | 🔒 Never | Intentionally unavailable |

The unimplemented ones need a three-legged OAuth consent flow that a headless
process cannot complete, and Meta additionally requires App Review for
`pages_manage_posts`. Until then they report `configured() === false`, which
means `perform()` refuses **before** an approval is created — you are never
asked to approve something that cannot happen. The Content Agent still writes
every post as a draft; you publish by hand.

Finishing one is contained work: implement `run` in the connector. Nothing in
the agents, orchestrator, or dashboard changes.

---

## 12. Adding a ninth agent

Three steps, no changes anywhere else.

**1.** `lib/jarvis/agents/inventory.ts`:

```ts
import { AgentDefinition } from '../registry';

export const inventoryAgent: AgentDefinition = {
  name: 'inventory',
  label: 'Inventory Agent',
  purpose: 'Tracks chemicals and pads, flags what is running low.',
  tools: ['search_memory', 'save_memory', 'business_snapshot', 'request_action'],
  maxSteps: 8,
  instructions: `You watch stock levels...`,
  tasks: {
    stock_check: {
      title: 'Stock check',
      brief: (input) => `Review current stock...\n${input.notes ?? ''}`,
    },
  },
  schedule: [{ kind: 'stock_check', cadence: 'weekly', hour: 7, weekday: 1, title: 'Stock check' }],
};
```

**2.** Add it to the array in `lib/jarvis/agents/index.ts`.

**3.** `npm run verify:jarvis` — the registry checks confirm every tool name and
delegation target it references actually exists.

It is now schedulable, delegatable, voice-routable, and on the dashboard,
because all of those read the registry.

---

## 13. Deployment

Jarvis deploys with the app. Two things matter.

**SQLite needs a real filesystem.** As `lib/db.ts` already warns, serverless
hosts have an ephemeral filesystem and the database will be lost. Jarvis makes
this sharper: the queue, memory, and approvals all live there. Run on a VPS, a
container with a volume, or this Windows machine — or port to Postgres first.
All SQL is confined to `lib/db.ts`, `lib/repo/*`, and `lib/jarvis/*`.

**The tick needs a scheduler.** See [§10](#10-scheduling). Without one, agents
only run when you press the button.

**Before going live:**

```bash
npm run typecheck && npm run verify:jarvis && npm run build
```

- [ ] `ANTHROPIC_API_KEY` set
- [ ] `JARVIS_SECRET_KEY` set (64 hex characters)
- [ ] `JARVIS_CRON_SECRET` set and the scheduler configured
- [ ] Review `/jarvis/settings` — confirm the autonomy defaults are what you want
- [ ] Pin your real brand voice and goals in `/jarvis/memory`, replacing the placeholders
- [ ] Set a daily token budget
- [ ] Back up `data.sqlite` — it now holds agent state as well as customers

---

## 14. Troubleshooting

**"Agents cannot think yet"** — `ANTHROPIC_API_KEY` is missing from
`.env.local`, or the server was not restarted after adding it.

**Nothing happens when I queue a task** — nothing runs until a tick. Press
**Run now** on `/jarvis/activity`, then set up a scheduler ([§10](#10-scheduling)).

**Voice does nothing** — Chrome or Edge on desktop only. Check the microphone
permission in the address bar. On a remote host, speech recognition requires
HTTPS. The typed box always works.

**Jarvis mishears things** — use **Talk now** to skip the wake phrase, or type
it. `NEXT_PUBLIC_JARVIS_WAKE_PHRASE` can be changed to something the recogniser
hears more reliably.

**An agent keeps failing** — `/jarvis/activity` shows the error on each task.
Missing credentials and refused actions will fail identically forever; fix the
cause rather than retrying.

**Approvals are piling up** — either loosen a channel in `/jarvis/settings`, or
turn off the agent generating them.

**"Daily token budget reached"** — raise it in settings, or leave it: the cap
did its job.

**Duplicate scheduled work** — should be impossible; the unique index prevents
it. If you see it, the dedupe key is wrong. `npm run verify:jarvis` covers this.

**Verification fails** — it keeps the temp database and prints the path.

---

## 15. Production readiness

**Ready now:** the queue, orchestrator, memory, approvals, logging, dashboard,
email and SMS connectors, security model. These are verified by 43 offline
checks, a passing typecheck, and a passing build, and the full loop has been run
end to end against the real database.

**Ready with a caveat:** the voice interface works well in Chrome and Edge but
is not offline ([§7](#7-voice)). The agents produce genuinely useful output, but
their writing should be read before it goes out — which is what the approval
queue is for. Leave the defaults alone for the first few weeks.

**Not ready:** social publishing, calendar sync, and accounting sync are
declared and unimplemented. They fail honestly rather than silently, but they do
not work.

**What I would do next, in order:**

1. Run it for two weeks with approvals on everything, and read what the agents
   write. That tells you which are worth their tokens.
2. Replace the placeholder memories with your real brand voice and goals. This
   is the single highest-leverage thing you can do — everything the agents write
   is downstream of it.
3. Finish the Meta connector if social matters to you; the drafts are already
   being written.
4. If you want true offline voice, do the Whisper/Piper work in
   [§7](#7-voice) — it is a contained project.
5. Consider Postgres if this ever runs anywhere but one machine.

**What I would not do:** turn on automatic sending for customer email or SMS
until you have read a month of drafts. The system is built to make that
optional, and the default is the right one.
