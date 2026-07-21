// End-to-end smoke test for POST /api/estimates.
//
// Run against a live server:   npm start   (in one shell)
//                              npm test    (in another)
//
// Exercises the paths that matter: a valid submission persists and returns a
// reference; hostile payloads are rejected; and — most importantly — a
// client-supplied price is ignored in favour of the server's own calculation.

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const ENDPOINT = `${BASE}/api/estimates`;

// The API rate-limits to 5 submissions per IP per hour. Each run therefore
// presents a unique client IP so repeated runs don't exhaust one bucket and
// start failing with 429s. Rate limiting itself is covered by its own test at
// the end, using a dedicated fixed IP.
const RUN_IP = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;

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

async function post(body, ip = RUN_IP) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

const validAutomotive = {
  name: 'Smoke Test',
  email: 'smoke@example.com',
  phone: '5550001111',
  industry: 'automotive',
  vehicleType: 'suv',
  make: 'Toyota',
  model: '4Runner',
  year: '2022',
  sizeClass: 'suv-3row',
  // Premium Full Detail (3-row SUV) = $225, + Clay Bar add-on = $70 -> $295
  serviceIds: ['auto-full-detail'],
  addOnIds: ['auto-clay-bar'],
  preferredDate: null,
  notes: 'Automated smoke test — safe to delete.',
  smsConsent: false,
};

console.log(`\nSmoke testing ${ENDPOINT}\n`);

// ── 1. Happy path ────────────────────────────────────────────────────────────
{
  const { status, data } = await post(validAutomotive);
  check('valid submission returns 200', status === 200, `got ${status}`);
  check('response is ok', data.ok === true, JSON.stringify(data).slice(0, 200));
  check('a reference is issued', /^MOD-[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(data.reference ?? ''), data.reference);
  check(
    'server priced Full Detail (3-row SUV) + clay bar at $295',
    data.quotedTotal === 295,
    `got ${data.quotedTotal}`
  );
  check(
    'automotive pricing is not flagged as placeholder',
    data.isPlaceholderPricing === false,
    `got ${data.isPlaceholderPricing}`
  );
  check('notification outcome is reported', data.notifications !== undefined);
}

// ── 2. Client-supplied price must be ignored ─────────────────────────────────
{
  const { data } = await post({ ...validAutomotive, quotedTotal: 1, total: 1, price: 1 });
  check(
    'client-supplied price is ignored; server recomputes $295',
    data.quotedTotal === 295,
    `got ${data.quotedTotal}`
  );
}

// ── 3. Validation ────────────────────────────────────────────────────────────
{
  const { status, data } = await post({ ...validAutomotive, email: 'not-an-email' });
  check('bad email rejected with 400', status === 400, `got ${status}`);
  check('bad email names the field', !!data.errors?.email);
}
{
  const { status, data } = await post({ ...validAutomotive, phone: '123' });
  check('short phone rejected', status === 400 && !!data.errors?.phone);
}
{
  const { status } = await post({ ...validAutomotive, year: '1200' });
  check('implausible year rejected', status === 400, `got ${status}`);
}
{
  const { status, data } = await post({ ...validAutomotive, serviceIds: [] });
  check('empty service list rejected', status === 400 && !!data.errors?.serviceIds);
}

// ── 4. Cross-industry tampering ──────────────────────────────────────────────
{
  // A marine service id submitted under the automotive industry must not price.
  const { status } = await post({ ...validAutomotive, serviceIds: ['marine-ceramic'] });
  check('cross-industry service id rejected', status === 400, `got ${status}`);
}
{
  // Yacht category paired with a jet-ski size class to reach cheaper pricing.
  const { status } = await post({
    ...validAutomotive,
    industry: 'marine',
    vehicleType: 'yacht',
    sizeClass: 'pwc',
    make: 'Azimut',
    model: 'S7',
    serviceIds: ['marine-wash'],
    addOnIds: [],
  });
  check('mismatched category/size rejected', status === 400, `got ${status}`);
}

// ── 5. Add-on must be attachable ─────────────────────────────────────────────
{
  // Maintenance Wash offers no add-ons; the clay bar must be dropped, not priced.
  const { data } = await post({
    ...validAutomotive,
    serviceIds: ['auto-maintenance-wash'],
    addOnIds: ['auto-clay-bar'],
  });
  check(
    'unattachable add-on is dropped (maintenance wash = $80)',
    data.quotedTotal === 80,
    `got ${data.quotedTotal}`
  );
}

// ── 6. Ranged pricing (motorcycle clay bar, $50–$75) ─────────────────────────
{
  const { data } = await post({
    ...validAutomotive,
    vehicleType: 'motorcycle',
    sizeClass: 'motorcycle',
    make: 'Ducati',
    model: 'Monster',
    serviceIds: ['moto-full-detail'],
    addOnIds: ['moto-clay-bar'],
  });
  check(
    'ranged add-on produces a min total of $200',
    data.quotedTotal === 200,
    `got ${data.quotedTotal}`
  );
  check(
    'ranged add-on produces a max total of $225',
    data.quotedTotalMax === 225,
    `got ${data.quotedTotalMax}`
  );
}

// ── 7. Placeholder pricing disclosure ────────────────────────────────────────
{
  const { data } = await post({
    ...validAutomotive,
    industry: 'marine',
    vehicleType: 'boat',
    sizeClass: 'boat-26-32',
    make: 'Sea Ray',
    model: 'SDX 270',
    serviceIds: ['marine-wash'],
    addOnIds: [],
  });
  check(
    'marine quote is flagged as placeholder pricing',
    data.isPlaceholderPricing === true,
    `got ${data.isPlaceholderPricing}`
  );
}

// ── 8. Method guard ──────────────────────────────────────────────────────────
{
  const res = await fetch(ENDPOINT);
  check('GET is rejected with 405', res.status === 405, `got ${res.status}`);
}

// ── 9. Rate limiting ─────────────────────────────────────────────────────────
// Uses its own IP so it cannot disturb the tests above. The limit is 5 per
// hour, so the 6th submission from this address must be refused.
{
  const rlIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const { status } = await post(validAutomotive, rlIp);
    statuses.push(status);
  }
  check(
    'first 5 submissions from one IP are accepted',
    statuses.slice(0, 5).every((s) => s === 200),
    statuses.join(',')
  );
  check('6th submission from the same IP is rate limited (429)', statuses[5] === 429, `got ${statuses[5]}`);

  // A different IP must be unaffected — the limit is per client, not global.
  const { status } = await post(validAutomotive, '198.51.100.250');
  check('a different IP is unaffected by that limit', status === 200, `got ${status}`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
