// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createPortalInstanceCacheBoundary } from "@/server/data/instance-cache";
import {
  createPortalReadCoordinator,
  type PortalCacheBoundary,
  type PortalReadEnvelope,
} from "@/server/data/read-coordinator";

const policy = { revalidateSeconds: 30, tags: ["portal:catalog-search:process"] };
const missEveryTime: PortalCacheBoundary = {
  async read(_key, _policy, loader) {
    return await loader();
  },
};
function envelope(loadedAtMs: number, payload: unknown = { rows: [1] }): PortalReadEnvelope {
  return { envelopeVersion: 1, loadedAtMs, originMarker: "1234abcd", payload };
}
function unwrap(result: Awaited<ReturnType<PortalCacheBoundary["read"]>>) {
  return "envelope" in result ? result.envelope : result;
}

describe("bounded instance reuse behind a non-persisting runtime cache", () => {
  it("coalesces cold concurrent origins, reuses a warm copy and reports the actual tier", async () => {
    let clock = 1000;
    const boundary = createPortalInstanceCacheBoundary(missEveryTime, { now: () => clock });
    const coordinator = createPortalReadCoordinator({ now: () => clock });
    const load = vi.fn<() => Promise<{ rows: number[] }>>(async () => ({ rows: [1] }));
    const input = {
      key: "environment-and-policy-bound-key",
      family: "catalog_search",
      rpcName: "portal_search_processes_v2",
      ...policy,
      timeoutMs: 8000,
      deadlineMs: Number.MAX_SAFE_INTEGER,
      boundary,
      load,
      validate: (payload: unknown) => typeof payload === "object" && payload !== null,
    };
    const cold = await Promise.all(Array.from({ length: 4 }, () => coordinator.runBounded(input)));
    expect(load).toHaveBeenCalledTimes(1);
    expect(new Set(cold.map((result) => result.consumer.originMarker)).size).toBe(1);
    clock += 5000;
    const warm = await coordinator.runBounded(input);
    expect(load).toHaveBeenCalledTimes(1);
    expect(warm.consumer).toMatchObject({
      outcome: "cache",
      cacheSource: "instance",
      loadedAtAgeMs: 5000,
    });
    expect(warm.consumer.originMarker).toBe(cold[0]!.consumer.originMarker);
    clock = 31_000;
    const refreshed = await coordinator.runBounded(input);
    expect(load).toHaveBeenCalledTimes(2);
    expect(refreshed.consumer).toMatchObject({ outcome: "origin", loadedAtAgeMs: 0 });
  });

  it("does not serve an expired envelope after origin failure, or extend age on hits", async () => {
    let clock = 1000;
    const boundary = createPortalInstanceCacheBoundary(missEveryTime, { now: () => clock });
    const loader = vi.fn<() => Promise<PortalReadEnvelope>>(async () => envelope(clock));
    await boundary.read("key", policy, loader);
    clock = 30_999;
    expect(unwrap(await boundary.read("key", policy, loader)).loadedAtMs).toBe(1000);
    loader.mockRejectedValue(new Error("origin unavailable"));
    clock = 31_000;
    await expect(boundary.read("key", policy, loader)).rejects.toThrow("origin unavailable");
    await expect(boundary.read("key", policy, loader)).rejects.toThrow("origin unavailable");
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it("returns isolated payloads without letting either cold or warm consumers mutate the store", async () => {
    const boundary = createPortalInstanceCacheBoundary(missEveryTime, { now: () => 1000 });
    const loader = vi.fn<() => Promise<PortalReadEnvelope>>(async () => envelope(1000));
    for (let n = 0; n < 3; n++) {
      const result = unwrap(await boundary.read("key", policy, loader));
      expect(result.payload).toEqual({ rows: [1] });
      (result.payload as { rows: number[] }).rows.push(2);
    }
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps runtime hits first and does not misattribute a background instance read", async () => {
    const loader = vi.fn<() => Promise<PortalReadEnvelope>>(async () => envelope(1000));
    let nextHit: PortalReadEnvelope | null = null;
    let background = false;
    const runtime: PortalCacheBoundary = {
      async read(_key, _policy, load) {
        if (nextHit) {
          if (background) await load();
          return structuredClone(nextHit);
        }
        return await load();
      },
    };
    const boundary = createPortalInstanceCacheBoundary(runtime, { now: () => 1000 });
    await boundary.read("key", policy, loader);
    nextHit = envelope(1000);
    expect(await boundary.read("key", policy, loader)).toMatchObject({ cacheSource: "runtime" });
    background = true;
    expect(await boundary.read("key", policy, loader)).toMatchObject({ cacheSource: "runtime" });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("evicts least recently used entries at the count limit", async () => {
    const boundary = createPortalInstanceCacheBoundary(missEveryTime, {
      now: () => 1000,
      maximumEntries: 2,
    });
    const loader = vi.fn<() => Promise<PortalReadEnvelope>>(async () => envelope(1000));
    for (const key of ["a", "b", "a", "c", "a", "b"]) await boundary.read(key, policy, loader);
    expect(loader).toHaveBeenCalledTimes(4);
  });

  it("enforces UTF-8 serialized-byte capacity and skips oversized entries without emptying valid ones", async () => {
    const bytes = Buffer.byteLength(JSON.stringify(envelope(1000, { rows: ["中文"] })), "utf8");
    const boundary = createPortalInstanceCacheBoundary(missEveryTime, {
      now: () => 1000,
      maximumBytes: bytes * 2,
    });
    const small = vi.fn<() => Promise<PortalReadEnvelope>>(async () =>
      envelope(1000, { rows: ["中文"] }),
    );
    for (const key of ["a", "b", "c", "b"]) await boundary.read(key, policy, small);
    const large = vi.fn<() => Promise<PortalReadEnvelope>>(async () =>
      envelope(1000, { rows: ["x".repeat(bytes * 3)] }),
    );
    await boundary.read("large", policy, large);
    await boundary.read("large", policy, large);
    await boundary.read("b", policy, small);
    await boundary.read("a", policy, small);
    expect(small).toHaveBeenCalledTimes(4);
    expect(large).toHaveBeenCalledTimes(2);
  });

  it("does not reuse future, malformed, expired or non-positive-window entries", async () => {
    for (const candidate of [
      envelope(1001),
      envelope(0),
      { ...envelope(1000), originMarker: "" },
    ]) {
      const boundary = createPortalInstanceCacheBoundary(missEveryTime, { now: () => 1000 });
      const loader = vi.fn<() => Promise<PortalReadEnvelope>>(async () => candidate);
      await boundary.read("key", policy, loader);
      await boundary.read("key", policy, loader);
      expect(loader).toHaveBeenCalledTimes(2);
    }
    const boundary = createPortalInstanceCacheBoundary(missEveryTime, { now: () => 1000 });
    const loader = vi.fn<() => Promise<PortalReadEnvelope>>(async () => envelope(1000));
    for (let n = 0; n < 2; n++)
      await boundary.read("key", { ...policy, revalidateSeconds: 0 }, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("caps even longer requested policies at thirty seconds and isolates already-bound keys", async () => {
    let clock = 1000;
    const boundary = createPortalInstanceCacheBoundary(missEveryTime, { now: () => clock });
    const loader = vi.fn<() => Promise<PortalReadEnvelope>>(async () => envelope(clock));
    await boundary.read("environment-a-policy-30", policy, loader);
    await boundary.read("environment-b-policy-30", policy, loader);
    await boundary.read("environment-a-policy-60", { ...policy, revalidateSeconds: 60 }, loader);
    expect(loader).toHaveBeenCalledTimes(3);
    clock = 31_000;
    await boundary.read("environment-a-policy-60", { ...policy, revalidateSeconds: 60 }, loader);
    expect(loader).toHaveBeenCalledTimes(4);
  });
});
