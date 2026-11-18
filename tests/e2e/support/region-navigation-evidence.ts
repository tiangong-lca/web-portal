import { writeFile } from "node:fs/promises";

import { test, type Frame, type Request, type Response } from "@playwright/test";

const searchPath = "/zh-CN/search";
const evidenceFile = "region-navigation-attempt-0.json";
const maxEvents = 80;
const chinaUrlAssertion = /geoNode=geo%3Acn/;
const pointerPhases = ["pointerdown", "pointerup", "click", "after-click"] as const;
const hitKinds = ["china-link", "other-link", "region-list", "map", "other", "missing"] as const;

function routeState(url: URL, origin: string) {
  if (url.href === "about:blank") return "blank";
  if (url.origin !== origin) return "other-origin";
  if (url.pathname.startsWith("/zh-CN/process/")) return "process-detail";
  if (url.pathname !== searchPath) return "other-path";
  switch (url.searchParams.get("geoNode")) {
    case null:
      return url.searchParams.get("explore") === "region" ? "world" : "other-search";
    case "geo:cn":
      return "china";
    case "geo:cn-ah":
      return "anhui";
    case "geo:cn-ah-hfe":
      return "hefei";
    default:
      return "other-region";
  }
}

function numericTuple(value: unknown, length: number): number[] | null {
  return Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? value.map((item: number) => Math.max(-100_000, Math.min(100_000, Math.round(item))))
    : null;
}

// Rebuild from fixed fields before admitting any browser-originated values to a CI artifact.
function pointerSample(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const phase = pointerPhases.find((candidate) => candidate === row.phase);
  const target = hitKinds.find((candidate) => candidate === row.target);
  const hit = hitKinds.find((candidate) => candidate === row.hit);
  const point = numericTuple(row.point, 2);
  const documentMs = row.documentMs;
  if (
    !phase ||
    !target ||
    !hit ||
    !point ||
    typeof documentMs !== "number" ||
    !Number.isFinite(documentMs) ||
    documentMs < 0
  )
    return null;
  return {
    phase,
    documentMs: Math.min(300_000, Math.round(documentMs)),
    target,
    hit,
    point,
    chinaRect: numericTuple(row.chinaRect, 4),
    pending: row.pending === true,
    defaultPrevented: row.defaultPrevented === true,
    mapMounted: row.mapMounted === true,
  };
}

/** Observes the first CI attempt of the world-to-city journey on the loopback fixture. */
export const regionNavigationTest = test.extend<{ observeRegionNavigation: void }>({
  observeRegionNavigation: [
    async ({ page, baseURL }, use, info) => {
      const base = baseURL ? new URL(baseURL) : null;
      if (
        !process.env.CI ||
        info.retry !== 0 ||
        base?.hostname !== "127.0.0.1" ||
        base.protocol !== "http:"
      ) {
        await use();
        return;
      }
      const { origin } = base;

      const started = performance.now();
      const events: ({ ms: number; event: string } & Record<string, unknown>)[] = [];
      let droppedEvents = 0;
      const record = (event: string, data: Record<string, unknown> = {}) => {
        if (events.length === maxEvents) {
          droppedEvents += 1;
          return;
        }
        events.push({ ms: Math.round(performance.now() - started), event, ...data });
      };

      const requests = new WeakMap<Request, number>();
      let requestId = 0;
      const onRequest = (request: Request) => {
        const url = new URL(request.url());
        if (url.origin !== origin || url.pathname !== searchPath) return;
        const id = ++requestId;
        requests.set(request, id);
        record("request", {
          id,
          route: routeState(url, origin),
          matchesChinaAssertion: chinaUrlAssertion.test(url.href),
          rsc: request.headers().rsc === "1",
          document: request.isNavigationRequest(),
        });
      };
      const onResponse = (response: Response) => {
        const id = requests.get(response.request());
        if (id !== undefined) record("response", { id, status: response.status() });
      };
      const onFinished = (request: Request) => {
        const id = requests.get(request);
        if (id !== undefined) record("request-finished", { id });
      };
      const onFailed = (request: Request) => {
        const id = requests.get(request);
        if (id !== undefined) {
          record("request-failed", {
            id,
            aborted: request.failure()?.errorText === "net::ERR_ABORTED",
          });
        }
      };
      const urlObservation = (href: string) => ({
        route: routeState(new URL(href), origin),
        matchesChinaAssertion: chinaUrlAssertion.test(href),
      });
      const onNavigation = (frame: Frame) => {
        if (frame === page.mainFrame()) record("url", urlObservation(frame.url()));
      };

      record("url", urlObservation(page.url()));
      page.on("request", onRequest);
      page.on("response", onResponse);
      page.on("requestfinished", onFinished);
      page.on("requestfailed", onFailed);
      page.on("framenavigated", onNavigation);
      try {
        await page.exposeBinding(
          "__portalRegionNavigationEvidence",
          ({ page: source, frame }, sample: unknown) => {
            if (source !== page || frame !== page.mainFrame()) return;
            const pointer = pointerSample(sample);
            if (pointer) record("pointer", pointer);
          },
        );
        await page.addInitScript(
          ({ origin, searchPath }) => {
            const url = new URL(location.href);
            if (
              window.top !== window ||
              url.origin !== origin ||
              url.pathname !== searchPath ||
              url.searchParams.get("explore") !== "region" ||
              url.searchParams.has("geoNode")
            )
              return;
            const evidenceWindow = window as Window & {
              __portalRegionNavigationEvidence?: (sample: object) => Promise<void>;
            };

            const findChinaLink = () =>
              [
                ...document.querySelectorAll<HTMLAnchorElement>(".catalog-navigation-list a[href]"),
              ].find(({ href }) => {
                const link = new URL(href);
                return (
                  link.origin === origin &&
                  link.pathname === searchPath &&
                  link.searchParams.get("geoNode") === "geo:cn"
                );
              });
            const hitKind = (element: Element | null, china: HTMLAnchorElement | undefined) => {
              if (!element) return "missing";
              const link = element.closest("a");
              if (link) return link === china ? "china-link" : "other-link";
              if (element.closest(".catalog-navigation-list")) return "region-list";
              if (element.closest(".catalog-region-visual")) return "map";
              return "other";
            };

            // Pointer capture covers the world-to-China leg. URL events continue through teardown.
            let observations = 0;
            const observe = (event: MouseEvent, phase: string) => {
              if (observations++ >= 16) return;
              const china = findChinaLink();
              const rect = china?.getBoundingClientRect();
              const target = event.target instanceof Element ? event.target : null;
              void evidenceWindow
                .__portalRegionNavigationEvidence?.({
                  phase,
                  documentMs: performance.now(),
                  target: hitKind(target, china),
                  hit: hitKind(document.elementFromPoint(event.clientX, event.clientY), china),
                  point: [event.clientX, event.clientY],
                  chinaRect: rect ? [rect.x, rect.y, rect.width, rect.height] : null,
                  pending: Boolean(
                    document.querySelector(".catalog-region-explorer[data-pending]"),
                  ),
                  defaultPrevented: event.defaultPrevented,
                  mapMounted: Boolean(document.querySelector(".region-maplibre")),
                })
                .catch(() => {});
            };
            for (const name of ["pointerdown", "pointerup", "click"] as const) {
              window.addEventListener(
                name,
                (event) => {
                  if (!event.isTrusted || new URL(location.href).searchParams.has("geoNode"))
                    return;
                  observe(event, name);
                  if (name === "click") setTimeout(() => observe(event, "after-click"), 0);
                },
                { capture: true, passive: true },
              );
            }
          },
          { origin, searchPath },
        );
      } catch {
        record("pointer-observer-unavailable");
        console.warn("Could not install the Portal region navigation pointer observer.");
      }

      try {
        await use();
      } finally {
        page.off("request", onRequest);
        page.off("response", onResponse);
        page.off("requestfinished", onFinished);
        page.off("requestfailed", onFailed);
        page.off("framenavigated", onNavigation);
        if (
          (info.status === "failed" || info.status === "timedOut") &&
          info.status !== info.expectedStatus
        ) {
          const finalUrl = urlObservation(page.url());
          await writeFile(
            info.outputPath(evidenceFile),
            JSON.stringify(
              {
                schema: "portal.region-navigation-first-attempt.v1",
                retry: info.retry,
                status: info.status,
                finalRoute: finalUrl.route,
                finalMatchesChinaAssertion: finalUrl.matchesChinaAssertion,
                droppedEvents,
                events,
              },
              null,
              2,
            ) + "\n",
            { flag: "wx" },
          );
        }
      }
    },
    { auto: true },
  ],
});
