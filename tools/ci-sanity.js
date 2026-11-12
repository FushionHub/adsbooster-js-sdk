/** CI sanity: client construction, v1.2.0 resources, webhook sign/verify (incl. tamper rejection), missing-key error, optional integrations. */
const path = require('path');
const { Adsbooster, webhooks, AdsboosterError, VERSION, AI_CREDITS_PER_USD } = require(path.join(__dirname, '..', 'dist', 'adsbooster.js'));

const c = new Adsbooster({ apiKey: 'adsb_test_ci', baseUrl: 'https://example.com' });
if (c.apiBase !== 'https://example.com/api/v1') throw new Error('apiBase mismatch: ' + c.apiBase);
for (const ns of ['campaigns', 'posts', 'ugc', 'credits', 'directory', 'reviews', 'capi', 'webhooks', 'publicAnalytics', 'integrations']) {
  if (!c[ns]) throw new Error('missing resource: ' + ns);
}
if (typeof c.webhooks.list !== 'function' || typeof c.webhooks.test !== 'function') throw new Error('v1.1.0 webhooks API missing');
if (VERSION !== '1.2.0') throw new Error('VERSION mismatch: ' + VERSION);
if (AI_CREDITS_PER_USD !== 100) throw new Error('AI_CREDITS_PER_USD mismatch');

const body = JSON.stringify({ event: 'payment.completed', timestamp: new Date().toISOString() });
const sig = webhooks.sign(body, 'whsec_ci');
if (sig.indexOf('sha256=') !== 0) throw new Error('signature format wrong');
if (!webhooks.verify(body, sig, 'whsec_ci')) throw new Error('webhook verify failed on valid signature');
if (webhooks.verify(JSON.stringify({ event: 'tampered' }), sig, 'whsec_ci')) throw new Error('webhook verify accepted tampered body');

let threw = false;
try { new Adsbooster({}); } catch (e) { threw = e instanceof AdsboosterError; }
if (!threw) throw new Error('missing apiKey must throw AdsboosterError');

// ── optional integrations ────────────────────────────────────────────────
const available = c.integrations.detect();
for (const key of ['gemini', 'flutterwave', 'groq']) {
  if (typeof available[key] !== 'boolean') throw new Error('integrations.detect() missing ' + key);
}
if (typeof c.integrations.geminiGenerateText !== 'function') throw new Error('integrations.geminiGenerateText missing');
if (typeof c.integrations.groqChat !== 'function') throw new Error('integrations.groqChat missing');
if (typeof c.integrations.flutterwaveClient !== 'function') throw new Error('integrations.flutterwaveClient missing');

// Validation must reject before any network call / package load.
const rejects = (fn, label) => {
  return fn().then(
    () => { throw new Error(label + ' should have rejected'); },
    (err) => {
      if (!(err instanceof AdsboosterError)) throw new Error(label + ' rejected with a non-AdsboosterError');
      return err;
    }
  );
};

(async () => {
  await rejects(() => c.integrations.geminiGenerateText({}), 'geminiGenerateText without payload');
  await rejects(() => c.integrations.geminiGenerateText({ prompt: 'hi' }), 'geminiGenerateText without apiKey');
  await rejects(() => c.integrations.groqChat({}), 'groqChat without payload');
  await rejects(() => c.integrations.groqChat({ messages: [{ role: 'user', content: 'hi' }] }), 'groqChat without apiKey');
  await rejects(() => c.integrations.flutterwaveClient({}), 'flutterwaveClient without payload');

  // When the optional package is present, the helper must construct it.
  if (available.flutterwave) {
    const flw = await c.integrations.flutterwaveClient({ secretKey: 'FLWSECK_TEST', publicKey: 'FLWPUB_TEST' });
    if (!flw || typeof flw !== 'object') throw new Error('flutterwaveClient did not return an instance');
  }
  if (available.groq) {
    const groq = await c.integrations.groqChat({ messages: [{ role: 'user', content: 'ping' }], apiKey: 'gsk_test' })
      .then(() => 'resolved', (err) => {
        // A rejected upstream call still proves the package loaded and was used.
        if (err instanceof AdsboosterError && err.code === 'MissingOptionalDependency') throw err;
        return 'rejected-upstream';
      });
    if (!groq) throw new Error('groqChat did not resolve');
  }

  console.log('CI sanity (dist/adsbooster.js) passed');
  console.log('optional integrations detected:', JSON.stringify(available));
  console.log('All CI checks passed');
})().catch((err) => {
  console.error('CI FAILED:', err && err.message);
  process.exit(1);
});
