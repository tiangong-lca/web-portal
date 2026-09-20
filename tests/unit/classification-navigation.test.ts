import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/i18n/messages/en.json";
import de from "@/i18n/messages/de.json";
import fr from "@/i18n/messages/fr.json";
import zh from "@/i18n/messages/zh-CN.json";
import {
  classificationContext,
  classificationPageSchema,
  type ClassificationContext,
  type ClassificationPage,
  type ClassificationRequest,
} from "@/lib/classification-navigation";
import type { getPublicNavigation } from "@/server/data/navigation";
import { ClassificationBranches } from "@/features/catalog/classification-branches";
import { createClassificationHandler } from "@/server/classification/handler";
import { classificationSeeds, readClassificationBranch } from "@/server/classification/navigation";
import { parsePortalBrowseUrl, type PublicNavigation } from "@/server/contracts/navigation";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale }: { locale: "en" | "de" | "fr" | "zh-CN" }) =>
    createTranslator({
      locale,
      messages: { en, de, fr, "zh-CN": zh }[locale],
      namespace: "Navigation",
    }),
}));
const context: ClassificationContext = { locale: "en", kind: "process", query: "", filters: {} };
const input: ClassificationRequest = { ...context, parentNodeId: null, cursor: null };
const identity = (id: string, parentNodeId: string | null = null) => ({
  nodeId: id,
  parentNodeId,
  code: id.split(":").at(-1)!,
  label: id,
});
const node = (id: string, parentNodeId: string | null = null) => ({
  ...identity(id, parentNodeId),
  count: 7,
  directCount: 2,
  hasChildren: true,
});
function page(
  parentNodeId: string | null = null,
  changes: Partial<ClassificationPage> = {},
): ClassificationPage {
  return classificationPageSchema.parse({
    schemaVersion: "portal.classification-branch.v1",
    countBasis: "public_versions",
    locale: "en",
    kind: "process",
    parent: parentNodeId ? node(parentNodeId) : null,
    ancestors: [],
    nodes: [node(parentNodeId ? `${parentNodeId}:child` : "class:isic", parentNodeId)],
    nextCursor: null,
    ...changes,
  });
}
function request(body: unknown = input, headers: Record<string, string> = {}) {
  return new Request("https://portal.example/internal/navigation", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const rawNode = (id: string, parentNodeId: string | null = null) => ({
  nodeId: id,
  parentNodeId,
  code: id.split(":").at(-1)!,
  taxonomy: "isic" as const,
  count: 7,
  directCount: 2,
  hasChildren: true,
});
function rawPage(parentNodeId: string | null): PublicNavigation {
  return {
    schemaVersion: "portal.public-navigation.v1",
    countBasis: "public_versions",
    kind: "process",
    dimension: "classification",
    totals: { process: 7, flow: 0 },
    parent: parentNodeId ? rawNode(parentNodeId) : null,
    ancestors: [],
    nodes: [rawNode("class:isic:0", parentNodeId)],
    nextCursor: null,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("same-origin classification reads", () => {
  it("rejects foreign origins, oversized streamed bodies and fields that could alter the public contract", async () => {
    const read = vi.fn<typeof readClassificationBranch>(async () => page());
    const handler = createClassificationHandler(read);
    expect((await handler(request(input, { origin: "https://attacker.example" }))).status).toBe(
      403,
    );
    expect((await handler(request(input, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await handler(request(input, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await handler(request(input, { "content-length": "8193" }))).status).toBe(413);
    expect(await handler(request({ ...input, query: "x".repeat(9000) }))).toHaveProperty(
      "status",
      413,
    );
    for (const body of [
      { ...input, locale: "es" },
      { ...input, limit: 500 },
      { ...input, stateCode: 20 },
      { ...input, parentNodeId: "geo:cn" },
      { ...input, cursor: "not a cursor" },
      { ...input, kind: "flow", filters: { processSubtype: "unit process" } },
    ])
      expect((await handler(request(body))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });
  it("keeps scope/kind/locale and the 64 KiB response limit closed, without exposing diagnostic details", async () => {
    const read = vi.fn<typeof readClassificationBranch>(async () => page());
    const handler = createClassificationHandler(read);
    const result = await handler(request());
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toMatchObject({
      countBasis: "public_versions",
      locale: "en",
      kind: "process",
    });
    for (const mismatch of [
      page("class:isic"),
      page(null, { kind: "flow" }),
      page(null, { locale: "fr" }),
    ]) {
      read.mockResolvedValueOnce(mismatch);
      expect((await handler(request())).status).toBe(503);
    }
    read.mockResolvedValueOnce(
      page(null, {
        nodes: Array.from({ length: 50 }, (_, i) => ({
          ...node(`class:large:${i}`),
          label: "x".repeat(4000),
        })),
      }),
    );
    expect((await handler(request())).status).toBe(503);
    read.mockRejectedValueOnce(new Error("private upstream diagnostic"));
    expect(await (await handler(request())).json()).toEqual({ code: "temporarily_unavailable" });
  });
  it("reads one aggregate child page and removes only this dimension's selected filter", async () => {
    const read = vi.fn<typeof getPublicNavigation>(async () => rawPage(null));
    const result = await readClassificationBranch(
      {
        ...input,
        filters: {
          classificationNodeId: "class:isic:0",
          classificationScope: "direct",
          classification: "0",
          geographyNodeId: "geo:cn",
          geographyScope: "subtree",
          source: "public source",
        },
      },
      read,
    );
    expect(read).toHaveBeenCalledExactlyOnceWith({
      kind: "process",
      query: "",
      dimension: "classification",
      parentNodeId: null,
      cursor: null,
      limit: 50,
      filters: { geographyNodeId: "geo:cn", geographyScope: "subtree", source: "public source" },
    });
    expect(result.nodes[0]?.label).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("href");
    expect(JSON.stringify(result)).not.toContain("labels");
  });
  it("hydrates only the root and selected ancestor path, preserving the selected page's opaque cursor", async () => {
    const current = rawPage("class:isic:01");
    current.ancestors = [rawNode("class:isic"), rawNode("class:isic:0", "class:isic")];
    const read = vi.fn<typeof getPublicNavigation>(async ({ parentNodeId }) =>
      rawPage(parentNodeId ?? null),
    );
    const seeds = await classificationSeeds(
      "en",
      parsePortalBrowseUrl({ kind: "process", classNode: "class:isic:01" }),
      current,
      "page2",
      read,
    );
    expect(read).toHaveBeenCalledTimes(3);
    expect(seeds.map((seed) => seed.parentNodeId)).toEqual([
      null,
      "class:isic",
      "class:isic:0",
      "class:isic:01",
    ]);
    expect(seeds.at(-1)).toMatchObject({
      cursor: "page2",
      page: { parent: { nodeId: "class:isic:01" } },
    });
    expect(seeds.flatMap((seed) => seed.page?.nodes ?? [])).toHaveLength(4);
  });
});

describe("classification branch cache", () => {
  it("deduplicates concurrent expansion, retains a collapsed branch and refreshes after 30 seconds", async () => {
    const read = vi.fn<
      (input: ClassificationRequest, signal: AbortSignal) => Promise<ClassificationPage>
    >(async () => page("class:isic"));
    const cache = new ClassificationBranches(context, [], read);
    await Promise.all([cache.load("class:isic"), cache.load("class:isic")]);
    await cache.load("class:isic");
    expect(read).toHaveBeenCalledTimes(1);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31000);
    await cache.load("class:isic");
    expect(read).toHaveBeenCalledTimes(2);
    cache.cancel();
  });
  it("appends more than 100 children without duplicates or a result navigation", async () => {
    const make = (start: number, count: number, nextCursor: string | null) =>
      page("class:isic", {
        nodes: Array.from({ length: count }, (_, i) =>
          node(`class:isic:${i + start}`, "class:isic"),
        ),
        nextCursor,
      });
    const read = vi.fn<
      (input: ClassificationRequest, signal: AbortSignal) => Promise<ClassificationPage>
    >(async (request: ClassificationRequest) =>
      request.cursor === null
        ? make(0, 50, "next50")
        : request.cursor === "next50"
          ? make(49, 50, "next99")
          : make(99, 22, null),
    );
    const cache = new ClassificationBranches(context, [], read);
    await cache.load("class:isic");
    await cache.load("class:isic", { more: true });
    await cache.load("class:isic", { more: true });
    expect(cache.getSnapshot().branches.get("class:isic")?.page?.nodes).toHaveLength(121);
    expect(cache.getSnapshot().branches.get("class:isic")?.page?.nextCursor).toBeNull();
    expect(read.mock.calls.map(([input]) => input.cursor)).toEqual([null, "next50", "next99"]);
    cache.cancel();
  });
  it("does not adopt a late response after filters, kind or locale changed", async () => {
    let release!: (page: ClassificationPage) => void;
    const read = vi.fn<
      (input: ClassificationRequest, signal: AbortSignal) => Promise<ClassificationPage>
    >(
      (_request: ClassificationRequest, _signal: AbortSignal) =>
        new Promise<ClassificationPage>((resolve) => {
          release = resolve;
        }),
    );
    const cache = new ClassificationBranches(context, [], read);
    const pending = cache.load("class:isic");
    cache.activate(
      { ...context, kind: "flow", locale: "de", filters: { geographyNodeId: "geo:cn" } },
      [{ parentNodeId: null, page: page(null, { kind: "flow", locale: "de" }) }],
    );
    expect(read.mock.calls[0]?.[1].aborted).toBe(true);
    release(page("class:isic"));
    await pending;
    expect(cache.getSnapshot().branches.has("class:isic")).toBe(false);
    expect(cache.getSnapshot().branches.get("root")?.page?.kind).toBe("flow");
    cache.cancel();
  });
  it("distinguishes failure from zero and supports an explicit retry", async () => {
    const read = vi.fn<
      (input: ClassificationRequest, signal: AbortSignal) => Promise<ClassificationPage>
    >(async () =>
      page("class:isic", {
        nodes: [{ ...node("class:isic:0", "class:isic"), count: 0, directCount: 0 }],
      }),
    );
    read.mockRejectedValueOnce(new Error("offline"));
    const cache = new ClassificationBranches(context, [], read);
    await cache.load("class:isic");
    expect(cache.getSnapshot().branches.get("class:isic")).toMatchObject({
      page: null,
      failed: true,
    });
    await cache.load("class:isic", { retry: true });
    expect(cache.getSnapshot().branches.get("class:isic")).toMatchObject({
      failed: false,
      page: { nodes: [{ count: 0 }] },
    });
    cache.cancel();
  });
  it("does not invalidate counts when only the selected classification changes", () => {
    const first = classificationContext(
      "en",
      parsePortalBrowseUrl({ classNode: "class:isic:0", geoNode: "geo:cn", q: "steel" }),
    );
    const second = classificationContext(
      "en",
      parsePortalBrowseUrl({ classNode: "class:isic:1", geoNode: "geo:cn", q: "steel" }),
    );
    expect(first).toEqual(second);
  });
});
