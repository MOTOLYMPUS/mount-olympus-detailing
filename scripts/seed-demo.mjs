// ─────────────────────────────────────────────────────────────────────────────
// Seed a realistic demo customer through the PUBLIC API — no direct DB writes.
//
// Doing this over HTTP rather than by inserting rows is the point: it proves
// the whole loop actually works end to end — register → save vehicles → staff
// books → staff completes → loyalty points accrue → business metrics move —
// rather than proving only that a screenshot can be staged.
//
//   node scripts/seed-demo.mjs <owner-email> <owner-password> [baseUrl]
//
// Safe to run repeatedly; every run creates a new customer.
// ─────────────────────────────────────────────────────────────────────────────

const OWNER_EMAIL = process.argv[2];
const OWNER_PASSWORD = process.argv[3];
const BASE = process.argv[4] ?? 'http://localhost:3000';

if (!OWNER_EMAIL || !OWNER_PASSWORD) {
  console.error('Usage: node scripts/seed-demo.mjs <owner-email> <owner-password> [baseUrl]');
  process.exit(1);
}

/** Minimal cookie jar — fetch does not persist cookies between calls. */
function session() {
  let cookie = '';
  return {
    async call(path, { method = 'GET', body } = {}) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        const m = /mod_session=([^;]*)/.exec(setCookie);
        if (m && m[1]) cookie = `mod_session=${m[1]}`;
      }
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      return { status: res.status, data };
    },
  };
}

const stamp = Date.now();
const customerEmail = `demo.customer.${stamp}@example.com`;
const customerPassword = 'demo-garage-passphrase';

// ── 1. Customer registers ────────────────────────────────────────────────────
const customer = session();
{
  const { status, data } = await customer.call('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Marcus Hale',
      email: customerEmail,
      phone: '4695550188',
      password: customerPassword,
      smsConsent: true,
    },
  });
  if (status !== 200) {
    console.error('register failed', data);
    process.exit(1);
  }
  console.log(`OK  Registered ${data.user.name} <${customerEmail}> as ${data.user.role}`);
}

const me0 = await customer.call('/api/me');
const customerId = me0.data.user.id;

// ── 2. Vehicles across two industries ────────────────────────────────────────
const VEHICLES = [
  {
    industry: 'automotive', vehicleType: 'car', sizeClass: 'coupe',
    year: '2023', make: 'Porsche', model: '911', trim: 'Carrera S',
    color: 'Guards Red', plate: 'MOD911',
    notes: 'Soft paint — light polish only.', isDefault: true,
  },
  {
    industry: 'automotive', vehicleType: 'truck', sizeClass: 'truck',
    year: '2022', make: 'Ford', model: 'F-150', trim: 'Lariat',
    color: 'Antimatter Blue', plate: 'HAUL22',
    notes: 'Tows the boat. Winter salt exposure.',
  },
  {
    industry: 'marine', vehicleType: 'boat', sizeClass: 'boat-20-25',
    year: '2021', make: 'Sea Ray', model: 'SDX 250', trim: 'Outboard',
    color: 'White / Navy',
    notes: 'Kept on a lift at Lake Lewisville.',
  },
];

const vehicleIds = [];
for (const v of VEHICLES) {
  const { status, data } = await customer.call('/api/vehicles', { method: 'POST', body: v });
  if (status !== 201) {
    console.error('vehicle failed', data);
    process.exit(1);
  }
  vehicleIds.push(data.vehicle.id);
  console.log(
    `OK  Saved vehicle: ${v.year} ${v.make} ${v.model}${data.vehicle.isDefault ? '  (default)' : ''}`
  );
}

// ── 3. Owner signs in ────────────────────────────────────────────────────────
const owner = session();
{
  const { status, data } = await owner.call('/api/auth/login', {
    method: 'POST',
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  if (status !== 200) {
    console.error('owner login failed', data);
    process.exit(1);
  }
  console.log(`OK  Signed in as ${data.user.name} (${data.user.role})`);
}

// ── 4. Owner books work for the customer ─────────────────────────────────────
//
// Booked at genuinely available slots rather than backdated. The availability
// engine refuses past dates by design (minimum notice), and working around it
// would mean bypassing the very rule the app exists to enforce.
const BOOKINGS = [
  { vehicle: 0, serviceIds: ['auto-full-detail'], addOnIds: ['auto-clay-bar'] },
  { vehicle: 1, serviceIds: ['auto-exterior-wash'], addOnIds: [] },
  { vehicle: 0, serviceIds: ['auto-ceramic-coating'], addOnIds: [] },
];

const created = [];
for (const b of BOOKINGS) {
  const v = VEHICLES[b.vehicle];

  const avail = await owner.call(
    `/api/availability?industry=${v.industry}&size=${v.sizeClass}&services=${b.serviceIds.join(',')}`
  );
  const day = (avail.data.days ?? []).find((d) => d.openCount > 0);
  const slot = day?.slots.find((s) => s.available);
  if (!slot) {
    console.log(`--  No free slot for ${v.make} ${v.model} — skipped`);
    continue;
  }

  const { status, data } = await owner.call('/api/appointments', {
    method: 'POST',
    body: {
      customerId,
      vehicleId: vehicleIds[b.vehicle],
      industry: v.industry,
      sizeClass: v.sizeClass,
      serviceIds: b.serviceIds,
      addOnIds: b.addOnIds,
      startsAt: slot.startsAt,
      locationType: 'mobile',
      address: '4820 Preston Park Blvd, Plano TX 75093',
      notes: 'Demo record — created by scripts/seed-demo.mjs.',
    },
  });

  if (status !== 201) {
    console.log(`--  Booking skipped (${data.error ?? status})`);
    continue;
  }

  created.push({
    id: data.appointment.id,
    ref: data.appointment.reference,
    total: data.appointment.quotedTotal,
    label: `${v.make} ${v.model}`,
  });
  console.log(
    `OK  Booked ${data.appointment.reference} — ${v.make} ${v.model} — $${data.appointment.quotedTotal}`
  );
}

// ── 5. Complete them ─────────────────────────────────────────────────────────
// This is the step that awards loyalty points and moves the revenue figures on
// the business dashboard. Leave one open so the customer has something upcoming.
for (const a of created.slice(0, Math.max(1, created.length - 1))) {
  const { status, data } = await owner.call(`/api/appointments/${a.id}`, {
    method: 'PATCH',
    body: { status: 'completed' },
  });
  if (status !== 200) {
    console.log(`--  Complete failed for ${a.ref} (${data.error ?? status})`);
    continue;
  }
  console.log(`OK  Completed ${a.ref} — ${a.label}`);
}

// ── 6. Read the state back from the customer's own account ───────────────────
{
  const me = await customer.call('/api/me');
  const l = me.data.loyalty;
  const vehicles = await customer.call('/api/vehicles');
  const appts = await customer.call('/api/appointments?direction=all&limit=20');

  console.log('');
  console.log('──────────────────────────────────────────────────────────');
  console.log('  CUSTOMER ACCOUNT STATE  (read back through /api/me)');
  console.log('──────────────────────────────────────────────────────────');
  console.log(`  Name             ${me.data.user.name}`);
  console.log(`  Role             ${me.data.user.role}`);
  console.log(`  Vehicles saved   ${me.data.counts.vehicles}`);
  vehicles.data.vehicles.forEach((v) => {
    console.log(
      `                   · ${v.year} ${v.make} ${v.model}${v.isDefault ? '  (default)' : ''}`
    );
  });
  console.log(`  Appointments     ${appts.data.appointments.length}`);
  console.log(`  Loyalty points   ${l.points}   (lifetime ${l.lifetimePoints})`);
  console.log(`  Tier             ${l.tier}  ->  ${l.tierDiscountPercent}% off every booking`);
  console.log(`  Referral code    ${l.referralCode}`);
  console.log('');
  console.log('  SIGN IN AS THIS CUSTOMER');
  console.log(`    ${customerEmail}`);
  console.log(`    ${customerPassword}`);
  console.log('');
}
