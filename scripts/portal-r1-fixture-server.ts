import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

import { navigationFixture, filterNavigationFixture } from "./portal-navigation-fixture";
import catalogFixture from "../tests/fixtures/portal/catalog-v1.json";
import environmentFixture from "../tests/fixtures/portal/r1-environments.json";

export type PortalR1FixtureEnvironmentName = keyof typeof environmentFixture;

type FixtureRequestReceipt = {
  bodyBytes: number;
  bodySha256: string;
  correlationId?: string;
  keyId?: string;
  name?: string;
};

type FixtureRpcReceipt = {
  count: number;
  receipt: FixtureRequestReceipt;
};

export type PortalR1FixtureReceipts = {
  rpcAccepted: number;
  rpcByName: Record<string, number>;
  lciaAccepted: number;
  hybridAccepted: number;
  rejected: number;
  lastRpc: FixtureRequestReceipt | null;
  lastLcia: FixtureRequestReceipt | null;
  lastHybrid: FixtureRequestReceipt | null;
};

type StartOptions = {
  environment: PortalR1FixtureEnvironmentName;
  host?: string;
  port?: number;
};

export type PortalR1FixtureServer = {
  environment: PortalR1FixtureEnvironmentName;
  origin: string;
  receipts: PortalR1FixtureReceipts;
  close(): Promise<void>;
};

const maximumRequestBytes = 64 * 1024;
const maximumCorrelationReceipts = 128;
const portalDataProductPath = "/functions/v1/portal_data_product_results_v1";
const portalHybridPath = "/functions/v1/portal_hybrid_search_v1";
const secondProcessId = "77777777-7777-7777-7777-777777777777";
const requiredLciaKeys = ["cursor", "impactCategoryId", "limit", "mode", "processRefs"];
const forbiddenRpcKeys = new Set([
  "actor",
  "authorization",
  "service_role",
  "state",
  "state_code",
  "team",
  "team_id",
  "user_id",
]);

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": String(body.byteLength),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

async function readRawBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > maximumRequestBytes) {
      throw new Error("fixture_body_too_large");
    }
    chunks.push(bytes);
  }

  return Buffer.concat(chunks);
}

function bodyReceipt(rawBody: Buffer): FixtureRequestReceipt {
  return {
    bodyBytes: rawBody.byteLength,
    bodySha256: createHash("sha256").update(rawBody).digest("hex"),
  };
}

function parseJsonObject(rawBody: Buffer): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenKey);
  }
  if (value === null || typeof value !== "object") {
    return false;
  }

  return Object.entries(value).some(
    ([key, nested]) => forbiddenRpcKeys.has(key.toLowerCase()) || containsForbiddenKey(nested),
  );
}

function hasForbiddenCredential(request: IncomingMessage): boolean {
  return request.headers.authorization !== undefined || request.headers.cookie !== undefined;
}

function processSearchResponse() {
  const firstItem = {
    ...catalogFixture.search.items[0]!,
    // Synthetic preview content, never injected into a production response.
    summary: [
      {
        language: "zh-CN",
        value: "用于本地界面预览的电力供应示例，展示发电背景与电网输配电过程的描述摘要。",
      },
      {
        language: "en",
        value:
          "Synthetic electricity supply example for local UI preview, covering generation and grid transmission and distribution.",
      },
    ],
  };
  return {
    ...catalogFixture.search,
    items: [
      firstItem,
      {
        ...firstItem,
        key: { ...firstItem.key, id: secondProcessId },
        names: [{ language: "en", value: "Electricity, low voltage" }],
        match: { ...firstItem.match, score: 0.8 },
      },
    ],
  };
}

function processDataset(id: string, name: string) {
  return {
    ...catalogFixture.datasetProcess,
    key: { ...catalogFixture.datasetProcess.key, id },
    metadata: {
      ...catalogFixture.datasetProcess.metadata,
      names: [{ language: "en", value: name }],
      cutoffRules: [{ language: "en", value: "Cutoff 1%" }],
    },
  };
}

function secondProcessDataset() {
  return processDataset(secondProcessId, "Electricity, low voltage");
}

function flowSearchResponse() {
  return {
    ...catalogFixture.search,
    kind: "flow",
    items: [
      {
        key: catalogFixture.datasetFlow.key,
        accessLevel: catalogFixture.datasetFlow.accessLevel,
        capabilities: catalogFixture.datasetFlow.capabilities,
        names: catalogFixture.datasetFlow.metadata.names,
        summary: catalogFixture.datasetFlow.metadata.generalComment,
        geography: {
          code: catalogFixture.datasetFlow.metadata.locationOfSupply.code,
          label: catalogFixture.datasetFlow.metadata.locationOfSupply.label,
          precision: "unknown",
        },
        referenceYear: null,
        context: {
          reference: {
            kind: "reference_flow_property",
            name: catalogFixture.datasetFlow.metadata.referenceFlowProperty?.name ?? [],
          },
          functionalUnit: null,
          technology: [],
          source: catalogFixture.datasetFlow.metadata.source,
          quality: { reviewStatus: null },
        },
        modifiedAt: catalogFixture.datasetFlow.modifiedAt,
        match: { kind: "lexical", score: 0.9, reasonCodes: ["name"] },
      },
    ],
  };
}

function versionsResponse(kind: unknown, id: unknown) {
  if (kind === "process" && id === catalogFixture.datasetProcess.key.id) {
    return catalogFixture.versions;
  }
  if (kind === "flow" && id === catalogFixture.datasetFlow.key.id) {
    return {
      ...catalogFixture.versions,
      dataset: { kind: "flow", id },
      items: [
        {
          key: catalogFixture.datasetFlow.key,
          accessLevel: catalogFixture.datasetFlow.accessLevel,
          capabilities: catalogFixture.datasetFlow.capabilities,
          modifiedAt: catalogFixture.datasetFlow.modifiedAt,
          isLatest: true,
        },
      ],
    };
  }
  return { ...catalogFixture.versions, dataset: { kind, id }, items: [], nextCursor: null };
}

function sitemapResponse(kind: unknown) {
  const processItem = catalogFixture.sitemap.items[0]!;
  const flowItem = {
    key: catalogFixture.datasetFlow.key,
    modifiedAt: catalogFixture.datasetFlow.modifiedAt,
  };
  return {
    ...catalogFixture.sitemap,
    items:
      kind === "process" ? [processItem] : kind === "flow" ? [flowItem] : [flowItem, processItem],
  };
}

function sitemapManifestResponse(arguments_: Record<string, unknown>) {
  return Object.keys(arguments_).length === 0 ? catalogFixture.sitemapManifest : undefined;
}

function sitemapShardResponse(arguments_: Record<string, unknown>) {
  if (Object.keys(arguments_).length !== 1 || typeof arguments_.p_shard_cursor !== "string") {
    return undefined;
  }

  const descriptorIndex = catalogFixture.sitemapManifest.shards.findIndex(
    (descriptor) => descriptor.shardCursor === arguments_.p_shard_cursor,
  );
  if (descriptorIndex === -1) {
    return undefined;
  }

  const processItem = catalogFixture.sitemapShard.items[0]!;
  const flowItem = {
    key: catalogFixture.datasetFlow.key,
    modifiedAt: catalogFixture.datasetFlow.modifiedAt,
  };
  return {
    ...catalogFixture.sitemapShard,
    shardCursor: arguments_.p_shard_cursor,
    items: descriptorIndex === 0 ? [flowItem, processItem] : [],
  };
}

function rpcPayload(name: string, arguments_: Record<string, unknown>): unknown {
  switch (name) {
    case "portal_navigation_v1":
      return navigationFixture(arguments_);
    case "portal_search_processes_v3":
      return filterNavigationFixture(processSearchResponse(), arguments_);
    case "portal_search_flows_v3":
      return filterNavigationFixture(flowSearchResponse(), arguments_);
    case "portal_search_processes_v2":
      return processSearchResponse();
    case "portal_search_flows_v2":
      return flowSearchResponse();
    case "portal_catalog_summary_v1":
      return Object.keys(arguments_).length === 0 ? catalogFixture.catalogSummary : undefined;
    case "portal_get_dataset_v1":
      if (
        arguments_.p_kind === "process" &&
        typeof arguments_.p_id === "string" &&
        /^8[0-9a-f]{7}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(arguments_.p_id) &&
        arguments_.p_version === catalogFixture.datasetProcess.key.version
      ) {
        return {
          ...processDataset(arguments_.p_id, "Electricity, medium voltage"),
        };
      }
      if (
        arguments_.p_kind === "process" &&
        arguments_.p_id === secondProcessId &&
        arguments_.p_version === catalogFixture.datasetProcess.key.version
      ) {
        return secondProcessDataset();
      }
      if (
        arguments_.p_kind === "process" &&
        arguments_.p_id === catalogFixture.datasetProcess.key.id &&
        arguments_.p_version === catalogFixture.datasetProcess.key.version
      ) {
        return processDataset(catalogFixture.datasetProcess.key.id, "Electricity, medium voltage");
      }
      if (
        arguments_.p_kind === "flow" &&
        arguments_.p_id === catalogFixture.datasetFlow.key.id &&
        arguments_.p_version === catalogFixture.datasetFlow.key.version
      ) {
        return catalogFixture.datasetFlow;
      }
      return null;
    case "portal_list_versions_v1":
      return versionsResponse(arguments_.p_kind, arguments_.p_id);
    case "portal_list_process_exchanges_v1":
      return arguments_.p_process_id === catalogFixture.datasetProcess.key.id &&
        arguments_.p_process_version === catalogFixture.datasetProcess.key.version
        ? catalogFixture.exchanges
        : null;
    case "portal_facets_v3":
    case "portal_facets_v2":
      return {
        ...catalogFixture.facets,
        kind: arguments_.p_kind,
        groups: catalogFixture.facets.groups
          .map((group) =>
            group.id === "kind"
              ? {
                  ...group,
                  values: group.values.map((value) => ({
                    ...value,
                    value: arguments_.p_kind,
                    label: [{ language: "en", value: String(arguments_.p_kind) }],
                  })),
                }
              : group,
          )
          .concat([
            {
              id: "geography",
              label: [{ language: "en", value: "Geography" }],
              hasMore: false,
              values:
                arguments_.p_kind === "flow"
                  ? []
                  : [{ value: "CN", label: [{ language: "en", value: "China" }], count: 2 }],
            },
            {
              id: "source",
              label: [{ language: "en", value: "Source" }],
              hasMore: false,
              values: [
                {
                  value: "TianGong",
                  label: [{ language: "en", value: "TianGong" }],
                  count: arguments_.p_kind === "all" ? 3 : arguments_.p_kind === "flow" ? 1 : 2,
                },
              ],
            },
          ]),
      };
    case "portal_sitemap_entries_v1":
      return sitemapResponse(arguments_.p_kind);
    case "portal_sitemap_manifest_v1":
      return sitemapManifestResponse(arguments_);
    case "portal_sitemap_shard_v1":
      return sitemapShardResponse(arguments_);
    default:
      return undefined;
  }
}

function verifyPortalHmac(
  request: IncomingMessage,
  rawBody: Buffer,
  environment: (typeof environmentFixture)[PortalR1FixtureEnvironmentName],
  usedNonces: Set<string>,
  functionPath: string,
):
  { ok: true; keyId: string; nonce: string; correlationId?: string } | { ok: false; code: string } {
  const keyId = request.headers["x-portal-key-id"];
  const timestamp = request.headers["x-portal-timestamp"];
  const nonce = request.headers["x-portal-nonce"];
  const suppliedBodyHash = request.headers["x-portal-body-sha256"];
  const suppliedSignature = request.headers["x-portal-signature"];
  const correlationId = request.headers["x-portal-correlation-id"];

  if (
    typeof keyId !== "string" ||
    typeof timestamp !== "string" ||
    typeof nonce !== "string" ||
    typeof suppliedBodyHash !== "string" ||
    typeof suppliedSignature !== "string" ||
    keyId !== environment.keyId ||
    !/^[1-9]\d*$/u.test(timestamp) ||
    !/^[A-Za-z0-9_-]+$/u.test(nonce) ||
    !/^[A-Za-z0-9_-]{43}$/u.test(suppliedBodyHash) ||
    !/^[A-Za-z0-9_-]{43}$/u.test(suppliedSignature) ||
    (correlationId !== undefined &&
      (typeof correlationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(correlationId)))
  ) {
    return { ok: false, code: "invalid_signature" };
  }

  const timestampSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(Date.now() / 1000 - timestampSeconds) > 60
  ) {
    return { ok: false, code: "expired_signature" };
  }

  let nonceBytes: Buffer;
  let signatureBytes: Buffer;
  try {
    nonceBytes = Buffer.from(nonce, "base64url");
    signatureBytes = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return { ok: false, code: "invalid_signature" };
  }
  if (
    nonceBytes.byteLength !== 16 ||
    nonceBytes.toString("base64url") !== nonce ||
    signatureBytes.byteLength !== 32
  ) {
    return { ok: false, code: "invalid_signature" };
  }

  const bodyHash = createHash("sha256").update(rawBody).digest("base64url");
  if (bodyHash !== suppliedBodyHash) {
    return { ok: false, code: "tampered_body" };
  }

  const canonical = [
    "portal-hmac-v1",
    keyId,
    timestamp,
    nonce,
    "POST",
    functionPath,
    bodyHash,
  ].join("\n");
  const expectedSignature = createHmac("sha256", Buffer.from(environment.hmacSecret, "base64url"))
    .update(canonical)
    .digest();
  if (!timingSafeEqual(expectedSignature, signatureBytes)) {
    return { ok: false, code: "invalid_signature" };
  }
  if (usedNonces.has(nonce)) {
    return { ok: false, code: "replayed_request" };
  }
  usedNonces.add(nonce);

  return {
    ok: true,
    keyId,
    nonce,
    ...(typeof correlationId === "string" ? { correlationId } : {}),
  };
}

function validHybridInput(value: Record<string, unknown>): boolean {
  const versioned = value.schemaVersion === "portal.hybrid-search-request.v2";
  const expectedKeys = versioned
    ? "cursor\nfilters\nkind\nlimit\nquery\nschemaVersion"
    : "filters\nkind\nlimit\nquery\nschemaVersion";
  if (Object.keys(value).sort().join("\n") !== expectedKeys) {
    return false;
  }
  // oxlint-disable-next-line no-control-regex -- The fixture mirrors the exact Edge C0/C1 rejection contract.
  const queryHasControl = /[\u0000-\u001f\u007f-\u009f]/u.test(String(value.query));
  if (
    (!versioned && value.schemaVersion !== "portal.hybrid-search-request.v1") ||
    (versioned &&
      value.cursor !== null &&
      (typeof value.cursor !== "string" || !/^[A-Za-z0-9_-]{1,4096}$/u.test(value.cursor))) ||
    (value.kind !== "process" && value.kind !== "flow") ||
    typeof value.query !== "string" ||
    value.query.trim().length === 0 ||
    Array.from(value.query.trim()).length > 512 ||
    Buffer.byteLength(value.query.trim(), "utf8") > 2048 ||
    queryHasControl ||
    value.filters === null ||
    typeof value.filters !== "object" ||
    Array.isArray(value.filters) ||
    !Number.isInteger(value.limit) ||
    Number(value.limit) < 1 ||
    Number(value.limit) > 20
  ) {
    return false;
  }

  const allowedFilterKeys = new Set([
    "accessLevel",
    "geography",
    "classification",
    "referenceYearFrom",
    "referenceYearTo",
    "processSubtype",
    "source",
  ]);
  const filters = value.filters as Record<string, unknown>;
  if (
    Object.keys(filters).some((key) => !allowedFilterKeys.has(key)) ||
    (value.kind === "flow" && filters.processSubtype !== undefined)
  ) {
    return false;
  }
  return true;
}

function hybridFailure(query: string): { code: string; status: number } | null {
  const match =
    /^fixture:(hybrid_disabled|guard_unavailable|budget_exhausted|concurrency_exhausted|circuit_open|hybrid_timeout|contract_failure)$/u.exec(
      query.trim(),
    );
  if (!match?.[1]) return null;
  const status =
    match[1] === "budget_exhausted" || match[1] === "concurrency_exhausted" ? 429 : 503;
  return { code: match[1], status };
}

function hybridSearchResponse(input: Record<string, unknown>) {
  const kind = input.kind as "process" | "flow";
  const sourcePage = kind === "process" ? processSearchResponse() : flowSearchResponse();
  const limit = Number(input.limit);
  const versioned = input.schemaVersion === "portal.hybrid-search-request.v2";
  const items = sourcePage.items.slice(0, limit).map((item, index) => ({
    ...item,
    match: {
      kind: "hybrid",
      algorithmVersion: versioned ? "portal-hybrid-rank-v2" : "portal-hybrid-rank-v1",
      score: Math.max(0, 0.9 - index * 0.1),
      reasonCodes: ["lexical_public_projection", "semantic_public_projection"],
      evidence: {
        lexicalRank: index + 1,
        semanticRank: index + 1,
        semanticDistance: index === 0 ? "0.125" : "0.25",
      },
    },
  }));
  return {
    schemaVersion: versioned ? "portal.hybrid-search-page.v2" : "portal.hybrid-search-page.v1",
    kind,
    queryFingerprint: "c".repeat(64),
    interpretation: {
      source: "model_generated",
      advisory: true,
      semanticQuery:
        kind === "process" ? "public low-carbon production evidence" : "public flow evidence",
      terms:
        kind === "process"
          ? [
              { language: "en", value: "low-carbon production" },
              { language: "zh-CN", value: "低碳生产" },
            ]
          : [{ language: "en", value: "public flow" }],
    },
    items,
    ...(versioned
      ? {
          candidateCount: items.length + (items.length > 0 ? 1 : 0),
          datasetCount: items.length,
          nextCursor: null,
          versionGroups: items.map((item, index) => ({
            key: item.key,
            matches: [
              { key: item.key, match: item.match },
              ...(index === 0
                ? [
                    {
                      key: { ...item.key, version: "00.99.999" },
                      match: { ...item.match, score: 0.65 },
                    },
                  ]
                : []),
            ],
          })),
        }
      : {}),
  };
}

function validLciaInput(value: Record<string, unknown>): boolean {
  if (Object.keys(value).sort().join("\n") !== requiredLciaKeys.join("\n")) {
    return false;
  }
  if (
    !["process_all_impacts", "processes_one_impact", "ranked_processes_one_impact"].includes(
      String(value.mode),
    ) ||
    !Array.isArray(value.processRefs) ||
    value.processRefs.length < 1 ||
    value.processRefs.length > 50 ||
    !Number.isInteger(value.limit) ||
    Number(value.limit) < 1 ||
    Number(value.limit) > 50 ||
    !(value.cursor === null || (typeof value.cursor === "string" && value.cursor.length <= 4096))
  ) {
    return false;
  }

  return value.processRefs.every(
    (reference) =>
      reference !== null &&
      typeof reference === "object" &&
      !Array.isArray(reference) &&
      Object.keys(reference).sort().join("\n") === "id\nversion" &&
      typeof (reference as Record<string, unknown>).id === "string" &&
      typeof (reference as Record<string, unknown>).version === "string",
  );
}

export async function startPortalR1FixtureServer(
  options: StartOptions,
): Promise<PortalR1FixtureServer> {
  const environment = environmentFixture[options.environment];
  if (!environment) {
    throw new Error("Unknown Portal R1 fixture environment");
  }

  const receipts: PortalR1FixtureReceipts = {
    rpcAccepted: 0,
    rpcByName: {},
    lciaAccepted: 0,
    hybridAccepted: 0,
    rejected: 0,
    lastRpc: null,
    lastLcia: null,
    lastHybrid: null,
  };
  const usedNonces = new Set<string>();
  const lciaReceiptsByCorrelationId = new Map<string, FixtureRequestReceipt>();
  const hybridReceiptsByCorrelationId = new Map<string, FixtureRequestReceipt>();
  const rpcReceiptsByFingerprint = new Map<string, FixtureRpcReceipt>();
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://fixture.local");
      if (request.method === "GET" && requestUrl.pathname === "/health") {
        writeJson(response, 200, {
          schemaVersion: "portal.r1-fixture-health.v1",
          environment: options.environment,
        });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/receipts") {
        writeJson(response, 200, {
          ...receipts,
          schemaVersion: "portal.r1-fixture-receipts.v1",
        });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname.startsWith("/receipts/lcia/")) {
        const correlationId = requestUrl.pathname.slice("/receipts/lcia/".length);
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(correlationId)
        ) {
          writeJson(response, 404, { code: "fixture_receipt_not_found" });
          return;
        }
        const receipt = lciaReceiptsByCorrelationId.get(correlationId);
        if (!receipt) {
          writeJson(response, 404, { code: "fixture_receipt_not_found" });
          return;
        }
        writeJson(response, 200, {
          schemaVersion: "portal.r1-fixture-lcia-receipt.v1",
          receipt,
        });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname.startsWith("/receipts/hybrid/")) {
        const correlationId = requestUrl.pathname.slice("/receipts/hybrid/".length);
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(correlationId)
        ) {
          writeJson(response, 404, { code: "fixture_receipt_not_found" });
          return;
        }
        const receipt = hybridReceiptsByCorrelationId.get(correlationId);
        if (!receipt) {
          writeJson(response, 404, { code: "fixture_receipt_not_found" });
          return;
        }
        writeJson(response, 200, {
          schemaVersion: "portal.r2-fixture-hybrid-receipt.v1",
          receipt,
        });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname.startsWith("/receipts/rpc/")) {
        const match = /^\/receipts\/rpc\/([a-z0-9_]+)\/([0-9a-f]{64})$/u.exec(requestUrl.pathname);
        const receipt = match ? rpcReceiptsByFingerprint.get(`${match[1]}:${match[2]}`) : undefined;
        if (!receipt) {
          writeJson(response, 404, { code: "fixture_receipt_not_found" });
          return;
        }
        writeJson(response, 200, {
          schemaVersion: "portal.r1-fixture-rpc-receipt.v1",
          ...receipt,
        });
        return;
      }

      const rawBody = await readRawBody(request);
      if (request.method !== "POST" || hasForbiddenCredential(request)) {
        receipts.rejected += 1;
        writeJson(response, 403, { code: "fixture_request_rejected" });
        return;
      }

      if (requestUrl.pathname.startsWith("/rest/v1/rpc/")) {
        const name = requestUrl.pathname.slice("/rest/v1/rpc/".length);
        if (
          request.headers.apikey !== environment.publishableKey ||
          request.headers["accept-profile"] !== "api" ||
          request.headers["content-profile"] !== "api"
        ) {
          receipts.rejected += 1;
          writeJson(response, 403, { code: "fixture_rpc_rejected" });
          return;
        }

        const arguments_ = parseJsonObject(rawBody);
        const payload =
          arguments_ && !containsForbiddenKey(arguments_)
            ? rpcPayload(name, arguments_)
            : undefined;
        if (payload === undefined) {
          receipts.rejected += 1;
          writeJson(response, 400, { code: "fixture_rpc_invalid" });
          return;
        }

        receipts.rpcAccepted += 1;
        receipts.rpcByName[name] = (receipts.rpcByName[name] ?? 0) + 1;
        const receipt = { ...bodyReceipt(rawBody), name };
        receipts.lastRpc = receipt;
        const fingerprint = `${name}:${receipt.bodySha256}`;
        const previous = rpcReceiptsByFingerprint.get(fingerprint);
        rpcReceiptsByFingerprint.delete(fingerprint);
        rpcReceiptsByFingerprint.set(fingerprint, {
          count: (previous?.count ?? 0) + 1,
          receipt,
        });
        while (rpcReceiptsByFingerprint.size > maximumCorrelationReceipts) {
          const oldest = rpcReceiptsByFingerprint.keys().next().value as string | undefined;
          if (!oldest) break;
          rpcReceiptsByFingerprint.delete(oldest);
        }
        writeJson(response, 200, payload);
        return;
      }

      if (requestUrl.pathname === portalDataProductPath) {
        if (request.headers.apikey !== environment.publishableKey) {
          receipts.rejected += 1;
          writeJson(response, 403, { code: "fixture_lcia_rejected" });
          return;
        }

        const verification = verifyPortalHmac(
          request,
          rawBody,
          environment,
          usedNonces,
          portalDataProductPath,
        );
        if (!verification.ok) {
          receipts.rejected += 1;
          writeJson(response, 403, { code: verification.code });
          return;
        }

        const input = parseJsonObject(rawBody);
        if (!input || !validLciaInput(input)) {
          receipts.rejected += 1;
          writeJson(response, 400, { code: "fixture_lcia_invalid" });
          return;
        }
        const references = input.processRefs as Array<Record<string, unknown>>;
        if (
          input.mode === "process_all_impacts" &&
          (references.length !== 1 || input.impactCategoryId !== null)
        ) {
          receipts.rejected += 1;
          writeJson(response, 400, { code: "fixture_lcia_invalid" });
          return;
        }
        if (input.mode !== "process_all_impacts" && typeof input.impactCategoryId !== "string") {
          receipts.rejected += 1;
          writeJson(response, 400, { code: "fixture_lcia_invalid" });
          return;
        }

        const allowedProcessIds = new Set([catalogFixture.datasetProcess.key.id, secondProcessId]);
        const referenceKeys = references.map(
          (reference) => `${String(reference.id)}@${String(reference.version)}`,
        );
        if (
          new Set(referenceKeys).size !== references.length ||
          !references.every(
            (reference) =>
              typeof reference.id === "string" &&
              allowedProcessIds.has(reference.id) &&
              reference.version === catalogFixture.datasetProcess.key.version,
          )
        ) {
          writeJson(response, 404, { code: "published_lcia_unavailable" });
          return;
        }

        const baseRow = catalogFixture.lcia.rows[0]!;
        const impactId =
          input.mode === "process_all_impacts" ? baseRow.impact.id : String(input.impactCategoryId);
        const rows = references.map((reference) => ({
          ...baseRow,
          process: { id: String(reference.id), version: String(reference.version) },
          impact: {
            ...baseRow.impact,
            id: impactId,
            name:
              impactId === baseRow.impact.id
                ? baseRow.impact.name
                : [{ language: "en", value: impactId }],
          },
          value: reference.id === secondProcessId ? "9.75" : baseRow.value,
        }));
        if (input.mode === "ranked_processes_one_impact") {
          rows.sort((left, right) => Number(right.value) - Number(left.value));
        }

        receipts.lciaAccepted += 1;
        const receipt = {
          ...bodyReceipt(rawBody),
          keyId: verification.keyId,
          ...(verification.correlationId ? { correlationId: verification.correlationId } : {}),
        };
        receipts.lastLcia = receipt;
        if (verification.correlationId) {
          lciaReceiptsByCorrelationId.delete(verification.correlationId);
          lciaReceiptsByCorrelationId.set(verification.correlationId, receipt);
          while (lciaReceiptsByCorrelationId.size > maximumCorrelationReceipts) {
            const oldest = lciaReceiptsByCorrelationId.keys().next().value as string | undefined;
            if (!oldest) break;
            lciaReceiptsByCorrelationId.delete(oldest);
          }
        }
        writeJson(response, 200, {
          ...catalogFixture.lcia,
          mode: input.mode,
          rows,
          nextCursor: null,
        });
        return;
      }

      if (requestUrl.pathname === portalHybridPath) {
        if (request.headers.apikey !== environment.publishableKey) {
          receipts.rejected += 1;
          writeJson(response, 403, { code: "portal_auth_failed", message: "Request rejected" });
          return;
        }

        const verification = verifyPortalHmac(
          request,
          rawBody,
          environment,
          usedNonces,
          portalHybridPath,
        );
        if (!verification.ok) {
          receipts.rejected += 1;
          writeJson(response, 401, { code: "portal_auth_failed", message: "Request rejected" });
          return;
        }

        const input = parseJsonObject(rawBody);
        if (!input || !validHybridInput(input)) {
          receipts.rejected += 1;
          writeJson(response, 400, { code: "invalid_request", message: "Invalid request" });
          return;
        }
        const failure = hybridFailure(String(input.query));
        if (failure) {
          writeJson(response, failure.status, {
            code: failure.code,
            message: "Hybrid fixture unavailable",
          });
          return;
        }

        receipts.hybridAccepted += 1;
        const receipt = {
          ...bodyReceipt(rawBody),
          keyId: verification.keyId,
          ...(verification.correlationId ? { correlationId: verification.correlationId } : {}),
        };
        receipts.lastHybrid = receipt;
        if (verification.correlationId) {
          hybridReceiptsByCorrelationId.delete(verification.correlationId);
          hybridReceiptsByCorrelationId.set(verification.correlationId, receipt);
          while (hybridReceiptsByCorrelationId.size > maximumCorrelationReceipts) {
            const oldest = hybridReceiptsByCorrelationId.keys().next().value as string | undefined;
            if (!oldest) break;
            hybridReceiptsByCorrelationId.delete(oldest);
          }
        }
        writeJson(response, 200, hybridSearchResponse(input));
        return;
      }

      writeJson(response, 404, { code: "fixture_not_found" });
    } catch {
      receipts.rejected += 1;
      writeJson(response, 500, { code: "fixture_internal_error" });
    }
  });

  server.listen(options.port ?? 0, options.host ?? "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const origin = `http://${options.host ?? "127.0.0.1"}:${address.port}`;

  return {
    environment: options.environment,
    origin,
    receipts,
    async close() {
      server.close();
      await once(server, "close");
    },
  };
}

type CommandLineOptions = {
  environment: PortalR1FixtureEnvironmentName;
  host: string;
  port: number;
};

function parseCommandLine(arguments_: string[]): CommandLineOptions {
  const options: CommandLineOptions = {
    environment: process.env.PORTAL_FIXTURE_ENV === "production" ? "production" : "preview",
    host: "127.0.0.1",
    port: Number(process.env.PORTAL_FIXTURE_PORT ?? 4328),
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === "--environment" && (value === "preview" || value === "production")) {
      options.environment = value;
      index += 1;
    } else if (argument === "--host" && value) {
      options.host = value;
      index += 1;
    } else if (argument === "--port" && value && /^\d+$/u.test(value)) {
      options.port = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown or invalid fixture argument: ${argument ?? "<missing>"}`);
    }
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
    throw new Error("Fixture port must be between 1 and 65535");
  }
  if (options.host !== "127.0.0.1" && options.host !== "localhost") {
    throw new Error("Fixture host must be loopback");
  }

  return options;
}

async function runCommandLine(): Promise<void> {
  const options = parseCommandLine(process.argv.slice(2));
  const fixture = await startPortalR1FixtureServer(options);
  process.stdout.write(`Portal R1 ${fixture.environment} fixture listening at ${fixture.origin}\n`);

  const stop = async () => {
    await fixture.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCommandLine();
}
