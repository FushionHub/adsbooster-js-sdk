/**
 * Adsbooster SDK — signed webhook receiver (Express + Node)
 *
 * Verifies X-Adsbooster-Signature (sha256 HMAC of the raw body) before
 * trusting any payload. Never trust parsed JSON for signature checks —
 * use the RAW body.
 *
 * Usage:
 *   WEBHOOK_SECRET=whsec_… node examples/express-webhooks.js
 */
'use strict';

const express = require('express');
const { webhooks } = require('../dist/adsbooster.js');

const app = express();
const SECRET = process.env.WEBHOOK_SECRET || 'whsec_REPLACE_ME';

app.post('/adsbooster/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const signature = req.get('X-Adsbooster-Signature') || '';

  // Timing-safe verification against the RAW request body.
  if (!webhooks.verify(req.body, signature, SECRET)) {
    console.warn('⚠ rejected webhook — bad signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(req.body.toString('utf8'));
  switch (event.event) {
    case 'campaign.status_changed':
      console.log('📣 campaign', event.data.id, '→', event.data.status);
      break;
    case 'post.published':
      console.log('📣 post published to', event.data.platform);
      break;
    case 'payment.completed':
      console.log('📣 payment completed:', event.data.amount, event.data.currency);
      break;
    default:
      console.log('📣 event:', event.event);
  }
  res.sendStatus(200);
});

app.listen(3000, () => console.log('Webhook receiver on :3000 — point your Adsbooster webhook here.'));
