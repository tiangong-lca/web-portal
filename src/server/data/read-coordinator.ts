import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { PortalDataError } from "./portal-data-error";

/**
 * Cache-boundary contract shared by the Portal RPC client and the Next runtime
 * adapter. The boundary owns persistence and revalidation; the coordinator owns
 * admission, coalescing, freshness enforcement and failure handling.
 */
export type PortalReadEnvelope = {
  readonly envelopeVersion: 1;
  readonly loadedAtMs: number;
  readonly originMarker: string;
  readonly payload: unknown;
};

export type PortalCacheBoundary = {
  read(
    key: string,
    options: { readonly revalidateSeconds: number; readonly tags: readonly string[] },
    loader: () => Promise<PortalReadEnvelope>,
  ): Promise<PortalReadEnvelope>;
};

export type PortalReadOutcome = "origin" | "coalesced" | "cache";

export type PortalOriginRecord = {
  readonly family: string;
  readonly rpcName: string;
  readonly marker: string;
  readonly status: "ok" | "error";
  readonly reason?: "capacity" | "cooldown" | "timeout" | "upstream";
  readonly durationMs: number;
  readonly gateWaitMs: number;
};

/** Observers never affect a read: throws and rejections are contained. */
export type PortalOriginObserver = (record: PortalOriginRecord) => void | Promise<void>;

export type PortalConsumerRecord = {
  readonly outcome: PortalReadOutcome;
  readonly loadedAtAgeMs: number;
  readonly originMarker: string;
  readonly gateWaitMs: number;
  readonly dedupeShared: boolean;
};

export type PortalReadResult = {
  readonly payload: unknown;
  readonly consumer: PortalConsumerRecord;
};

export type PortalReadCoordinator = {
  runBounded(input: {
    readonly key: string;
    readonly family: string;
    readonly rpcName: string;
    readonly revalidateSeconds: number;
    readonly tags: readonly string[];
    readonly timeoutMs: number;
    readonly deadlineMs: number;
    readonly boundary: PortalCacheBoundary;
    readonly validate: (payload: unknown) => boolean;
    readonly load: (signal: AbortSignal) => Promise<unknown>;
  }): Promise<PortalReadResult>;

  runCoalesced(input: {
    readonly key: string;
    readonly family: string;
    readonly rpcName: string;
    readonly timeoutMs: number;
    readonly deadlineMs: number;
    readonly validate: (payload: unknown) => boolean;
    readonly load: (signal: AbortSignal) => Promise<unknown>;
  }): Promise<PortalReadResult>;
};

export type PortalReadCoordinatorOptions = {
  now?: () => number;
  marker?: () => string;
  /** Per-instance, per-family ceiling on concurrent origin loads. */
  maximumConcurrentOrigins?: number;
  /** Bounded wait for an admission slot before shedding this consumer. */
  admissionWaitMs?: number;
  /** Bounded window that suppresses repeated failing refreshes for one key. */
  cooldownMs?: number;
  /** Hard ceiling on tracked in-flight keys; live work is never evicted. */
  maximumTrackedEntries?: number;
  onOrigin?: PortalOriginObserver;
};

const defaultMaximumConcurrentOrigins = 8;
const defaultAdmissionWaitMs = 1500;
const defaultCooldownMs = 2000;
const defaultMaximumTrackedEntries = 256;
const admissionPollMs = 25;
/** An envelope timestamp may lead the local clock by at most this much. */
const envelopeClockSkewMs = 1000;
/** Largest delay a runtime timer can hold; longer budgets skip the timer. */
const maximumTimerMilliseconds = 2_147_483_647;

/**
 * Local, instance-scoped shed signal. It never leaves this module's callers as
 * a distinguishable public error: the RPC client maps it onto the existing
 * `upstream_unavailable` contract and reports the local reason through
 * telemetry only.
 */
export class PortalLocalShedError extends Error {
  readonly reason: "capacity" | "cooldown";

  constructor(reason: "capacity" | "cooldown") {
    super(`portal local ${reason} shed`);
    this.name = "PortalLocalShedError";
    this.reason = reason;
  }
}

function defaultMarker(): string {
  return randomBytes(4).toString("hex");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}

function readBoundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return resolved;
}

/**
 * Canonical JSON mirroring `JSON.stringify` semantics with object keys sorted:
 * `undefined` object properties are dropped, `undefined` array items become
 * `null`, `toJSON` is honoured, and an own `__proto__` property stays an own
 * data property instead of touching the prototype.
 */
export function canonicalizeReadArguments(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  const withToJson = value as { toJSON?: unknown };
  if (typeof withToJson.toJSON === "function") {
    return canonicalizeReadArguments((withToJson.toJSON as () => unknown).call(value));
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeReadArguments(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalizeReadArguments(item)}`)
    .join(",")}}`;
}

/**
 * Stable key for one logical read. The identity binds the origin and the
 * publishable key, so entries are isolated per environment; neither value is
 * ever placed in a key, a log line, or a cache entry.
 */
export function portalReadKey(input: {
  readonly identity: string;
  readonly rpcName: string;
  readonly arguments_: Record<string, unknown>;
  readonly timeoutMs: number;
  readonly policy:
    | { readonly mode: "no-store" }
    | { readonly mode: "revalidate"; readonly seconds: number; readonly tags: readonly string[] };
}): string {
  const material = [
    "portal-read-v1",
    input.identity,
    input.rpcName,
    canonicalizeReadArguments(input.arguments_),
    String(input.timeoutMs),
    input.policy.mode,
    input.policy.mode === "revalidate" ? String(input.policy.seconds) : "",
    input.policy.mode === "revalidate" ? [...input.policy.tags].sort().join("\u0000") : "",
  ].join("\u0001");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export function portalReadIdentity(supabaseUrl: string, publishableKey: string): string {
  return createHash("sha256").update(`${supabaseUrl}\u0000${publishableKey}`, "utf8").digest("hex");
}

type OriginAttempt = {
  readonly promise: Promise<PortalReadEnvelope>;
  readonly marker: string;
  /** Shared with the running load so consumers read the real admission wait. */
  readonly gate: { waitMs: number };
  readonly dedupeShared: boolean;
};

export function createPortalReadCoordinator(
  options: PortalReadCoordinatorOptions = {},
): PortalReadCoordinator {
  const now = options.now ?? (() => Date.now());
  const marker = options.marker ?? defaultMarker;
  const maximumConcurrentOrigins = readBoundedInteger(
    options.maximumConcurrentOrigins,
    defaultMaximumConcurrentOrigins,
    1,
    1024,
    "maximumConcurrentOrigins",
  );
  const admissionWaitMs = readBoundedInteger(
    options.admissionWaitMs,
    defaultAdmissionWaitMs,
    0,
    60_000,
    "admissionWaitMs",
  );
  const cooldownMs = readBoundedInteger(
    options.cooldownMs,
    defaultCooldownMs,
    0,
    60_000,
    "cooldownMs",
  );
  const maximumTrackedEntries = readBoundedInteger(
    options.maximumTrackedEntries,
    defaultMaximumTrackedEntries,
    1,
    65_536,
    "maximumTrackedEntries",
  );

  const inflight = new Map<string, OriginAttempt>();
  const cooldowns = new Map<string, number>();
  const activeOrigins = new Map<string, number>();

  function notifyOrigin(record: PortalOriginRecord): void {
    const observer = options.onOrigin;
    if (observer === undefined) return;
    try {
      const result = observer(record);
      if (result !== undefined && typeof (result as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(result).catch(() => {
          // A failing observer must never surface as a failed read.
        });
      }
    } catch {
      // A throwing observer must never surface as a failed read.
    }
  }

  function activeCount(family: string): number {
    return activeOrigins.get(family) ?? 0;
  }

  function releaseOrigin(family: string): void {
    const current = activeCount(family);
    if (current <= 1) activeOrigins.delete(family);
    else activeOrigins.set(family, current - 1);
  }

  /**
   * Admission is bounded on its own; no consumer deadline bounds it, so a late
   * consumer of a shared entry can never inherit an earlier consumer's budget.
   */
  async function admit(family: string): Promise<number> {
    if (activeCount(family) < maximumConcurrentOrigins) {
      activeOrigins.set(family, activeCount(family) + 1);
      return 0;
    }
    const startedAt = now();
    const waitUntil = startedAt + admissionWaitMs;
    while (activeCount(family) >= maximumConcurrentOrigins) {
      if (now() >= waitUntil) {
        throw new PortalLocalShedError("capacity");
      }
      await sleep(Math.min(admissionPollMs, Math.max(1, waitUntil - now())));
      if (now() >= waitUntil) {
        throw new PortalLocalShedError("capacity");
      }
    }
    activeOrigins.set(family, activeCount(family) + 1);
    return now() - startedAt;
  }

  function cooldownRemaining(key: string): number {
    const until = cooldowns.get(key);
    if (until === undefined) return 0;
    const remaining = until - now();
    if (remaining <= 0) {
      cooldowns.delete(key);
      return 0;
    }
    return remaining;
  }

  function recordCooldown(key: string): void {
    if (cooldownMs === 0) return;
    const currentTime = now();
    for (const [trackedKey, until] of cooldowns) {
      if (until <= currentTime) cooldowns.delete(trackedKey);
    }
    // A full table stops recording new windows instead of evicting a window
    // that still protects a failing origin.
    if (cooldowns.size >= maximumTrackedEntries) return;
    cooldowns.set(key, currentTime + cooldownMs);
  }

  /**
   * Starts, joins or sheds one controlled origin load. Only a shed throws
   * synchronously; every other outcome is carried by the returned promise.
   */
  function startOrigin(input: {
    readonly key: string;
    readonly family: string;
    readonly rpcName: string;
    readonly timeoutMs: number;
    readonly validate: (payload: unknown) => boolean;
    readonly load: (signal: AbortSignal) => Promise<unknown>;
  }): OriginAttempt {
    const existing = inflight.get(input.key);
    if (existing !== undefined) {
      return { ...existing, dedupeShared: true };
    }
    if (cooldownRemaining(input.key) > 0) {
      notifyOrigin({
        family: input.family,
        rpcName: input.rpcName,
        marker: "-",
        status: "error",
        reason: "cooldown",
        durationMs: 0,
        gateWaitMs: 0,
      });
      throw new PortalLocalShedError("cooldown");
    }
    if (inflight.size >= maximumTrackedEntries) {
      notifyOrigin({
        family: input.family,
        rpcName: input.rpcName,
        marker: "-",
        status: "error",
        reason: "capacity",
        durationMs: 0,
        gateWaitMs: 0,
      });
      throw new PortalLocalShedError("capacity");
    }

    const markerValue = marker();
    const gate = { waitMs: 0 };
    const loadStartedAt = now();
    let self: OriginAttempt | null = null;
    const promise = (async (): Promise<PortalReadEnvelope> => {
      let slotHeld = false;
      try {
        gate.waitMs = await admit(input.family);
        slotHeld = true;

        const payload = await input.load(AbortSignal.timeout(input.timeoutMs));
        if (!input.validate(payload)) {
          throw new PortalDataError("invalid_response");
        }
        cooldowns.delete(input.key);
        notifyOrigin({
          family: input.family,
          rpcName: input.rpcName,
          marker: markerValue,
          status: "ok",
          durationMs: now() - loadStartedAt,
          gateWaitMs: gate.waitMs,
        });
        return {
          envelopeVersion: 1,
          loadedAtMs: now(),
          originMarker: markerValue,
          payload,
        };
      } catch (error) {
        if (!slotHeld) gate.waitMs = Math.max(0, now() - loadStartedAt);
        const shed = error instanceof PortalLocalShedError ? error.reason : null;
        if (shed === null) {
          recordCooldown(input.key);
        }
        notifyOrigin({
          family: input.family,
          rpcName: input.rpcName,
          marker: markerValue,
          status: "error",
          reason:
            shed ??
            (error instanceof Error && error.name === "TimeoutError" ? "timeout" : "upstream"),
          durationMs: now() - loadStartedAt,
          gateWaitMs: gate.waitMs,
        });
        if (error instanceof PortalDataError || error instanceof PortalLocalShedError) {
          throw error;
        }
        throw new PortalDataError("upstream_unavailable");
      } finally {
        // Every exit path — including a shed before admission — leaves no
        // rejected entry behind and releases only a slot it actually holds.
        if (slotHeld) releaseOrigin(input.family);
        if (inflight.get(input.key) === self) inflight.delete(input.key);
      }
    })();

    const attempt: OriginAttempt = { promise, marker: markerValue, gate, dedupeShared: false };
    self = attempt;
    inflight.set(input.key, attempt);
    return attempt;
  }

  function windowMsOf(revalidateSeconds: number): number {
    return Number.isFinite(revalidateSeconds) && revalidateSeconds > 0
      ? revalidateSeconds * 1000
      : 0;
  }

  function usableEnvelope(value: unknown): PortalReadEnvelope | null {
    if (value === null || typeof value !== "object") return null;
    const candidate = value as Partial<PortalReadEnvelope>;
    if (candidate.envelopeVersion !== 1) return null;
    const loadedAtMs = candidate.loadedAtMs;
    if (typeof loadedAtMs !== "number" || !Number.isFinite(loadedAtMs) || loadedAtMs <= 0) {
      return null;
    }
    if (loadedAtMs > now() + envelopeClockSkewMs) return null;
    const originMarker = candidate.originMarker;
    if (typeof originMarker !== "string" || originMarker.length === 0 || originMarker.length > 16) {
      return null;
    }
    return { envelopeVersion: 1, loadedAtMs, originMarker, payload: candidate.payload };
  }

  function withDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
    const remaining = deadlineMs - now();
    if (remaining <= 0) {
      promise.catch(() => undefined);
      return Promise.reject(new PortalDataError("upstream_unavailable"));
    }
    if (remaining > maximumTimerMilliseconds) {
      // The budget is longer than the runtime can schedule; the promise itself
      // bounds the wait, and the deadline is still re-checked on resolution.
      return promise.then((value) => {
        if (now() > deadlineMs) throw new PortalDataError("upstream_unavailable");
        return value;
      });
    }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new PortalDataError("upstream_unavailable"));
      }, remaining);
      promise.then(
        (value) => {
          clearTimeout(timer);
          // A delayed timer must not let a consumer succeed past its budget.
          if (now() > deadlineMs) reject(new PortalDataError("upstream_unavailable"));
          else resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  function resultOf(envelope: PortalReadEnvelope, attempt: OriginAttempt | null): PortalReadResult {
    // The payload counts as this call's own load only when the envelope marker
    // matches it: a boundary may have started a refresh and still returned an
    // older entry.
    const own = attempt !== null && envelope.originMarker === attempt.marker;
    return {
      payload: envelope.payload,
      consumer: {
        outcome: own ? (attempt.dedupeShared ? "coalesced" : "origin") : "cache",
        loadedAtAgeMs: Math.max(0, now() - envelope.loadedAtMs),
        originMarker: envelope.originMarker,
        gateWaitMs: own ? attempt.gate.waitMs : 0,
        dedupeShared: own ? attempt.dedupeShared : false,
      },
    };
  }

  return {
    async runBounded(input) {
      let attempt: OriginAttempt | null = null;
      const loader = (): Promise<PortalReadEnvelope> => {
        attempt ??= startOrigin(input);
        return attempt.promise;
      };

      const served = await withDeadline(
        input.boundary.read(
          input.key,
          { revalidateSeconds: input.revalidateSeconds, tags: input.tags },
          loader,
        ),
        input.deadlineMs,
      );

      const envelope = usableEnvelope(served);
      if (envelope !== null && now() - envelope.loadedAtMs <= windowMsOf(input.revalidateSeconds)) {
        return resultOf(envelope, attempt);
      }

      // Stale, future-dated or malformed: this call waits for its own controlled
      // refresh. A loader the boundary already started is awaited, never
      // retried, so one stale window costs at most one origin load.
      const controlled = attempt ?? startOrigin(input);
      const fresh = usableEnvelope(await withDeadline(controlled.promise, input.deadlineMs));
      if (fresh === null) {
        throw new PortalDataError("invalid_response");
      }
      return resultOf(fresh, controlled);
    },

    async runCoalesced(input) {
      const attempt = startOrigin(input);
      const envelope = usableEnvelope(await withDeadline(attempt.promise, input.deadlineMs));
      if (envelope === null) {
        throw new PortalDataError("invalid_response");
      }
      return resultOf(envelope, attempt);
    },
  };
}
