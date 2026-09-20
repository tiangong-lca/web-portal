import "server-only";
import { classificationPageMatches } from "@/lib/classification-navigation";
import { classificationRequestSchema, readClassificationBranch } from "./navigation";

const maximumRequestBytes = 8192;
const maximumResponseBytes = 64 * 1024;
function respond(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    // Public RPC data retains its 30s cache. This query-specific POST envelope is not a CDN page.
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
function allowedOrigin(request: Request) {
  try {
    const url = new URL(process.env.SITE_URL || request.url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return !url.username &&
      !url.password &&
      (url.protocol === "https:" || (url.protocol === "http:" && local))
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** Internal, anonymous, read-only adapter for a single classification branch. */
export function createClassificationHandler(read = readClassificationBranch) {
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin !== null && origin !== allowedOrigin(request))
    )
      return respond({ code: "cross_origin_request" }, 403);
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    )
      return respond({ code: "invalid_request" }, 415);
    const declaredLength = request.headers.get("content-length");
    if (
      declaredLength !== null &&
      /^\d+$/u.test(declaredLength) &&
      Number(declaredLength) > maximumRequestBytes
    )
      return respond({ code: "body_too_large" }, 413);
    const reader = request.body?.getReader();
    if (!reader) return respond({ code: "invalid_request" }, 400);
    let total = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maximumRequestBytes) {
          await reader.cancel().catch(() => undefined);
          return respond({ code: "body_too_large" }, 413);
        }
        chunks.push(value);
      }
    } catch {
      return respond({ code: "invalid_request" }, 400);
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let input;
    try {
      input = classificationRequestSchema.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    } catch {
      return respond({ code: "invalid_request" }, 400);
    }
    if (request.signal.aborted) return respond({ code: "request_cancelled" }, 408);
    try {
      const page = await read(input);
      if (
        !classificationPageMatches(page, input) ||
        new TextEncoder().encode(JSON.stringify(page)).byteLength > maximumResponseBytes
      )
        return respond({ code: "temporarily_unavailable" }, 503);
      return respond(page);
    } catch {
      return respond({ code: "temporarily_unavailable" }, 503);
    }
  };
}
