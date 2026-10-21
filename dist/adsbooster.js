/**
 * Adsbooster JavaScript SDK — official client for the Adsbooster.net REST API v1.
 *
 * Works in Node.js (>=18) and modern browsers. Zero dependencies.
 * Docs: https://github.com/adsbooster-sdks/adsbooster-js-sdk
 * API reference: /developer-docs on your Adsbooster deployment.
 *
 * Quick start:
 *   const { Adsbooster } = require('adsbooster-js-sdk');       // Node
 *   const client = new Adsbooster({ apiKey: 'adsb_live_...' });
 *   const balance = await client.credits.balance();
 *
 * © 2026 Adsbooster.net — MIT License
 */
(function (root, factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Adsbooster = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var DEFAULT_TIMEOUT = 30000;   // ms
  var DEFAULT_RETRIES = 2;       // retries on 429/5xx (initial attempt excluded)
  var AI_CREDITS_PER_USD = 100;  // documented platform rate

  /* ─────────────────────────── Errors ─────────────────────────── */

  /**
   * Raised for any non-2xx API response, network failure, or usage error.
   * `status` is the HTTP status (0 for network errors), `code` the API error
   * slug (e.g. 'RateLimitExceeded'), `rateLimit` the last seen quota snapshot.
   */
  function AdsboosterError(message, opts) {
    opts = opts || {};
    this.name = 'AdsboosterError';
    this.message = message || 'Unknown Adsbooster API error';
    this.status = typeof opts.status === 'number' ? opts.status : 0;
    this.code = opts.code || null;
    this.details = opts.details || null;
    this.rateLimit = opts.rateLimit || null;
    this.isRateLimit = this.code === 'RateLimitExceeded' || this.status === 429;
    var stackFn = Error.captureStackTrace;
    if (stackFn) {
      stackFn.call(Error, this, AdsboosterError);
    } else {
      this.stack = new Error(this.message).stack;
    }
  }
  AdsboosterError.prototype = Object.create(Error.prototype);
  AdsboosterError.prototype.constructor = AdsboosterError;

  /* ─────────────────────── Small utilities ────────────────────── */

  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function buildQuery(params) {
    if (!params) return '';
    var parts = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function nowSec() { return Math.floor(Date.now() / 1000); }

  function parseRetryAfter(headers) {
    if (!headers) return null;
    var ra = headers.get ? headers.get('retry-after') : null;
    if (ra) {
      var n = parseInt(ra, 10);
      if (!isNaN(n)) return n * 1000;
      var asDate = Date.parse(ra);
      if (!isNaN(asDate)) return Math.max(1000, asDate - Date.now());
    }
    var reset = headers.get ? headers.get('x-ratelimit-reset') : null;
    if (reset) {
      var delta = (parseInt(reset, 10) - nowSec()) * 1000;
      if (!isNaN(delta) && delta > 0) return delta;
    }
    return null;
  }

  /* ────────────────────────── Client ──────────────────────────── */

  /**
   * @param {object} options
   * @param {string} options.apiKey            Required. adsb_live_… / adsb_test_… key from the Developer Console.
   * @param {string} [options.baseUrl]         Platform origin, e.g. https://adsbooster.net (no trailing /api).
   * @param {number} [options.timeout=30000]   Per-request timeout in ms.
   * @param {number} [options.maxRetries=2]    Automatic retries on 429 + 5xx.
   * @param {function} [options.fetch]         Custom fetch implementation (testing, proxies).
   */
  function Adsbooster(options) {
    options = options || {};
    if (!options.apiKey || typeof options.apiKey !== 'string') {
      throw new AdsboosterError('An `apiKey` is required — generate one in your Adsbooster Developer Console (api-settings).');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || 'https://adsbooster.net').replace(/\/+$/, '');
    this.apiBase = this.baseUrl + '/api/v1';
    this.timeout = typeof options.timeout === 'number' ? options.timeout : DEFAULT_TIMEOUT;
    this.maxRetries = typeof options.maxRetries === 'number' ? options.maxRetries : DEFAULT_RETRIES;
    this._fetch = options.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!this._fetch) {
      throw new AdsboosterError('No fetch implementation found. Adsbooster SDK needs Node >= 18 or a modern browser.');
    }

    // Resource namespaces
    this.campaigns  = new CampaignsResource(this);
    this.posts      = new PostsResource(this);
    this.ugc        = new UgcResource(this);
    this.credits    = new CreditsResource(this);
    this.directory  = new DirectoryResource(this);
    this.reviews    = new ReviewsResource(this);
    this.capi       = new CapiResource(this);
    this.webhooks   = new WebhooksResource(this);

    // Last observed quota: { limit, remaining, reset }
    this.lastRateLimit = null;
  }

  Adsbooster.prototype.VERSION = VERSION;

  /** Low-level request with timeout, retries and error normalisation. */
  Adsbooster.prototype.request = function (method, path, body, options) {
    options = options || {};
    var self = this;
    var url = this.apiBase + path;
    var attempt = 0;

    function once() {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, self.timeout) : null;

      var headers = {
        'X-API-Key': self.apiKey,
        'Accept': 'application/json'
      };
      var payload;
      if (body !== undefined && body !== null && method !== 'GET') {
        if (typeof FormData !== 'undefined' && body instanceof FormData) {
          payload = body; // browser sets the multipart boundary itself
        } else {
          headers['Content-Type'] = 'application/json';
          payload = JSON.stringify(body);
        }
      }

      return self._fetch(url, {
        method: method,
        headers: headers,
        body: payload,
        signal: controller ? controller.signal : undefined,
        credentials: 'omit'
      }).then(function (res) {
        if (timer) clearTimeout(timer);
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON */ }

          // Capture quota telemetry on every response.
          if (res.headers && res.headers.get) {
            var limit = parseInt(res.headers.get('x-ratelimit-limit'), 10);
            var remaining = parseInt(res.headers.get('x-ratelimit-remaining'), 10);
            var reset = parseInt(res.headers.get('x-ratelimit-reset'), 10);
            if (!isNaN(limit)) {
              self.lastRateLimit = {
                limit: limit,
                remaining: isNaN(remaining) ? null : remaining,
                reset: isNaN(reset) ? null : reset
              };
            }
          }

          if (res.ok && data && data.success === false) {
            // 2xx with success:false — treat as an API error (rare).
            throw new AdsboosterError(data.message || data.error || 'Request failed', {
              status: res.status, code: data.error || null, details: data,
              rateLimit: self.lastRateLimit
            });
          }
          if (!res.ok) {
            throw new AdsboosterError(
              (data && (data.message || data.error)) || ('HTTP ' + res.status),
              { status: res.status, code: data && data.error || null, details: data, rateLimit: self.lastRateLimit }
            );
          }
          return data;
        });
      }).catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err instanceof AdsboosterError) throw err;
        var aborted = controller && controller.signal && controller.signal.aborted;
        throw new AdsboosterError(
          aborted ? 'Request timed out after ' + self.timeout + 'ms' : ('Network error: ' + (err && err.message)),
          { status: 0, code: aborted ? 'Timeout' : 'NetworkError' }
        );
      });
    }

    function run() {
      return once().catch(function (err) {
        var retryable = err.isRateLimit || (err.status >= 500 && err.status < 600) || err.status === 0;
        if (retryable && attempt < self.maxRetries) {
          attempt += 1;
          var wait = err.isRateLimit
            ? (parseRetryAfter(err.details && err.details.__headers) || 5000 * attempt)
            : Math.min(8000, 400 * Math.pow(2, attempt - 1));
          return sleep(wait).then(run);
        }
        throw err;
      });
    }
    return run();
  };

  /* ───────────────────── Resource: Campaigns ──────────────────── */

  function CampaignsResource(client) { this._c = client; }

  /** GET /campaigns.php — list your campaigns. opts: { page, limit, status } */
  CampaignsResource.prototype.list = function (opts) {
    return this._c.request('GET', '/campaigns.php' + buildQuery(opts || {}));
  };

  /** GET /campaigns.php?id=N — fetch a single campaign. */
  CampaignsResource.prototype.get = function (id) {
    return this._c.request('GET', '/campaigns.php?id=' + encodeURIComponent(id));
  };

  /** POST /campaigns.php — create a campaign. */
  CampaignsResource.prototype.create = function (payload) {
    if (!isObject(payload)) {
      return Promise.reject(new AdsboosterError('campaigns.create() expects a payload object.'));
    }
    return this._c.request('POST', '/campaigns.php', payload);
  };

  /** PUT /campaigns.php?id=N — update (status, budget, targeting…). */
  CampaignsResource.prototype.update = function (id, payload) {
    if (!isObject(payload)) {
      return Promise.reject(new AdsboosterError('campaigns.update() expects a payload object.'));
    }
    return this._c.request('PUT', '/campaigns.php?id=' + encodeURIComponent(id), payload);
  };

  /** Convenience: pause a campaign. */
  CampaignsResource.prototype.pause = function (id) {
    return this.update(id, { status: 'paused' });
  };

  /** Convenience: resume a paused campaign. */
  CampaignsResource.prototype.resume = function (id) {
    return this.update(id, { status: 'active' });
  };

  /* ─────────────────────── Resource: Posts ────────────────────── */

  function PostsResource(client) { this._c = client; }

  /** GET /posts.php — list social posts. opts: { page, limit, status } */
  PostsResource.prototype.list = function (opts) {
    return this._c.request('GET', '/posts.php' + buildQuery(opts || {}));
  };

  /** GET /posts.php?id=N — fetch a single post. */
  PostsResource.prototype.get = function (id) {
    return this._c.request('GET', '/posts.php?id=' + encodeURIComponent(id));
  };

  /** POST /posts.php — create / publish / schedule a post. */
  PostsResource.prototype.create = function (payload) {
    if (!isObject(payload)) {
      return Promise.reject(new AdsboosterError('posts.create() expects a payload object.'));
    }
    return this._c.request('POST', '/posts.php', payload);
  };

  /** DELETE /posts.php?id=N — remove a scheduled post. */
  PostsResource.prototype.remove = function (id) {
    return this._c.request('DELETE', '/posts.php?id=' + encodeURIComponent(id));
  };

  /* ──────────────────────── Resource: UGC ─────────────────────── */

  function UgcResource(client) { this._c = client; }

  /** GET /ugc.php — recent AI creatives. opts: { limit ≤ 50 } */
  UgcResource.prototype.listRecent = function (opts) {
    return this._c.request('GET', '/ugc.php' + buildQuery(opts || {}));
  };

  /**
   * POST /ugc.php — generate a photoreal UGC image (Nano Banana 2 stack).
   * payload: { product_name, ugc_style, creator_persona, aspect_ratio, target_audience, headline, badge_text }
   */
  UgcResource.prototype.generateImage = function (payload) {
    if (!payload || !payload.product_name) {
      return Promise.reject(new AdsboosterError("ugc.generateImage() requires { product_name: '…' }."));
    }
    return this._c.request('POST', '/ugc.php', payload);
  };

  /* ────────────────────── Resource: Credits ───────────────────── */

  function CreditsResource(client) { this._c = client; }

  /** GET /credits.php — ad + AI credit balance for the API key's account. */
  CreditsResource.prototype.balance = function () {
    return this._c.request('GET', '/credits.php');
  };

  /* ───────────────────── Resource: Directory ──────────────────── */

  function DirectoryResource(client) { this._c = client; }

  /** GET /directory.php — browse the verified business directory. opts: { category, q, limit } */
  DirectoryResource.prototype.list = function (opts) {
    return this._c.request('GET', '/directory.php' + buildQuery(opts || {}));
  };

  /** POST /directory.php — submit a marketplace listing. */
  DirectoryResource.prototype.createListing = function (payload) {
    if (!isObject(payload)) {
      return Promise.reject(new AdsboosterError('directory.createListing() expects a payload object.'));
    }
    return this._c.request('POST', '/directory.php', payload);
  };

  /* ────────────────────── Resource: Reviews ───────────────────── */

  function ReviewsResource(client) { this._c = client; }

  /** GET /reviews.php — approved community reviews. opts: { limit } */
  ReviewsResource.prototype.list = function (opts) {
    return this._c.request('GET', '/reviews.php' + buildQuery(opts || {}));
  };

  /** POST /reviews.php — submit or update your platform review. */
  ReviewsResource.prototype.submit = function (payload) {
    if (!payload || !payload.rating || !payload.review_text) {
      return Promise.reject(new AdsboosterError('reviews.submit() requires { rating: 1-5, review_text: "…" }.'));
    }
    return this._c.request('POST', '/reviews.php', payload);
  };

  /* ──────────────── Resource: Server-side tracking ────────────── */

  function CapiResource(client) { this._c = client; }

  /** URL of the drop-in browser tracking script (Meta CAPI / TikTok Events bridge). */
  CapiResource.prototype.scriptUrl = function () {
    return this._c.apiBase + '/capi-bridge.php?js=1';
  };

  /**
   * POST /capi-bridge.php — forward a conversion event server-side.
   * payload: { pixel_token, event_name, user_data, custom_data, source_url }
   */
  CapiResource.prototype.track = function (payload) {
    if (!payload || !payload.pixel_token) {
      return Promise.reject(new AdsboosterError('capi.track() requires { pixel_token: "…" } from your Server Tracking console.'));
    }
    return this._c.request('POST', '/capi-bridge.php', payload);
  };

  /* ───────────────────── Resource: Webhooks ───────────────────── */

  function WebhooksResource(client) { this._c = client; }

  /** Ping-test URL helper for your webhook receiver (fires from the Developer Console). */
  WebhooksResource.prototype.testPingUrl = function (targetUrl) {
    return this._c.baseUrl + '/api-settings.php?ping=' + encodeURIComponent(targetUrl);
  };

  /* ───────────────────── Webhook verification ─────────────────── */

  var webhooks = {
    /**
     * Verify an inbound webhook signature (X-Adsbooster-Signature header).
     * Node-only: use `crypto.timingSafeEqual`. Provide the RAW request body.
     * Signature format: "sha256=<hex hmac of raw body using the webhook secret>".
     */
    verify: function (rawBody, signature, secret) {
      if (typeof signature !== 'string' || signature.indexOf('sha256=') !== 0) {
        return false;
      }
      var expected = signature.slice(7);
      var cryptoApi = null;
      try { cryptoApi = require('crypto'); } catch (e) { /* browser */ }
      if (!cryptoApi || !cryptoApi.createHmac) {
        throw new AdsboosterError('Webhook signatures must be verified server-side in Node.js (crypto is unavailable here).');
      }
      var hmac = cryptoApi.createHmac('sha256', secret).update(String(rawBody), 'utf8').digest('hex');
      var a = Buffer.from(hmac);
      var b = Buffer.from(String(expected));
      if (a.length !== b.length) return false;
      return cryptoApi.timingSafeEqual(a, b);
    },

    /** Build the expected signature yourself (useful for tests). */
    sign: function (rawBody, secret) {
      var cryptoApi = null;
      try { cryptoApi = require('crypto'); } catch (e) { /* browser */ }
      if (!cryptoApi || !cryptoApi.createHmac) {
        throw new AdsboosterError('webhooks.sign() is Node-only.');
      }
      return 'sha256=' + cryptoApi.createHmac('sha256', secret).update(String(rawBody), 'utf8').digest('hex');
    }
  };

  /* ────────────────────────── Exports ─────────────────────────── */

  return {
    VERSION: VERSION,
    Adsbooster: Adsbooster,
    AdsboosterError: AdsboosterError,
    AI_CREDITS_PER_USD: AI_CREDITS_PER_USD,
    webhooks: webhooks,
    /** Back-compat alias */
    default: Adsbooster
  };
});
