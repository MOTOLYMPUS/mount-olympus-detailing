// ─────────────────────────────────────────────────────────────────────────────
// A module resolver that lets Node run this project's TypeScript directly.
//
// Node 24 strips types from .ts files on its own, so no build step or bundler
// is needed to test lib/ code. Two things it does NOT do, which this supplies:
//
//   • extensionless imports — `from './db'`. Standard ESM requires the
//     extension; TypeScript source omits it everywhere.
//   • the `@/` path alias from tsconfig.json.
//
// Test tooling only. Nothing in the app or the build uses it.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/** Extensions to try, in the order TypeScript itself would. */
const CANDIDATES = ['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  // Built-ins (node:sqlite among them) must pass straight through untouched —
  // rewriting them is exactly what broke the jiti-based approach.
  if (specifier.startsWith('node:') || !/^[.@/]/.test(specifier)) {
    return nextResolve(specifier, context);
  }

  let target = specifier;

  if (specifier.startsWith('@/')) {
    target = pathToFileURL(path.join(root, specifier.slice(2))).href;
  } else if (specifier.startsWith('.') && context.parentURL) {
    target = new URL(specifier, context.parentURL).href;
  }

  if (target.startsWith('file:')) {
    const filePath = fileURLToPath(target);
    if (!path.extname(filePath) || !existsSync(filePath)) {
      for (const ext of CANDIDATES) {
        const candidate = filePath + ext;
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(target, context);
  }

  return nextResolve(specifier, context);
}
