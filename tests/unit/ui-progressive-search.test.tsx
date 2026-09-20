import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { act, cleanup, render as renderBase, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

import { HybridSearchPanel } from "@/features/catalog/hybrid-search-panel";
import type { SearchResultLabels } from "@/features/catalog/search-results";
import messages from "@/i18n/messages/en.json";
import { encodeHybridQueryFragment } from "@/features/catalog/hybrid-share";
import catalog from "../fixtures/portal/catalog-v1.json";
import { hybridVersionPage } from "../fixtures/portal/hybrid-v2";

const resultLabels: SearchResultLabels = {
  exchangesAvailable: messages.Common.exchangesAvailable,
  lciaAvailable: messages.Common.lciaAvailable,
  referenceFlowProperty: messages.Detail.referenceFlowProperty,
  collect: "Collect",
  compare: "Compare",
  copied: "Copied",
  copyCitation: "Copy citation",
  copyFailure: "Copy failed",
  details: "Details",
  emptyDescription: "Try another query",
  emptyTitle: "No results",
  functionalUnit: "Functional unit",
  geography: "Geography",
  match: "Match",
  metadataOnly: "Metadata only",
  flow: "Flow",
  process: "Process",
  public: "Public",
  quality: "Quality",
  reference: "Reference",
  referenceYear: "Reference year",
  selectForCompare: "Select this Process",
  source: "Source",
  technology: "Technology",
  matchingVersions: messages.Search.matchingVersions,
  version: messages.Search.version,
};

function lexicalPage(name = "Initial catalog result") {
  const item = structuredClone(catalog.search.items[0]!);
  item.names = [{ language: "en", value: name }];
  return {
    schemaVersion: "portal.hybrid-bff.v2",
    mode: "lexical",
    kind: "process",
    queryFingerprint: "b".repeat(64),
    items: [item],
    interpretation: null,
    fallbackReason: null,
    nextCursor: null as string | null,
  };
}

function refinedPage(name = "Refined catalog result") {
  const page = hybridVersionPage();
  page.items[0]!.names = [{ language: "en", value: name }];
  return { ...page, schemaVersion: "portal.hybrid-bff.v2", mode: "hybrid", fallbackReason: null };
}

type Pending = {
  url: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  resolve: (value: Response) => void;
  reject: (reason?: unknown) => void;
};

function setup() {
  const pending: Pending[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          pending.push({
            url,
            body: JSON.parse(typeof init.body === "string" ? init.body : "{}"),
            signal: init.signal as AbortSignal,
            resolve,
            reject,
          });
        }),
    ),
  );
  const view = render(
    <HybridSearchPanel
      initialFilters={{}}
      initialKind="process"
      labels={messages.Hybrid}
      locale="en"
      resultLabels={resultLabels}
      siteOrigin="https://portal.example"
    />,
  );
  const user = userEvent.setup();
  const submit = async (query = "private electricity need") => {
    await user.clear(screen.getByLabelText(messages.Hybrid.queryLabel));
    await user.type(screen.getByLabelText(messages.Hybrid.queryLabel), query);
    await user.click(screen.getByRole("button", { name: messages.Hybrid.submit }));
  };
  const complete = async (index: number, body: unknown, status = 200) => {
    await act(async () => {
      pending[index]!.resolve(Response.json(body, { status }));
    });
  };
  return { ...view, user, pending, submit, complete };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("progressive, version-aware discovery", () => {
  it("restores an old shared query without submitting it and preserves its bounded page size", async () => {
    const fragment = encodeHybridQueryFragment({
      schemaVersion: "portal.hybrid-search-request.v1",
      kind: "process",
      query: "shared electricity",
      filters: {},
      limit: 5,
    });
    window.history.replaceState(null, "", `/en/search${fragment}`);
    const { user, pending } = setup();
    expect(screen.getByLabelText(messages.Hybrid.queryLabel)).toHaveValue("shared electricity");
    expect(pending).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: messages.Hybrid.submit }));
    expect(pending[0]!.body).toMatchObject({
      schemaVersion: "portal.hybrid-search-request.v2",
      cursor: null,
      limit: 5,
    });
  });

  it("keeps early rows and selection until the user explicitly applies the new matching result", async () => {
    const { user, pending, submit, complete } = setup();
    await submit();
    expect(screen.getByRole("button", { name: messages.Hybrid.submit })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(pending.map((request) => request.url)).toEqual([
      "/internal/hybrid/lexical",
      "/internal/hybrid",
    ]);
    expect(pending[0]!.body).toMatchObject({
      schemaVersion: "portal.hybrid-search-request.v2",
      query: "private electricity need",
      cursor: null,
      limit: 20,
    });
    await complete(0, lexicalPage());
    const original = screen.getByText("Initial catalog result");
    const selected = screen.getByRole("checkbox", { name: /Select this Process/ });
    await user.click(selected);
    await complete(1, refinedPage());
    expect(screen.getByText("Initial catalog result")).toBe(original);
    expect(selected).toBeChecked();
    expect(screen.queryByText("Refined catalog result")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(messages.Hybrid.updateDescription);
    await user.click(screen.getByRole("button", { name: messages.Hybrid.showUpdated }));
    expect(screen.getByText("Refined catalog result")).toBeVisible();
    expect(screen.queryByText("Initial catalog result")).not.toBeInTheDocument();
    expect(window.location.href).not.toContain("electricity");

    const versions = screen.getByRole("button", {
      name: new RegExp(messages.Search.matchingVersions),
    });
    versions.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("link", { name: "Version 00.99.999" })).toHaveAttribute(
      "href",
      "/en/process/11111111-1111-1111-1111-111111111111%4000.99.999",
    );
    expect(screen.getByRole("checkbox", { name: /00.99.999/ })).toHaveAttribute(
      "value",
      "11111111-1111-1111-1111-111111111111@00.99.999",
    );
  });

  it("does not replace faster intelligent results with a late lexical response", async () => {
    const { submit, complete } = setup();
    await submit();
    await complete(1, refinedPage());
    await complete(0, lexicalPage());
    expect(screen.getByText("Refined catalog result")).toBeVisible();
    expect(screen.queryByText("Initial catalog result")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: messages.Hybrid.showUpdated }),
    ).not.toBeInTheDocument();
  });

  it("cancels old work and ignores out-of-order completion after a new submission", async () => {
    const { pending, submit, complete } = setup();
    await submit("first private need");
    await complete(0, lexicalPage("First result"));
    await submit("second private need");
    expect(pending[0]!.signal.aborted).toBe(true);
    expect(pending[1]!.signal.aborted).toBe(true);
    await complete(1, refinedPage("Stale result"));
    await complete(3, refinedPage("Second result"));
    await complete(2, lexicalPage("Second early result"));
    expect(screen.getByText("Second result")).toBeVisible();
    expect(screen.queryByText("Stale result")).not.toBeInTheDocument();
    expect(screen.queryByText("First result")).not.toBeInTheDocument();
  });

  it("retains useful lexical rows on failure without claiming intelligent matching succeeded", async () => {
    const { pending, submit, complete } = setup();
    await submit();
    await complete(0, lexicalPage());
    await act(async () => {
      pending[1]!.reject(new Error("private upstream failure"));
    });
    expect(screen.getByText("Initial catalog result")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(messages.Hybrid.fallbackTitle);
    expect(screen.queryByText(messages.Hybrid.optimized)).not.toBeInTheDocument();
    expect(screen.queryByText("private upstream failure")).not.toBeInTheDocument();
  });

  it("keeps current rows when a ranked cursor expires and restarts only on explicit request", async () => {
    const { user, pending, submit, complete } = setup();
    await submit();
    await complete(1, {
      ...refinedPage(),
      candidateCount: 3,
      datasetCount: 2,
      nextCursor: "ranked_cursor",
    });
    await user.click(screen.getByRole("button", { name: messages.Hybrid.loadMore }));
    expect(pending[2]!.url).toBe("/internal/hybrid");
    expect(pending[2]!.body.cursor).toBe("ranked_cursor");
    await complete(2, { code: "hybrid_cursor_expired" }, 409);
    expect(screen.getByText("Refined catalog result")).toBeVisible();
    expect(screen.getByText(messages.Hybrid.cursorExpired)).toBeVisible();
    expect(pending).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: messages.Hybrid.restart }));
    expect(pending).toHaveLength(5);
    expect(pending[3]!.body.cursor).toBeNull();
    expect(pending[4]!.body.cursor).toBeNull();
  });

  it("does not append a stale lexical page after the user applies updated results", async () => {
    const { user, pending, submit, complete } = setup();
    await submit();
    await complete(0, { ...lexicalPage(), nextCursor: "lexical_cursor" });
    await user.click(screen.getByRole("button", { name: messages.Hybrid.loadMore }));
    await complete(1, refinedPage());
    await user.click(screen.getByRole("button", { name: messages.Hybrid.showUpdated }));
    expect(pending[2]!.signal.aborted).toBe(true);
    await complete(2, lexicalPage("Late extra result"));
    expect(screen.getByText("Refined catalog result")).toBeVisible();
    expect(screen.queryByText("Late extra result")).not.toBeInTheDocument();
  });

  it("does not announce an empty early page as the final result while matching is still pending", async () => {
    const { submit, complete } = setup();
    await submit();
    await complete(0, { ...lexicalPage(), items: [] });
    expect(screen.queryByText(messages.Hybrid.emptyTitle)).not.toBeInTheDocument();
    await complete(1, refinedPage());
    expect(screen.getByText("Refined catalog result")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: messages.Hybrid.showUpdated }),
    ).not.toBeInTheDocument();
  });

  it.each(["lexical-first", "hybrid-first"])(
    "keeps useful lexical results and continuation when intelligent matching is empty (%s)",
    async (order) => {
      const { user, pending, submit, complete } = setup();
      await submit();
      const emptyHybrid = {
        ...refinedPage(),
        items: [],
        versionGroups: [],
        candidateCount: 0,
        datasetCount: 0,
      };
      const lexical = { ...lexicalPage(), nextCursor: "lexical_cursor" };
      const hybridFirst = order === "hybrid-first";
      await complete(hybridFirst ? 1 : 0, hybridFirst ? emptyHybrid : lexical);
      expect(screen.queryByText(messages.Hybrid.emptyTitle)).not.toBeInTheDocument();
      await complete(hybridFirst ? 0 : 1, hybridFirst ? lexical : emptyHybrid);
      expect(screen.getByText("Initial catalog result")).toBeVisible();
      expect(screen.getByRole("status")).toHaveTextContent(messages.Hybrid.noMatchesTitle);
      expect(screen.queryByText(messages.Hybrid.optimized)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: messages.Hybrid.showUpdated }),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: messages.Hybrid.loadMore }));
      expect(pending[2]!.url).toBe("/internal/hybrid/lexical");
      expect(pending[2]!.body.cursor).toBe("lexical_cursor");
    },
  );

  it("reports malformed or failed responses without rendering partial private transport data", async () => {
    const { submit, complete } = setup();
    await submit();
    await complete(0, {
      ...lexicalPage(),
      items: [{ key: { kind: "process", id: "invalid", version: "latest" } }],
    });
    await complete(1, { privateDebug: "not public" }, 503);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(messages.Hybrid.error));
    expect(screen.queryByText("not public")).not.toBeInTheDocument();
  });

  it("aborts both pending reads when the panel is unmounted", async () => {
    const { pending, submit, unmount } = setup();
    await submit();
    unmount();
    expect(pending.every((request) => request.signal.aborted)).toBe(true);
  });
});

function render(node: ReactNode) {
  return renderBase(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}
