import "server-only";

export type PortalDataErrorCode = "invalid_request" | "upstream_unavailable" | "invalid_response";

/**
 * The single public failure shape of the Portal data boundary. Messages stay
 * generic: callers and framework logs may surface them, so they must never
 * carry a query, an identifier list, or an upstream body.
 */
export class PortalDataError extends Error {
  readonly code: PortalDataErrorCode;

  constructor(code: PortalDataErrorCode) {
    super(
      code === "invalid_request"
        ? "The Portal request is invalid."
        : "The public data service is temporarily unavailable.",
    );
    this.name = "PortalDataError";
    this.code = code;
  }
}
