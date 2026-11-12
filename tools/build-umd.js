/**
 * Generate dist/adsbooster.js (UMD) from the canonical source.
 * The UMD build is byte-identical to src/adsbooster.js - this script exists so
 * the build step is explicit and repeatable (npm run build:umd).
 */
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..');
const srcPath = path.join(base, 'src', 'adsbooster.js');
const outPath = path.join(base, 'dist', 'adsbooster.js');

const src = fs.readFileSync(srcPath, 'utf8');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, src, 'utf8');

console.log(`UMD build written: ${src.length} bytes`);
