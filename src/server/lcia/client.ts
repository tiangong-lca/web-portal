import "server-only";

import { publishedLciaInputSchema, type PublishedLciaInput } from "@/server/contracts/input";
import { publishedLciaPageSchema, type PublishedLciaPage } from "@/server/contracts/portal";
import { readPortalLciaEnvironment, type PortalLciaEnvironment } from "@/server/lcia/environment";
import { createPortalNonce, signPortalHmac } from "@/server/r0-compat/hmac";
import { validatePortalCorrelationId } from "@/server/telemetry/logger";

export const portalDataProductFunctionPath = "/functions/v1/portal_data_product_results_v1";

const maximumResponseBytes = 512 * 1024;
const maximumRequestBytes = 16 * 1024;
const wireInputKeys = ["mode", "processRefs", "impactCategoryId", "cursor", "limit"] as const;

export type PublishedLciaResult =
  | { status: "available"; data: PublishedLciaPage }
  | { status: "unavailable"; data: null }
  | { status: "temporarily_unavailable"; data: null };

export class PortalLciaInputError extends Error {
  readonly code = "invalid_request";

  constructor() {
    super("The LCIA request is invalid.");
    this.name = "PortalLciaInputError";
  }
}

type QueryOptions = {
  environment?: PortalLciaEnvironment;
  fetchImplementation?: typeof fetch;
  now?: () => number;
  nonce?: () => string;
  correlationId?: string;
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

export async function queryPublishedLciaRaw(
  rawBody: Uint8Array,
  options: QueryOptions = {},
): Promise<PublishedLciaResult> {
  if (rawBody.byteLength === 0 || rawBody.byteLength > maximumRequestBytes) {
    throw new PortalLciaInputError();
  }
  let requestBody = new Uint8Array(rawBody.byteLength);
  requestBody.set(rawBody);

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(requestBody)) as unknown;
  } catch {
    throw new PortalLciaInputError();
  }

  const parsedInput = publishedLciaInputSchema.safeParse(decoded);
  if (
    decoded === null ||
    typeof decoded !== "object" ||
    Array.isArray(decoded) ||
    !wireInputKeys.every((key) => Object.prototype.hasOwnProperty.call(decoded, key)) ||
    !parsedInput.success
  ) {
    throw new PortalLciaInputError();
  }

  const environment = options.environment ?? readPortalLciaEnvironment();
  requestBody = new TextEncoder().encode(
    JSON.stringify({
      ...parsedInput.data,
      schemaVersion: "portal.published-lcia-request.v2",
      allowedBrandCodes: environment.dataBrandScope.allowedBrandCodes,
    }),
  );
  const signed = await signPortalHmac({
    rawBody: requestBody,
    keyId: environment.keyId,
    secret: environment.secret,
    timestamp: Math.floor((options.now?.() ?? Date.now()) / 1000),
    nonce: options.nonce?.() ?? createPortalNonce(),
    functionPath: portalDataProductFunctionPath,
  });
  const target = new URL(portalDataProductFunctionPath, environment.edgeOrigin);
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
      signal: AbortSignal.timeout(environment.edgeTimeoutMilliseconds),
    });
  } catch {
    return { status: "temporarily_unavailable", data: null };
  }

  if (response.status === 204 || response.status === 404) {
    return { status: "unavailable", data: null };
  }
  if (response.status === 400) {
    throw new PortalLciaInputError();
  }
  if (!response.ok) {
    return { status: "temporarily_unavailable", data: null };
  }

  try {
    const payload = await parseResponsePayload(response);
    if (payload === null) {
      return { status: "unavailable", data: null };
    }

    const parsed = publishedLciaPageSchema.safeParse(payload);
    return parsed.success && parsed.data.mode === parsedInput.data.mode
      ? { status: "available", data: parsed.data }
      : { status: "temporarily_unavailable", data: null };
  } catch {
    return { status: "temporarily_unavailable", data: null };
  }
}

export function queryPublishedLcia(
  input: PublishedLciaInput,
  options: QueryOptions = {},
): Promise<PublishedLciaResult> {
  const parsed = publishedLciaInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PortalLciaInputError();
  }

  return queryPublishedLciaRaw(new TextEncoder().encode(JSON.stringify(parsed.data)), options);
}
