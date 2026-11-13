import "server-only";

import { Readable } from "node:stream";
import { constants, createGzip } from "node:zlib";

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

export function createCompressionProbeStream(
  mode: "identity" | "gzip",
): ReadableStream<Uint8Array> {
  if (mode === "gzip") {
    const gzip = createGzip();
    const stream = Readable.toWeb(gzip);
    const timer = setTimeout(() => gzip.end(compressionProbeTail), 2000);
    // The web adapter destroys the compressor when the response is canceled.
    gzip.once("close", () => clearTimeout(timer));
    gzip.write(compressionProbeShell);
    // Expose the shell immediately while keeping the same gzip member open.
    gzip.flush(constants.Z_SYNC_FLUSH);
    return stream;
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(compressionProbeShell));
      timer = setTimeout(() => {
        controller.enqueue(encoder.encode(compressionProbeTail));
        controller.close();
      }, 2000);
    },
    cancel() {
      clearTimeout(timer);
    },
  });
}
