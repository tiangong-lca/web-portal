/** Explicit read-only capture of the anonymous Portal's rendered navigation. No credentials. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const origin = "https://www.tiangong.earth";
const destination = new URL("./counts.generated.json", import.meta.url);
const vocabularyBytes = readFileSync("contracts/database-engine/portal/navigation-vocabulary.json");
const vocabulary = JSON.parse(vocabularyBytes);
const nodes = new Map(vocabulary.nodes.map((node) => [node.nodeId, node]));
const maps = JSON.parse(readFileSync("src/features/catalog/region-map-manifest.generated.json"));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const number = (value) => {
  const cleaned = value?.replace(/[,\s]/gu, "");
  if (!cleaned || !/^\d+$/u.test(cleaned))
    throw new Error("Missing public count; never substitute zero.");
  return Number(cleaned);
};

if (!process.argv.includes("--capture")) {
  const snapshot = JSON.parse(readFileSync(destination));
  if (snapshot.vocabularySha256 !== digest(vocabularyBytes))
    throw new Error("Snapshot vocabulary changed.");
  for (const key of Object.keys(maps.layers)) {
    const page = snapshot.branches[key];
    if (!page?.complete || !Array.isArray(page.entries))
      throw new Error(`Incomplete capture ${key}`);
    for (const entry of page.entries) {
      if (!Number.isSafeInteger(entry.count) || entry.count < 0)
        throw new Error(`Invalid count ${entry.nodeId}`);
      if (
        nodes.has(entry.nodeId) &&
        nodes.get(entry.nodeId).parentNodeId !== (key === "world" ? null : key)
      )
        throw new Error(`Wrong parent for ${entry.nodeId}`);
    }
  }
  console.log(
    `Verified ${Object.keys(snapshot.branches).length} public navigation branches captured ${snapshot.capturedAt}.`,
  );
} else {
  const startedAt = new Date().toISOString();
  const marker = await fetch(`${origin}/r0-compat/route-handler`).then((r) => r.json());
  const branches = {};
  const queue = Object.keys(maps.layers);
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const key = queue.shift();
        const first = new URL("/zh-CN/search", origin);
        first.searchParams.set("explore", "region");
        first.searchParams.set("kind", "process");
        if (key !== "world") first.searchParams.set("geoNode", key);
        let url = first.href;
        const entries = new Map();
        const receipts = [];
        let count = null;
        let directCount = null;
        while (url) {
          if (receipts.length >= 10 || receipts.some((r) => r.url === url))
            throw new Error(`Pagination loop: ${key}`);
          const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
          if (!response.ok) throw new Error(`Public page HTTP ${response.status}: ${key}`);
          const html = await response.text();
          const dom = new JSDOM(html);
          const section = dom.window.document.querySelector(".catalog-region-explorer");
          if (!section || section.textContent.includes("导航暂时不可用"))
            throw new Error(`Unavailable branch ${key}`);
          for (const link of section.querySelectorAll(".catalog-navigation-list a")) {
            const href = new URL(link.getAttribute("href"), origin);
            const nodeId = href.searchParams.get("geoNode");
            const value = number(
              link.querySelector(".catalog-navigation-count")?.firstChild?.textContent,
            );
            if (!nodeId || entries.has(nodeId)) throw new Error(`Duplicate/missing node ${key}`);
            const node = nodes.get(nodeId);
            entries.set(nodeId, {
              nodeId,
              code: node?.code ?? nodeId.slice(4).toUpperCase(),
              labels: node?.labels ?? {
                "zh-CN":
                  link.querySelector(".catalog-navigation-name")?.firstChild?.textContent?.trim() ??
                  nodeId,
              },
              count: value,
              hasChildren: href.searchParams.get("explore") === "region",
              dataUrl: href.href,
            });
          }
          for (const link of section.querySelectorAll(".catalog-navigation-actions a")) {
            const href = new URL(link.getAttribute("href"), origin);
            const value = link.textContent.match(/[（(]([\d,]+)[）)]/u)?.[1];
            if (!value) continue;
            if (href.searchParams.get("geoScope") === "direct") directCount = number(value);
            else count = number(value);
          }
          const more = [...section.querySelectorAll("a")].find((link) =>
            new URL(link.getAttribute("href"), origin).searchParams.has("navCursor"),
          );
          receipts.push({
            url,
            fetchedAt: new Date().toISOString(),
            sha256: digest(html),
            bytes: Buffer.byteLength(html),
          });
          url = more ? new URL(more.getAttribute("href"), origin).href : null;
          dom.window.close();
        }
        // Static children, including zero matches, must all be reachable in the capture.
        const expected = vocabulary.nodes.filter(
          (node) =>
            node.dimension === "geography" &&
            node.taxonomy !== "database-virtual" &&
            node.parentNodeId === (key === "world" ? null : key),
        );
        for (const node of expected)
          if (!entries.has(node.nodeId))
            throw new Error(`Missing static child ${node.nodeId} in ${key}`);
        branches[key] = {
          count,
          directCount,
          entries: [...entries.values()],
          complete: true,
          receipts,
        };
        console.log(`${key}: ${entries.size} regions, ${receipts.length} page(s)`);
      }
    }),
  );
  const after = await fetch(`${origin}/r0-compat/route-handler`).then((r) => r.json());
  if (marker.deploymentSha !== after.deploymentSha)
    throw new Error("Deployment changed during capture; rerun.");
  writeFileSync(
    destination,
    `${JSON.stringify(
      {
        schemaVersion: "portal.maplibre-public-counts.v1",
        origin,
        kind: "process",
        query: "",
        countBasis: "public_versions",
        startedAt,
        capturedAt: new Date().toISOString(),
        deploymentSha: marker.deploymentSha,
        vocabularySha256: digest(vocabularyBytes),
        note: "Public rendered navigation snapshot, including historical public versions. Not a live feed. Counts are never inferred from geometry.",
        branches: Object.fromEntries(
          Object.entries(branches).sort(([a], [b]) => a.localeCompare(b)),
        ),
      },
      null,
      2,
    )}\n`,
  );
}
