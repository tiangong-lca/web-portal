// @vitest-environment node
import { constants, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/r0-compat/compression/stream/route";
import {
  compressionProbeEnabled,
  compressionProbeShell,
  compressionProbeTail,
  createCompressionProbeStream,
  observedAcceptEncoding,
} from "@/server/r0-compat/compression";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("isolated compression diagnostics", () => {
  it("refuses production even with the diagnostic flag", () => {
    vi.stubEnv("PORTAL_DEPLOYMENT_ENV", "production");
    vi.stubEnv("PORTAL_COMPRESSION_PROBE_ENABLED", "1");
    expect(compressionProbeEnabled()).toBe(false);
    expect(
      GET(new Request("https://example.test/r0-compat/compression/stream?mode=gzip")).status,
    ).toBe(404);
  });

  it("requires both preview and explicit opt-in", () => {
    vi.stubEnv("PORTAL_DEPLOYMENT_ENV", "preview");
    vi.stubEnv("PORTAL_COMPRESSION_PROBE_ENABLED", "0");
    expect(compressionProbeEnabled()).toBe(false);
    vi.stubEnv("PORTAL_COMPRESSION_PROBE_ENABLED", "1");
    expect(compressionProbeEnabled()).toBe(true);
    const response = GET(
      new Request("https://example.test/r0-compat/compression/stream?mode=unknown"),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("never reflects arbitrary header values", () => {
    expect(observedAcceptEncoding("sensitive-example-value")).toBe("other");
    expect(observedAcceptEncoding(null)).toBe("absent");
    expect(observedAcceptEncoding("gzip,br")).toBe("gzip, br");
    expect(observedAcceptEncoding("gzip;q=0")).toBe("gzip;q=0");
  });

  it("flushes the shell before completing a single gzip member with the delayed tail", async () => {
    vi.useFakeTimers();
    const reader = createCompressionProbeStream("gzip").getReader();
    const chunks: Uint8Array[] = [];
    let decoded = "";
    while (decoded.length < compressionProbeShell.length) {
      const { done, value } = await reader.read();
      if (done) throw new Error("Gzip stream ended before delivering the shell");
      chunks.push(value);
      decoded = gunzipSync(Buffer.concat(chunks), {
        finishFlush: constants.Z_SYNC_FLUSH,
      }).toString();
    }
    expect(decoded).toBe(compressionProbeShell);
    const partial = Buffer.concat(chunks);
    expect(partial.subarray(0, 3)).toEqual(Buffer.from([0x1f, 0x8b, 0x08]));
    expect(() => gunzipSync(partial)).toThrow("unexpected end of file");

    await vi.advanceTimersByTimeAsync(2000);
    for (let result = await reader.read(); !result.done; result = await reader.read()) {
      chunks.push(result.value);
    }
    const compressed = Buffer.concat(chunks);
    const expected = compressionProbeShell + compressionProbeTail;
    expect(gunzipSync(compressed).toString()).toBe(expected);
    // The last member's trailer covers the whole document, including the shell.
    expect(compressed.readUInt32LE(compressed.length - 4)).toBe(Buffer.byteLength(expected));
  });

  it.each(["identity", "gzip"] as const)(
    "cancels the pending delayed %s chunk when a client disconnects",
    async (mode) => {
      vi.useFakeTimers();
      const reader = createCompressionProbeStream(mode).getReader();
      await reader.read();
      await reader.cancel();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
