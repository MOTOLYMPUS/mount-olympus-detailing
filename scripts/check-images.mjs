// Verifies every image URL in data/media.ts actually resolves.
//
// Stock photo IDs go stale and typos are invisible until a customer sees a
// blank panel, so this is worth re-running after any media change:
//   node scripts/check-images.mjs

import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../data/media.ts', import.meta.url), 'utf8');

const ids = [...src.matchAll(/u\('(photo-[^']+)'/g)].map((m) => m[1]);
const names = [...src.matchAll(/(\w+):\s*\{?\s*(?:src:\s*)?u\('(photo-[^']+)'/g)].map((m) => ({
  key: m[1],
  id: m[2],
}));

const unique = [...new Set(ids)];
console.log(`\nChecking ${unique.length} unique Unsplash images…\n`);

let bad = 0;
for (const id of unique) {
  const url = `https://images.unsplash.com/${id}?q=80&w=400&auto=format&fit=crop`;
  const label = names.filter((n) => n.id === id).map((n) => n.key).join(', ') || id;
  try {
    const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1024' } });
    const type = res.headers.get('content-type') ?? '';
    const ok = res.ok && type.startsWith('image/');
    if (!ok) bad++;
    console.log(
      `  ${ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mDEAD\x1b[0m'} ${res.status} ${type.padEnd(12)} ${label}  (${id})`
    );
  } catch (e) {
    bad++;
    console.log(`  \x1b[31mDEAD\x1b[0m  ERR  ${label}  (${id}) — ${e.message}`);
  }
}

console.log(`\n${unique.length - bad} live, ${bad} dead\n`);
process.exit(bad > 0 ? 1 : 0);
