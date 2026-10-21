# Adsbooster JavaScript SDK

Official JavaScript / TypeScript client for the **Adsbooster.net REST API v1** — built for SaaS teams that want AI ad creatives, multi-network campaign management, social publishing and server-side conversion tracking inside their own product.

- **Zero dependencies** — one small file, works in Node.js (≥18) and modern browsers
- **Typed** — ships complete TypeScript definitions
- **Resilient** — automatic retries on `429`/`5xx`, timeout via `AbortController`, rate-limit telemetry on every response
- **Universal** — UMD (`dist/adsbooster.js`), ESM (`dist/adsbooster.esm.js`)

> Platform repo: https://github.com/FushionHub/seopp
> SDK repo: https://github.com/adsbooster-sdks/adsbooster-js-sdk

---

## Install

**npm / yarn / pnpm**
```bash
npm install adsbooster-js-sdk
```

**Browser (CDN or self-hosted from your Adsbooster deployment)**
```html
<!-- Self-hosted — served straight from your platform, always in sync -->
<script src="https://adsbooster.net/api/v1/sdk/adsbooster.js"></script>

<!-- or jsDelivr once published -->
<script src="https://cdn.jsdelivr.net/npm/adsbooster-js-sdk/dist/adsbooster.js"></script>
```

## Quick start

```js
const { Adsbooster } = require('adsbooster-js-sdk');   // Node
// import { Adsbooster } from 'adsbooster-js-sdk';     // ESM / TS
// const Adsbooster = window.Adsbooster.Adsbooster;    // Browser <script>

const client = new Adsbooster({
  apiKey: process.env.ADSBOOSTER_API_KEY, // from Developer Console → api-settings
  // baseUrl: 'https://adsbooster.net',   // default; change for self-hosted
});

// 1) Check wallet balance
const balance = await client.credits.balance();
console.log(balance.ad_credits, balance.ai_credits);

// 2) Generate an AI UGC creative (Nano Banana 2 image stack)
const creative = await client.ugc.generateImage({
  product_name: 'Cloud-Knit Running Shoes',
  ugc_style: 'selfie_hold',
  creator_persona: 'gen_z',
  aspect_ratio: '1:1',
});
console.log(creative.creative.image_url);

// 3) Launch a campaign across connected networks
const campaign = await client.campaigns.create({
  name: 'Q4 Sneaker Drop',
  platform: 'meta',
  objective: 'conversions',
  budget_amount: 25,
  budget_type: 'daily',
});

// 4) Publish a post live to social
await client.posts.create({
  platform: 'tiktok',
  caption: 'New drop 🚀 link in bio #ad',
  media_url: creative.creative.image_url,
  media_type: 'image',
});
```

## API surface

| Namespace | Methods | Endpoint |
|---|---|---|
| `client.campaigns` | `list({page,limit,status})` · `get(id)` · `create(payload)` · `update(id,payload)` · `pause(id)` · `resume(id)` | `/api/v1/campaigns.php` |
| `client.posts` | `list({page,limit,status})` · `get(id)` · `create(payload)` · `remove(id)` | `/api/v1/posts.php` |
| `client.ugc` | `generateImage(payload)` · `listRecent({limit})` | `/api/v1/ugc.php` |
| `client.credits` | `balance()` | `/api/v1/credits.php` |
| `client.directory` | `list({category,q,limit})` · `createListing(payload)` | `/api/v1/directory.php` |
| `client.reviews` | `list({limit})` · `submit({rating,review_text,…})` | `/api/v1/reviews.php` |
| `client.capi` | `scriptUrl()` · `track({pixel_token,event_name,…})` | `/api/v1/capi-bridge.php` |
| `client.webhooks` | `testPingUrl(url)` | Developer Console |

Every response is the raw API payload (`{ success: true, … }`). Non-2xx responses throw an [`AdsboosterError`](#error-handling).

## Error handling

```js
const { Adsbooster, AdsboosterError } = require('adsbooster-js-sdk');

try {
  await client.ugc.generateImage({ product_name: '…' });
} catch (err) {
  if (err instanceof AdsboosterError) {
    console.error(err.status);        // 401, 429, 500… (0 = network/timeout)
    console.error(err.code);          // 'Unauthorized', 'RateLimitExceeded'…
    console.error(err.rateLimit);     // { limit: 60, remaining: 0, reset: 1768… }
    if (err.isRateLimit) {
      await new Promise(r => setTimeout(r, 60_000)); // or rely on auto-retry
    }
  } else {
    throw err;
  }
}
```

### Rate limits
The platform enforces **60 requests / minute / key** (sliding window). The SDK:
- reads `X-RateLimit-*` headers on **every** response into `client.lastRateLimit`
- **auto-retries** `429` honoring `Retry-After` / `X-RateLimit-Reset`, and `5xx` with exponential backoff (default `maxRetries: 2`)

```js
const client = new Adsbooster({ apiKey, maxRetries: 4, timeout: 60000 });
```

## Webhooks (server-side)

Outbound webhooks (`campaign.status_changed`, `post.published`, `payment.completed`) are signed with `X-Adsbooster-Signature: sha256=<hmac>` — verify with the raw body:

```js
const express = require('express');
const { webhooks } = require('adsbooster-js-sdk');

app.post('/adsbooster/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const ok = webhooks.verify(
    req.body,                                       // RAW body (Buffer/string)
    req.get('X-Adsbooster-Signature') || '',
    process.env.WEBHOOK_SECRET                      // per-endpoint secret from api-settings
  );
  if (!ok) return res.status(401).send('bad signature');
  const event = JSON.parse(req.body.toString('utf8'));
  console.log(event.event, event.data);
  res.sendStatus(200);
});
```

## Server-side conversion tracking (Meta CAPI / TikTok Events)

```js
// Browser: drop-in script (no SDK needed)
// <script src="https://adsbooster.net/api/v1/capi-bridge.php?js=1"></script>
// <script>window._adsbooster_token='px_live_…'; AdsboosterTrack('Purchase',{value:49.99,currency:'USD'});</script>

// Server-side from your SaaS:
await client.capi.track({
  pixel_token: 'px_live_…',
  event_name: 'Purchase',
  event_id: 'order_8841',
  custom_data: { value: 49.99, currency: 'USD' },
  user_data: { email_hash: sha256(email) },
});
```

## Examples

 runnable scripts live in [`examples/`](examples/):

- `examples/node-smoke-test.js` — end-to-end smoke test against a live deployment
- `examples/node-create-campaign.js` — campaign lifecycle (create → pause → resume)
- `examples/browser-ugc.html` — generate an AI creative from a web page
- `examples/express-webhooks.js` — verify signed webhooks in Express

## TypeScript

Full definitions ship in `types/index.d.ts`:

```ts
import { Adsbooster, AdsboosterError } from 'adsbooster-js-sdk';
const client = new Adsbooster({ apiKey: process.env.ADSBOOSTER_API_KEY! });
const res = await client.campaigns.list({ status: 'active', limit: 50 });
```

## Getting an API key

1. Sign up / log in on your Adsbooster deployment
2. Open **Developer Console** (`/api-settings`)
3. Generate a key (`adsb_live_…`) — optionally restrict it to your server IPs
4. Fund ad/AI credits from **Billing & Wallet** (top-ups from $2.50)

## License

[MIT](LICENSE) © Adsbooster.net Engineering Team
