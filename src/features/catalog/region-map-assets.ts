import "server-only";
import manifest from "./region-maplibre-manifest.generated.json";
import type { RegionMapAssets, RegionMapBounds } from "./region-maplibre-types";

/** Only the current layer and its two reusable context URLs cross the server/client boundary. */
export function regionMapAssets(layer: string): RegionMapAssets | undefined {
  const layers: Record<string, { url: string }> = manifest.layers;
  const current = layers[layer];
  if (!current) return;
  return {
    layer,
    url: current.url,
    worldUrl: manifest.layers.world.url,
    chinaUrl: manifest.layers["geo:cn"].url,
    chinaBounds: manifest.layers["geo:cn"].bounds as RegionMapBounds,
    workerUrl: manifest.renderer.worker.url,
    noticeUrl: manifest.renderer.notice.url,
  };
}
