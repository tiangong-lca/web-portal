import "server-only";
import { getTranslations } from "next-intl/server";
import type {
  BrowseSearchInput,
  PublicNavigation,
  NavigationDimension,
} from "@/server/contracts/navigation";
import { navigationLabel } from "@/server/navigation-labels";
import type { PortalLocale } from "@/i18n/routing";
import { navigationHref } from "./navigation-links";
import type { CatalogNavigationProps } from "./catalog-navigation";

export async function navigationView(
  locale: PortalLocale,
  input: BrowseSearchInput,
  dimension: NavigationDimension,
  page: PublicNavigation | null,
): Promise<CatalogNavigationProps> {
  const t = await getTranslations({ locale, namespace: "Navigation" });
  const geographic = dimension === "geography";
  const scope = geographic ? input.filters.geographyScope : input.filters.classificationScope;
  const rootLabel = t(geographic ? "world" : "root");
  const label = (node: { nodeId: string; code: string }) => {
    const virtual: Record<
      string,
      "isic" | "cpc" | "elementary" | "special" | "unmapped" | "uncategorized"
    > = {
      "class:isic": "isic",
      "class:cpc": "cpc",
      "class:elementary": "elementary",
      "geo:special": "special",
      "geo:unmapped": "unmapped",
      "class:unmapped": "uncategorized",
      "class:unclassified": "uncategorized",
    };
    if (node.nodeId.endsWith(":~raw")) return t("uncategorized");
    return virtual[node.nodeId]
      ? t(virtual[node.nodeId]!)
      : navigationLabel(node, locale, geographic);
  };
  const view: CatalogNavigationProps = {
    title: t(dimension),
    countDescription: t("counts"),
    breadcrumbLabel: t("path"),
    unavailableLabel: t("unavailable"),
    emptyLabel: t("empty"),
    unavailable: page === null,
    currentLabel: page?.parent ? label(page.parent) : rootLabel,
    breadcrumbs: page?.parent
      ? [
          { label: rootLabel, href: navigationHref(locale, input, dimension, null) },
          ...page.ancestors.map((node) => ({
            label: label(node),
            href: navigationHref(locale, input, dimension, node.nodeId, { code: node.code }),
          })),
        ]
      : [],
    entries:
      page?.nodes.map((node) => ({
        nodeId: node.nodeId,
        code: node.code === "ALL" || node.code === "~" ? "" : node.code,
        label: label(node),
        ...(geographic && node.code.toUpperCase() === "CN-AH-ZX"
          ? { description: t("ambiguousRegion") }
          : geographic && node.nodeId.startsWith("geo:~")
            ? { description: t("unmappedRegion") }
            : {}),
        count: scope === "direct" ? node.directCount : node.count,
        countText: (scope === "direct" ? node.directCount : node.count).toLocaleString(locale),
        countLabel: t("versions", { count: scope === "direct" ? node.directCount : node.count }),
        hasChildren: node.hasChildren,
        href: navigationHref(locale, input, dimension, node.nodeId, {
          results: !node.hasChildren,
          scope,
          code: node.code,
        }),
      })) ?? [],
    ...(page?.parent
      ? {
          all: {
            href: navigationHref(locale, input, dimension, page.parent.nodeId, {
              results: true,
              code: page.parent.code,
            }),
            label: t("all", { count: page.parent.count }),
            active: scope !== "direct",
          },
          direct: {
            href: navigationHref(locale, input, dimension, page.parent.nodeId, {
              results: true,
              scope: "direct",
              code: page.parent.code,
            }),
            label: t("direct", { count: page.parent.directCount }),
            active: scope === "direct",
          },
        }
      : {}),
    ...(page?.nextCursor
      ? {
          more: {
            href: navigationHref(locale, input, dimension, page.parent?.nodeId ?? null, {
              cursor: page.nextCursor,
              code: page.parent?.code,
            }),
            label: t("more"),
          },
        }
      : {}),
    compact: !geographic,
  };
  if (geographic) {
    const collator = new Intl.Collator(locale);
    view.entries.sort(
      (left, right) => right.count - left.count || collator.compare(left.label, right.label),
    );
  }
  return view;
}
