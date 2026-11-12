/**
 * Type definitions for adsbooster-js-sdk
 * Official JavaScript SDK for the Adsbooster.net REST API v1.
 */

/** Snapshot of the platform rate-limit quota from the last response. */
export interface RateLimit {
  /** Requests allowed per minute (60). */
  limit: number;
  /** Requests remaining in the current sliding window. */
  remaining: number | null;
  /** Unix timestamp when the window resets. */
  reset: number | null;
}

/** Thrown for any non-2xx response, network failure or usage error. */
export declare class AdsboosterError extends Error {
  name: 'AdsboosterError';
  /** HTTP status; 0 for network errors / timeouts. */
  status: number;
  /** API error slug, e.g. 'Unauthorized', 'RateLimitExceeded'. */
  code: string | null;
  /** Full parsed response body, when available. */
  details: any;
  /** Last seen quota snapshot. */
  rateLimit: RateLimit | null;
  /** True when status is 429 (or the API returned RateLimitExceeded). */
  isRateLimit: boolean;
  constructor(message?: string, opts?: Partial<{ status: number; code: string; details: any; rateLimit: RateLimit | null }>);
}

export interface AdsboosterOptions {
  /** API key from your Adsbooster Developer Console (api-settings). Required. */
  apiKey: string;
  /** Platform origin, e.g. 'https://adsbooster.net'. Defaults to https://adsbooster.net. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeout?: number;
  /** Automatic retries on 429 and 5xx. Default 2. */
  maxRetries?: number;
  /** Custom fetch implementation (tests, proxies). */
  fetch?: typeof fetch;
}

export interface ListOptions {
  page?: number;
  limit?: number;
  status?: string;
}

export interface UgcGeneratePayload {
  product_name: string;
  ugc_style?: 'selfie_hold' | 'unboxing' | 'lifestyle_kitchen' | 'influencer_desk' | 'before_after' | 'flatlay' | string;
  creator_persona?: 'gen_z' | 'saas_founder' | 'fitness_athlete' | 'homemaker' | 'tech_reviewer' | 'luxury_model' | string;
  aspect_ratio?: '1:1' | '9:16' | '16:9' | '4:5' | string;
  target_audience?: string;
  headline?: string;
  badge_text?: string;
  seed?: number;
}

export interface PostPayload {
  platform: 'meta' | 'tiktok' | 'twitter' | 'linkedin' | 'snapchat' | string;
  caption: string;
  media_url?: string;
  media_type?: 'image' | 'video';
  scheduled_time?: string;
}

export interface CampaignPayload {
  name?: string;
  campaign_name?: string;
  platform?: string;
  objective?: string;
  budget_amount?: number;
  budget_type?: 'daily' | 'lifetime';
  status?: 'active' | 'paused';
  targeting?: Record<string, unknown>;
  creative?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReviewPayload {
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  review_text: string;
  user_role?: string;
}

export interface CapiTrackPayload {
  pixel_token: string;
  event_name?: string;
  user_data?: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
  source_url?: string;
}

/** Which optional integration packages are installed next to the SDK. */
export interface IntegrationAvailability {
  /** `@google/genai` is installed. */
  gemini: boolean;
  /** `flutterwave` is installed. */
  flutterwave: boolean;
  /** `groq-sdk` is installed. */
  groq: boolean;
}

export interface GeminiGeneratePayload {
  /** Prompt or contents sent to the model. */
  prompt: string;
  /** Gemini API key. */
  apiKey: string;
  /** Model id. Default `gemini-2.5-flash`. */
  model?: string;
  /** Optional system instruction. */
  systemInstruction?: string;
}

export interface GeminiGenerateResult {
  /** Generated text. */
  text: string;
  /** Raw @google/genai response. */
  raw: unknown;
}

export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant' | string;
  content: string;
}

export interface GroqChatPayload {
  /** Conversation messages. */
  messages: GroqChatMessage[];
  /** Groq API key. */
  apiKey: string;
  /** Model id. Default `llama-3.3-70b-versatile`. */
  model?: string;
}

export interface FlutterwaveClientPayload {
  /** Flutterwave secret key (server-side only). */
  secretKey: string;
  /** Public key - when set, the v2-style positional constructor is used. */
  publicKey?: string;
  /** Set to false to target the staging environment. */
  production?: boolean;
}

/** Generic API response — every endpoint returns success:true plus its own fields. */
export interface ApiResponse<T = Record<string, any>> {
  success: true;
  [key: string]: any;
}

export declare class Adsbooster {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly apiBase: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly VERSION: string;
  /** Quota snapshot from the most recent response. */
  lastRateLimit: RateLimit | null;

  constructor(options: AdsboosterOptions);

  /** Low-level request — normalised, retried and typed. */
  request<T = ApiResponse>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, options?: Record<string, unknown>): Promise<T>;

  readonly campaigns: {
    list(opts?: ListOptions): Promise<ApiResponse>;
    get(id: number | string): Promise<ApiResponse>;
    create(payload: CampaignPayload): Promise<ApiResponse>;
    update(id: number | string, payload: CampaignPayload): Promise<ApiResponse>;
    pause(id: number | string): Promise<ApiResponse>;
    resume(id: number | string): Promise<ApiResponse>;
  };

  readonly posts: {
    list(opts?: ListOptions): Promise<ApiResponse>;
    get(id: number | string): Promise<ApiResponse>;
    create(payload: PostPayload): Promise<ApiResponse>;
    remove(id: number | string): Promise<ApiResponse>;
  };

  readonly ugc: {
    listRecent(opts?: { limit?: number }): Promise<ApiResponse>;
    generateImage(payload: UgcGeneratePayload): Promise<ApiResponse>;
  };

  readonly credits: {
    balance(): Promise<ApiResponse>;
  };

  readonly directory: {
    list(opts?: { category?: string; q?: string; limit?: number }): Promise<ApiResponse>;
    createListing(payload: Record<string, unknown>): Promise<ApiResponse>;
  };

  readonly reviews: {
    list(opts?: { limit?: number }): Promise<ApiResponse>;
    submit(payload: ReviewPayload): Promise<ApiResponse>;
  };

  readonly capi: {
    scriptUrl(): string;
    track(payload: CapiTrackPayload): Promise<ApiResponse>;
  };

  readonly webhooks: {
    /** GET /api/v1/webhooks.php — list your registered webhook endpoints. */
    list(): Promise<ApiResponse>;
    /** Signed test ping to one of YOUR registered https:// endpoints. */
    test(targetUrl: string): Promise<ApiResponse>;
    /** Deprecated alias — resolves the ping URL instead of firing it. */
    testPingUrl(targetUrl: string): Promise<string>;
  };

  /** Public aggregate analytics — no auth, 30 req/min/IP. */
  readonly publicAnalytics: {
    feed(view?: 'all' | 'campaigns' | 'users' | 'platforms' | 'success'): Promise<ApiResponse>;
    totals(): Promise<ApiResponse>;
  };

  /**
   * Optional Node.js integrations for the packages shipped alongside the SDK
   * (Flutterwave, Google Gemini, Groq). Resolved lazily — nothing is loaded
   * until one of these helpers is called.
   */
  readonly integrations: {
    /** Report which optional packages are installed. */
    detect(): IntegrationAvailability;
    /** Generate text with Google Gemini (@google/genai). */
    geminiGenerateText(payload: GeminiGeneratePayload): Promise<GeminiGenerateResult>;
    /** Chat completion through Groq (groq-sdk). */
    groqChat(payload: GroqChatPayload): Promise<unknown>;
    /** Build a Flutterwave client for server-side payment tooling. */
    flutterwaveClient(payload: FlutterwaveClientPayload): Promise<unknown>;
  };
}

/** Server-side webhook helpers (Node.js only). */
export declare const webhooks: {
  /** Timing-safe verification of the X-Adsbooster-Signature header against the RAW body. */
  verify(rawBody: string | Buffer, signature: string, secret: string): boolean;
  /** Compute the signature yourself (useful in tests). */
  sign(rawBody: string | Buffer, secret: string): string;
};

declare const sdk: {
  VERSION: string;
  Adsbooster: typeof Adsbooster;
  AdsboosterError: typeof AdsboosterError;
  AI_CREDITS_PER_USD: number;
  webhooks: typeof webhooks;
  default: typeof Adsbooster;
};

export as namespace AdsboosterSDK;
export default sdk;
