// ─────────────────────────────────────────────────────────────────────────────
// Run one orchestrator tick against a running server.
//
//     npm run jarvis:tick
//
// This is what Windows Task Scheduler (or cron) should call. It posts to
// /api/jarvis/tick rather than importing the orchestrator directly, and that is
// deliberate: the running Next.js server owns the SQLite connection, and a
// second process opening the same database for writes is how a WAL file gets
// corrupted at 3am with nobody watching.
//
// Environment:
//   JARVIS_BASE_URL      — default http://localhost:3000
//   JARVIS_CRON_SECRET   — or CRON_SECRET; required, since there is no session
//
// Exits non-zero on failure so a scheduler can report it.
// ─────────────────────────────────────────────────────────────────────────────

const base = (process.env.JARVIS_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const secret = process.env.JARVIS_CRON_SECRET ?? process.env.CRON_SECRET;

async function main() {
  if (!secret) {
    console.error(
      'JARVIS_CRON_SECRET (or CRON_SECRET) is not set. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
        'and add it to .env.local.'
    );
    process.exit(1);
  }

  const started = Date.now();

  let res;
  try {
    res = await fetch(`${base}/api/jarvis/tick`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    });
  } catch (e) {
    console.error(`Could not reach ${base} — is the server running? (${e.message})`);
    process.exit(1);
  }

  const body = await res.text();

  if (!res.ok) {
    console.error(`Tick failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    console.error(`Unexpected response: ${body.slice(0, 200)}`);
    process.exit(1);
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[${new Date().toISOString()}] tick in ${seconds}s — ` +
      `claimed ${data.claimed}, completed ${data.completed}, failed ${data.failed}, ` +
      `scheduled ${data.scheduled}, reclaimed ${data.reclaimed}, ${data.tokens} tokens` +
      (data.note ? ` — ${data.note}` : '')
  );

  // A tick that ran but failed every task is worth surfacing to the scheduler.
  process.exit(data.failed > 0 && data.completed === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Tick crashed:', e);
  process.exit(1);
});
