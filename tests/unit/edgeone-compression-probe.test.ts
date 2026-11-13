// @vitest-environment node
import { gunzipSync } from "node:zlib";
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

  it("delivers independently decodable gzip shell before the delayed tail", async () => {
    vi.useFakeTimers();
    const reader = createCompressionProbeStream("gzip").getReader();
    const first = await reader.read();
    expect(gunzipSync(first.value!).toString()).toBe(compressionProbeShell);
    await vi.advanceTimersByTimeAsync(2000);
    const second = await reader.read();
    expect(gunzipSync(Buffer.concat([first.value!, second.value!])).toString()).toBe(
      compressionProbeShell + compressionProbeTail,
    );
    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });

  it("cancels the pending delayed chunk when a client disconnects", async () => {
    vi.useFakeTimers();
    const reader = createCompressionProbeStream("identity").getReader();
    await reader.read();
    await reader.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });
});
