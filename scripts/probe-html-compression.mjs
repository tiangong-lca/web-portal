import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open } from "node:fs/promises";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { isAbsolute } from "node:path";
import { performance } from "node:perf_hooks";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createBrotliDecompress, createGunzip } from "node:zlib";

const acceptanceCases = ["identity", "gzip", "br", "gzip, br", "gzip;q=0", null];
const observedEncodings = [
  "absent",
  ...acceptanceCases.slice(0, -1),
  "br, gzip",
  "gzip;q=0, identity",
  "other",
];
const targets = [
  { label: "native", path: "/r0-compat/compression/native" },
  { label: "stream-identity", path: "/r0-compat/compression/stream?mode=identity", hash: true },
  { label: "stream-gzip", path: "/r0-compat/compression/stream?mode=gzip", hash: true },
];
const diagnosticTimeoutMs = 12_000;
const customTimeoutMs = 45_000;
const maximumWireBytes = 4 * 1024 * 1024;
const maximumDecodedBytes = 8 * 1024 * 1024;
const maximumPreviewFileBytes = 2048;
const markerOverlap = 512;

const help = `Usage: node scripts/probe-html-compression.mjs <http(s) origin> [/<path>?<query>]
       node scripts/probe-html-compression.mjs --preview-url-file <absolute private file> [/<path>?<query>]
For a protected EdgeOne Preview, use a private file (mode 600) with its temporary HTTPS access link.
With no path, measure the three compression diagnostics. A custom path is labeled "custom".
Requests are sequential HTTP/1.1 GETs without cookies or redirects.
Each line reports one request. Wire bytes exclude HTTP framing and TLS overhead.
Timings are milliseconds from request start. Missing values are null.
The forced identity/gzip diagnostics ignore inbound negotiation; compare their decoded hashes.
Selected response headers are normalized; unknown values are reported as "other".
HTTP status, negotiation, and timing are observations; check them separately from the exit code.`;

function parseOrigin(origin) {
  const url = new URL(origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.hash
  ) {
    throw new Error();
  }
  return url;
}

async function readPreviewOrigin(file) {
  if (!file || !isAbsolute(file)) throw new Error();
  const flags =
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);
  const handle = await open(file, flags);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > maximumPreviewFileBytes) {
      throw new Error();
    }
    const buffer = Buffer.alloc(maximumPreviewFileBytes + 1);
    const { bytesRead } = await handle.read(buffer);
    if (bytesRead !== stat.size) throw new Error();
    const link = buffer.toString("utf8", 0, bytesRead).trim();
    if (/\s/.test(link)) throw new Error();
    const url = parseOrigin(link);
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.edgeone\.dev$/.test(url.hostname) ||
      url.port ||
      url.searchParams.size !== 2 ||
      !/^[0-9a-f]{16,128}$/i.test(url.searchParams.get("eo_token") ?? "") ||
      !/^\d{1,16}$/.test(url.searchParams.get("eo_time") ?? "")
    ) {
      throw new Error();
    }
    return url;
  } finally {
    await handle.close();
  }
}

function requestUrl(base, path) {
  const url = new URL(path, base);
  if (base.search) {
    if (url.searchParams.has("eo_token") || url.searchParams.has("eo_time")) throw new Error();
    const accessQuery = base.searchParams.toString();
    url.search = url.search ? `${url.search}&${accessQuery}` : accessQuery;
  }
  return url;
}

async function parseArguments(args) {
  const preview = args[0] === "--preview-url-file";
  const [origin, path, ...unexpected] = preview ? args.slice(1) : args;
  if (origin === undefined || unexpected.length > 0) throw new Error();
  const base = preview ? await readPreviewOrigin(origin) : parseOrigin(origin);
  if (!preview && base.search) throw new Error();
  if (path === undefined) {
    return {
      selected: targets.map((target) => ({ ...target, url: requestUrl(base, target.path) })),
      intervalMs: 250,
    };
  }
  if (!/^\/(?![/\\])/.test(path) || path.length > 2048) throw new Error();
  const url = requestUrl(base, path);
  if (url.origin !== base.origin || url.hash) throw new Error();
  return { selected: [{ label: "custom", url }], intervalMs: 3_100 };
}

function readHeader(headers, name) {
  const value = headers[name];
  return (Array.isArray(value) ? value.join(", ") : (value ?? "")).trim().toLowerCase();
}

function readNumber(headers, name) {
  const value = readHeader(headers, name);
  return /^\d{1,15}$/.test(value) ? Number(value) : null;
}

function readDirectives(headers, name, allowed) {
  const value = readHeader(headers, name);
  if (!value) return null;
  return value
    .split(",")
    .map((part) => part.trim())
    .map((part) => (allowed.test(part) ? part : "other"))
    .join(", ");
}

function readEncoding(headers) {
  const value = readHeader(headers, "content-encoding");
  if (!value) return null;
  return ["identity", "gzip", "br", "deflate", "zstd"].includes(value) ? value : "other";
}

function readCacheStatus(headers, name) {
  const value = readHeader(headers, name);
  if (!value) return null;
  const status =
    /^(?:tcp_)?(hit|miss|bypass|dynamic|expired|stale|updating|revalidated|refresh_hit|refresh_miss|error|config_nocache)(?:\b|$)/.exec(
      value,
    );
  return status?.[1] ?? "other";
}

function readResponseHeaders(headers) {
  return {
    contentEncoding: readEncoding(headers),
    contentLength: readNumber(headers, "content-length"),
    cacheControl: readDirectives(
      headers,
      "cache-control",
      /^(?:public|private|no-cache|no-store|no-transform|immutable|must-revalidate|proxy-revalidate|(?:max-age|s-maxage|stale-while-revalidate|stale-if-error)=\d+)$/,
    ),
    vary: readDirectives(
      headers,
      "vary",
      /^(?:\*|accept|accept-encoding|accept-language|cookie|rsc|next-router-prefetch|next-router-segment-prefetch|next-router-state-tree|next-url|user-agent|sec-fetch-dest)$/,
    ),
    age: readNumber(headers, "age"),
    cacheStatus: readCacheStatus(headers, "x-cache"),
    edgeOneCacheStatus: readCacheStatus(headers, "eo-cache-status"),
    cacheLookup: readCacheStatus(headers, "cache-lookup"),
    nextCacheStatus: readCacheStatus(headers, "x-nextjs-cache"),
    robots: readDirectives(headers, "x-robots-tag", /^(?:noindex|nofollow|index|follow|none)$/),
  };
}

function readObservedEncoding(value) {
  return observedEncodings.includes(value) ? value : null;
}

function openResponse(url, acceptEncoding, signal) {
  const get = url.protocol === "https:" ? httpsGet : httpGet;
  const headers = { accept: "text/html" };
  if (acceptEncoding !== null) headers["accept-encoding"] = acceptEncoding;
  return new Promise((resolve, reject) => {
    get(url, { agent: false, headers, signal }, resolve).once("error", reject);
  });
}

function measureWire(result, elapsed, hash) {
  return new Transform({
    transform(chunk, _, done) {
      result.firstBodyMs ??= elapsed();
      result.wireBytes += chunk.length;
      if (result.wireBytes > maximumWireBytes) return done(new Error("wire-limit"));
      hash?.update(chunk);
      done(null, chunk);
    },
    flush(done) {
      result.wireEndMs = elapsed();
      done();
    },
  });
}

function inspectHtml(result, elapsed, hash) {
  let overlap = "";
  return new Writable({
    write(chunk, _, done) {
      result.decodedBytes += chunk.length;
      if (result.decodedBytes > maximumDecodedBytes) return done(new Error("decoded-limit"));
      hash?.update(chunk);
      // The inspected markup is ASCII; latin1 preserves it even when chunks split UTF-8 text.
      const markup = overlap + chunk.toString("latin1");
      if (result.shellMs === null && /<p data-compression-shell(?:=|\s|>)/.test(markup)) {
        result.shellMs = elapsed();
      }
      if (result.completeMs === null && /<p data-compression-complete(?:=|\s|>)/.test(markup)) {
        result.completeMs = elapsed();
      }
      result.originAcceptEncoding ??= readObservedEncoding(
        /<output data-compression-accept-encoding(?:="(?:true)?")?>([^<]{1,24})<\/output>/.exec(
          markup,
        )?.[1],
      );
      result.searchView ??=
        /\bdata-search-view="(initial|process|flow|region)"/.exec(markup)?.[1] ?? null;
      result.documentLanguage ??= /<html\b[^>]*\blang="(zh-CN|en|de|fr)"/.exec(markup)?.[1] ?? null;
      result.noindex ||= /<meta\b(?=[^>]*\bname="robots")(?=[^>]*\bcontent="noindex\b)[^>]*>/.test(
        markup,
      );
      overlap = markup.slice(-markerOverlap);
      done();
    },
  });
}

async function measure(url, target, acceptEncoding) {
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);
  const signal = AbortSignal.timeout(
    target.label === "custom" ? customTimeoutMs : diagnosticTimeoutMs,
  );
  const result = {
    target: target.label,
    negotiationApplicable: !target.hash,
    acceptEncoding,
    status: null,
    headers: null,
    wireBytes: 0,
    decodedBytes: null,
    headersMs: null,
    firstBodyMs: null,
    shellMs: null,
    completeMs: null,
    wireEndMs: null,
    originAcceptEncoding: null,
    documentLanguage: null,
    searchView: null,
    noindex: null,
    wireSha256: null,
    decodedSha256: null,
    error: null,
  };

  try {
    const response = await openResponse(url, acceptEncoding, signal);
    result.headersMs = elapsed();
    result.status = response.statusCode;
    result.headers = readResponseHeaders(response.headers);
    result.originAcceptEncoding = readObservedEncoding(
      readHeader(response.headers, "x-compression-observed-encoding"),
    );
    const encoding = result.headers.contentEncoding;
    const hash = target.hash && result.status === 200 ? createHash("sha256") : null;
    const wireHash = hash ? createHash("sha256") : null;
    const wire = measureWire(result, elapsed, wireHash);
    if (encoding === "gzip" || encoding === "br" || encoding === null || encoding === "identity") {
      const decoders =
        encoding === "gzip"
          ? [createGunzip()]
          : encoding === "br"
            ? [createBrotliDecompress()]
            : [];
      result.decodedBytes = 0;
      result.noindex = false;
      await pipeline([response, wire, ...decoders, inspectHtml(result, elapsed, hash)], { signal });
      result.decodedSha256 = hash?.digest("hex") ?? null;
    } else {
      await pipeline(
        [
          response,
          wire,
          new Writable({
            write(_chunk, _, done) {
              done();
            },
          }),
        ],
        { signal },
      );
      result.error = "unsupported-content-encoding";
    }
    result.wireSha256 = wireHash?.digest("hex") ?? null;
  } catch (error) {
    if (signal.aborted) result.error = "timeout";
    else if (["wire-limit", "decoded-limit"].includes(error.message)) result.error = error.message;
    else if (typeof error.code === "string" && error.code.startsWith("Z_"))
      result.error = "invalid-compressed-body";
    else result.error = "transport-error";
  }
  return result;
}

async function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(help);
    return;
  }
  let config;
  try {
    config = await parseArguments(args);
  } catch {
    console.error(help);
    process.exitCode = 2;
    return;
  }
  let first = true;
  for (const target of config.selected) {
    for (const acceptEncoding of acceptanceCases) {
      if (!first) await delay(config.intervalMs);
      first = false;
      const result = await measure(target.url, target, acceptEncoding);
      console.log(JSON.stringify(result));
      if (result.error) process.exitCode = 1;
    }
  }
}

await main(process.argv.slice(2));
