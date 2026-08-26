// Registers scripts/ts-resolve-hooks.mjs. Used as:
//     node --import ./scripts/register-ts.mjs <script.mjs>
import { register } from 'node:module';
register('./ts-resolve-hooks.mjs', import.meta.url);
