import "server-only";

import { Buffer } from "node:buffer";

import type { PortalCacheBoundary, PortalReadEnvelope } from "./read-coordinator";

type Entry = { serialized: string; bytes: number; loadedAtMs: number };

/** A bounded second tier for a runtime whose Next cache does not persist writes. */
export function createPortalInstanceCacheBoundary(
  runtime: PortalCacheBoundary,
  options: { now?: () => number; maximumEntries?: number; maximumBytes?: number } = {},
): PortalCacheBoundary {
  const now = options.now ?? Date.now;
  const maximumEntries = options.maximumEntries ?? 256;
  const maximumBytes = options.maximumBytes ?? 16 * 1024 * 1024;
  for (const [bound, ceiling] of [
    [maximumEntries, 4096],
    [maximumBytes, 64 * 1024 * 1024],
  ] as const) {
    if (!Number.isSafeInteger(bound) || bound <= 0 || bound > ceiling) {
      throw new RangeError("Invalid cache bound");
    }
  }
  const entries = new Map<string, Entry>();
  let storedBytes = 0;

  function remove(key: string): void {
    const entry = entries.get(key);
    if (entry) storedBytes -= entry.bytes;
    entries.delete(key);
  }

  function fresh(loadedAtMs: number, windowMs: number): boolean {
    const age = now() - loadedAtMs;
    return Number.isFinite(loadedAtMs) && loadedAtMs > 0 && age >= 0 && age < windowMs;
  }

  function read(key: string, windowMs: number): PortalReadEnvelope | null {
    const entry = entries.get(key);
    if (!entry) return null;
    if (!fresh(entry.loadedAtMs, windowMs)) {
      remove(key);
      return null;
    }
    // Read copies never share mutable payload objects with callers.
    let envelope: PortalReadEnvelope;
    try {
      envelope = JSON.parse(entry.serialized) as PortalReadEnvelope;
    } catch {
      remove(key);
      return null;
    }
    entries.delete(key);
    entries.set(key, entry);
    return envelope;
  }

  function write(key: string, envelope: PortalReadEnvelope, windowMs: number): void {
    if (
      envelope.envelopeVersion !== 1 ||
      typeof envelope.originMarker !== "string" ||
      envelope.originMarker.length === 0 ||
      envelope.originMarker.length > 16 ||
      !fresh(envelope.loadedAtMs, windowMs)
    )
      return;

    let serialized: string;
    try {
      serialized = JSON.stringify(envelope);
    } catch {
      // An optional cache cannot make an otherwise valid read fail.
      return;
    }
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes > maximumBytes) return;
    // Expired entries must not crowd out current public data. The policy is
    // already part of each key; 30 seconds is the absolute local ceiling.
    for (const [oldKey, entry] of entries) {
      if (!fresh(entry.loadedAtMs, 30_000)) remove(oldKey);
    }
    remove(key);
    while (entries.size >= maximumEntries || storedBytes + bytes > maximumBytes) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      remove(oldest);
    }
    entries.set(key, { serialized, bytes, loadedAtMs: envelope.loadedAtMs });
    storedBytes += bytes;
  }

  return {
    async read(key, policy, loader) {
      const windowMs = Number.isFinite(policy.revalidateSeconds)
        ? Math.min(30, Math.max(0, policy.revalidateSeconds)) * 1000
        : 0;
      let instanceHit: PortalReadEnvelope | null = null;
      const served = await runtime.read(key, policy, async () => {
        instanceHit = read(key, windowMs);
        if (instanceHit) return instanceHit;
        // The coordinator validates the fixed RPC write schema before resolve.
        const loaded = await loader();
        write(key, loaded, windowMs);
        return loaded;
      });
      const envelope =
        served !== null && typeof served === "object" && "envelope" in served
          ? served.envelope
          : served;
      // Identity distinguishes an actual local return from a Next cached copy
      // even if a background loader also inspected the local tier.
      return { envelope, cacheSource: envelope === instanceHit ? "instance" : "runtime" };
    },
  };
}
