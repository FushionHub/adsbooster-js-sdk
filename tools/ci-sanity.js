/** CI sanity: client construction, v1.1.0 resources, webhook sign/verify (incl. tamper rejection), missing-key error. */
const path = require('path');
const { Adsbooster, webhooks, AdsboosterError, VERSION, AI_CREDITS_PER_USD } = require(path.join(__dirname, '..', 'dist', 'adsbooster.js'));

const c = new Adsbooster({ apiKey: 'adsb_test_ci', baseUrl: 'https://example.com' });
if (c.apiBase !== 'https://example.com/api/v1') throw new Error('apiBase mismatch: ' + c.apiBase);
for (const ns of ['campaigns', 'posts', 'ugc', 'credits', 'directory', 'reviews', 'capi', 'webhooks', 'publicAnalytics']) {
  if (!c[ns]) throw new Error('missing resource: ' + ns);
}
if (typeof c.webhooks.list !== 'function' || typeof c.webhooks.test !== 'function') throw new Error('v1.1.0 webhooks API missing');
if (VERSION !== '1.1.0') throw new Error('VERSION mismatch: ' + VERSION);
if (AI_CREDITS_PER_USD !== 100) throw new Error('AI_CREDITS_PER_USD mismatch');

const body = JSON.stringify({ event: 'payment.completed', timestamp: new Date().toISOString() });
const sig = webhooks.sign(body, 'whsec_ci');
if (sig.indexOf('sha256=') !== 0) throw new Error('signature format wrong');
if (!webhooks.verify(body, sig, 'whsec_ci')) throw new Error('webhook verify failed on valid signature');
if (webhooks.verify(JSON.stringify({ event: 'tampered' }), sig, 'whsec_ci')) throw new Error('webhook verify accepted tampered body');

let threw = false;
try { new Adsbooster({}); } catch (e) { threw = e instanceof AdsboosterError; }
if (!threw) throw new Error('missing apiKey must throw AdsboosterError');

console.log('CI sanity (dist/adsbooster.js) passed');

// ESM build: parse-level only (node --check covers syntax); verify same exports exist via dynamic check is not needed here.
console.log('All CI checks passed');
