/**
 * Adsbooster SDK — campaign lifecycle (Node)
 *
 * Creates a campaign, pauses it, then resumes it.
 *
 * Usage:
 *   ADSBOOSTER_API_KEY=adsb_live_… node examples/node-create-campaign.js
 */
'use strict';

const { Adsbooster, AdsboosterError } = require('../dist/adsbooster.js');

(async () => {
  const client = new Adsbooster({
    apiKey: process.env.ADSBOOSTER_API_KEY || 'adsb_live_REPLACE_ME',
    baseUrl: process.env.ADSBOOSTER_BASE_URL || 'https://adsbooster.net',
  });

  // 1. Create
  const created = await client.campaigns.create({
    name: 'SDK Demo Campaign ' + Date.now(),
    platform: 'meta',
    objective: 'conversions',
    budget_amount: 10,
    budget_type: 'daily',
    targeting: { geo: 'United States', age_min: 18, age_max: 45, interests: 'Fitness' },
    headline: 'Walk on clouds — 40% off',
    primary_text: 'Cloud-knit running shoes built for 20,000 daily steps. Free shipping today.',
    destination_url: 'https://example.com/offer',
  });
  const id = created.campaign?.id ?? created.id;
  console.log('✓ created campaign #' + id);

  // 2. Pause
  await client.campaigns.pause(id);
  console.log('✓ paused');

  // 3. Resume
  await client.campaigns.resume(id);
  console.log('✓ resumed');

  // 4. Fetch final state
  const final = await client.campaigns.get(id);
  console.log('✓ status:', final.campaign?.status ?? final.status);
})().catch((err) => {
  if (err instanceof AdsboosterError) {
    console.error(`✗ [${err.status}] ${err.code}: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
