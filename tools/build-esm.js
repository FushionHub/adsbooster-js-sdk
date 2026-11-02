/**
 * Generate dist/adsbooster.esm.js from the canonical UMD build.
 * Unwraps the UMD factory body and appends ESM exports — same shape as
 * the v1.0.0 ESM already on origin/main (header + 'use strict' + body + exports).
 */
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(base, 'src', 'adsbooster.js'), 'utf8');

// The UMD wrapper: everything up to and including the factory-opening line
//   })(typeof self !== 'undefined' ? self : this, function () {
// and the closing `});` line at the end.
const openMarker = "})(typeof self !== 'undefined' ? self : this, function () {";
const openIdx = src.indexOf(openMarker);
if (openIdx === -1) throw new Error('factory opener not found');

let body = src.slice(openIdx + openMarker.length);
// Strip the final "});" that closes the UMD call (allow trailing whitespace/newline)
body = body.replace(/\}\);\s*$/, '');

// Drop the leading duplicate 'use strict'; line inside the factory (the ESM
// header already has one) — keep the code identical otherwise.
body = body.replace(/^\s*\r?\n\s*'use strict';\s*\r?\n/, '\n');
// Also handle it when it appears after a comment block directly
body = body.replace(/(\r?\n)'use strict';(\r?\n)/, '$1$2');

// The factory's final `return { ... };` becomes a module-level `var API`,
// matching the v1.0.0 ESM build's shape.
const returnIdx = body.lastIndexOf('return {');
if (returnIdx === -1) throw new Error('factory return not found');
body = body.slice(0, returnIdx) + 'var API = {' + body.slice(returnIdx + 'return {'.length);

const header =
  "/**\n" +
  " * Adsbooster JavaScript SDK — ESM build. Generated from src/adsbooster.js (UMD).\n" +
  " * Do not edit by hand — edit the source and regenerate.\n" +
  " */\n" +
  "'use strict';\n\n";

const footer =
  "\n\nexport { VERSION, Adsbooster, AdsboosterError, AI_CREDITS_PER_USD, webhooks };\n" +
  "export default Adsbooster;\n";

fs.writeFileSync(path.join(base, 'dist', 'adsbooster.esm.js'), header + body + footer, 'utf8');
console.log('ESM build written:', (header + body + footer).length, 'bytes');
