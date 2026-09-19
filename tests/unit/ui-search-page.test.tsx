import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render as renderBase, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import catalogFixture from "../fixtures/portal/catalog-v1.json";
import enMessages from "../../src/i18n/messages/en.json";
import type {
  getPublicFacets,
  searchPublicFlows,
  searchPublicProcesses,
} from "@/server/data/catalog";
import { publicFacetsSchema, publicSearchPageSchema } from "@/server/contracts/portal";

type Translator = (key: string, values?: Record<string, string | number>) => string;

const catalogMocks = vi.hoisted(() => ({
  searchPublicProcesses: vi.fn<typeof searchPublicProcesses>(),
  searchPublicFlows: vi.fn<typeof searchPublicFlows>(),
  getPublicFacets: vi.fn<typeof getPublicFacets>(),
}));

const getTranslations = vi.hoisted(() =>
  vi.fn<(options: { locale?: string; namespace: string }) => Promise<Translator>>(),
);

vi.mock("@/server/data/catalog", () => catalogMocks);
vi.mock("next-intl/server", () => ({
  getTranslations,
  setRequestLocale: vi.fn<(locale: string) => void>(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<(href: string) => void>() }),
  notFound: vi.fn<() => never>(),
}));
vi.mock("@/features/catalog/hybrid-search-panel", () => ({
  HybridSearchPanel: () => <div data-testid="hybrid-panel-stub" />,
}));

vi.mock("@/components/brand/catalog-search-entry", () => ({
  CatalogSearchEntry: () => <h1>Initial catalog entry</h1>,
}));
import SearchPage from "@/app/[locale]/search/page";
import { PortalDataError } from "@/server/data/supabase-rpc";

const searchDictionary = enMessages.Search;

function translator(namespace: string) {
  return (key: string, values?: Record<string, string | number>) => {
    const value = (enMessages as Record<string, Record<string, unknown>>)[namespace]?.[key];
    const template = typeof value === "string" ? value : key;
    if (!values) return template;
    return template.replace(/\{(\w+)\}/gu, (_match, name: string) =>
      String(values[name] ?? `{${name}}`),
    );
  };
}

type SearchPageParams = Record<string, string | string[] | undefined>;

function getSidebar() {
  fireEvent.click(screen.getByRole("button", { name: "Refine results" }));
  return screen.getByRole("dialog", { name: "Refine results" });
}

async function renderSearchPage(searchParams: SearchPageParams) {
  const element = await SearchPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(element);
}

describe("Search page sidebar state (Portal #46)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    getTranslations.mockImplementation(async ({ namespace }: { namespace: string }) =>
      translator(namespace),
    );
  });

  it("empty query queries no backend and shows the initial prompt instead of the unavailable text", async () => {
    await renderSearchPage({});

    expect(catalogMocks.searchPublicProcesses).not.toHaveBeenCalled();
    expect(catalogMocks.searchPublicFlows).not.toHaveBeenCalled();
    expect(catalogMocks.getPublicFacets).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Initial catalog entry" })).toBeInTheDocument();
    expect(screen.queryByText(searchDictionary.unavailableDescription)).not.toBeInTheDocument();
  });

  it("a real backend failure on a submitted query still reports the unavailable state", async () => {
    catalogMocks.searchPublicProcesses.mockRejectedValue(
      new PortalDataError("upstream_unavailable"),
    );
    catalogMocks.getPublicFacets.mockRejectedValue(new PortalDataError("upstream_unavailable"));

    await renderSearchPage({ v: "1", kind: "process", q: "electricity" });

    expect(catalogMocks.searchPublicProcesses).toHaveBeenCalledTimes(1);
    expect(catalogMocks.searchPublicFlows).not.toHaveBeenCalled();
    expect(catalogMocks.getPublicFacets).toHaveBeenCalledTimes(1);

    expect(screen.getByText(searchDictionary.unavailableDescription)).toBeInTheDocument();
  });

  it("a successful query keeps facets and the facet description", async () => {
    catalogMocks.searchPublicProcesses.mockResolvedValue(
      publicSearchPageSchema.parse(catalogFixture.search),
    );
    catalogMocks.getPublicFacets.mockResolvedValue(
      publicFacetsSchema.parse({ ...catalogFixture.facets, kind: "process" }),
    );

    await renderSearchPage({ v: "1", kind: "process", q: "electricity" });

    const sidebar = getSidebar();
    expect(
      within(sidebar).getAllByText(searchDictionary.filtersDescription)[0],
    ).toBeInTheDocument();
    expect(
      within(sidebar).queryByText(searchDictionary.unavailableDescription),
    ).not.toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Process (1)" })).toBeInTheDocument();
  });

  it("executes an explicit geography-only query and preserves the filter in keyword submission", async () => {
    catalogMocks.searchPublicProcesses.mockResolvedValue(
      publicSearchPageSchema.parse(fixtureSearch()),
    );
    catalogMocks.getPublicFacets.mockResolvedValue(
      publicFacetsSchema.parse({ ...catalogFixture.facets, kind: "process" }),
    );
    await renderSearchPage({ v: "1", kind: "process", geo: "cn" });
    expect(catalogMocks.searchPublicProcesses).toHaveBeenCalledWith(
      expect.objectContaining({ query: "", filters: { geography: "cn" } }),
      undefined,
      { cache: "short-public" },
    );
    expect(
      screen.getByRole("heading", { name: enMessages.CatalogReference.catalog, level: 1 }),
    ).toBeInTheDocument();
    expect(document.querySelector('input[name="geo"]')).toHaveValue("cn");
  });
});

function fixtureSearch() {
  return catalogFixture.search;
}

function render(node: ReactNode) {
  return renderBase(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {node}
    </NextIntlClientProvider>,
  );
}
