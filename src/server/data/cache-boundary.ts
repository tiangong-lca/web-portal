import "server-only";

import { unstable_cache } from "next/cache";

import { createPortalInstanceCacheBoundary } from "./instance-cache";
import type { PortalCacheBoundary } from "./read-coordinator";

/**
 * Next data-cache adapter for the bounded Portal reads.
 *
 * The boundary deliberately wraps the coordinator loader instead of a raw
 * `fetch`: when the stored entry is stale the runtime re-runs this loader, so
 * admission control, coalescing, cooldowns and the origin timeout stay in
 * force for background refreshes as well. It is the same Incremental Cache the
 * previous `fetch(..., { cache: "force-cache", next: { revalidate, tags } })`
 * policy used. A bounded instance tier inside this loader reuses successful
 * envelopes when the hosted cache misses; it never extends their loadedAt.
 * Only the Next tier participates in framework tag invalidation.
 *
 * `key` is already an environment-scoped hash (origin + publishable key); it is
 * the only key material, and
 * no call arguments are passed as `unstable_cache` arguments. Application keys
 * and JSON logs contain no query text or identifier lists; provider/framework
 * request-path diagnostics are a separate logging surface.
 */
const nextBoundary: PortalCacheBoundary = {
  async read(key, { revalidateSeconds, tags }, loader) {
    const cached = unstable_cache(loader, [key], {
      revalidate: revalidateSeconds,
      tags: [...tags],
    });
    return await cached();
  },
};

export const portalNextDataCacheBoundary = createPortalInstanceCacheBoundary(nextBoundary);
