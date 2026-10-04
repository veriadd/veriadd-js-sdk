/** Typed API error parsed from the Veriadd `{error: {code, message}}` envelope. */
export class VeriaddError extends Error {
  /** Machine-readable code, e.g. `insufficient_credits`, `kyb_required`. */
  readonly code: string;
  /** HTTP status of the failed call. */
  readonly status: number;
  /** Correlation id — quote it when contacting support. */
  readonly requestId?: string;

  constructor(code: string, status: number, message: string, requestId?: string) {
    super(message);
    this.name = "VeriaddError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}
