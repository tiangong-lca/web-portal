import "server-only";

import {
  portalHybridSearchRequestSchema,
  type PortalHybridSearchRequest,
} from "@/lib/hybrid-request";
import {
  portalHybridErrorPayloadSchema,
  portalHybridSearchPageSchema,
  type PortalHybridFallbackReason,
  type PortalHybridSearchPage,
} from "@/server/hybrid/contracts";
import {
  readPortalHybridEnvironment,
  type PortalHybridEnvironment,
} from "@/server/hybrid/environment";
import { createPortalNonce, signPortalHmac } from "@/server/r0-compat/hmac";
import { validatePortalCorrelationId } from "@/server/telemetry/logger";

export const portalHybridFunctionPath = "/functions/v1/portal_hybrid_search_v1";

const maximumRequestBytes = 32 * 1024;
const maximumResponseBytes = 512 * 1024;

export type PortalHybridQueryResult =
  | { status: "available"; data: PortalHybridSearchPage }
  | { status: "fallback"; reason: PortalHybridFallbackReason };

export class PortalHybridInputError extends Error {
  readonly code = "invalid_request";

  constructor() {
    super("The Hybrid request is invalid.");
    this.name = "PortalHybridInputError";
  }
}

type QueryOptions = {
  environment?: PortalHybridEnvironment;
  fetchImplementation?: typeof fetch;
  now?: () => number;
  nonce?: () => string;
  correlationId?: string;
  signal?: AbortSignal;
};

async function parseResponsePayload(response: Response): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/u.test(contentLength) &&
    Number(contentLength) > maximumResponseBytes
  ) {
    throw new Error("oversized response");
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maximumResponseBytes) {
    throw new Error("oversized response");
  }

  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

export function parsePortalHybridRequestBody(rawBody: Uint8Array): PortalHybridSearchRequest {
  if (rawBody.byteLength === 0 || rawBody.byteLength > maximumRequestBytes) {
    throw new PortalHybridInputError();
  }

  try {
    const decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    ) as unknown;
    const parsed = portalHybridSearchRequestSchema.safeParse(decoded);
    if (!parsed.success) throw new PortalHybridInputError();
    return parsed.data;
  } catch (error) {
    if (error instanceof PortalHybridInputError) throw error;
    throw new PortalHybridInputError();
  }
}

function fallback(reason: PortalHybridFallbackReason): PortalHybridQueryResult {
  return { status: "fallback", reason };
}

export async function queryPortalHybridRaw(
  rawBody: Uint8Array,
  options: QueryOptions = {},
): Promise<PortalHybridQueryResult> {
  const parsedInput = parsePortalHybridRequestBody(rawBody);
  if (options.signal?.aborted) return fallback("hybrid_upstream_unavailable");

  let environment: PortalHybridEnvironment;
  try {
    environment = options.environment ?? readPortalHybridEnvironment();
  } catch {
    return fallback("hybrid_upstream_unavailable");
  }

  const requestBody = new TextEncoder().encode(
    JSON.stringify({
      ...parsedInput,
      schemaVersion: "portal.hybrid-search-request.v3",
      cursor: "cursor" in parsedInput ? parsedInput.cursor : null,
      allowedBrandCodes: environment.dataBrandScope.allowedBrandCodes,
    }),
  );

  let signed: Awaited<ReturnType<typeof signPortalHmac>>;
  try {
    signed = await signPortalHmac({
      rawBody: requestBody,
      keyId: environment.keyId,
      secret: environment.secret,
      timestamp: Math.floor((options.now?.() ?? Date.now()) / 1000),
      nonce: options.nonce?.() ?? createPortalNonce(),
      functionPath: portalHybridFunctionPath,
    });
  } catch {
    return fallback("portal_auth_unavailable");
  }

  const target = new URL(portalHybridFunctionPath, environment.edgeOrigin);
  const correlationId = validatePortalCorrelationId(options.correlationId);
  let response: Response;
  try {
    response = await (options.fetchImplementation ?? fetch)(target, {
      method: "POST",
      body: requestBody.buffer,
      headers: {
        ...signed.headers,
        accept: "application/json",
        apikey: environment.publishableKey,
        "content-type": "application/json",
        ...(correlationId ? { "x-portal-correlation-id": correlationId } : {}),
      },
      cache: "no-store",
      redirect: "error",
      signal: options.signal
        ? AbortSignal.any([
            options.signal,
            AbortSignal.timeout(environment.edgeTimeoutMilliseconds),
          ])
        : AbortSignal.timeout(environment.edgeTimeoutMilliseconds),
    });
  } catch {
    return fallback("hybrid_upstream_unavailable");
  }

  let payload: unknown;
  try {
    payload = await parseResponsePayload(response);
  } catch {
    return fallback("contract_failure");
  }

  if (!response.ok) {
    const errorPayload = portalHybridErrorPayloadSchema.safeParse(payload);
    return fallback(errorPayload.success ? errorPayload.data.code : "contract_failure");
  }

  const parsedPage = portalHybridSearchPageSchema.safeParse(payload);
  const expectedVersion = "portal.hybrid-search-page.v3";
  if (
    !parsedPage.success ||
    parsedPage.data.kind !== parsedInput.kind ||
    parsedPage.data.schemaVersion !== expectedVersion ||
    parsedPage.data.items.length > parsedInput.limit
  ) {
    return fallback("contract_failure");
  }

  return { status: "available", data: parsedPage.data };
}

export function queryPortalHybrid(
  input: PortalHybridSearchRequest,
  options: QueryOptions = {},
): Promise<PortalHybridQueryResult> {
  const parsed = portalHybridSearchRequestSchema.safeParse(input);
  if (!parsed.success) throw new PortalHybridInputError();
  return queryPortalHybridRaw(new TextEncoder().encode(JSON.stringify(parsed.data)), options);
}
