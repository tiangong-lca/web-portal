import "server-only";

import { gzipSync } from "node:zlib";

/** Diagnostics are opt-in, synthetic and unavailable on the production environment. */
export function compressionProbeEnabled(environment = process.env): boolean {
  return (
    environment.PORTAL_DEPLOYMENT_ENV === "preview" &&
    environment.PORTAL_COMPRESSION_PROBE_ENABLED === "1"
  );
}

const observedEncodings = new Set([
  "identity",
  "gzip",
  "br",
  "gzip, br",
  "br, gzip",
  "gzip;q=0",
  "gzip;q=0, identity",
]);

/** Never reflect arbitrary request headers, cookies or user-supplied strings. */
export function observedAcceptEncoding(value: string | null): string {
  if (value === null) return "absent";
  if (value.length > 128) return "other";
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/\s*,\s*/gu, ", ");
  return observedEncodings.has(normalized) ? normalized : "other";
}

export const compressionProbeText = "Public synthetic compression evidence. ".repeat(512);
export const compressionProbeShell =
  '<!doctype html><html lang="en"><head><meta name="robots" content="noindex,nofollow">' +
  "<title>Transport qualification</title></head><body><p data-compression-shell>" +
  compressionProbeText +
  "</p>";
export const compressionProbeTail =
  "<p data-compression-complete>Deferred transport evidence complete.</p></body></html>";

export function createCompressionProbeStream(mode: "identity" | "gzip") {
  const encode = (text: string) =>
    mode === "gzip" ? new Uint8Array(gzipSync(text)) : new TextEncoder().encode(text);
  // Two complete gzip members intentionally isolate transport passthrough from
  // Next's compression negotiation. This is not a product response compressor.
  const shell = encode(compressionProbeShell);
  const tail = encode(compressionProbeTail);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(shell);
      timer = setTimeout(() => {
        controller.enqueue(tail);
        controller.close();
      }, 2000);
    },
    cancel() {
      clearTimeout(timer);
    },
  });
}
