// jiti strips the `node:` prefix when resolving specifiers, so `node:sqlite`
// (a built-in with no bare-specifier form) fails to resolve inside lib/db.ts.
// The verify scripts alias `sqlite` to this file, which re-exports the real
// built-in. Test tooling only — nothing in the app imports it.
module.exports = require('node:sqlite');
