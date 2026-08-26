// ─────────────────────────────────────────────────────────────────────────────
// Prove that buildSystemPrompt() is grounded in the REAL price tables.
//
//   node scripts/verify-ai-prompt.cjs            print the whole prompt
//   node scripts/verify-ai-prompt.cjs --check     assert known prices appear
//
// This exists because the assistant's entire value depends on it quoting the
// business's own numbers. If the prompt ever stops carrying them, the model
// falls back to inventing prices — and the failure is invisible until a
// customer is quoted something the business has to honour.
//
// Also checks that askAssistant() degrades instead of throwing with no API key.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const root = path.join(__dirname, '..');

const jiti = require('jiti')(__filename, {
  // jiti strips the `node:` prefix when resolving, which breaks `node:sqlite`
  // (a built-in with no bare-specifier alias). Map it back.
  alias: { '@': root, sqlite: path.join(__dirname, 'jiti-node-sqlite-shim.cjs') },
  esmResolve: true,
});

const { buildSystemPrompt, askAssistant, aiConfigured } = jiti(path.join(root, 'lib/ai.ts'));

const prompt = buildSystemPrompt();

if (!process.argv.includes('--check')) {
  console.log(prompt);
  console.log(`\n─── ${prompt.length} characters ───`);
  process.exit(0);
}

// Spot values read straight out of data/pricing — if the catalogue changes,
// this list is meant to be updated, not deleted.
const { allServices, allAddOns } = jiti(path.join(root, 'data/pricing/index.ts'));
const { formatPrice } = jiti(path.join(root, 'lib/pricing.ts'));

let failures = 0;
const check = (label, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures++;
};

check(`every service name appears`, allServices.every((s) => prompt.includes(s.name)));
check(`every add-on name appears`, allAddOns.every((a) => prompt.includes(a.name)));

// Every single price cell, formatted exactly as the app formats it elsewhere.
let cells = 0;
let missing = [];
for (const item of [...allServices, ...allAddOns]) {
  for (const [size, price] of Object.entries(item.prices)) {
    cells++;
    const formatted = formatPrice(price.price, price.priceMax);
    if (!prompt.includes(formatted)) missing.push(`${item.id}/${size} → ${formatted}`);
  }
}
check(`all ${cells} price cells present (missing: ${missing.length})`, missing.length === 0);
if (missing.length) console.log('   ' + missing.slice(0, 10).join('\n   '));

check('includes-lists are carried through', prompt.includes('Includes:'));
check('escalation token is documented', prompt.includes('[[ESCALATE]]'));
check('anti-sales-pitch rule is present', prompt.includes('DO NOT end every message with a pitch'));
check('business phone is present', prompt.includes('(469) 390-1255'));

// ── Graceful degradation with no API key ────────────────────────────────────
delete process.env.ANTHROPIC_API_KEY;
check('aiConfigured() is false with no key', aiConfigured() === false);

askAssistant({ messages: [{ role: 'user', content: 'How much for a ceramic coating?' }], user: null })
  .then((result) => {
    check('askAssistant() resolved instead of throwing', typeof result.reply === 'string');
    check('fallback reply is non-empty', result.reply.length > 20);
    check('fallback points at the phone number', result.reply.includes('(469) 390-1255'));
    check('fallback is not marked escalated', result.escalated === false);
    console.log(`\nFallback reply:\n${result.reply}\n`);
    console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.log(`FAIL  askAssistant() THREW — graceful degradation is broken: ${e}`);
    process.exit(1);
  });
