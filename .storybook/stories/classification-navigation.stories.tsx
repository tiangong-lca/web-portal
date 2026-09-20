import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { http, HttpResponse } from "msw";
import { expect, waitFor, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ClassificationNavigation,
  ClassificationNavigationProvider,
} from "@/features/catalog/classification-navigation";
import type { ClassificationRequest } from "@/lib/classification-navigation";
import type { BrowseSearchInput } from "@/server/contracts/navigation";
import type { PortalLocale } from "@/i18n/routing";
import { dictionaries, mobileGlobals, storyLocale } from "../fixtures";
import { classificationFixturePage, classificationFixtureSeeds } from "../classification-fixtures";

let requests: ClassificationRequest[] = [];
let failures = 0;
const handlers = [
  http.post("*/internal/navigation", async ({ request }) => {
    const input = (await request.json()) as ClassificationRequest;
    requests.push(input);
    if (failures-- > 0)
      return HttpResponse.json({ code: "temporarily_unavailable" }, { status: 503 });
    return HttpResponse.json(
      classificationFixturePage(input.locale, input.kind, input.parentNodeId, input.cursor),
    );
  }),
];

function Example({
  locale,
  selected: initialSelected,
}: {
  locale: PortalLocale;
  selected?: string;
}) {
  const [kind, setKind] = useState<"process" | "flow">("process");
  const [selected, setSelected] = useState(initialSelected);
  const input: BrowseSearchInput = useMemo(
    () => ({
      kind,
      query: "steel",
      filters: {
        geographyNodeId: "geo:cn",
        geographyScope: "subtree",
        ...(selected ? { classificationNodeId: selected, classificationScope: "subtree" } : {}),
      },
      sort: "relevance",
      cursor: null,
      limit: 10,
    }),
    [kind, selected],
  );
  const seeds = useMemo(
    () => classificationFixtureSeeds(locale, kind, selected),
    [locale, kind, selected],
  );
  const current = classificationFixturePage(locale, kind, selected ?? null);
  const t = dictionaries[locale].Navigation;
  const navigation = {
    title: t.classification,
    countDescription: t.counts,
    unavailableLabel: t.unavailable,
    emptyLabel: t.empty,
    breadcrumbLabel: t.path,
    breadcrumbs: [],
    currentLabel: current.parent?.label ?? t.root,
    compact: true,
  };
  return (
    <ClassificationNavigationProvider
      locale={locale}
      input={input}
      seeds={seeds}
      selectedPath={[
        ...current.ancestors.map((node) => node.nodeId),
        ...(selected ? [selected] : []),
      ]}
    >
      <div className="flex max-w-4xl flex-col gap-4 p-4">
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setKind("process");
              setSelected(undefined);
            }}
          >
            {dictionaries[locale].Common.process}
          </Button>
          <Button
            onClick={() => {
              setKind("flow");
              setSelected(undefined);
            }}
          >
            {dictionaries[locale].Common.flow}
          </Button>
        </div>
        <div
          className="catalog-hierarchy-layout"
          onClickCapture={(event) => {
            if (
              event.target instanceof Element &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              const link = event.target.closest<HTMLAnchorElement>("a.classification-link");
              if (link) {
                event.preventDefault();
                setSelected(new URL(link.href).searchParams.get("classNode") ?? undefined);
              }
            }
          }}
        >
          <div key={kind}>
            <ClassificationNavigation navigation={navigation} />
          </div>
          <output data-testid="selection">{selected ?? t.root}</output>
        </div>
      </div>
    </ClassificationNavigationProvider>
  );
}
const meta = {
  title: "Catalog/Classification navigation",
  component: ClassificationNavigation,
  subcomponents: {
    ClassificationNavigationProvider,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    Button,
  },
  args: {
    navigation: {
      title: "Classification",
      countDescription: "Public versions",
      breadcrumbLabel: "Path",
      breadcrumbs: [],
      unavailableLabel: "Unavailable",
      emptyLabel: "No categories",
    },
  },
  parameters: { msw: { handlers } },
  beforeEach: () => {
    requests = [];
    failures = 0;
  },
  render: (_, { globals, parameters }) => (
    <Example
      locale={storyLocale(globals)}
      selected={parameters.selectedNode as string | undefined}
    />
  ),
} satisfies Meta<typeof ClassificationNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;
const expandedName = `Expand ${dictionaries.en.Navigation.isic}`;

export const LazyBranches: Story = {
  globals: { locale: "en" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const rootLabel = dictionaries.en.Navigation.isic;
    await userEvent.click(canvas.getByRole("button", { name: `Expand ${rootLabel}` }));
    await expect(
      await canvas.findByRole("button", { name: "Expand Example industry" }),
    ).toBeVisible();
    await expect(canvas.getByTestId("selection")).toHaveTextContent(
      dictionaries.en.Navigation.root,
    );
    await expect(canvasElement.querySelector('[role="tree"]')).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: `Collapse ${rootLabel}` }));
    await userEvent.click(canvas.getByRole("button", { name: `Expand ${rootLabel}` }));
    await expect(requests).toHaveLength(1);
    const link = canvasElement.querySelector<HTMLAnchorElement>(
      '[data-node-id="class:isic:0"] .classification-link',
    )!;
    await expect(link.href).toContain("geoNode=geo%3Acn");
    await userEvent.click(link);
    await expect(canvas.getByTestId("selection")).toHaveTextContent("class:isic:0");
  },
};
export const FullPagination: Story = {
  globals: { locale: "en" },
  parameters: { selectedNode: "class:isic:0" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("link", { name: "Load more categories" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    await expect(requests[0]?.cursor).toBe("page50");
    await expect(await canvas.findByText("Category 99", {}, { timeout: 5000 })).toBeVisible();
    await userEvent.click(canvas.getByRole("link", { name: "Load more categories" }));
    await expect(await canvas.findByText("Category 120", {}, { timeout: 5000 })).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-node-id^="class:isic:0:"]')).toHaveLength(
      121,
    );
    await expect(canvas.getByTestId("selection")).toHaveTextContent("class:isic:0");
  },
};
export const UrlPathBeyondFirstPage: Story = {
  globals: { locale: "en" },
  parameters: { selectedNode: "class:isic:0:75" },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Category 75")).toBeVisible();
    await expect(
      canvasElement.querySelector('[data-node-id="class:isic:0:75"] .classification-link'),
    ).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("link", { name: "Load more categories" })).toBeVisible();
  },
};
export const SeparateKinds: Story = {
  globals: { locale: "en" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: expandedName }));
    await expect(
      await canvas.findByRole("button", { name: "Expand Example industry" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: dictionaries.en.Common.flow }));
    await userEvent.click(
      canvas.getByRole("button", { name: `Expand ${dictionaries.en.Navigation.cpc}` }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Expand Example industry" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: dictionaries.en.Common.process }));
    await expect(
      await canvas.findByRole("button", { name: `Collapse ${dictionaries.en.Navigation.isic}` }),
    ).toHaveAttribute("aria-expanded", "true");
  },
};
export const RetryBranch: Story = {
  globals: { locale: "en" },
  beforeEach: () => {
    failures = 1;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: expandedName }));
    await expect(
      await canvas.findByText(dictionaries.en.Navigation.classificationUnavailable),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Reload categories" }));
    await expect(
      await canvas.findByRole("button", { name: "Expand Example industry" }),
    ).toBeVisible();
  },
};
export const Keyboard: Story = {
  globals: { locale: "en" },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: expandedName });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await expect(
      await canvas.findByRole("button", { name: "Expand Example industry" }),
    ).toBeVisible();
    await userEvent.keyboard("{Tab}");
    await waitFor(() =>
      expect(
        within(
          canvas.getByRole("navigation", { name: dictionaries.en.Navigation.classification }),
        ).getByRole("link", {
          name: new RegExp(
            dictionaries.en.Navigation.isic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "u",
          ),
        }),
      ).toHaveFocus(),
    );
  },
};
export const MobileChinese: Story = {
  globals: { ...mobileGlobals, locale: "zh-CN" },
  parameters: { selectedNode: "class:isic:0:75" },
};
export const German: Story = {
  globals: { locale: "de" },
  parameters: { selectedNode: "class:isic:0" },
};
export const FrenchDark: Story = {
  globals: { locale: "fr", theme: "dark" },
  parameters: { selectedNode: "class:isic:0" },
};
