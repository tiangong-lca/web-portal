import locationNames from "./locations.generated.json";
import supplementaryNames from "./navigation-locations.generated.json";
import type { PortalLocale } from "./routing";

const names: Record<string, Partial<Record<PortalLocale, string>>> = locationNames;
const supplementary: Record<
  string,
  Partial<Record<PortalLocale, string>>
> = supplementaryNames.names;

/** This is a display lookup, never a filter-code or geography-precision rewrite. */
export function geographyName(
  code: string | null | undefined,
  locale: PortalLocale,
): string | undefined {
  if (!code?.trim() || code.trim().toUpperCase() === "NULL") return undefined;
  const key = code.trim().toUpperCase();
  if (Object.hasOwn(names, key)) return names[key]?.[locale];
  const extra = Object.hasOwn(supplementary, key) ? supplementary[key] : undefined;
  return extra?.[locale] ?? (extra?.en && locale !== "en" ? `${extra.en} [en]` : undefined);
}

export function formatGeographyCode(
  code: string | null | undefined,
  locale: PortalLocale,
): string | undefined {
  if (!code?.trim() || code.trim().toUpperCase() === "NULL") return undefined;
  const name = geographyName(code, locale);
  if (name) return `${name} (${code.trim().toUpperCase()})`;
  // A known parent helps locate an unresolved Chinese code without inventing a city name.
  // This is display context only: filters and authored geography remain unchanged.
  const parentCode = /^(CN-[A-Z]{2})-[A-Z0-9-]+$/u.exec(code.trim().toUpperCase())?.[1];
  const parent = parentCode ? geographyName(parentCode, locale) : undefined;
  return parent ? `${parent} · ${code.trim().toUpperCase()}` : code;
}
