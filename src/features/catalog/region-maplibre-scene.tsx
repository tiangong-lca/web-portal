"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  Map as LibreMap,
  setWorkerUrl,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  RegionMapBounds,
  RegionMapFeature,
  RegionMapGeometry,
  RegionMapSceneProps,
  RegionMapStatus,
} from "./region-maplibre-types";

/** Presentation identity of a shape. The world layer aliases Taiwan, Hong Kong and Macao to the
 * China entry through `navigationNodeId`, so those shapes highlight and select as one target. */
const identity: ["coalesce", ["get", string], ["get", string], string] = [
  "coalesce",
  ["get", "navigationNodeId"],
  ["get", "nodeId"],
  "",
];
const WORLD = "world";
const CHINA = "china";
const REGIONS = "regions";
const EMPTY: RegionMapGeometry = { type: "FeatureCollection", features: [] };
const NOTHING = "__none__";
/** Reviewed framing: the globe looks at East Asia and the western Pacific, and the flat world is
 * Pacific-centred so the seam never runs through the continent being browsed. */
const GLOBE_CENTER: [number, number] = [137, 24];
const FLAT_CENTER: [number, number] = [150, 24];
const WORLD_LATITUDE = 24;
/** Reviewed zooms for a canvas without a measurable size yet. */
const GLOBE_FALLBACK_ZOOM = 1.85;
const FLAT_FALLBACK_ZOOM = 1.3;
const CAMERA_DURATION = 850;
const TILE_SIZE = 512;
/** Leave a margin so the framed world is not flush with the canvas edges. */
const WORLD_MARGIN = 0.92;
const REGION_PADDING = { top: 64, bottom: 64, left: 60, right: 90 };
const REGION_MAX_ZOOM = 9;
const LEVEL_MAX_ZOOM = 7.5;
const MAX_GEOMETRY_BYTES = 2 * 1024 * 1024;
const MAX_FEATURES = 1000;
/** A worker that never answers leaves the map loading with no error event; fail instead. */
const READY_TIMEOUT_MS = 20_000;
const LINE_WIDTH = { world: 0.65, china: 0.75, regions: 0.7, selected: 2.5, hover: 2 };
/** Reviewed prototype colors, used for any token the Portal does not define. */
const REVIEWED_HOVER = "#75358b";
const COLOR_SENTINEL = "#010203";

type Palette = {
  water: string;
  land: string;
  border: string;
  empty: string;
  unknown: string;
  low: string;
  high: string;
  selected: string;
  hover: string;
};

const REVIEWED_LIGHT: Palette = {
  water: "#e5f1f6",
  land: "#faf9f6",
  border: "#b9c6cd",
  empty: "#faf9f6",
  unknown: "#e6e9eb",
  low: "#e9ddec",
  high: "#622977",
  selected: "#48205a",
  hover: REVIEWED_HOVER,
};
const REVIEWED_DARK: Palette = {
  water: "#142833",
  land: "#26363e",
  border: "#4a5b65",
  empty: "#26323b",
  unknown: "#34404a",
  low: "#604476",
  high: "#c195dd",
  selected: "#f2d9ff",
  hover: REVIEWED_HOVER,
};
/** The Portal's map tokens; the parent legend and the canvas read the same values. */
const TOKENS = {
  water: "--map-water",
  land: "--map-land",
  border: "--map-border",
  empty: "--map-empty",
  unknown: "--map-unknown",
  low: "--map-count-low",
  high: "--map-count-high",
  selected: "--map-selected",
} as const;

let nextInstance = 0;
let colorContext: CanvasRenderingContext2D | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function identityOf(properties: unknown) {
  if (!isRecord(properties)) return "";
  const { navigationNodeId, nodeId } = properties;
  if (typeof navigationNodeId === "string" && navigationNodeId) return navigationNodeId;
  return typeof nodeId === "string" ? nodeId : "";
}

function sameOrigin(url: string) {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function hexPart(value: number) {
  return value.toString(16).padStart(2, "0");
}

/**
 * Convert a computed CSS color into the sRGB hex form MapLibre parses. The engine resolves
 * `color-mix()`, `oklch()` and wide-gamut syntaxes itself, so no color library ships with the
 * scene; a color MapLibre could not parse keeps the reviewed fallback instead.
 */
function toMapColor(value: string, fallback: string) {
  const text = value.trim();
  if (!text) return fallback;
  try {
    if (/^#[0-9a-f]{6}$/iu.test(text)) return text.toLowerCase();
    if (colorContext === undefined) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      colorContext = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!colorContext) return fallback;
    // An invalid assignment is ignored, so a sentinel proves the engine accepted the value.
    colorContext.fillStyle = COLOR_SENTINEL;
    colorContext.fillStyle = text;
    if (colorContext.fillStyle === COLOR_SENTINEL && !/^#010203$/iu.test(text)) return fallback;
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 0] = colorContext.getImageData(0, 0, 1, 1).data;
    const base = `#${hexPart(red)}${hexPart(green)}${hexPart(blue)}`;
    return alpha === 255 ? base : `${base}${hexPart(alpha)}`;
  } catch {
    return fallback;
  }
}

function reviewedPalette(): Palette {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? REVIEWED_DARK
    : REVIEWED_LIGHT;
}

/** Resolve the Portal's map tokens through the cascade, preferring the hidden probe so tokens
 * defined on the scene, on the level or on the document are all honoured. */
function resolvePalette(probe: Element | null, host: Element | null): Palette {
  const fallback = reviewedPalette();
  const read = (token: string) => {
    for (const element of [probe, host]) {
      if (!element) continue;
      const value = getComputedStyle(element).getPropertyValue(token).trim();
      if (value) return value;
    }
    return "";
  };
  const color = (name: keyof typeof TOKENS) => toMapColor(read(TOKENS[name]), fallback[name]);
  return {
    water: color("water"),
    land: color("land"),
    border: color("border"),
    empty: color("empty"),
    unknown: color("unknown"),
    low: color("low"),
    high: color("high"),
    selected: color("selected"),
    hover: REVIEWED_HOVER,
  };
}

function validBounds(value: unknown): value is RegionMapBounds {
  return Array.isArray(value) && value.length === 4 && value.every((part) => Number.isFinite(part));
}

function parseGeometry(value: unknown): RegionMapGeometry {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features))
    throw new Error("Invalid geometry");
  if (value.features.length > MAX_FEATURES) throw new Error("Oversized geometry");
  for (const feature of value.features) {
    if (!isRecord(feature) || feature.type !== "Feature") throw new Error("Invalid feature");
    const { properties, geometry } = feature;
    if (!isRecord(properties) || typeof properties.boundaryId !== "string")
      throw new Error("Invalid feature identity");
    if (!validBounds(properties.bounds)) throw new Error("Invalid feature bounds");
    if (properties.nodeId !== null && typeof properties.nodeId !== "string")
      throw new Error("Invalid feature node");
    if (!isRecord(geometry) || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon"))
      throw new Error("Invalid feature shape");
    if (!Array.isArray(geometry.coordinates)) throw new Error("Invalid feature coordinates");
  }
  return value as unknown as RegionMapGeometry;
}

/** Anonymous, same-origin, public reads only; the raw bytes stay capped like the SVG pipeline. */
async function fetchGeometry(url: string, signal: AbortSignal): Promise<RegionMapGeometry> {
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error(`Geometry unavailable: ${response.status}`);
  const text = await response.text();
  if (new TextEncoder().encode(text).length > MAX_GEOMETRY_BYTES)
    throw new Error("Oversized geometry");
  return parseGeometry(JSON.parse(text));
}

/** Union of reviewed feature boxes, unwrapping boxes that cross the antimeridian. */
function unionBounds(features: readonly RegionMapFeature[]): RegionMapBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const feature of features) {
    const [boxWest, boxSouth, boxEast, boxNorth] = feature.properties.bounds;
    west = Math.min(west, boxWest);
    east = Math.max(east, boxWest > boxEast ? boxEast + 360 : boxEast);
    south = Math.min(south, boxSouth);
    north = Math.max(north, boxNorth);
  }
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

/** Zoom that fits the whole world, or the whole globe, into the canvas it is drawn on. */
function worldZoom(globe: boolean, width: number, height: number) {
  const size = Math.min(width, height);
  if (!size) return globe ? GLOBE_FALLBACK_ZOOM : FLAT_FALLBACK_ZOOM;
  const worldSize = globe
    ? Math.PI * size * WORLD_MARGIN * Math.cos((WORLD_LATITUDE * Math.PI) / 180)
    : // A Mercator world spans the viewport width once; fitting its square to the shorter
      // height would repeat several copies across a wide catalog canvas.
      width;
  return Math.max(0, Math.log2(worldSize / TILE_SIZE));
}

/** Production MapLibre renderer for the public catalog regions. One map survives geographic
 * level, entries/count, mode and theme changes. The surrounding product UI owns selection
 * controls, legends, markers and small-region shortcuts, so none of them live here.
 * @import import { RegionMapScene } from "@/features/catalog/region-maplibre-scene";
 */
export function RegionMapScene({
  assets,
  entries,
  globe,
  locale,
  selected,
  cameraRequest,
  reducedMotion,
  unavailable,
  labels,
  onSelect,
  onHover,
  onReady,
  onStatus,
  onMoving,
}: RegionMapSceneProps) {
  const scene = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const styleRef = useRef(false);
  const geometryRef = useRef<RegionMapGeometry | null>(null);
  const cacheRef = useRef(new Map<string, RegionMapGeometry>());
  const framedRef = useRef(false);
  const interactiveRef = useRef(false);
  const measureRef = useRef(false);
  const maximumRef = useRef(2);
  const [revision, setRevision] = useState(0);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [moving, setMoving] = useState(false);

  const readEntries = useEffectEvent(() => entries);
  const readGlobe = useEffectEvent(() => globe);
  const readSelected = useEffectEvent(() => selected);
  const readLabels = useEffectEvent(() => labels);
  const readCameraRequest = useEffectEvent(() => cameraRequest);
  const selectEvent = useEffectEvent((nodeId: string) => onSelect(nodeId));
  const hoverEvent = useEffectEvent((nodeId: string | null) => onHover(nodeId));
  const readyEvent = useEffectEvent((ready: boolean) => onReady(ready));
  const statusEvent = useEffectEvent((status: RegionMapStatus) => onStatus?.(status));
  const movingEvent = useEffectEvent((value: boolean) => onMoving?.(value));
  const prefersReduced = useEffectEvent(
    () =>
      Boolean(reducedMotion) ||
      (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  );

  const liveMap = () => (styleRef.current ? mapRef.current : null);

  useEffect(() => {
    // The instance receipt tells a remount from a re-render; it is written after hydration.
    const element = scene.current;
    if (element) element.dataset.sceneInstance = String(++nextInstance);
  }, []);

  /** Theme colors only: geometry, feature state and the camera are untouched. */
  const applyPalette = useEffectEvent(() => {
    const map = liveMap();
    if (!map) return;
    const palette = resolvePalette(probe.current, host.current);
    map.setPaintProperty("ocean", "background-color", palette.water);
    map.setPaintProperty("land", "fill-color", palette.land);
    for (const layer of ["world-lines", "china-lines", "regions-lines"])
      map.setPaintProperty(layer, "line-color", palette.border);
    map.setPaintProperty("selected-lines", "line-color", palette.selected);
    map.setPaintProperty("hover-lines", "line-color", palette.hover);
    // Counts stay unknown until their level and entries are installed; zero stays selectable, and
    // the reviewed ramp keeps the smallest positive count at its low end.
    map.setPaintProperty("regions-fill", "fill-color", [
      "case",
      ["!=", ["feature-state", "known"], true],
      palette.unknown,
      ["==", ["feature-state", "count"], 0],
      palette.empty,
      [
        "interpolate",
        ["linear"],
        ["sqrt", ["feature-state", "count"]],
        1,
        palette.low,
        Math.sqrt(Math.max(2, maximumRef.current)),
        palette.high,
      ],
    ]);
  });

  /** Per-feature count state keyed by `navigationNodeId ?? nodeId`: the world aliases highlight as
   * one target and counts are never summed across shapes. */
  const applyCounts = useEffectEvent(() => {
    const map = liveMap();
    const geometry = geometryRef.current;
    if (!map || !geometry) return;
    const counts = new Map(readEntries().map((entry) => [entry.nodeId, entry.count]));
    let maximum = 2;
    for (const count of counts.values()) maximum = Math.max(maximum, count);
    maximumRef.current = maximum;
    for (const feature of geometry.features) {
      const id = feature.properties.boundaryId;
      const nodeId = identityOf(feature.properties);
      const count = nodeId ? counts.get(nodeId) : undefined;
      if (typeof count !== "number" || !Number.isFinite(count) || count < 0)
        map.removeFeatureState({ source: REGIONS, id });
      else map.setFeatureState({ source: REGIONS, id }, { known: true, count });
    }
    applyPalette();
  });

  const frame = useEffectEvent(
    (map: LibreMap, bounds: RegionMapBounds, nodeId: string | null, duration: number) => {
      const [west, south, east, north] = bounds;
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: REGION_PADDING,
          maxZoom: nodeId ? REGION_MAX_ZOOM : LEVEL_MAX_ZOOM,
          duration,
          pitch: 0,
          bearing: 0,
        },
      );
    },
  );

  /** Reviewed framing: the level, then a selected region inside it. */
  const fit = useEffectEvent((nodeId: string | null, immediate = false) => {
    const map = liveMap();
    if (!map) return;
    const level = assets.layer;
    const reduced = prefersReduced();
    // Initial framing and reduced motion are immediate; later selections and level transitions
    // travel.
    const duration = immediate || !framedRef.current || reduced ? 0 : CAMERA_DURATION;
    if (level === "world" && !nodeId) {
      const canvas = map.getCanvas();
      map.flyTo({
        center: readGlobe() ? GLOBE_CENTER : FLAT_CENTER,
        zoom: worldZoom(readGlobe(), canvas.clientWidth, canvas.clientHeight),
        bearing: 0,
        pitch: 0,
        duration,
      });
      return;
    }
    if (nodeId === "geo:cn" || (!nodeId && level === "geo:cn")) {
      frame(map, assets.chinaBounds, nodeId, duration);
      return;
    }
    const shapes = (geometryRef.current?.features ?? []).filter((feature) =>
      nodeId ? identityOf(feature.properties) === nodeId : feature.properties.nodeId !== null,
    );
    const bounds = unionBounds(shapes);
    if (!bounds) return;
    // A union wider than a hemisphere is not a frame worth flying to.
    if (bounds[2] - bounds[0] > 180) {
      map.flyTo({ center: readGlobe() ? GLOBE_CENTER : FLAT_CENTER, zoom: 1.5, duration });
      return;
    }
    frame(map, bounds, nodeId, duration);
  });

  /** Projection belongs to the mode and the level; the camera request follows it. */
  const synchronizeProjection = useEffectEvent((level: string) => {
    const map = liveMap();
    if (!map) return;
    // Province and city views stay flat; otherwise the globe flattens as zoom approaches 4.
    const flat = !readGlobe() || (level !== "world" && level !== "geo:cn");
    map.setProjection({
      type: flat
        ? "mercator"
        : ["interpolate", ["linear"], ["zoom"], 2, "vertical-perspective", 4, "mercator"],
    });
    fit(readSelected());
  });

  useEffect(() => {
    const element = host.current;
    if (!element || unavailable) return;
    let disposed = false;
    const fail = () => {
      if (disposed) return;
      styleRef.current = false;
      setFailed(true);
      readyEvent(false);
    };
    // MapLibre builds its worker pool while the first map is constructed, so the supplied
    // same-origin worker is registered first; a cross-origin URL would be fetched as a blob.
    if (!sameOrigin(assets.workerUrl) || !assets.workerUrl.endsWith(".js")) {
      queueMicrotask(fail);
      return;
    }
    // Gesture help and the initial accessible name are fixed at construction; the surrounding UI
    // remounts the scene when it changes a locale.
    const initialLabels = readLabels();
    let map: LibreMap;
    const palette = resolvePalette(probe.current, element);
    try {
      setWorkerUrl(assets.workerUrl);
      map = new LibreMap({
        container: element,
        style: {
          version: 8,
          sources: {},
          layers: [
            { id: "ocean", type: "background", paint: { "background-color": palette.water } },
          ],
        },
        center: readGlobe() ? GLOBE_CENTER : FLAT_CENTER,
        zoom: worldZoom(readGlobe(), element.clientWidth, element.clientHeight),
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        cooperativeGestures: true,
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": initialLabels.gestureWindows,
          "CooperativeGesturesHandler.MacHelpText": initialLabels.gestureMac,
          "CooperativeGesturesHandler.MobileHelpText": initialLabels.gestureMobile,
        },
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
        canvasContextAttributes: { antialias: true },
        renderWorldCopies: true,
      });
    } catch {
      queueMicrotask(fail);
      return;
    }
    mapRef.current = map;
    const styleDeadline = window.setTimeout(fail, READY_TIMEOUT_MS);
    map.getCanvas().setAttribute("aria-label", initialLabels.title);
    let cursor = "grab";
    map.getCanvas().style.cursor = cursor;
    const setCursor = (value: string) => {
      if (cursor === value) return;
      cursor = value;
      map.getCanvas().style.cursor = value;
    };
    map.on("load", () => {
      if (disposed) return;
      window.clearTimeout(styleDeadline);
      for (const id of [WORLD, CHINA, REGIONS])
        map.addSource(id, {
          type: "geojson",
          data: EMPTY,
          ...(id === REGIONS ? { promoteId: "boundaryId" } : {}),
        });
      map.addLayer({
        id: "land",
        type: "fill",
        source: WORLD,
        paint: { "fill-color": palette.land },
      });
      map.addLayer({
        id: "world-lines",
        type: "line",
        source: WORLD,
        paint: { "line-color": palette.border, "line-width": LINE_WIDTH.world },
      });
      map.addLayer({
        id: "china-lines",
        type: "line",
        source: CHINA,
        paint: { "line-color": palette.border, "line-width": LINE_WIDTH.china },
      });
      // Count colors are opaque: no terrain, light, shading or faded fill over them.
      map.addLayer({
        id: "regions-fill",
        type: "fill",
        source: REGIONS,
        paint: { "fill-color": palette.unknown, "fill-opacity": 1 },
      });
      map.addLayer({
        id: "regions-lines",
        type: "line",
        source: REGIONS,
        paint: { "line-color": palette.border, "line-width": LINE_WIDTH.regions },
      });
      map.addLayer({
        id: "selected-lines",
        type: "line",
        source: REGIONS,
        filter: ["==", identity, NOTHING],
        paint: { "line-color": palette.selected, "line-width": LINE_WIDTH.selected },
      });
      map.addLayer({
        id: "hover-lines",
        type: "line",
        source: REGIONS,
        filter: ["==", identity, NOTHING],
        paint: { "line-color": palette.hover, "line-width": LINE_WIDTH.hover },
      });
      styleRef.current = true;
      setRevision((value) => value + 1);
    });
    /** Exact painted geometry only, and only ids the current entries expose. */
    const pick = (event: MapMouseEvent): MapGeoJSONFeature | undefined => {
      if (!map.getLayer("regions-fill") || map.isMoving()) return undefined;
      return map
        .queryRenderedFeatures(event.point, { layers: ["regions-fill"] })
        .find((feature) => {
          if (!interactiveRef.current) return false;
          const nodeId = identityOf(feature.properties);
          return Boolean(nodeId) && readEntries().some((entry) => entry.nodeId === nodeId);
        });
    };
    map.on("mousemove", (event) => {
      const nodeId = identityOf(pick(event)?.properties);
      setCursor(nodeId ? "pointer" : "grab");
      if (map.getLayer("hover-lines"))
        map.setFilter("hover-lines", ["==", identity, nodeId || NOTHING]);
      hoverEvent(nodeId || null);
    });
    map.on("click", (event) => {
      const nodeId = identityOf(pick(event)?.properties);
      if (nodeId) selectEvent(nodeId);
    });
    map.on("movestart", () => {
      setMoving(true);
      movingEvent(true);
      setCursor("grab");
      if (map.getLayer("hover-lines")) map.setFilter("hover-lines", ["==", identity, NOTHING]);
      hoverEvent(null);
    });
    map.on("moveend", () => {
      setMoving(false);
      movingEvent(false);
    });
    map.on("idle", () => {
      if (disposed) return;
      // Observable camera receipts; they describe the camera after a real idle frame.
      element.dataset.cameraZoom = map.getZoom().toFixed(3);
      element.dataset.cameraLongitude = map.getCenter().lng.toFixed(3);
      element.dataset.cameraLatitude = map.getCenter().lat.toFixed(3);
      const centerPoint = map.project(map.getCenter());
      element.dataset.cameraOriginX = String(centerPoint.x);
      element.dataset.cameraOriginY = String(centerPoint.y);
    });
    map.on("error", fail);
    // Resize also repaints, so a frozen review thumbnail keeps the last frame.
    const observer = new ResizeObserver(() => {
      map.resize();
      map.redraw();
      // A level installed while the canvas had no measurable size is framed once it has one; a
      // later resize never moves a camera the reader has already placed.
      if (measureRef.current && element.clientWidth > 0 && element.clientHeight > 0) {
        measureRef.current = false;
        fit(null, true);
      }
    });
    observer.observe(element);
    const theme = new MutationObserver(() => applyPalette());
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      disposed = true;
      window.clearTimeout(styleDeadline);
      styleRef.current = false;
      interactiveRef.current = false;
      geometryRef.current = null;
      framedRef.current = false;
      observer.disconnect();
      theme.disconnect();
      mapRef.current = null;
      map.remove();
    };
  }, [unavailable, assets.workerUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !revision) return;
    let active = true;
    const controller = new AbortController();
    const level = assets.layer;
    const layerUrl = assets.url;
    const fail = () => {
      if (!active) return;
      active = false;
      controller.abort();
      setFailed(true);
      readyEvent(false);
    };
    // Cover the whole install, including a worker that never resolves setData().
    const deadline = window.setTimeout(fail, READY_TIMEOUT_MS);
    // The old foreground stays as neutral context, but loses counts and interaction.
    setFailed(false);
    setReadyUrl(null);
    readyEvent(false);
    map.stop();
    interactiveRef.current = false;
    geometryRef.current = null;
    hoverEvent(null);
    if (map.getLayer("hover-lines")) map.setFilter("hover-lines", ["==", identity, NOTHING]);
    map.removeFeatureState({ source: REGIONS });
    const urls = [
      assets.worldUrl,
      layerUrl,
      ...(level === "world" || level === "geo:cn" ? [] : [assets.chinaUrl]),
    ];
    if (!urls.every(sameOrigin)) {
      queueMicrotask(fail);
      return;
    }
    const cache = cacheRef.current;
    const inflight = new Map<string, Promise<RegionMapGeometry>>();
    const load = (url: string) => {
      const cached = cache.get(url);
      if (cached) return Promise.resolve(cached);
      const ongoing = inflight.get(url);
      if (ongoing) return ongoing;
      const request = fetchGeometry(url, controller.signal).then((geometry) => {
        cache.set(url, geometry);
        return geometry;
      });
      inflight.set(url, request);
      return request;
    };
    void Promise.all([
      load(assets.worldUrl),
      load(layerUrl),
      level === "world" || level === "geo:cn" ? Promise.resolve(EMPTY) : load(assets.chinaUrl),
    ])
      .then(async ([world, layer, china]) => {
        if (!active) return;
        await Promise.all([
          (map.getSource(WORLD) as GeoJSONSource).setData(world),
          (map.getSource(CHINA) as GeoJSONSource).setData(china),
          (map.getSource(REGIONS) as GeoJSONSource).setData(layer),
        ]);
        if (!active) return;
        geometryRef.current = layer;
        interactiveRef.current = true;
        applyCounts();
        applyPalette();
        synchronizeProjection(level);
        framedRef.current = true;
        // A canvas measured only after this install re-frames the level once it has a size.
        const canvas = host.current;
        if (!canvas?.clientWidth || !canvas.clientHeight) measureRef.current = true;
        map.once("idle", () => {
          if (!active) return;
          window.clearTimeout(deadline);
          setReadyUrl(layerUrl);
          readyEvent(true);
        });
        map.redraw();
      })
      .catch(() => {
        if (!controller.signal.aborted) fail();
      });
    return () => {
      active = false;
      window.clearTimeout(deadline);
      controller.abort();
    };
  }, [revision, assets.layer, assets.url, assets.worldUrl, assets.chinaUrl]);

  useEffect(() => {
    if (revision) applyCounts();
  }, [revision, entries]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !revision) return;
    map.setFilter("selected-lines", ["==", identity, selected ?? NOTHING]);
  }, [revision, selected]);

  useEffect(() => {
    if (revision) synchronizeProjection(assets.layer);
  }, [revision, globe, assets.layer]);

  useEffect(() => {
    const map = mapRef.current;
    if (revision) map?.getCanvas().setAttribute("aria-label", labels.title);
  }, [revision, labels.title]);

  useEffect(() => {
    if (!revision) return;
    // Only a new request moves the camera; re-renders with the same sequence do not.
    fit(readCameraRequest().nodeId);
  }, [revision, cameraRequest.sequence]);

  // Status is composed from real outcomes only: a level is ready after its own idle frame and
  // failed only through a reported failure, never through a delay.
  const state: RegionMapStatus =
    unavailable || failed
      ? "failed"
      : readyUrl === assets.url && revision > 0
        ? "ready"
        : "loading";
  useEffect(() => {
    statusEvent(state);
  }, [state]);

  return (
    <div
      ref={scene}
      className="region-maplibre-scene"
      data-layer={assets.layer}
      data-state={state}
      data-moving={moving || undefined}
      data-notice-url={assets.noticeUrl}
      aria-busy={state === "loading" || undefined}
    >
      <div ref={host} className="region-maplibre-canvas" lang={locale} />
      <span
        ref={probe}
        className="region-maplibre-probe"
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
          visibility: "hidden",
          pointerEvents: "none",
        }}
      />
      {state !== "ready" && (
        <output className="region-maplibre-status">
          {state === "failed" ? labels.unavailable : labels.loading}
        </output>
      )}
    </div>
  );
}
