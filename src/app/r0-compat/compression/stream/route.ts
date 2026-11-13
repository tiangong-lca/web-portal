import {
  compressionProbeEnabled,
  createCompressionProbeStream,
  observedAcceptEncoding,
} from "@/server/r0-compat/compression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const headers = new Headers({
    "cache-control": "private, no-store, max-age=0",
    "x-robots-tag": "noindex, nofollow",
    "content-type": "text/html; charset=utf-8",
    vary: "Accept-Encoding",
  });
  if (!compressionProbeEnabled()) return new Response(null, { status: 404, headers });
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode !== "identity" && mode !== "gzip") {
    return new Response(null, { status: 400, headers });
  }
  headers.set(
    "x-compression-observed-encoding",
    observedAcceptEncoding(request.headers.get("accept-encoding")),
  );
  if (mode === "gzip") headers.set("content-encoding", "gzip");
  return new Response(createCompressionProbeStream(mode), { headers });
}

export function HEAD() {
  return new Response(null, {
    status: 405,
    headers: { allow: "GET", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}
