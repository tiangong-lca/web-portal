import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  Map as LibreMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapGeoJSONFeature,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  geometryBounds,
  regionLabel,
  type RegionEntry,
  type RegionFeature,
  type RegionGeometry,
} from "./types";
import type { PortalLocale } from "@/i18n/routing";

setWorkerUrl(workerUrl);
const empty: RegionGeometry = { type: "FeatureCollection", features: [] };
const identity: ["coalesce", ["get", string], ["get", string], string] = [
  "coalesce",
  ["get", "navigationNodeId"],
  ["get", "nodeId"],
  "",
];
let nextInstance = 0;

type Props = {
  layer: string;
  layerUrl: string;
  worldUrl: string;
  chinaUrl: string;
  chinaBounds: [number, number, number, number];
  globe: boolean;
  dark: boolean;
  locale: PortalLocale;
  entries: RegionEntry[];
  selected: string | null;
  cameraRequest: { nodeId: string | null; sequence: number };
  reducedMotion?: boolean;
  unavailable?: boolean;
  label: string;
  loadingLabel: string;
  gestures: { windows: string; mac: string; mobile: string };
  unavailableLabel: string;
  onSelect: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
  onReady: (ready: boolean) => void;
};

/** Prototype-only MapLibre renderer. Production routes never import this module.
 * @import import { MapScene } from ".storybook/maplibre-reference/map-scene";
 */
export function MapScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const onSelect = useEffectEvent(props.onSelect);
  const onHover = useEffectEvent(props.onHover);
  const onReady = useEffectEvent(props.onReady);
  const activeEntries = useEffectEvent(() => props.entries);
  const initial = useRef({ dark: props.dark, label: props.label, gestures: props.gestures });
  const geometryCache = useRef(new Map<string, RegionGeometry>());
  const [completedUrl, setCompletedUrl] = useState<string | null>(null);
  const framed = useRef(false);
  const shapeRef = useRef<RegionGeometry>(empty);
  const markers = useRef<Marker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [moving, setMoving] = useState(false);
  const [instance] = useState(() => ++nextInstance);

  const fit = useEffectEvent((nodeId: string | null, immediate = false) => {
    const map = mapRef.current;
    if (!map) return;
    const reduced =
      props.reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = immediate || !framed.current || reduced ? 0 : 850;
    if (props.layer === "world" && !nodeId) {
      map.flyTo({
        center: [137, 24],
        zoom: props.globe ? 1.85 : 1.3,
        bearing: 0,
        pitch: 0,
        duration,
      });
      return;
    }
    const shapes = nodeId
      ? shapeRef.current.features.filter(
          (feature) =>
            (feature.properties.navigationNodeId ?? feature.properties.nodeId) === nodeId,
        )
      : shapeRef.current.features.filter((feature) => feature.properties.nodeId !== null);
    const bounds =
      nodeId === "geo:cn" || (!nodeId && props.layer === "geo:cn")
        ? props.chinaBounds
        : geometryBounds(shapes);
    if (!bounds) return;
    const [w, s, e, n] = bounds;
    if (e - w > 180) {
      map.flyTo({ center: [137, 24], zoom: 1.5, duration });
      return;
    }
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      {
        padding: { top: 64, bottom: 64, left: 60, right: 90 },
        maxZoom: nodeId ? 9 : 7.5,
        duration,
        pitch: 0,
        bearing: 0,
      },
    );
  });

  useEffect(() => {
    if (!host.current || props.unavailable) return;
    let disposed = false;
    let map: LibreMap;
    try {
      map = new LibreMap({
        container: host.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "ocean",
              type: "background",
              paint: { "background-color": initial.current.dark ? "#152a35" : "#e5f1f6" },
            },
          ],
        },
        center: [137, 24],
        zoom: 1.85,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        cooperativeGestures: true,
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": initial.current.gestures.windows,
          "CooperativeGesturesHandler.MacHelpText": initial.current.gestures.mac,
          "CooperativeGesturesHandler.MobileHelpText": initial.current.gestures.mobile,
        },
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
        canvasContextAttributes: { antialias: true },
        renderWorldCopies: true,
      });
    } catch {
      queueMicrotask(() => {
        if (!disposed) {
          setPhase("failed");
          onReady(false);
        }
      });
      return () => {
        disposed = true;
      };
    }
    mapRef.current = map;
    map.getCanvas().setAttribute("aria-label", initial.current.label);
    map.on("load", () => {
      if (disposed) return;
      for (const id of ["world", "china", "regions"])
        map.addSource(id, { type: "geojson", data: empty });
      map.addLayer({
        id: "land",
        type: "fill",
        source: "world",
        paint: { "fill-color": "#faf9f6" },
      });
      map.addLayer({
        id: "world-lines",
        type: "line",
        source: "world",
        paint: { "line-color": "#b9c6cd", "line-width": 0.65 },
      });
      map.addLayer({
        id: "china-lines",
        type: "line",
        source: "china",
        paint: { "line-color": "#bdc6c9", "line-width": 0.75 },
      });
      map.addLayer({
        id: "regions-fill",
        type: "fill",
        source: "regions",
        paint: { "fill-color": "#eee8f1", "fill-opacity": 1 },
      });
      map.addLayer({
        id: "regions-lines",
        type: "line",
        source: "regions",
        paint: { "line-color": "#8c8093", "line-width": 0.7 },
      });
      map.addLayer({
        id: "selected-lines",
        type: "line",
        source: "regions",
        filter: ["==", identity, "__none__"],
        paint: { "line-color": "#512063", "line-width": 2.5 },
      });
      map.addLayer({
        id: "hover-lines",
        type: "line",
        source: "regions",
        filter: ["==", identity, "__none__"],
        paint: { "line-color": "#75358b", "line-width": 2 },
      });
      setLoaded(true);
    });
    const pick = (event: MapMouseEvent): MapGeoJSONFeature | undefined => {
      if (!map.getLayer("regions-fill") || map.isMoving()) return;
      // Exact painted geometry wins. Nearby shapes remain selectable via explicit HTML callouts.
      return map
        .queryRenderedFeatures(event.point, { layers: ["regions-fill"] })
        .find((feature) =>
          activeEntries().some(
            (entry) =>
              entry.nodeId === (feature.properties.navigationNodeId ?? feature.properties.nodeId),
          ),
        );
    };
    map.on("mousemove", (event) => {
      const feature = pick(event);
      const nodeId = feature
        ? String(feature.properties.navigationNodeId ?? feature.properties.nodeId)
        : null;
      map.getCanvas().style.cursor = nodeId ? "pointer" : "grab";
      if (map.getLayer("hover-lines"))
        map.setFilter("hover-lines", ["==", identity, nodeId ?? "__none__"]);
      onHover(nodeId);
    });
    map.on("click", (event) => {
      const feature = pick(event);
      if (feature)
        onSelect(String(feature.properties.navigationNodeId ?? feature.properties.nodeId));
    });
    map.on("movestart", () => {
      setMoving(true);
      onHover(null);
    });
    map.on("moveend", () => setMoving(false));
    map.on("idle", () => {
      // Observable camera receipts let interaction tests verify the rendered journey.
      const element = host.current;
      if (!element || disposed) return;
      element.dataset.cameraZoom = map.getZoom().toFixed(3);
      element.dataset.cameraLongitude = map.getCenter().lng.toFixed(3);
      element.dataset.cameraLatitude = map.getCenter().lat.toFixed(3);
    });
    map.on("error", () => {
      if (!disposed) {
        setPhase("failed");
        onReady(false);
      }
    });
    // Storybook freezes animation callbacks in review thumbnails. Paint completed
    // source work synchronously so the thumbnail contains the real map, not a loader.
    map.on("sourcedata", (event) => {
      if (event.isSourceLoaded)
        queueMicrotask(() => {
          if (!disposed) map.redraw();
        });
    });
    const observer = new ResizeObserver(() => {
      map.resize();
      map.redraw();
    });
    observer.observe(host.current);
    return () => {
      disposed = true;
      observer.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.remove();
      mapRef.current = null;
    };
    // The camera instance survives every geographic level; callbacks read current React props.
  }, [props.unavailable]);

  const synchronizeProjection = useEffectEvent(() => {
    const map = mapRef.current;
    if (!map) return;
    // Globe begins flattening as country/province detail enters view.
    map.setProjection({
      type: props.globe
        ? ["interpolate", ["linear"], ["zoom"], 2, "vertical-perspective", 4, "mercator"]
        : "mercator",
    });
    fit(props.selected);
  });
  useEffect(() => {
    if (loaded) synchronizeProjection();
  }, [loaded, props.globe]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    let active = true;
    const controller = new AbortController();
    onReady(false);
    map.stop();
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const read = async (url: string): Promise<RegionGeometry> => {
      const cached = geometryCache.current.get(url);
      if (cached) return cached;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Geometry unavailable");
      const value = (await response.json()) as RegionGeometry;
      if (value.type !== "FeatureCollection" || !Array.isArray(value.features))
        throw new Error("Invalid geometry");
      geometryCache.current.set(url, value);
      return value;
    };
    void Promise.all([
      read(props.worldUrl),
      read(props.layerUrl),
      props.layer !== "world" && props.layer !== "geo:cn"
        ? read(props.chinaUrl)
        : Promise.resolve(empty),
    ])
      .then(async ([world, layer, china]) => {
        if (!active) return;
        const counts = new Map(props.entries.map((entry) => [entry.nodeId, entry.count]));
        const features: RegionFeature[] = layer.features.map((feature) => ({
          ...feature,
          properties: {
            ...feature.properties,
            count:
              counts.get(feature.properties.navigationNodeId ?? feature.properties.nodeId ?? "") ??
              null,
          },
        }));
        shapeRef.current = { ...layer, features };
        await Promise.all([
          (map.getSource("world") as GeoJSONSource).setData(world),
          (map.getSource("china") as GeoJSONSource).setData(china),
          (map.getSource("regions") as GeoJSONSource).setData(shapeRef.current),
        ]);
        if (!active) return;
        const maximum = Math.max(2, ...props.entries.map((entry) => entry.count));
        map.setPaintProperty("regions-fill", "fill-color", [
          "case",
          ["==", ["get", "count"], null],
          props.dark ? "#34404a" : "#e6e9eb",
          ["==", ["get", "count"], 0],
          props.dark ? "#26323b" : "#faf9f6",
          [
            "interpolate",
            ["linear"],
            ["sqrt", ["get", "count"]],
            1,
            props.dark ? "#604476" : "#e9ddec",
            Math.sqrt(maximum),
            props.dark ? "#c195dd" : "#622977",
          ],
        ]);
        map.setPaintProperty("ocean", "background-color", props.dark ? "#142833" : "#e5f1f6");
        map.setPaintProperty("land", "fill-color", props.dark ? "#26363e" : "#faf9f6");
        map.setPaintProperty("world-lines", "line-color", props.dark ? "#4a5b65" : "#b9c6cd");
        map.setPaintProperty("selected-lines", "line-color", props.dark ? "#f2d9ff" : "#48205a");
        if (props.layer === "geo:cn") {
          for (const code of ["TW", "HK", "MO"]) {
            const entry = props.entries.find((candidate) => candidate.code === code);
            if (!entry) continue;
            const bounds = geometryBounds(
              features.filter((feature) => feature.properties.nodeId === entry.nodeId),
            );
            if (!bounds) continue;
            const button = document.createElement("button");
            button.type = "button";
            button.className = `globe-region-callout globe-region-callout-${code.toLowerCase()}`;
            button.textContent = regionLabel(entry, props.locale);
            button.setAttribute(
              "aria-label",
              `${regionLabel(entry, props.locale)} · ${entry.count}`,
            );
            button.addEventListener("click", (event) => {
              event.stopPropagation();
              onSelect(entry.nodeId);
            });
            const marker = new Marker({
              element: button,
              anchor: "left",
              offset: code === "MO" ? [14, 24] : code === "HK" ? [18, -25] : [12, 0],
            })
              .setLngLat([(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2])
              .addTo(map);
            markers.current.push(marker);
          }
        }
        fit(null);
        framed.current = true;
        const ready = () => {
          if (active) {
            setCompletedUrl(props.layerUrl);
            setPhase("ready");
            onReady(true);
          }
        };
        map.once("idle", ready);
        map.redraw();
      })
      .catch(() => {
        if (active) {
          setPhase("failed");
          onReady(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    loaded,
    props.layerUrl,
    props.worldUrl,
    props.chinaUrl,
    props.layer,
    props.entries,
    props.dark,
    props.locale,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (loaded && map?.getLayer("selected-lines"))
      map.setFilter("selected-lines", ["==", identity, props.selected ?? "__none__"]);
  }, [loaded, props.selected]);
  useEffect(() => {
    if (loaded) fit(props.cameraRequest.nodeId);
  }, [loaded, props.cameraRequest]);

  const displayPhase =
    props.unavailable || phase === "failed"
      ? "failed"
      : completedUrl === props.layerUrl
        ? phase
        : "loading";
  return (
    <div
      className="globe-scene"
      data-scene-instance={instance}
      data-layer={props.layer}
      data-state={displayPhase}
      data-moving={moving || undefined}
    >
      <div ref={host} className="globe-scene-canvas" />
      {displayPhase !== "ready" && (
        <output className="globe-scene-status">
          {displayPhase === "failed" ? props.unavailableLabel : props.loadingLabel}
        </output>
      )}
    </div>
  );
}
