// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  getPublicCatalogSummary,
  getPublicDataset,
  getPublicFacets,
  getPublicSitemapManifest,
  getPublicSitemapShard,
  listPublicDatasetVersions,
  listPublicProcessExchanges,
  searchPublicFlows,
  searchPublicProcesses,
} from "@/server/data/catalog";
import { readPortalDataEnvironment } from "@/server/data/environment";
import { PortalDataError, type PortalRpcClient } from "@/server/data/supabase-rpc";

const liveDescribe = process.env.PORTAL_LIVE_PROBE === "true" ? describe : describe.skip;
const forbiddenCardKeys = new Set([
  "actor",
  "authorization",
  "cookie",
  "data_source",
  "embedding",
  "json",
  "locator",
  "model_id",
  "object_path",
  "service_role",
  "state",
  "state_code",
  "team",
  "team_id",
  "user_id",
]);

function collectForbiddenKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectForbiddenKeys(item, found);
    return found;
  }
  if (value === null || typeof value !== "object") return found;
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenCardKeys.has(key.toLowerCase())) found.add(key);
    collectForbiddenKeys(nested, found);
  }
  return found;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? Number.POSITIVE_INFINITY;
}

liveDescribe("Portal Production anonymous R1 contracts", () => {
  it("keeps real public paths complete, bounded, locator-free, and fail-closed", async () => {
    const summary = await getPublicCatalogSummary();
    expect(summary.counts.process).toBeGreaterThan(0);
    expect(summary.counts.flow).toBeGreaterThan(0);
    expect(summary.counts.total).toBe(summary.counts.process + summary.counts.flow);
    expect(summary.latestModifiedAt).not.toBeNull();
    expect(summary.examples.length).toBeGreaterThan(0);
    expect(summary.examples.length).toBeLessThanOrEqual(3);
    expect(collectForbiddenKeys(summary)).toEqual(new Set());

    const queryFor = (kind: "process" | "flow") =>
      summary.examples.find((example) => example.datasetKind === kind)?.query ?? "";
    const processQuery = queryFor("process");
    const flowQuery = queryFor("flow");
    const processSamples: number[] = [];
    const flowSamples: number[] = [];
    let processPage: Awaited<ReturnType<typeof searchPublicProcesses>> | undefined;
    let flowPage: Awaited<ReturnType<typeof searchPublicFlows>> | undefined;
    for (let sample = 0; sample < 20; sample += 1) {
      let startedAt = performance.now();
      processPage = await searchPublicProcesses({ query: processQuery, limit: 50 });
      processSamples.push(performance.now() - startedAt);
      startedAt = performance.now();
      flowPage = await searchPublicFlows({ query: flowQuery, limit: 50 });
      flowSamples.push(performance.now() - startedAt);
    }
    expect(percentile(processSamples, 0.95)).toBeLessThan(2000);
    expect(percentile(flowSamples, 0.95)).toBeLessThan(2000);
    expect(Math.max(...processSamples)).toBeLessThan(8000);
    expect(Math.max(...flowSamples)).toBeLessThan(8000);
    expect(processPage?.items.length).toBeGreaterThan(0);
    expect(flowPage?.items.length).toBeGreaterThan(0);
    expect(collectForbiddenKeys(processPage)).toEqual(new Set());
    expect(collectForbiddenKeys(flowPage)).toEqual(new Set());

    const pages = [processPage!, flowPage!];
    const accessLevels = new Set(
      pages.flatMap((page) => page.items.map((item) => item.accessLevel)),
    );
    expect(accessLevels.size).toBeGreaterThan(0);
    for (const accessLevel of accessLevels) {
      expect(["open", "metadata_only"]).toContain(accessLevel);
    }
    for (const example of summary.examples) {
      let page;
      try {
        page =
          example.datasetKind === "process"
            ? await searchPublicProcesses({ query: example.query, limit: 50 })
            : await searchPublicFlows({ query: example.query, limit: 50 });
      } catch (error) {
        if (error instanceof PortalDataError) {
          throw new Error(
            `Production catalog example failed: ${example.queryKind}/${example.datasetKind}/${error.code}`,
          );
        }
        throw error;
      }
      expect(page.items.length).toBeGreaterThan(0);
    }

    for (const page of pages) {
      const item = page.items[0]!;
      const dataset = await getPublicDataset(item.key);
      expect(dataset?.key).toEqual(item.key);
      const versions = await listPublicDatasetVersions({ kind: item.key.kind, id: item.key.id });
      expect(versions.items.some((version) => version.key.version === item.key.version)).toBe(true);
      const facets = await getPublicFacets({ kind: item.key.kind, query: "" });
      expect(facets.kind).toBe(item.key.kind);
    }

    const broadProcessPage = await searchPublicProcesses({ query: "", limit: 50 });
    const exchangeCandidate = broadProcessPage.items.find(
      (item) => item.capabilities.exchangesVisible,
    );
    expect(exchangeCandidate).toBeDefined();
    const exchanges = await listPublicProcessExchanges({
      processId: exchangeCandidate!.key.id,
      processVersion: exchangeCandidate!.key.version,
      limit: 50,
    });
    expect(exchanges?.process).toEqual({
      id: exchangeCandidate!.key.id,
      version: exchangeCandidate!.key.version,
    });

    const manifest = await getPublicSitemapManifest();
    expect(manifest.shards).toHaveLength(64);
    for (const descriptor of [manifest.shards[0]!, manifest.shards.at(-1)!]) {
      const shard = await getPublicSitemapShard({ shardCursor: descriptor.shardCursor });
      expect(shard.shardCursor).toBe(descriptor.shardCursor);
    }

    let rejectedClientCalls = 0;
    const rejectedClient: PortalRpcClient = {
      call: () => {
        rejectedClientCalls += 1;
        return Promise.reject(new Error("network must not be reached"));
      },
    };
    await expect(
      searchPublicProcesses(
        { query: processQuery, state: 20, team_id: "forbidden" } as never,
        rejectedClient,
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(rejectedClientCalls).toBe(0);
    await expect(
      getPublicDataset({ kind: "process", id: "not-a-uuid", version: "01.00.000" }),
    ).rejects.toBeInstanceOf(PortalDataError);
    await expect(
      getPublicDataset({
        kind: "process",
        id: "99999999-9999-4999-8999-999999999999",
        version: "99.99.999",
      }),
    ).resolves.toBeNull();

    const environment = readPortalDataEnvironment();
    const forgedRpc = await fetch(
      new URL("/rest/v1/rpc/portal_search_processes_v4", environment.supabaseUrl),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          apikey: environment.publishableKey,
          "content-profile": "api",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_query: processQuery,
          p_filters: {},
          p_sort: "relevance",
          p_cursor: null,
          p_limit: 1,
          p_state: 20,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(environment.timeoutMilliseconds),
      },
    );
    expect(forgedRpc.ok).toBe(false);

    console.log(
      JSON.stringify({
        schemaVersion: "portal.production-r1-probe.v1",
        counts: summary.counts,
        examples: summary.examples.length,
        accessLevels: [...accessLevels].sort((left, right) => left.localeCompare(right)),
        processSearchP95Ms: Math.round(percentile(processSamples, 0.95)),
        flowSearchP95Ms: Math.round(percentile(flowSamples, 0.95)),
        processSearchMaxMs: Math.round(Math.max(...processSamples)),
        flowSearchMaxMs: Math.round(Math.max(...flowSamples)),
        processItems: processPage!.items.length,
        flowItems: flowPage!.items.length,
        exchangeRows: exchanges?.rows.length ?? 0,
        sitemapShards: manifest.shards.length,
        forgedRpcStatus: forgedRpc.status,
      }),
    );
  }, 120_000);
});
