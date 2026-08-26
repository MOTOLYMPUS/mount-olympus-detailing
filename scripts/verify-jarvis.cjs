// ─────────────────────────────────────────────────────────────────────────────
// Offline verification of the Jarvis core.
//
//     npm run verify:jarvis
//
// Runs against a THROWAWAY database (JARVIS_TEST_DB), never your real one, and
// makes NO network calls — so it needs no API key and costs nothing.
//
// What it covers is chosen by one rule: the things whose failure would be
// silent and expensive.
//
//   • Duplicate suppression — a scheduler that queues the weekly summary twice
//     costs money and confuses the owner, and would never throw.
//   • Atomic claiming — two workers running one task is the classic queue bug.
//   • Retry backoff and terminal failure — work that silently vanishes.
//   • Stall recovery — a task stuck 'running' forever after a crash.
//   • Approval gating — that an agent CANNOT send without a human yes. This is
//     the safety property the whole design rests on.
//   • Consent enforcement — that SMS refuses without TCPA consent.
//   • Memory search — that FTS actually returns what was stored.
//
// It deliberately does NOT test that the agents write good copy. That needs a
// model, a bill, and a human read.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');

// A fresh database per run, in the temp directory. Pointing the app's own
// DATABASE_PATH at it means lib/db.ts creates the full schema from scratch —
// the same code path production uses, not a hand-built fixture.
const testDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-verify-')), 'test.sqlite');
process.env.DATABASE_PATH = testDb;
process.env.JARVIS_SECRET_KEY = 'a'.repeat(64);
delete process.env.ANTHROPIC_API_KEY; // prove no network is required

// The modules under test are compiled to CommonJS first (see
// tsconfig.verify.json for why jiti and native type-stripping both fall short).
// `npm run verify:jarvis` runs the compile; this only checks it happened.
const BUILD = path.join(root, '.verify-build');

if (!fs.existsSync(BUILD)) {
  console.error(
    '\nThe verify build is missing. Run:\n\n    npm run verify:jarvis\n\n' +
      '(or: npx tsc -p tsconfig.verify.json)\n'
  );
  process.exit(1);
}

// tsc does not rewrite the `@/` path alias in its output, so it is resolved
// here — pointed at the compiled tree rather than the source tree.
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) request = path.join(BUILD, request.slice(2));
  return originalResolve.call(this, request, ...rest);
};

const load = (p) => require(path.join(BUILD, p.replace(/\.ts$/, '')));

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

async function main() {
  console.log(`\nJarvis core verification\ndatabase: ${testDb}\n`);

  const queue = load('lib/jarvis/queue.ts');
  const memory = load('lib/jarvis/memory.ts');
  const approvals = load('lib/jarvis/approvals.ts');
  const config = load('lib/jarvis/config.ts');
  const connectors = load('lib/jarvis/connectors/index.ts');
  const orchestrator = load('lib/jarvis/orchestrator.ts');
  const registry = load('lib/jarvis/registry.ts');
  const agents = load('lib/jarvis/agents/index.ts');
  const logs = load('lib/jarvis/logs.ts');
  const vault = load('lib/jarvis/vault.ts');

  // ── Registry ───────────────────────────────────────────────────────────────
  section('Agent registry');

  agents.ensureAgentsRegistered();
  agents.ensureAgentsRegistered(); // idempotent — must not throw on re-import
  const all = registry.allAgents();
  check('all eight agents register', all.length === 8, `got ${all.length}`);
  check(
    'every agent has at least one task kind',
    all.every((a) => Object.keys(a.tasks).length > 0)
  );

  // Catches a copy-pasted agent granting itself a tool that does not exist —
  // which would fail only at run time, mid-task, after spending tokens.
  const toolNames = new Set(load('lib/jarvis/tools.ts').allToolNames());
  const badTools = all.flatMap((a) => a.tools.filter((t) => !toolNames.has(t)).map((t) => `${a.name}:${t}`));
  check('every agent references only real tools', badTools.length === 0, badTools.join(', '));

  // Likewise for delegation targets.
  const names = new Set(registry.agentNames());
  const badDelegates = all.flatMap((a) =>
    (a.delegatesTo ?? []).filter((d) => !names.has(d)).map((d) => `${a.name}→${d}`)
  );
  check('every delegation target exists', badDelegates.length === 0, badDelegates.join(', '));

  // ── Queue ──────────────────────────────────────────────────────────────────
  section('Task queue');

  const first = queue.enqueue({
    agent: 'analytics',
    kind: 'weekly_summary',
    title: 'Weekly summary',
    dedupeKey: 'analytics:weekly_summary:2026-W30',
  });
  check('enqueue creates a task', first.created === true);

  const duplicate = queue.enqueue({
    agent: 'analytics',
    kind: 'weekly_summary',
    title: 'Weekly summary',
    dedupeKey: 'analytics:weekly_summary:2026-W30',
  });
  check('duplicate is suppressed', duplicate.created === false);
  check('duplicate returns the original task', duplicate.task.id === first.task.id);

  queue.enqueue({ agent: 'marketing', kind: 'campaign_ideas', title: 'Low', priority: 0 });
  const urgent = queue.enqueue({
    agent: 'operations',
    kind: 'daily_briefing',
    title: 'Urgent',
    priority: queue.PRIORITY.INCIDENT,
  });

  const claimed = queue.claimNext();
  check('highest priority is claimed first', claimed && claimed.id === urgent.task.id);
  check('claimed task is running', claimed.status === 'running');
  check('claim increments attempts', claimed.attempts === 1);

  // The property that matters: a second claim must never return the same row.
  const second = queue.claimNext();
  check('a second claim returns a different task', second && second.id !== claimed.id);

  // ── Retry and failure ──────────────────────────────────────────────────────
  section('Retry and terminal failure');

  const retryable = queue.enqueue({
    agent: 'seo',
    kind: 'site_audit',
    title: 'Retry test',
    maxAttempts: 2,
  });
  const t1 = queue.claimNext(['analytics', 'marketing', 'operations', 'content', 'comms', 'leadgen', 'supervisor']);
  const afterFirst = queue.fail(t1.id, 'transient network error');
  check('first failure re-queues', afterFirst.status === 'queued', afterFirst.status);
  check('retry is scheduled in the future', Date.parse(afterFirst.runAfter) > Date.now());

  // Force the retry to be due, then exhaust it.
  const db = load('lib/db.ts').getDb();
  db.prepare(`UPDATE jarvis_tasks SET run_after = ? WHERE id = ?`).run(
    new Date(Date.now() - 1000).toISOString(),
    retryable.task.id
  );
  const t2 = queue.claimNext(['analytics', 'marketing', 'operations', 'content', 'comms', 'leadgen', 'supervisor']);
  const afterSecond = queue.fail(t2.id, 'still broken');
  check('failure past maxAttempts is terminal', afterSecond.status === 'failed', afterSecond.status);
  check('the error is retained', /still broken/.test(afterSecond.error ?? ''));

  // ── Stall recovery ─────────────────────────────────────────────────────────
  section('Stall recovery');

  db.prepare(`UPDATE jarvis_tasks SET lease_until = ? WHERE id = ?`).run(
    new Date(Date.now() - 60_000).toISOString(),
    claimed.id
  );
  const reclaimed = queue.reclaimStalled();
  check('an expired lease is reclaimed', reclaimed >= 1, `reclaimed ${reclaimed}`);
  check('the reclaimed task is queued again', queue.getTask(claimed.id).status === 'queued');

  // ── Memory ─────────────────────────────────────────────────────────────────
  section('Business memory');

  memory.remember({
    kind: 'brand',
    title: 'Brand voice',
    body: 'Confident and plain-spoken. Never use exclamation marks in customer email.',
    pinned: true,
  });
  memory.remember({
    kind: 'insight',
    title: 'Ceramic coatings convert best in spring',
    body: 'Enquiries for ceramic coating peak in April and May.',
  });

  const found = memory.searchMemory('ceramic coating');
  check('full-text search finds a memory', found.length > 0, `${found.length} results`);
  check('search ranks the right memory first', found[0]?.title.includes('Ceramic'));

  const pinned = memory.pinnedMemory();
  check('pinned memory is returned for prompts', pinned.some((m) => m.title === 'Brand voice'));

  // A spoken sentence full of punctuation must not break FTS syntax.
  let searchThrew = false;
  try {
    memory.searchMemory('what about "ceramic" AND (coating) NEAR/5 -- 5-star?');
  } catch {
    searchThrew = true;
  }
  check('messy speech input does not break search', searchThrew === false);

  // ── Approval gating ────────────────────────────────────────────────────────
  section('Approval gating — the safety property');

  const policy = config.getPolicy();
  check('customer email defaults to requiring approval', policy.channels['email.customer'] === 'approve');
  check('payments default to requiring approval', policy.channels['payment.write'] === 'approve');

  // Payments must be un-automatable even by direct policy write.
  config.setPolicy({ channels: { 'payment.write': 'auto' } });
  check(
    'payments cannot be set to automatic',
    config.getPolicy().channels['payment.write'] === 'approve'
  );

  // With no RESEND_API_KEY, email must refuse BEFORE creating an approval —
  // asking the owner to approve something unsendable wastes their attention.
  const unconfigured = await connectors.perform({
    connector: 'email',
    action: 'send',
    payload: { to: 'someone@example.com', subject: 'Hi', body: 'Hello' },
    summary: 'Test email',
    agent: 'comms',
  });
  check('an unconfigured connector refuses', unconfigured.status === 'refused', unconfigured.status);
  check('no approval row is created for it', approvals.pendingCount() === 0);

  // Now with credentials present, the same call must QUEUE rather than send.
  process.env.RESEND_API_KEY = 'test-key-not-real';
  process.env.MAIL_FROM = 'test@example.com';

  const gated = await connectors.perform({
    connector: 'email',
    action: 'send',
    payload: { to: 'someone@example.com', subject: 'Hi', body: 'Hello' },
    summary: 'Test email',
    agent: 'comms',
  });
  check('a configured connector queues for approval', gated.status === 'awaiting_approval', gated.status);
  check('the approval is pending', approvals.pendingCount() === 1);

  const approval = approvals.getApproval(gated.approvalId);
  check('the payload is stored verbatim', approval.payload.subject === 'Hi');
  check('the approval names the connector action', approval.action === 'email.send');

  // A real user is required: `decided_by` is a foreign key into users, so an
  // approval can never record a decision by an account that does not exist.
  const users = load('lib/repo/users.ts');
  const owner = users.createUser({
    email: `owner-${Date.now()}@example.com`,
    name: 'Test Owner',
    phone: '5550000000',
    role: 'owner',
    passwordHash: 'x',
  });

  // Double-decision must not be possible: approving twice would send twice.
  const decided = approvals.decide(approval.id, 'approved', { userId: owner.id });
  check('an approval can be decided', decided && decided.status === 'approved');
  const again = approvals.decide(approval.id, 'approved', { userId: owner.id });
  check('an approval cannot be decided twice', again === null);
  check(
    'a decision cannot be attributed to a non-existent user',
    (() => {
      const other = approvals.requestApproval({
        agent: 'comms',
        channel: 'email.customer',
        action: 'email.send',
        summary: 'FK test',
        payload: {},
      });
      try {
        approvals.decide(other.id, 'approved', { userId: 'no-such-user' });
        return false;
      } catch {
        return true;
      }
    })()
  );

  // ── Consent ────────────────────────────────────────────────────────────────
  section('SMS consent');

  process.env.TWILIO_ACCOUNT_SID = 'AC-test';
  process.env.TWILIO_AUTH_TOKEN = 'test';
  process.env.TWILIO_PHONE_NUMBER = '+15550000000';

  const withoutConsent = users.createUser({
    email: `noconsent-${Date.now()}@example.com`,
    name: 'No Consent',
    phone: '5551234567',
    role: 'customer',
    passwordHash: 'x',
    smsConsent: false,
  });

  const smsConnector = connectors.getConnector('sms');
  const refused = await smsConnector.actions.send.run({
    userId: withoutConsent.id,
    body: 'Your car is ready.',
  });
  check('SMS to a non-consenting customer is refused', refused.ok === false);
  check('the refusal explains why', /consent/i.test(refused.detail), refused.detail);

  // A phone number with no customer record has no verifiable consent.
  const bare = await smsConnector.actions.send.run({ to: '+15551234567', body: 'Hello' });
  check('SMS to a bare phone number is refused', bare.ok === false);

  // ── Vault ──────────────────────────────────────────────────────────────────
  section('Secret vault');

  vault.putSecret('TEST_TOKEN', 'super-secret-value', { hint: 'test' });
  check('a secret round-trips', vault.getSecret('TEST_TOKEN') === 'super-secret-value');
  check('the value is not in the listing', !JSON.stringify(vault.listSecrets()).includes('super-secret-value'));

  const raw = db.prepare(`SELECT ciphertext FROM jarvis_secrets WHERE name = ?`).get('TEST_TOKEN');
  check('the stored value is encrypted', !String(raw.ciphertext).includes('super-secret'));

  // ── Scheduling ─────────────────────────────────────────────────────────────
  section('Recurring schedule');

  const firstPass = orchestrator.scheduleRecurring();
  const secondPass = orchestrator.scheduleRecurring();
  check('scheduled work is queued', firstPass >= 0);
  check('scheduling twice in one period queues nothing new', secondPass === 0, `queued ${secondPass}`);

  // ── Logs ───────────────────────────────────────────────────────────────────
  section('Logging');

  logs.log({ agent: 'test', level: 'info', message: 'hello', meta: { api_key: 'sk-secret-123' } });
  const events = logs.listEvents({ agent: 'test' });
  check('events are recorded', events.length === 1);
  check(
    'secrets are redacted from log metadata',
    events[0].meta.api_key === '[redacted]',
    JSON.stringify(events[0].meta)
  );

  // ── Result ─────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    // Only clean up on success — a failed run leaves the database for
    // inspection. The handle must be closed first: Windows refuses to delete
    // an open file, and the WAL and shm sidecars are open too.
    try {
      load('lib/db.ts').closeDb();
      fs.rmSync(path.dirname(testDb), { recursive: true, force: true });
    } catch {
      // Cleanup is a courtesy, not a result. A temp file left behind must not
      // turn a passing run into a failing one.
    }
  } else {
    console.log(`Database kept for inspection: ${testDb}\n`);
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nVerification crashed:', e);
  console.log(`\nDatabase kept for inspection: ${testDb}\n`);
  process.exit(1);
});
