/** Verification decision returned by POST /v1/verify/address. */
export type VeriaddVerifyStatus = "verified" | "partial" | "failed" | "invalid";

/** Input for {@link VeriaddClient.verifyAddress}. Only `postcode` is required. */
export interface VeriaddVerifyInput {
  postcode: string;
  street?: string;
  lga?: string;
  state?: string;
  first_name?: string;
  last_name?: string;
  /** Date of birth, yyyy-mm-dd. */
  dob?: string;
  phone?: string;
  /** 11-digit Bank Verification Number. */
  bvn?: string;
  /** 11-digit National Identification Number. */
  nin?: string;
  lat?: number;
  lng?: number;
  /** NIPOST lookup depth 1–5. Billing: L1 free, L2 ₦30, L3+ ₦50. Defaults to 3. */
  level?: number;
}

/** NIPOST graded lookup payload (levels are cumulative). */
export interface VeriaddNipostLookup {
  postcode: string;
  valid: boolean;
  administrative_address?: {
    state_name: string;
    lga_name: string;
    locality_name: string;
    zone: string;
  };
  recent_house_address?: Record<string, string>;
  building_use_status?: string;
}

/** Identity cross-check breakdown (Dojah). Fields appear when checked. */
export interface VeriaddIdentity {
  provider: string;
  bvn_valid?: boolean;
  bvn_name_match?: boolean;
  phone_linked?: boolean;
  phone_name_match?: boolean;
  nin_valid?: boolean;
}

export interface VeriaddVerifyResult {
  audit_id: string;
  status: VeriaddVerifyStatus;
  /** 0–100 confidence score. Gate onboarding on status + threshold. */
  confidence: number;
  /** Human-readable, auditable scoring trail. */
  reasons: string[];
  postcode_canonical: string;
  nipost: VeriaddNipostLookup | null;
  identity?: VeriaddIdentity | null;
  billed_kobo: number;
  billed_ngn: number;
}

export interface VeriaddWallet {
  client: string;
  email: string;
  balance_kobo: number;
  balance_ngn: number;
  price_l2_kobo: number;
  price_l3_kobo: number;
}

export interface VeriaddUsageRow {
  endpoint: string;
  status: string;
  billed_kobo: number;
  confidence: number | null;
  created_at: string;
}

export interface VeriaddTopupInit {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface VeriaddTopupVerify {
  credited_kobo: number;
  already_credited: boolean;
  balance_kobo: number;
  balance_ngn: number;
}

export type VeriaddKYBStatus = "draft" | "under_review" | "approved" | "rejected";

export interface VeriaddKYB {
  id: string;
  business_name: string;
  rc_number: string;
  registered_address: string;
  website: string;
  use_case: string;
  company_type: string;
  cac_verified: boolean;
  cac_legal_name: string | null;
  status: string;
  review_note: string | null;
}

/** CAC company types accepted by the KYB endpoint. */
export type VeriaddCompanyType =
  | "BUSINESS_NAME"
  | "COMPANY"
  | "INCORPORATED_TRUSTEES"
  | "LIMITED_PARTNERSHIP"
  | "LIMITED_LIABILITY_PARTNERSHIP";

export interface VeriaddKYBInput {
  business_name: string;
  rc_number: string;
  company_type: VeriaddCompanyType;
  registered_address?: string;
  website?: string;
  use_case?: string;
}

export interface VeriaddKeyInfo {
  id: string;
  key_prefix: string;
  env: string;
  revoked: boolean;
  created_at: string;
}

export interface VeriaddCreatedKey {
  /** Shown once — store it immediately, it is never returned again. */
  api_key: string;
  key_prefix: string;
  warning: string;
}

export interface VeriaddStatus {
  service: string;
  version: string;
  time: string;
  uptime_seconds: number;
  deps: {
    postgres: { ok: boolean; latency_ms: number };
    redis: { ok: boolean; disabled: boolean; latency_ms: number };
    nipost: { configured: boolean };
    dojah: { configured: boolean };
    paystack: { configured: boolean };
  };
}

export interface VeriaddNearbyInput {
  lat: number;
  lng: number;
  /** Search radius in metres (default 300). */
  radius?: number;
}

export interface VeriaddReverseInput {
  lat: number;
  lng: number;
  /** Snap radius in metres (default 25, max 250). */
  max_distance_m?: number;
}

export interface VeriaddAssembleInput {
  state: string;
  lga: string;
  district: string;
  area: string;
  unit: string;
}
