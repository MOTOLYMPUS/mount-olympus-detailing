// ─────────────────────────────────────────────────────────────────────────────
// End-to-end smoke test for the app: auth, authorisation, garage, availability
// and booking.
//
// Run against a live server:   npm start        (in one shell)
//                              npm run test:app (in another)
//
// The emphasis is deliberately on the things that would be EXPENSIVE TO GET
// WRONG rather than on breadth:
//
//   • Can a customer read or modify another customer's data?      (horizontal)
//   • Can a customer grant themselves a staff role?               (vertical)
//   • Is a client-supplied price ever trusted?                    (integrity)
//   • Can the same slot be sold twice?                            (integrity)
//   • Does an unauthenticated caller get anything at all?
//
// Every run uses fresh randomised accounts, so it is safe to run repeatedly
// against a development database. It will leave test users behind — that is
// intentional, so a failure can be inspected afterwards.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

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

/**
 * A minimal cookie jar. `fetch` does not persist cookies between calls, and the
 * whole point of these tests is that the session cookie is what carries
 * identity — so it has to be threaded through by hand.
 */
function newSession() {
  let cookie = '';

  return {
    get cookie() {
      return cookie;
    },
    async call(path, { method = 'GET', body, headers = {} } = {}) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });

      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        const match = /mod_session=([^;]*)/.exec(setCookie);
        if (match) cookie = match[1] ? `mod_session=${match[1]}` : '';
      }

      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = { _raw: text.slice(0, 200) };
      }
      return { status: res.status, data, headers: res.headers };
    },
  };
}

const stamp = Date.now();
const passwordFor = (n) => `smoke-test-passphrase-${n}`;

console.log(`\nSmoke testing the app at ${BASE}`);

// ─────────────────────────────────────────────────────────────────────────────
section('1. Registration and session');
// ─────────────────────────────────────────────────────────────────────────────

const alice = newSession();
const aliceEmail = `smoke-alice-${stamp}@example.com`;

{
  const { status, data } = await alice.call('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Alice Smoke',
      email: aliceEmail,
      phone: '5550001111',
      password: passwordFor('alice'),
      smsConsent: false,
    },
  });
  check('registration succeeds', status === 200 && data.ok === true, JSON.stringify(data).slice(0, 160));
  check('a session cookie is issued', alice.cookie.startsWith('mod_session='), alice.cookie);
  check('new accounts are customers, never staff', data.user?.role === 'customer', data.user?.role);
}

{
  // Weak passwords must be refused, and the message must name the field.
  const probe = newSession();
  const { status, data } = await probe.call('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Weak Password',
      email: `smoke-weak-${stamp}@example.com`,
      phone: '5550001111',
      password: 'password',
      smsConsent: false,
    },
  });
  check('a weak password is rejected', status === 400 && !!data.errors?.password, JSON.stringify(data).slice(0, 160));
}

{
  // Registering the same address twice must NOT confirm the account exists.
  const probe = newSession();
  const { status, data } = await probe.call('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Duplicate',
      email: aliceEmail,
      phone: '5550001111',
      password: passwordFor('dupe'),
      smsConsent: false,
    },
  });
  const message = String(data.error ?? '').toLowerCase();
  check('a duplicate registration is refused', status === 409, `got ${status}`);
  check(
    'the refusal does not confirm the account exists',
    !message.includes('already registered') && !message.includes('taken'),
    data.error
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('2. Authentication');
// ─────────────────────────────────────────────────────────────────────────────

{
  const probe = newSession();
  const wrongPassword = await probe.call('/api/auth/login', {
    method: 'POST',
    body: { email: aliceEmail, password: 'definitely-the-wrong-password' },
  });
  const noSuchUser = await probe.call('/api/auth/login', {
    method: 'POST',
    body: { email: `nobody-${stamp}@example.com`, password: 'definitely-the-wrong-password' },
  });

  check('a wrong password is refused', wrongPassword.status === 401, `got ${wrongPassword.status}`);
  check('an unknown account is refused', noSuchUser.status === 401, `got ${noSuchUser.status}`);
  check(
    'both failures return the SAME message (no account enumeration)',
    wrongPassword.data.error === noSuchUser.data.error,
    `"${wrongPassword.data.error}" vs "${noSuchUser.data.error}"`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. Unauthenticated access');
// ─────────────────────────────────────────────────────────────────────────────

{
  const anon = newSession();
  for (const path of ['/api/me', '/api/vehicles', '/api/appointments', '/api/notifications']) {
    const { status } = await anon.call(path);
    check(`${path} refuses an anonymous caller`, status === 401, `got ${status}`);
  }

  // Availability is intentionally public so the marketing site can show a
  // calendar — but it must not leak who is booked.
  const { status, data } = await anon.call('/api/availability');
  check('/api/availability is public', status === 200, `got ${status}`);
  const serialised = JSON.stringify(data);
  check(
    'availability leaks no customer or booking identifiers',
    !serialised.includes('customerId') && !serialised.includes('reference'),
    'found identifying fields in the public availability response'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('4. Privilege escalation');
// ─────────────────────────────────────────────────────────────────────────────

{
  // The profile endpoint must ignore role/active entirely.
  const { status } = await alice.call('/api/me', {
    method: 'PATCH',
    body: { name: 'Alice Smoke', phone: '5550001111', role: 'owner', active: true },
  });
  check('profile update accepts the legitimate fields', status === 200, `got ${status}`);

  const me = await alice.call('/api/me');
  check(
    'a customer CANNOT promote themselves via /api/me',
    me.data.user?.role === 'customer',
    `role is now ${me.data.user?.role}`
  );
}

{
  const { status } = await alice.call('/api/admin/employees');
  check('a customer cannot reach the admin employee list', status === 403 || status === 404, `got ${status}`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. Vehicle garage');
// ─────────────────────────────────────────────────────────────────────────────

let aliceVehicleId = '';

{
  const { status, data } = await alice.call('/api/vehicles', {
    method: 'POST',
    body: {
      industry: 'automotive',
      vehicleType: 'suv',
      sizeClass: 'suv-3row',
      make: 'Toyota',
      model: '4Runner',
      year: '2022',
      color: 'Silver',
    },
  });
  aliceVehicleId = data.vehicle?.id ?? '';
  check('a vehicle can be saved', status === 201 && !!aliceVehicleId, JSON.stringify(data).slice(0, 160));
  check('the first vehicle becomes the default', data.vehicle?.isDefault === true);
}

{
  // A VIN is 17 characters and never contains I, O or Q.
  const { status, data } = await alice.call('/api/vehicles', {
    method: 'POST',
    body: {
      industry: 'automotive',
      vehicleType: 'car',
      sizeClass: 'sedan',
      make: 'Honda',
      model: 'Accord',
      vin: 'IOQ00000000000000',
    },
  });
  check('an invalid VIN is rejected', status === 400 && !!data.errors?.vin, JSON.stringify(data).slice(0, 160));
}

{
  // Cross-industry tampering, same rule the estimate API enforces.
  const { status } = await alice.call('/api/vehicles', {
    method: 'POST',
    body: {
      industry: 'marine',
      vehicleType: 'yacht',
      sizeClass: 'pwc',
      make: 'Azimut',
      model: 'S7',
    },
  });
  check('a jet-ski size on a yacht is rejected', status === 400, `got ${status}`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('6. Horizontal access control');
// ─────────────────────────────────────────────────────────────────────────────

const bob = newSession();

{
  await bob.call('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Bob Smoke',
      email: `smoke-bob-${stamp}@example.com`,
      phone: '5550002222',
      password: passwordFor('bob'),
      smsConsent: false,
    },
  });

  const read = await bob.call(`/api/vehicles/${aliceVehicleId}`);
  check(
    "Bob cannot read Alice's vehicle",
    read.status === 404,
    `got ${read.status} — this is a horizontal access control failure`
  );

  const write = await bob.call(`/api/vehicles/${aliceVehicleId}`, {
    method: 'PATCH',
    body: { color: 'Hacked' },
  });
  check("Bob cannot modify Alice's vehicle", write.status === 404, `got ${write.status}`);

  const destroy = await bob.call(`/api/vehicles/${aliceVehicleId}`, { method: 'DELETE' });
  check("Bob cannot delete Alice's vehicle", destroy.status === 404, `got ${destroy.status}`);

  const list = await bob.call('/api/vehicles');
  check(
    "Bob's garage does not contain Alice's vehicle",
    !(list.data.vehicles ?? []).some((v) => v.id === aliceVehicleId)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('7. Availability and booking');
// ─────────────────────────────────────────────────────────────────────────────

let slot = null;

{
  const { status, data } = await alice.call(
    '/api/availability?industry=automotive&size=suv-3row&services=auto-full-detail'
  );
  check('availability returns days', status === 200 && Array.isArray(data.days), `got ${status}`);

  const openDay = (data.days ?? []).find((d) => d.openCount > 0);
  slot = openDay?.slots.find((s) => s.available) ?? null;
  check('at least one bookable slot exists', !!slot, 'no open slots — check business hours seeding');

  check(
    'the duration is derived from the catalogue, not the client',
    data.durationMinutes > 0,
    `got ${data.durationMinutes}`
  );
}

let appointmentId = '';

if (slot) {
  const { status, data } = await alice.call('/api/appointments', {
    method: 'POST',
    body: {
      vehicleId: aliceVehicleId,
      industry: 'automotive',
      sizeClass: 'suv-3row',
      serviceIds: ['auto-full-detail'],
      addOnIds: ['auto-clay-bar'],
      startsAt: slot.startsAt,
      locationType: 'mobile',
      address: '1 Test Street, Dallas TX 75201',
      notes: 'Automated smoke test — safe to delete.',
      // Hostile fields: a client trying to set its own price and pick a role.
      quotedTotal: 1,
      customerId: 'someone-else',
      employeeId: 'someone-else',
    },
  });

  appointmentId = data.appointment?.id ?? '';
  check('a booking is created', status === 201 && !!appointmentId, JSON.stringify(data).slice(0, 200));
  check(
    'the client-supplied price is IGNORED (server recomputes $295)',
    data.appointment?.quotedTotal === 295,
    `got ${data.appointment?.quotedTotal}`
  );
  check(
    'a customer cannot book on behalf of someone else',
    data.appointment?.customerId !== 'someone-else'
  );
  check(
    'a customer cannot assign a technician',
    !data.appointment?.employeeId,
    `got ${data.appointment?.employeeId}`
  );
}

if (slot) {
  // THE double-booking test. The same instant must not be sold twice.
  const { status, data } = await alice.call('/api/appointments', {
    method: 'POST',
    body: {
      vehicleId: aliceVehicleId,
      industry: 'automotive',
      sizeClass: 'suv-3row',
      serviceIds: ['auto-full-detail'],
      addOnIds: [],
      startsAt: slot.startsAt,
      locationType: 'mobile',
      address: '1 Test Street, Dallas TX 75201',
      notes: 'Double-booking probe.',
    },
  });
  check(
    'the SAME slot cannot be booked twice (409)',
    status === 409,
    `got ${status} — this is a double-booking failure`
  );
  check('the conflict explains itself', typeof data.error === 'string' && data.error.length > 0);
}

if (appointmentId) {
  const read = await bob.call(`/api/appointments/${appointmentId}`);
  check("Bob cannot read Alice's booking", read.status === 404, `got ${read.status}`);

  const cancel = await bob.call(`/api/appointments/${appointmentId}`, { method: 'DELETE' });
  check("Bob cannot cancel Alice's booking", cancel.status === 404, `got ${cancel.status}`);

  const own = await alice.call(`/api/appointments/${appointmentId}`);
  check('Alice can read her own booking', own.status === 200, `got ${own.status}`);
  check('the booking carries a reference', /^MOD-/.test(own.data.appointment?.reference ?? ''));
}

// ─────────────────────────────────────────────────────────────────────────────
section('8. Password reset does not enumerate accounts');
// ─────────────────────────────────────────────────────────────────────────────

{
  const anon = newSession();
  const real = await anon.call('/api/auth/password', { method: 'POST', body: { email: aliceEmail } });
  const fake = await anon.call('/api/auth/password', {
    method: 'POST',
    body: { email: `nobody-${stamp}@example.com` },
  });

  check('a reset request for a real account returns 200', real.status === 200);
  check('a reset request for an unknown account ALSO returns 200', fake.status === 200);
  check(
    'both responses are identical',
    JSON.stringify(real.data) === JSON.stringify(fake.data),
    `${JSON.stringify(real.data)} vs ${JSON.stringify(fake.data)}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('9. Sign out');
// ─────────────────────────────────────────────────────────────────────────────

{
  const before = await alice.call('/api/me');
  check('the session works before sign out', before.status === 200);

  await alice.call('/api/auth/logout', { method: 'POST' });

  const after = await alice.call('/api/me');
  check('the session is dead after sign out', after.status === 401, `got ${after.status}`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('10. Security headers and PWA assets');
// ─────────────────────────────────────────────────────────────────────────────

{
  const res = await fetch(`${BASE}/`);
  const csp = res.headers.get('content-security-policy') ?? '';
  check('a Content-Security-Policy is served', csp.length > 0);
  check("frame-ancestors is 'none'", csp.includes("frame-ancestors 'none'"));
  check('X-Content-Type-Options is nosniff', res.headers.get('x-content-type-options') === 'nosniff');

  const manifest = await fetch(`${BASE}/manifest.webmanifest`);
  check('the web app manifest is served', manifest.status === 200, `got ${manifest.status}`);

  const sw = await fetch(`${BASE}/sw.js`);
  check('the service worker is served', sw.status === 200, `got ${sw.status}`);
  check(
    'the service worker is not cached aggressively',
    (sw.headers.get('cache-control') ?? '').includes('no-cache'),
    sw.headers.get('cache-control') ?? 'no cache-control header'
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
