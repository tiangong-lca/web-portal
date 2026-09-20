"use client";

import { useTranslations } from "next-intl";
import "./region-maplibre.css";

/** Reserves the map frame while either lazy module is downloading.
 * @import import { RegionMapLoading } from "@/features/catalog/region-map-loading";
 */
export function RegionMapLoading({ whole = false }: { whole?: boolean }) {
  const t = useTranslations("Navigation");
  return (
    <div className={whole ? "region-maplibre-placeholder" : "region-maplibre-scene"}>
      <output className="region-maplibre-status">
        {t("mapLoading")}
      </output>
    </div>
  );
}
