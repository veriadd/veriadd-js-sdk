import { VeriaddError } from "./errors.js";
import type {
  VeriaddAssembleInput,
  VeriaddCreatedKey,
  VeriaddIdentity,
  VeriaddKYB,
  VeriaddKYBInput,
  VeriaddKeyInfo,
  VeriaddNearbyInput,
  VeriaddNipostLookup,
  VeriaddReverseInput,
  VeriaddStatus,
  VeriaddTopupInit,
  VeriaddTopupVerify,
  VeriaddUsageRow,
  VeriaddVerifyInput,
  VeriaddVerifyResult,
  VeriaddWallet,
} from "./types.js";

/** Error codes worth retrying with backoff (transient upstream/rate states). */
export const RETRYABLE_CODES = new Set([
  "rate_limited",
  "provider_unavailable",
  "nipost_rate_limited",
]);

export interface VeriaddClientOptions {
  /** Secret key (`vr_live_…` / `vr_test_…`). Never expose in browsers. */
  apiKey: string;
  /** API host. Defaults to production. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 15_000. */
  timeoutMs?: number;
  /** Custom fetch (Edge runtimes, testing). Defaults to global fetch. */
  fetch?: typeof fetch;
}

function trimBase(url: string): string {
  return url.replace(/\/$/, "");
}

function newRequestId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Official client for the Veriadd address KYC API.
 *
 * ```ts
 * import { VeriaddClient } from "@veriadd/js";
 *
 * const veriadd = new VeriaddClient({ apiKey: process.env.VERIADD_KEY! });
 * const result = await veriadd.verifyAddress({
 *   postcode: "LA-11-W06-TC-10",
 *   state: "LAGOS",
 *   bvn: "22233344455",
 *   level: 3,
 * });
 * if (result.status === "verified" && result.confidence >= 80) {
 *   // proceed to onboarding
 * }
 * ```
 */
export class VeriaddClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(options: VeriaddClientOptions) {
    if (!options || !options.apiKey) {
      throw new VeriaddError("missing_api_key", 0, "VeriaddClient requires an apiKey");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = trimBase(options.baseUrl || "https://api.veriadd.tech");
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.doFetch = options.fetch ?? fetch.bind(globalThis);
    if (typeof this.doFetch !== "function") {
      throw new VeriaddError("missing_fetch", 0, "No global fetch — pass options.fetch explicitly");
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.doFetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          "X-Request-ID": newRequestId(),
          ...(init?.headers || {}),
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new VeriaddError("timeout", 0, `Request timed out after ${this.timeoutMs}ms`);
      }
      throw new VeriaddError(
        "network_error",
        0,
        err instanceof Error ? err.message : "Network request failed",
      );
    } finally {
      clearTimeout(timer);
    }

    let body: unknown = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    if (!res.ok) {
      const nested = (body as { error?: { code?: string; message?: string; request_id?: string } }).error || {};
      throw new VeriaddError(
        nested.code || `http_${res.status}`,
        res.status,
        nested.message || `Request failed (${res.status})`,
        nested.request_id,
      );
    }
    return (body as { data: T }).data;
  }

  /** Verify an address + optional identity cross-checks. The money endpoint. */
  verifyAddress(input: VeriaddVerifyInput): Promise<VeriaddVerifyResult> {
    return this.request<VeriaddVerifyResult>(`/api/v1/verify/address`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** Direct NIPOST postcode lookup. L1 is free. */
  lookup(code: string, level = 1): Promise<VeriaddNipostLookup> {
    const q = new URLSearchParams({ code, level: String(level) });
    return this.request<VeriaddNipostLookup>(`/api/v1/lookup?${q}`);
  }

  /** Segment-aware postcode typeahead. */
  autocomplete(q: string): Promise<unknown> {
    const qs = new URLSearchParams({ q });
    return this.request<unknown>(`/api/v1/search/autocomplete?${qs}`);
  }

  /** Postcodes within a radius of a coordinate. */
  nearby(input: VeriaddNearbyInput): Promise<unknown> {
    const qs = new URLSearchParams({
      lat: String(input.lat),
      lng: String(input.lng),
      ...(input.radius !== undefined ? { radius: String(input.radius) } : {}),
    });
    return this.request<unknown>(`/api/v1/search/nearby?${qs}`);
  }

  /** Resolve a coordinate to the nearest postcode. */
  reverse(input: VeriaddReverseInput): Promise<unknown> {
    const qs = new URLSearchParams({
      lat: String(input.lat),
      lng: String(input.lng),
      ...(input.max_distance_m !== undefined ? { max_distance_m: String(input.max_distance_m) } : {}),
    });
    return this.request<unknown>(`/api/v1/search/reverse?${qs}`);
  }

  /** Parse a postcode into segments (native NIPOST shape). */
  disassemble(code: string): Promise<unknown> {
    const qs = new URLSearchParams({ code });
    return this.request<unknown>(`/api/v1/assembly/disassemble?${qs}`);
  }

  /** Assemble segments into a canonical postcode. */
  assemble(input: VeriaddAssembleInput): Promise<unknown> {
    return this.request<unknown>(`/api/v1/assembly/assemble`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** Wallet balance + pricing for this key. */
  wallet(): Promise<VeriaddWallet> {
    return this.request<VeriaddWallet>(`/api/v1/wallet`);
  }

  /** Metered call history (1–200, default 50). */
  usage(limit = 50): Promise<VeriaddUsageRow[]> {
    return this.request<VeriaddUsageRow[]>(`/api/v1/usage?limit=${limit}`);
  }

  /** Start a Paystack wallet top-up; redirect the user to `authorization_url`. */
  topupInit(amountKobo: number, email: string, callbackUrl?: string): Promise<VeriaddTopupInit> {
    return this.request<VeriaddTopupInit>(`/api/v1/wallet/topup/initialize`, {
      method: "POST",
      body: JSON.stringify({ amount_kobo: amountKobo, email, callback_url: callbackUrl }),
    });
  }

  /** Verify a top-up reference and credit the wallet (idempotent). */
  topupVerify(reference: string): Promise<VeriaddTopupVerify> {
    const qs = new URLSearchParams({ reference });
    return this.request<VeriaddTopupVerify>(`/api/v1/wallet/topup/verify?${qs}`);
  }

  /** Current workspace KYB submission (null when never submitted). */
  kybGet(): Promise<VeriaddKYB | null> {
    return this.request<VeriaddKYB | null>(`/api/v1/kyb`);
  }

  /** Submit (or resubmit) KYB business details. */
  kybSubmit(input: VeriaddKYBInput): Promise<VeriaddKYB> {
    return this.request<VeriaddKYB>(`/api/v1/kyb`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** Live dependency status (public, no key needed — key is harmless if set). */
  status(): Promise<VeriaddStatus> {
    return this.request<VeriaddStatus>(`/api/v1/status`);
  }

  /** List key prefixes (full keys are never returned). */
  listKeys(): Promise<VeriaddKeyInfo[]> {
    return this.request<VeriaddKeyInfo[]>(`/api/v1/keys`);
  }

  /** Issue a key. The full secret is shown once — store it immediately. */
  createKey(env: "live" | "test" = "live"): Promise<VeriaddCreatedKey> {
    return this.request<VeriaddCreatedKey>(`/api/v1/keys`, {
      method: "POST",
      body: JSON.stringify({ env }),
    });
  }

  /** Revoke a key by id. Immediate. */
  revokeKey(id: string): Promise<{ revoked: boolean }> {
    return this.request<{ revoked: boolean }>(`/api/v1/keys/${id}/revoke`, {
      method: "POST",
    });
  }
}

export type { VeriaddIdentity };

export interface VeriaddRetryOptions {
  maxRetries?: number;
  retryable?: Set<string>;
  /** Base delay in ms; doubles each attempt. Default 1000. */
  baseDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn` with exponential backoff on retryable {@link VeriaddError} codes.
 * Non-retryable errors bubble immediately.
 */
export async function withVeriaddRetry<T>(
  fn: () => Promise<T>,
  options: VeriaddRetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const retryable = options.retryable ?? RETRYABLE_CODES;
  const base = options.baseDelayMs ?? 1000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = err instanceof VeriaddError ? err.code : "";
      if (attempt >= maxRetries || !retryable.has(code)) throw err;
      await sleep(base * 2 ** attempt);
    }
  }
}
