import type { BrowseSearchInput as PortalSearchUrlInput } from "@/server/contracts/navigation";
import { localePath, type PortalLocale } from "@/i18n/routing";

const pageTrailParameter = "pageTrail";
const rootPageToken = "~";
const cursorPattern = /^[A-Za-z0-9_-]{1,4096}$/u;
const maximumTrailEntries = 12;
const maximumSerializedTrailLength = 4096;

export type SearchCursorTrail = (string | null)[];

type SearchParameterRecord = Record<string, string | string[] | undefined>;

function firstParameter(
  parameters: URLSearchParams | SearchParameterRecord,
  key: string,
): string | undefined {
  if (parameters instanceof URLSearchParams) return parameters.get(key) ?? undefined;
  const value = parameters[key];
  return Array.isArray(value) ? value[0] : value;
}

function setSearchCursorTrail(parameters: URLSearchParams, trail: SearchCursorTrail): void {
  const bounded = trail.slice(-maximumTrailEntries);
  while (bounded.length > 0) {
    const serialized = bounded.map((cursor) => cursor ?? rootPageToken).join(".");
    parameters.set(pageTrailParameter, serialized);
    const decodedLength = Array.from(parameters).reduce(
      (length, [key, value]) => length + key.length + value.length,
      0,
    );
    if (serialized.length <= maximumSerializedTrailLength && decodedLength <= 7800) return;
    bounded.shift();
  }
  parameters.delete(pageTrailParameter);
}

export function parseSearchCursorTrail(
  parameters: URLSearchParams | SearchParameterRecord,
): SearchCursorTrail {
  const value = firstParameter(parameters, pageTrailParameter);
  if (!value || value.length > maximumSerializedTrailLength) return [];
  const tokens = value.split(".");
  if (tokens.length > maximumTrailEntries) return [];
  if (tokens.some((token) => token !== rootPageToken && !cursorPattern.test(token))) return [];
  return tokens.map((token) => (token === rootPageToken ? null : token));
}

export function searchParameters(
  input: PortalSearchUrlInput,
  cursor: string | null = input.cursor,
): URLSearchParams {
  const p = new URLSearchParams({
    kind: input.kind,
    limit: String(input.limit),
    q: input.query,
    sort: input.sort,
    v: "1",
  });
  if (cursor) p.set("cursor", cursor);
  const fields = {
    access: input.filters.accessLevel,
    geo: input.filters.geography,
    classification: input.filters.classification,
    classNode: input.filters.classificationNodeId,
    classScope: input.filters.classificationScope,
    geoNode: input.filters.geographyNodeId,
    geoScope: input.filters.geographyScope,
    yearFrom: input.filters.referenceYearFrom,
    yearTo: input.filters.referenceYearTo,
    subtype: input.filters.processSubtype,
    source: input.filters.source,
  };
  for (const [key, value] of Object.entries(fields))
    if (value !== undefined) p.set(key, String(value));
  return p;
}

export function searchHref(
  locale: PortalLocale,
  input: PortalSearchUrlInput,
  cursor: string | null = input.cursor,
): string {
  return `${localePath(locale, "search")}?${searchParameters(input, cursor)}`;
}

export function nextSearchPageHref(
  locale: PortalLocale,
  input: PortalSearchUrlInput,
  nextCursor: string,
  trail: SearchCursorTrail,
): string {
  const parameters = searchParameters(input, nextCursor);
  setSearchCursorTrail(parameters, [...trail, input.cursor]);
  return `${localePath(locale, "search")}?${parameters}`;
}

export function previousSearchPageHref(
  locale: PortalLocale,
  input: PortalSearchUrlInput,
  trail: SearchCursorTrail,
): string | null {
  if (trail.length === 0) return null;
  const previousCursor = trail.at(-1) ?? null;
  const parameters = searchParameters(input, previousCursor);
  setSearchCursorTrail(parameters, trail.slice(0, -1));
  return `${localePath(locale, "search")}?${parameters}`;
}

export function facetHref(
  locale: PortalLocale,
  input: PortalSearchUrlInput,
  groupId: string,
  value: string,
): string | null {
  const p = searchParameters(input, null);
  const group = groupId.toLowerCase().replaceAll(/[^a-z]/gu, "");
  if (group === "kind" || group === "objecttype") {
    if (value !== "process" && value !== "flow") return null;
    p.set("kind", value);
    if (value !== input.kind) {
      p.delete("classNode");
      p.delete("classScope");
      p.delete("classification");
    }
    if (value === "flow") p.delete("subtype");
  } else if (group.includes("access")) {
    if (value !== "open" && value !== "metadata_only") return null;
    p.set("access", value);
  } else if (group.includes("geography") || group.includes("region")) {
    p.set("geo", value);
    p.delete("geoNode");
    p.delete("geoScope");
  } else if (group.includes("year")) {
    if (!/^\d{1,4}$/u.test(value)) return null;
    p.set("yearFrom", value);
    p.set("yearTo", value);
  } else if (group.includes("subtype")) {
    if (input.kind !== "process") return null;
    p.set("subtype", value);
  } else if (group.includes("source") || group.includes("database")) p.set("source", value);
  else if (group.includes("classification")) p.set("classification", value);
  else return null;
  return `${localePath(locale, "search")}?${p}`;
}

export function hasCatalogQuery(input: PortalSearchUrlInput): boolean {
  return Boolean(
    input.query ||
    input.cursor ||
    Object.values(input.filters).some((value) => value !== undefined),
  );
}
