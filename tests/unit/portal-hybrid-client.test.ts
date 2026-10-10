import { describe, expect, it, vi } from "vitest";

import catalogFixture from "../fixtures/portal/catalog-v1.json";
import environmentFixture from "../fixtures/portal/r1-environments.json";
import { hybridVersionPage } from "../fixtures/portal/hybrid-v2";

import type { PortalHybridSearchRequest } from "@/lib/hybrid-request";
import {
  portalHybridFunctionPath,
  PortalHybridInputError,
  queryPortalHybrid,
  queryPortalHybridRaw,
} from "@/server/hybrid/client";
import {
  portalHybridEdgeTimeoutMilliseconds,
  readPortalHybridEnvironment,
} from "@/server/hybrid/environment";
import { readPortalLciaEnvironment } from "@/server/lcia/environment";

const request: PortalHybridSearchRequest = {
  schemaVersion: "portal.hybrid-search-request.v1",
  kind: "process",
  query: "low-carbon steel",
  filters: {},
  limit: 10,
};

const environment = {
  supabaseUrl: "https://project.supabase.co",
  publishableKey: environmentFixture.preview.publishableKey,
  timeoutMilliseconds: 2000,
  dataBrandScope: {
    allowedBrandCodes: ["tiangong_lca"] as const,
    identity: "portal-display-scope.v1:tiangong_lca",
  },
  edgeOrigin: "https://project.supabase.co",
  keyId: environmentFixture.preview.keyId,
  secret: environmentFixture.preview.hmacSecret,
  edgeTimeoutMilliseconds: 2000,
};

function edgePage() {
  return {
    schemaVersion: "portal.hybrid-search-page.v1",
    kind: "process",
    queryFingerprint: "a".repeat(64),
    interpretation: {
      source: "model_generated",
      advisory: true,
      semanticQuery: "low carbon steel production",
      terms: [{ language: "en", value: "steel production" }],
    },
    items: catalogFixture.search.items.map((item, index) => ({
      ...item,
      match: {
        kind: "hybrid",
        algorithmVersion: "portal-hybrid-rank-v1",
        score: index === 0 ? 0.9 : 0.8,
        reasonCodes: ["lexical_public_projection", "semantic_public_projection"],
        evidence: {
          lexicalRank: index + 1,
          semanticRank: index + 1,
          semanticDistance: index === 0 ? "0.125" : "0.25",
        },
      },
    })),
  };
}

describe("Portal Hybrid signed client", () => {
  it("does not sign or call the provider path after its incoming request was cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImplementation = vi.fn<typeof fetch>();
    await expect(
      queryPortalHybrid(request, { environment, signal: controller.signal, fetchImplementation }),
    ).resolves.toEqual({ status: "fallback", reason: "hybrid_upstream_unavailable" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("binds V2 requests to the grouped version-aware response, never an old V1 page", async () => {
    const versionRequest = {
      ...request,
      schemaVersion: "portal.hybrid-search-request.v2" as const,
      cursor: null,
    };
    const result = await queryPortalHybrid(versionRequest, {
      environment,
      fetchImplementation: vi.fn<typeof fetch>(async () => Response.json(hybridVersionPage())),
    });
    expect(result).toMatchObject({
      status: "available",
      data: { datasetCount: 1, candidateCount: 2, versionGroups: [{ matches: [{}, {}] }] },
    });
    await expect(
      queryPortalHybrid(versionRequest, {
        environment,
        fetchImplementation: vi.fn<typeof fetch>(async () => Response.json(edgePage())),
      }),
    ).resolves.toEqual({ status: "fallback", reason: "contract_failure" });
  });

  it("rejects mismatched, unordered, missing or excessive version membership", async () => {
    const mutations = [
      (page: ReturnType<typeof hybridVersionPage>) => {
        page.versionGroups[0]!.matches[1]!.key.id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      },
      (page: ReturnType<typeof hybridVersionPage>) => {
        page.versionGroups[0]!.matches[1]!.match.score = 1;
      },
      (page: ReturnType<typeof hybridVersionPage>) => {
        page.versionGroups[0]!.matches.pop();
      },
      (page: ReturnType<typeof hybridVersionPage>) => {
        page.candidateCount = 401;
      },
      (page: ReturnType<typeof hybridVersionPage>) => {
        page.items[0]!.match.evidence.semanticRank = 201;
      },
      (page: ReturnType<typeof hybridVersionPage>) => {
        page.nextCursor = "not/a/cursor";
      },
    ];
    for (const mutate of mutations) {
      const page = hybridVersionPage();
      mutate(page);
      await expect(
        queryPortalHybrid(
          { ...request, schemaVersion: "portal.hybrid-search-request.v2", cursor: null },
          {
            environment,
            fetchImplementation: vi.fn<typeof fetch>(async () => Response.json(page)),
          },
        ),
      ).resolves.toEqual({ status: "fallback", reason: "contract_failure" });
    }
  });

  it("rejects out-of-order V2 representatives, including equal-score id ties", async () => {
    const page = hybridVersionPage();
    const second = structuredClone(page.items[0]!);
    second.key.id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    second.match.score = 0.8;
    page.items.push(second);
    page.versionGroups.push({
      key: second.key,
      matches: [{ key: second.key, brand: second.brand, match: second.match }],
    });
    page.candidateCount = 3;
    page.datasetCount = 2;
    const check = () =>
      queryPortalHybrid(
        { ...request, schemaVersion: "portal.hybrid-search-request.v2", cursor: null },
        { environment, fetchImplementation: vi.fn<typeof fetch>(async () => Response.json(page)) },
      );
    await expect(check()).resolves.toMatchObject({ status: "available" });
    second.match.score = page.items[0]!.match.score;
    await expect(check()).resolves.toMatchObject({ status: "available" });
    page.items.reverse();
    page.versionGroups.reverse();
    await expect(check()).resolves.toEqual({ status: "fallback", reason: "contract_failure" });
    second.match.score = 1;
    await expect(check()).resolves.toMatchObject({ status: "available" });
    page.items.reverse();
    page.versionGroups.reverse();
    await expect(check()).resolves.toEqual({ status: "fallback", reason: "contract_failure" });
  });

  it("uses a dedicated bounded Hybrid timeout without widening LCIA", () => {
    const runtimeEnvironment = {
      PORTAL_DATA_BRANDS: "tiangong_lca",
      SUPABASE_URL: environment.supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: environment.publishableKey,
      PORTAL_EDGE_ENDPOINT: environment.edgeOrigin,
      PORTAL_EDGE_KEY_ID: environment.keyId,
      PORTAL_EDGE_HMAC_SECRET: environment.secret,
      PORTAL_EDGE_TIMEOUT_MS: "8000",
    };

    expect(readPortalHybridEnvironment(runtimeEnvironment).edgeTimeoutMilliseconds).toBe(
      portalHybridEdgeTimeoutMilliseconds,
    );
    expect(readPortalLciaEnvironment(runtimeEnvironment).edgeTimeoutMilliseconds).toBe(8000);
    expect(
      readPortalHybridEnvironment({
        ...runtimeEnvironment,
        PORTAL_HYBRID_EDGE_TIMEOUT_MS: "25000",
      }).edgeTimeoutMilliseconds,
    ).toBe(25000);
    expect(() =>
      readPortalHybridEnvironment({
        ...runtimeEnvironment,
        PORTAL_HYBRID_EDGE_TIMEOUT_MS: "30001",
      }),
    ).toThrow("Portal Hybrid Edge timeout must not exceed 30000 ms");
  });

  it("signs the exact raw body for the fixed Hybrid path and validates success", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBeInstanceOf(URL);
      expect((input as URL).toString()).toBe(
        `https://project.supabase.co${portalHybridFunctionPath}`,
      );
      expect(init?.method).toBe("POST");
      expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(
        JSON.stringify({
          ...request,
          schemaVersion: "portal.hybrid-search-request.v3",
          cursor: null,
          allowedBrandCodes: ["tiangong_lca"],
        }),
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe(environment.publishableKey);
      expect(headers.get("x-portal-key-id")).toBe(environment.keyId);
      expect(headers.get("x-portal-signature")).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(headers.get("x-portal-correlation-id")).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      return Response.json(hybridVersionPage());
    });

    await expect(
      queryPortalHybrid(request, {
        environment,
        fetchImplementation,
        now: () => 1_800_000_000_000,
        nonce: () => "AAAAAAAAAAAAAAAAAAAAAA",
        correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).resolves.toMatchObject({ status: "available", data: { items: [{ context: {} }] } });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("maps fixed Edge failures without forwarding private messages", async () => {
    for (const code of [
      "hybrid_disabled",
      "guard_unavailable",
      "budget_exhausted",
      "concurrency_exhausted",
      "circuit_open",
      "hybrid_timeout",
    ] as const) {
      const result = await queryPortalHybrid(request, {
        environment,
        fetchImplementation: vi.fn<typeof fetch>(async () =>
          Response.json({ code, message: "private provider and locator details" }, { status: 503 }),
        ),
      });
      expect(result).toEqual({ status: "fallback", reason: code });
      expect(JSON.stringify(result)).not.toContain("private provider");
    }
  });

  it("fails malformed or context-drifted success responses to lexical fallback", async () => {
    const malformed = edgePage();
    delete (malformed.items[0] as Partial<(typeof malformed.items)[number]>).context;
    await expect(
      queryPortalHybrid(request, {
        environment,
        fetchImplementation: vi.fn<typeof fetch>(async () => Response.json(malformed)),
      }),
    ).resolves.toEqual({ status: "fallback", reason: "contract_failure" });
  });

  it("rejects client-shaped extra fields before signing or fetch", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    await expect(
      queryPortalHybridRaw(
        new TextEncoder().encode(JSON.stringify({ ...request, embedding: [0.1] })),
        { environment, fetchImplementation },
      ),
    ).rejects.toBeInstanceOf(PortalHybridInputError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("falls back when server-only Edge configuration is absent", async () => {
    await expect(
      queryPortalHybrid(request, {
        fetchImplementation: vi.fn<typeof fetch>(),
      }),
    ).resolves.toEqual({ status: "fallback", reason: "hybrid_upstream_unavailable" });
  });
});
