/**
 * Adsbooster SDK — Node smoke test
 *
 * End-to-end check against a live deployment. Safe to run: it only reads
 * (balance, lists) and prints results.
 *
 * Usage:
 *   ADSBOOSTER_API_KEY=adsb_live_… ADSBOOSTER_BASE_URL=https://adsbooster.net node examples/node-smoke-test.js
 */
'use strict';

const { Adsbooster, AdsboosterError } = require('../dist/adsbooster.js');

(async () => {
  const apiKey = process.env.ADSBOOSTER_API_KEY;
  if (!apiKey) {
    console.error('Set ADSBOOSTER_API_KEY first (Developer Console → api-settings).');
    process.exit(1);
  }

  const client = new Adsbooster({
    apiKey,
    baseUrl: process.env.ADSBOOSTER_BASE_URL || 'https://adsbooster.net',
  });

  console.log('Adsbooster SDK', client.VERSION, '→', client.apiBase);

  // 1. Credits
  const credits = await client.credits.balance();
  console.log('✓ balance:', JSON.stringify(credits.balances));

  // 2. Campaigns (list)
  const campaigns = await client.campaigns.list({ page: 1, limit: 5 });
  console.log('✓ campaigns:', Array.isArray(campaigns.campaigns) ? campaigns.campaigns.length : campaigns);

  // 3. Recent AI creatives
  const ugc = await client.ugc.listRecent({ limit: 3 });
  console.log('✓ recent UGC creatives:', Array.isArray(ugc.creatives) ? ugc.creatives.length : ugc);

  // 4. Directory + Reviews
  const dir = await client.directory.list({ limit: 3 });
  console.log('✓ directory listings:', Array.isArray(dir.listings) ? dir.listings.length : dir);
  const reviews = await client.reviews.list({ limit: 3 });
  console.log('✓ reviews:', Array.isArray(reviews.reviews) ? reviews.reviews.length : reviews);

  console.log('\nAll smoke checks passed. Rate quota:', client.lastRateLimit);
})().catch((err) => {
  if (err instanceof AdsboosterError) {
    console.error(`✗ AdsboosterError [${err.status}] ${err.code}: ${err.message}`);
    if (err.rateLimit) console.error('  quota:', err.rateLimit);
  } else {
    console.error('✗ unexpected error:', err);
  }
  process.exit(1);
});
