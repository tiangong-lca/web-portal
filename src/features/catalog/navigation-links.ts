import type { BrowseSearchInput, NavigationDimension } from "@/server/contracts/navigation";
import { searchParameters } from "./search-links";
import { localePath, type PortalLocale } from "@/i18n/routing";

export function navigationHref(
  locale: PortalLocale,
  input: BrowseSearchInput,
  dimension: NavigationDimension,
  nodeId: string | null,
  options: { results?: boolean; scope?: "subtree" | "direct"; cursor?: string; code?: string } = {},
): string {
  const parameters = searchParameters(input, null);
  const geographic = dimension === "geography";
  const nodeKey = geographic ? "geoNode" : "classNode";
  const scopeKey = geographic ? "geoScope" : "classScope";
  parameters.delete(geographic ? "geo" : "classification");
  parameters.delete(nodeKey);
  parameters.delete(scopeKey);
  if (nodeId) {
    parameters.set(nodeKey, nodeId);
    parameters.set(scopeKey, options.scope ?? "subtree");
    // Virtual raw-group parents use a synthetic code, not an authored filter.
    if (nodeId.includes(":~") && !nodeId.endsWith(":~raw") && options.code)
      parameters.set(geographic ? "geo" : "classification", options.code);
  }
  if (!options.results && geographic) parameters.set("explore", "region");
  else parameters.set("explore", input.kind);
  if (options.cursor) parameters.set("navCursor", options.cursor);
  return `${localePath(locale, "search")}?${parameters}`;
}

export function hierarchyFilters(input: BrowseSearchInput, dimension: NavigationDimension) {
  const filters = { ...input.filters };
  if (dimension === "classification") {
    delete filters.classificationNodeId;
    delete filters.classificationScope;
    delete filters.classification;
  } else {
    delete filters.geographyNodeId;
    delete filters.geographyScope;
    delete filters.geography;
  }
  return filters;
}
