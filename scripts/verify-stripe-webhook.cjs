// ─────────────────────────────────────────────────────────────────────────────
// Prove verifyWebhookSignature() actually verifies.
//
//   node scripts/verify-stripe-webhook.cjs
//
// The webhook route is the only endpoint in the app with no withAuth(); the
// signature IS the authentication. A verifier that accepts everything would
// hand anyone the ability to mark arbitrary payments as succeeded, and nothing
// in normal use would ever reveal it — hence this test.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('node:crypto');
const path = require('node:path');
const root = path.join(__dirname, '..');

const jiti = require('jiti')(__filename, {
  alias: { '@': root, sqlite: path.join(__dirname, 'jiti-node-sqlite-shim.cjs') },
  esmResolve: true,
});

const { verifyWebhookSignature } = jiti(path.join(root, 'lib/stripe.ts'));

const SECRET = 'whsec_test_secret_do_not_use_in_production';
const BODY = JSON.stringify({
  id: 'evt_test_1',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1', payment_status: 'paid', amount_total: 15000 } },
});

/** Build a header exactly the way Stripe does. */
function sign(body, secret, timestamp) {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

const now = Math.floor(Date.now() / 1000);

let failures = 0;
function check(label, actual, expected) {
  const pass = actual === expected;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}  (got ${actual}, expected ${expected})`);
  if (!pass) failures++;
}

// 1. Correctly signed, current timestamp → accepted.
check(
  'accepts a correctly signed payload',
  verifyWebhookSignature(BODY, sign(BODY, SECRET, now), SECRET).ok,
  true
);

// 2. Body tampered after signing → rejected. This is the attack that matters:
//    replay a real event with the amount or the session id changed.
const tampered = BODY.replace('15000', '1');
const r2 = verifyWebhookSignature(tampered, sign(BODY, SECRET, now), SECRET);
check('rejects a tampered payload', r2.ok, false);
check('  …with reason bad-signature', r2.reason, 'bad-signature');

// 3. Correctly signed but 10 minutes old → rejected by the replay window.
const old = now - 10 * 60;
const r3 = verifyWebhookSignature(BODY, sign(BODY, SECRET, old), SECRET);
check('rejects an expired timestamp', r3.ok, false);
check('  …with reason timestamp-out-of-tolerance', r3.reason, 'timestamp-out-of-tolerance');

// 4. Signed with a different secret → rejected.
check(
  'rejects a signature from the wrong secret',
  verifyWebhookSignature(BODY, sign(BODY, 'whsec_wrong', now), SECRET).ok,
  false
);

// 5. A future timestamp beyond tolerance is also rejected (clock-skew abuse).
check(
  'rejects a far-future timestamp',
  verifyWebhookSignature(BODY, sign(BODY, SECRET, now + 10 * 60), SECRET).ok,
  false
);

// 6. Structural failures.
check('rejects a missing header', verifyWebhookSignature(BODY, null, SECRET).ok, false);
check('rejects a malformed header', verifyWebhookSignature(BODY, 'garbage', SECRET).ok, false);
const r7 = verifyWebhookSignature(BODY, sign(BODY, SECRET, now), undefined);
check('rejects when no secret is configured', r7.ok, false);
check('  …with reason no-secret', r7.reason, 'no-secret');

// 7. Secret rotation: Stripe sends several v1 values; any match is a pass.
const rotating = `${sign(BODY, 'whsec_old', now)},v1=${crypto
  .createHmac('sha256', SECRET)
  .update(`${now}.${BODY}`, 'utf8')
  .digest('hex')}`;
check('accepts during secret rotation (multiple v1 values)', verifyWebhookSignature(BODY, rotating, SECRET).ok, true);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
