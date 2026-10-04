# Veriadd JS SDK — `@veriadd/js`

Official JavaScript/TypeScript client for the Veriadd address KYC API.
Works in Node 18+, browsers, Edge runtimes and React Native. Zero runtime dependencies.

## Install

```bash
npm install @veriadd/js
# pnpm add @veriadd/js | bun add @veriadd/js | yarn add @veriadd/js
```

## Quickstart

```ts
import { VeriaddClient } from "@veriadd/js";

const veriadd = new VeriaddClient({ apiKey: process.env.VERIADD_KEY! });

// Primary KYC endpoint: postcode + identity cross-check
const result = await veriadd.verifyAddress({
  postcode: "LA-11-W06-TC-10",
  state: "LAGOS",
  first_name: "Adaeze",
  last_name: "Okafor",
  bvn: "22233344455",
  phone: "08031234567",
  level: 3, // L1 free, L2 ₦30, L3 ₦50
});

if (result.status === "verified" && result.confidence >= 80) {
  // proceed to onboarding — result.audit_id is your CBN trail
}
```

Point at a self-hosted backend with `baseUrl` (default `https://api.veriadd.tech`),
or test keys — sandbox traffic is never billed.

## Error handling

Every failure throws `VeriaddError` with `code`, `status` and `requestId`:

```ts
import { VeriaddClient, VeriaddError, withVeriaddRetry } from "@veriadd/js";

try {
  await veriadd.verifyAddress({ postcode: "X", level: 3 });
} catch (err) {
  if (err instanceof VeriaddError && err.code === "insufficient_credits") {
    // pause onboarding, trigger a wallet top-up
  }
}

// Retry transient states with backoff
const result = await withVeriaddRetry(
  () => veriadd.verifyAddress({ postcode: "LA-11-W06-TC-10", level: 3 }),
);
```

## Methods

| Method | Endpoint |
|---|---|
| `verifyAddress(input)` | `POST /v1/verify/address` |
| `lookup(code, level?)` | `GET /v1/lookup` |
| `autocomplete(q)` | `GET /v1/search/autocomplete` |
| `nearby({lat,lng,radius?})` | `GET /v1/search/nearby` |
| `reverse({lat,lng,max_distance_m?})` | `GET /v1/search/reverse` |
| `disassemble(code)` / `assemble(parts)` | assembly endpoints |
| `wallet()` / `usage(limit?)` | wallet + history |
| `topupInit(amountKobo, email, callbackUrl?)` / `topupVerify(ref)` | Paystack top-ups |
| `kybGet()` / `kybSubmit(input)` | business verification |
| `listKeys()` / `createKey(env?)` / `revokeKey(id)` | API keys |
| `status()` | live dependency status |

Full endpoint semantics: https://veriadd.tech/docs/api
