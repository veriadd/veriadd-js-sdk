import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { VeriaddClient, withVeriaddRetry, RETRYABLE_CODES } from "../src/index.js";
import { VeriaddError } from "../src/errors.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("VeriaddClient", () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const okVerify = {
    data: {
      audit_id: "audit-1",
      status: "verified",
      confidence: 92,
      reasons: ["postcode valid in NIPOST registry (+40)"],
      postcode_canonical: "LA-11-W06-TC-10",
      nipost: { postcode: "LA-11-W06-TC-10", valid: true },
      identity: { provider: "dojah", bvn_valid: true },
      billed_kobo: 5000,
      billed_ngn: 50,
    },
  };

  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init: init || {} });
        return jsonResponse(200, okVerify);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires an apiKey", () => {
    expect(() => new VeriaddClient({ apiKey: "" })).toThrowError(VeriaddError);
  });

  it("posts verify payload with auth headers", async () => {
    const c = new VeriaddClient({ apiKey: "vr_live_test" });
    const res = await c.verifyAddress({ postcode: "LA-11-W06-TC-10", level: 3 });
    expect(res.status).toBe("verified");
    expect(res.confidence).toBe(92);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.veriadd.tech/api/v1/verify/address");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("vr_live_test");
    expect(headers["X-Request-ID"]).toBeTruthy();
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      postcode: "LA-11-W06-TC-10",
      level: 3,
    });
  });

  it("honours baseUrl overrides and trims slashes", async () => {
    const c = new VeriaddClient({ apiKey: "k", baseUrl: "http://localhost:8080/" });
    await c.lookup("LA-11-W06-TC-10", 1);
    expect(calls[0].url).toBe("http://localhost:8080/api/v1/lookup?code=LA-11-W06-TC-10&level=1");
  });

  it("maps the error envelope to VeriaddError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(402, {
          error: { code: "insufficient_credits", message: "top up", request_id: "req-1" },
        }),
      ),
    );
    const c = new VeriaddClient({ apiKey: "k" });
    const err = await c.wallet().catch((e) => e);
    expect(err).toBeInstanceOf(VeriaddError);
    expect(err.code).toBe("insufficient_credits");
    expect(err.status).toBe(402);
    expect(err.requestId).toBe("req-1");
  });

  it("handles non-JSON error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gateway exploded", { status: 502 })),
    );
    const c = new VeriaddClient({ apiKey: "k" });
    const err = await c.wallet().catch((e) => e);
    expect(err).toBeInstanceOf(VeriaddError);
    expect(err.status).toBe(502);
  });

  it("maps aborts to timeout errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const e = new Error("aborted");
        e.name = "AbortError";
        // honour the abort signal like a real fetch would
        if (init?.signal) await new Promise((_, rej) => rej(e));
        throw e;
      }),
    );
    const c = new VeriaddClient({ apiKey: "k", timeoutMs: 20 });
    const err = await c.wallet().catch((e) => e);
    expect(err).toBeInstanceOf(VeriaddError);
    expect(err.code).toBe("timeout");
  });

  it("posts key creation with env", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init: init || {} });
        return jsonResponse(201, { data: { api_key: "vr_live_x", key_prefix: "vr_live_x", warning: "once" } });
      }),
    );
    const c = new VeriaddClient({ apiKey: "k" });
    const k = await c.createKey("test");
    expect(k.api_key).toBe("vr_live_x");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ env: "test" });
  });
});

describe("withVeriaddRetry", () => {
  it("retries retryable codes then succeeds", async () => {
    let n = 0;
    const out = await withVeriaddRetry(
      async () => {
        n++;
        if (n < 3) throw new VeriaddError("rate_limited", 429, "slow down");
        return "ok";
      },
      { baseDelayMs: 1 },
    );
    expect(out).toBe("ok");
    expect(n).toBe(3);
  });

  it("bubbles non-retryable errors immediately", async () => {
    let n = 0;
    await expect(
      withVeriaddRetry(
        async () => {
          n++;
          throw new VeriaddError("invalid_api_key", 401, "bad key");
        },
        { baseDelayMs: 1 },
      ),
    ).rejects.toMatchObject({ code: "invalid_api_key" });
    expect(n).toBe(1);
  });

  it("gives up after maxRetries", async () => {
    let n = 0;
    await expect(
      withVeriaddRetry(
        async () => {
          n++;
          throw new VeriaddError("nipost_rate_limited", 429, "slow");
        },
        { maxRetries: 2, baseDelayMs: 1 },
      ),
    ).rejects.toMatchObject({ code: "nipost_rate_limited" });
    expect(n).toBe(3);
    expect(RETRYABLE_CODES.has("rate_limited")).toBe(true);
  });
});
