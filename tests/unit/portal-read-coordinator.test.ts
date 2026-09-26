// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { PortalDataError } from "@/server/data/portal-data-error";
import {
  canonicalizeReadArguments,
  createPortalReadCoordinator,
  PortalLocalShedError,
  portalReadIdentity,
  portalReadKey,
  type PortalCacheBoundary,
  type PortalReadEnvelope,
  type PortalReadCoordinator,
  type PortalReadCoordinatorOptions,
} from "@/server/data/read-coordinator";

const baseKeyInput = {
  identity: portalReadIdentity("https://project.supabase.co", "sb_publishable_test"),
  rpcName: "portal_search_processes_v2",
  timeoutMs: 8000,
} as const;

const baseRead = {
  family: "catalog_search",
  rpcName: baseKeyInput.rpcName,
  revalidateSeconds: 30,
  tags: ["portal:catalog-search:process"],
  timeoutMs: 8000,
} as const;

type LoadMock = ReturnType<typeof vi.fn<(signal: AbortSignal) => Promise<unknown>>>;

function envelope(payload: unknown, loadedAtMs: number, marker = "marker00"): PortalReadEnvelope {
  return { envelopeVersion: 1, loadedAtMs, originMarker: marker, payload };
}

function keyFor(arguments_: Record<string, unknown>, identity = baseKeyInput.identity): string {
  return portalReadKey({
    ...baseKeyInput,
    identity,
    arguments_,
    policy: { mode: "revalidate", seconds: 30, tags: ["portal:catalog-search:process"] },
  });
}

/** Cold boundary: every consumer runs the loader, as on a cache miss. */
function coldBoundary(): PortalCacheBoundary {
  return {
    async read(_key, _options, loader) {
      return await loader();
    },
  };
}

function slowLoad(milliseconds: number, value = "value"): LoadMock {
  return vi.fn<(signal: AbortSignal) => Promise<unknown>>(
    async () => new Promise((resolve) => setTimeout(() => resolve(value), milliseconds)),
  );
}

function boundedInput(
  overrides: Partial<Parameters<PortalReadCoordinator["runBounded"]>[0]> = {},
): Parameters<PortalReadCoordinator["runBounded"]>[0] {
  return {
    ...baseRead,
    key: keyFor({ p_query: "electricity" }),
    deadlineMs: Number.MAX_SAFE_INTEGER,
    boundary: coldBoundary(),
    validate: () => true,
    load: async () => "payload",
    ...overrides,
  };
}

function coordinatorWith(options: PortalReadCoordinatorOptions = {}): PortalReadCoordinator {
  return createPortalReadCoordinator(options);
}

describe("Portal bounded read coordinator", () => {
  it("serves concurrent same-parameter consumers from one origin load", async () => {
    const load = slowLoad(20, "payload");
    const coordinator = coordinatorWith({ now: () => 1_000 });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        coordinator.runBounded(boundedInput({ key: keyFor({ p_query: "electricity" }), load })),
      ),
    );

    expect(load).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.payload === "payload")).toBe(true);
    expect(results.filter((result) => result.consumer.outcome === "origin")).toHaveLength(1);
    expect(results.filter((result) => result.consumer.outcome === "coalesced")).toHaveLength(7);
  });

  it("keys arguments with JSON semantics, including __proto__, undefined and toJSON", () => {
    expect(canonicalizeReadArguments({ b: 2, a: 1 })).toBe(
      canonicalizeReadArguments({ a: 1, b: 2 }),
    );
    expect(canonicalizeReadArguments({ a: undefined })).toBe(canonicalizeReadArguments({}));
    expect(canonicalizeReadArguments({ a: [undefined] })).toBe(
      canonicalizeReadArguments({ a: [null] }),
    );
    expect(canonicalizeReadArguments({ a: null })).not.toBe(canonicalizeReadArguments({}));
    expect(canonicalizeReadArguments({ d: new Date(0) })).toBe(
      canonicalizeReadArguments({ d: "1970-01-01T00:00:00.000Z" }),
    );

    const withProto = JSON.parse('{"__proto__": 1}') as Record<string, unknown>;
    expect(Object.getPrototypeOf(withProto)).toBe(Object.prototype);
    expect(canonicalizeReadArguments(withProto)).toBe('{"__proto__":1}');
    expect(canonicalizeReadArguments(withProto)).not.toBe(canonicalizeReadArguments({}));

    const otherIdentity = portalReadIdentity("https://other.supabase.co", "sb_publishable_test");
    const keys = new Set([
      keyFor({ p_query: "electricity" }),
      keyFor({ p_query: "electricity", p_limit: 21 }),
      keyFor({ p_query: "electricity " }),
      keyFor({ p_query: "electricity" }, otherIdentity),
      portalReadKey({
        ...baseKeyInput,
        arguments_: { p_query: "electricity" },
        policy: { mode: "no-store" },
      }),
    ]);
    expect(keys.size).toBe(5);
  });

  it("never returns a payload that is older than the documented window when the origin fails", async () => {
    const coordinator = coordinatorWith({ now: () => 50_000 });

    await expect(
      coordinator.runBounded(
        boundedInput({
          key: keyFor({ p_query: "electricity" }),
          boundary: {
            async read() {
              return envelope("stale-public-data", 50_000 - 31_000);
            },
          },
          load: vi.fn<(signal: AbortSignal) => Promise<unknown>>(async () => {
            throw new PortalDataError("upstream_unavailable");
          }),
        }),
      ),
    ).rejects.toMatchObject({ code: "upstream_unavailable" });
  });

  it("serves a cached payload that is still inside the window", async () => {
    const load = vi.fn<(signal: AbortSignal) => Promise<unknown>>(async () => "fresh-origin");
    const result = await coordinatorWith({ now: () => 50_000 }).runBounded(
      boundedInput({
        key: keyFor({ p_query: "electricity" }),
        boundary: {
          async read() {
            return envelope("cached", 50_000 - 5_000);
          },
        },
        load,
      }),
    );

    expect(result.payload).toBe("cached");
    expect(result.consumer.outcome).toBe("cache");
    expect(result.consumer.loadedAtAgeMs).toBe(5_000);
    expect(load).not.toHaveBeenCalled();
  });

  it("awaits this call's own refresh instead of starting a second origin load", async () => {
    // The loader finishes before the boundary hands back its stale entry: the
    // completed refresh must be reused, never retried.
    const load = slowLoad(20, "fresh-origin");
    const coordinator = coordinatorWith({ now: () => 50_000 });
    const result = await coordinator.runBounded(
      boundedInput({
        key: keyFor({ p_query: "electricity" }),
        boundary: {
          async read(_key, _options, loader) {
            await loader();
            return envelope("stale", 50_000 - 31_000);
          },
        },
        load,
      }),
    );

    expect(result.payload).toBe("fresh-origin");
    expect(result.consumer.outcome).toBe("origin");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("routes a detached background refresh through admission and coalescing", async () => {
    const load = slowLoad(40, "fresh-origin");
    const coordinator = coordinatorWith({ now: () => 50_000 });
    const result = await coordinator.runBounded(
      boundedInput({
        key: keyFor({ p_query: "electricity" }),
        boundary: {
          async read(_key, _options, loader) {
            void loader();
            return envelope("stale", 50_000 - 31_000);
          },
        },
        load,
      }),
    );

    expect(result.payload).toBe("fresh-origin");
    expect(result.consumer.outcome).toBe("origin");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reports a cache outcome when the boundary returns an older entry than its own refresh", async () => {
    const load = slowLoad(40, "refreshed");
    const result = await coordinatorWith({ now: () => 50_000 }).runBounded(
      boundedInput({
        key: keyFor({ p_query: "electricity" }),
        boundary: {
          async read(_key, _options, loader) {
            void loader();
            return envelope("cached-entry", 50_000 - 1_000, "foreign1");
          },
        },
        load,
      }),
    );

    expect(result.payload).toBe("cached-entry");
    expect(result.consumer.outcome).toBe("cache");
    expect(result.consumer.gateWaitMs).toBe(0);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed or future-dated envelopes and loads a controlled refresh", async () => {
    const cases: PortalReadEnvelope[] = [
      {
        envelopeVersion: 1,
        loadedAtMs: Number.POSITIVE_INFINITY,
        originMarker: "m",
        payload: "bad",
      },
      { envelopeVersion: 1, loadedAtMs: 50_000 + 60_000, originMarker: "m", payload: "bad" },
      { envelopeVersion: 1, loadedAtMs: 50_000 - 1_000, originMarker: "", payload: "bad" },
      {
        envelopeVersion: 1,
        loadedAtMs: 50_000 - 1_000,
        originMarker: "x".repeat(17),
        payload: "bad",
      },
      {
        envelopeVersion: 2,
        loadedAtMs: 50_000 - 1_000,
        originMarker: "m",
        payload: "bad",
      } as unknown as PortalReadEnvelope,
    ];

    for (const malformed of cases) {
      const load = vi.fn<(signal: AbortSignal) => Promise<unknown>>(async () => "controlled");
      const result = await coordinatorWith({ now: () => 50_000 }).runBounded(
        boundedInput({
          key: keyFor({ p_query: "electricity" }),
          boundary: {
            async read() {
              return malformed;
            },
          },
          load,
        }),
      );
      expect(result.payload).toBe("controlled");
      expect(result.consumer.outcome).toBe("origin");
      expect(load).toHaveBeenCalledTimes(1);
    }
  });

  it("fails closed when a consumer's promise resolves after its deadline", async () => {
    let currentTime = 1_000;
    const coordinator = coordinatorWith({ now: () => currentTime });
    const load = vi.fn<(signal: AbortSignal) => Promise<unknown>>(async () => {
      currentTime = 5_000;
      return "late";
    });

    await expect(
      coordinator.runBounded(
        boundedInput({
          key: keyFor({ p_query: "electricity" }),
          deadlineMs: 1_030,
          load,
        }),
      ),
    ).rejects.toMatchObject({ code: "upstream_unavailable" });
  });

  it("clears a failed slot, suppresses refreshes inside the cooldown, and recovers after it", async () => {
    let currentTime = 1_000;
    let shouldFail = true;
    const load = vi.fn<(signal: AbortSignal) => Promise<unknown>>(async () => {
      if (shouldFail) throw new Error("origin down");
      return "recovered";
    });
    const coordinator = coordinatorWith({
      now: () => currentTime,
      cooldownMs: 500,
      admissionWaitMs: 5,
    });
    const run = () =>
      coordinator.runBounded(
        boundedInput({
          key: keyFor({ p_query: "electricity" }),
          deadlineMs: currentTime + 8_000,
          load,
        }),
      );

    await expect(run()).rejects.toMatchObject({ code: "upstream_unavailable" });
    expect(load).toHaveBeenCalledTimes(1);

    await expect(run()).rejects.toBeInstanceOf(PortalLocalShedError);
    expect(load).toHaveBeenCalledTimes(1);

    shouldFail = false;
    currentTime += 501;
    await expect(run()).resolves.toMatchObject({ payload: "recovered" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("rejects an origin payload that fails the shared write schema", async () => {
    await expect(
      coordinatorWith({ now: () => 1_000 }).runCoalesced({
        ...baseRead,
        key: keyFor({ p_query: "electricity" }),
        deadlineMs: 9_000,
        validate: (payload) => payload === "valid",
        load: async () => "invalid",
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("reclaims expired cooldowns so new keys retain failure protection", async () => {
    let currentTime = 1_000;
    const load = vi.fn<() => Promise<unknown>>(async () => {
      throw new Error("origin unavailable");
    });
    const coordinator = coordinatorWith({
      now: () => currentTime,
      cooldownMs: 500,
      maximumTrackedEntries: 2,
    });
    const run = (query: string) =>
      coordinator.runBounded(boundedInput({ key: keyFor({ p_query: query }), load }));
    await expect(run("first")).rejects.toBeInstanceOf(PortalDataError);
    await expect(run("second")).rejects.toBeInstanceOf(PortalDataError);
    currentTime += 501;
    await expect(run("third")).rejects.toBeInstanceOf(PortalDataError);
    await expect(run("third")).rejects.toMatchObject({ reason: "cooldown" });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("sheds a queued origin whose slot opens after its admission deadline", async () => {
    let currentTime = 1_000;
    let release: () => void = () => undefined;
    const onOrigin = vi.fn<NonNullable<PortalReadCoordinatorOptions["onOrigin"]>>();
    const coordinator = coordinatorWith({
      now: () => currentTime,
      maximumConcurrentOrigins: 1,
      admissionWaitMs: 20,
      onOrigin,
    });
    const first = coordinator.runBounded(
      boundedInput({
        key: keyFor({ p_query: "held" }),
        load: () =>
          new Promise((resolve) => {
            release = () => resolve("held");
          }),
      }),
    );
    await Promise.resolve();
    const load = vi.fn<() => Promise<unknown>>(async () => "too late");
    const queued = coordinator.runBounded(
      boundedInput({ key: keyFor({ p_query: "queued" }), load }),
    );
    const rejected = queued.then(
      () => ({ error: null }),
      (error: unknown) => ({ error }),
    );
    currentTime += 1_000;
    release();
    await first;
    await expect(rejected).resolves.toMatchObject({ error: { reason: "capacity" } });
    expect(load).not.toHaveBeenCalled();
    expect(onOrigin).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "capacity", gateWaitMs: 1_000 }),
    );
  });

  it("holds one slot, sheds a competitor, and lets it retry after release", async () => {
    const coordinator = coordinatorWith({ maximumConcurrentOrigins: 1, admissionWaitMs: 20 });
    const held = slowLoad(80, "held");
    const first = coordinator.runCoalesced({
      ...baseRead,
      key: keyFor({ p_query: "first" }),
      deadlineMs: Date.now() + 9_000,
      validate: () => true,
      load: held,
    });
    const competitor = coordinator.runCoalesced({
      ...baseRead,
      key: keyFor({ p_query: "second" }),
      deadlineMs: Date.now() + 9_000,
      validate: () => true,
      load: slowLoad(10, "second"),
    });

    await expect(competitor).rejects.toMatchObject({ reason: "capacity" });
    await expect(first).resolves.toMatchObject({ payload: "held" });

    // The shed attempt left no rejected entry behind for its key.
    const retry = await coordinator.runCoalesced({
      ...baseRead,
      key: keyFor({ p_query: "second" }),
      deadlineMs: Date.now() + 9_000,
      validate: () => true,
      load: slowLoad(10, "second"),
    });
    expect(retry.payload).toBe("second");
  });

  it("never evicts live work when the tracked-key ceiling is reached", async () => {
    const coordinator = coordinatorWith({
      maximumTrackedEntries: 2,
      maximumConcurrentOrigins: 4,
      admissionWaitMs: 5,
    });
    const first = coordinator.runCoalesced({
      ...baseRead,
      key: keyFor({ p_query: "tracked-1" }),
      deadlineMs: Date.now() + 9_000,
      validate: () => true,
      load: slowLoad(60, "one"),
    });
    const second = coordinator.runCoalesced({
      ...baseRead,
      key: keyFor({ p_query: "tracked-2" }),
      deadlineMs: Date.now() + 9_000,
      validate: () => true,
      load: slowLoad(60, "two"),
    });
    const third = coordinator.runCoalesced({
      ...baseRead,
      key: keyFor({ p_query: "tracked-3" }),
      deadlineMs: Date.now() + 9_000,
      validate: () => true,
      load: slowLoad(60, "three"),
    });

    await expect(third).rejects.toMatchObject({ reason: "capacity" });
    // The two live entries still coalesce instead of restarting their work.
    const joined = await coordinator.runCoalesced({
      ...baseRead,
      key: keyFor({ p_query: "tracked-1" }),
      deadlineMs: Date.now() + 9_000,
      validate: () => true,
      load: slowLoad(60, "one"),
    });
    expect(joined.payload).toBe("one");
    expect(joined.consumer.outcome).toBe("coalesced");
    await expect(first).resolves.toMatchObject({ payload: "one" });
    await expect(second).resolves.toMatchObject({ payload: "two" });
  });

  it("contains a throwing or rejecting origin observer", async () => {
    const coordinator = coordinatorWith({
      now: () => 1_000,
      onOrigin: () => {
        throw new Error("observer exploded");
      },
    });
    const load = vi.fn<(signal: AbortSignal) => Promise<unknown>>(async () => "payload");
    const result = await coordinator.runBounded(boundedInput({ load }));
    expect(result.payload).toBe("payload");

    const rejecting = coordinatorWith({
      now: () => 1_000,
      onOrigin: async () => {
        throw new Error("observer rejected");
      },
    });
    await expect(
      rejecting.runBounded(boundedInput({ load: slowLoad(5, "payload") })),
    ).resolves.toMatchObject({
      payload: "payload",
    });
  });

  it("reports the real admission wait instead of a copied zero", async () => {
    const coordinator = coordinatorWith({ maximumConcurrentOrigins: 1, admissionWaitMs: 500 });
    const held = slowLoad(80, "held");
    const first = coordinator.runCoalesced({
      ...baseRead,
      key: keyFor({ p_query: "wait-1" }),
      deadlineMs: Date.now() + 9_000,
      validate: () => true,
      load: held,
    });
    const second = coordinator.runCoalesced({
      ...baseRead,
      key: keyFor({ p_query: "wait-2" }),
      deadlineMs: Date.now() + 9_000,
      validate: () => true,
      load: slowLoad(5, "waited"),
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.consumer.gateWaitMs).toBe(0);
    expect(secondResult.consumer.gateWaitMs).toBeGreaterThan(20);
  });

  it("lets one consumer's deadline expire without cancelling the shared origin load", async () => {
    let currentTime = 1_000;
    const load = slowLoad(300, "shared");
    const coordinator = coordinatorWith({ now: () => currentTime });
    const shared = boundedInput({
      key: keyFor({ p_query: "electricity" }),
      deadlineMs: currentTime + 10,
      load,
    });

    await expect(coordinator.runBounded({ ...shared })).rejects.toMatchObject({
      code: "upstream_unavailable",
    });

    currentTime += 20;
    const late = await coordinator.runBounded({ ...shared, deadlineMs: currentTime + 5_000 });
    expect(late.payload).toBe("shared");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("validates constructor parameters", () => {
    for (const invalid of [
      { maximumConcurrentOrigins: 0 },
      { maximumConcurrentOrigins: Number.NaN },
      { maximumConcurrentOrigins: Number.POSITIVE_INFINITY },
      { maximumConcurrentOrigins: 1.5 },
      { maximumConcurrentOrigins: 100_000 },
      { admissionWaitMs: -1 },
      { admissionWaitMs: Number.POSITIVE_INFINITY },
      { cooldownMs: 60_001 },
      { maximumTrackedEntries: 0 },
    ]) {
      expect(() => createPortalReadCoordinator(invalid)).toThrow(RangeError);
    }

    expect(() => createPortalReadCoordinator({ maximumConcurrentOrigins: 1 })).not.toThrow();
  });
});
