import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { usePathname } from "@storybook/nextjs-vite/navigation.mock";
import { expect, spyOn, waitFor, within } from "storybook/test";
import { DetailHeader } from "../../src/features/catalog/detail-header";
import { CitationDialog } from "../../src/features/catalog/citation-dialog";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "../../src/components/ui/dialog";
import { CitationCopy } from "../../src/features/catalog/citation-copy";
import { OverviewPanel } from "../../src/features/catalog/overview-panel";
import { VersionsPanel } from "../../src/features/catalog/versions-panel";
import { LciaPanel } from "../../src/features/catalog/lcia-panel";
import { CompareSelectionProvider } from "../../src/features/compare/selection";
import { dictionaries, mobileGlobals, refs, selectionLabels, storyLocale } from "../fixtures";
import { detailRecord, lciaLabels, lciaResult } from "../composition-fixtures";

const meta = {
  component: DetailHeader,
  subcomponents: {
    CompareSelectionProvider,
    OverviewPanel,
    VersionsPanel,
    LciaPanel,
    CitationCopy,
    CitationDialog,
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogTitle,
  },
  title: "Catalog/Dataset detail",
  tags: ["!autodocs"],
  beforeEach({ globals, parameters }) {
    const locale = storyLocale(globals);
    const kind = parameters.flow ? "flow" : "process";
    usePathname.mockReturnValue(
      `/${locale}/${kind}/${encodeURIComponent(refs[parameters.flow ? 2 : 0])}${parameters.panel ? `/${parameters.panel}` : ""}`,
    );
    return () => usePathname.mockReset();
  },
  loaders: [
    async ({ globals, parameters }) => {
      const locale = storyLocale(globals);
      const kind = parameters.flow ? "flow" : "process";
      const record = parameters.missing ? undefined : detailRecord(locale, kind);
      if (record && parameters.noCitation) record.citation = undefined;
      if (record && parameters.attribution) {
        record.dataGenerator = "Example research group";
        record.dataOwner = "Example data owner";
        record.accessRestrictions = "Research use only; contact the owner for other uses. [en]";
        record.licenseUrl = undefined;
      }
      return {
        header: await DetailHeader({
          locale,
          kind,
          refValue: refs[parameters.flow ? 2 : 0],
          record,
        }),
        overview: await OverviewPanel({ locale, record }),
      };
    },
  ],
  render: (_, { globals, parameters, loaded }) => {
    const locale = storyLocale(globals);
    const m = dictionaries[locale].Detail;
    return (
      <CompareSelectionProvider locale={locale} labels={selectionLabels(locale)}>
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          {loaded.header}
          {parameters.panel === "lcia" ? (
            <LciaPanel
              locale={locale}
              labels={lciaLabels(locale)}
              result={
                parameters.unavailable
                  ? { status: "unavailable" }
                  : parameters.failure
                    ? { status: "temporarily_unavailable" }
                    : lciaResult(locale)
              }
            />
          ) : parameters.panel === "versions" ? (
            <VersionsPanel
              locale={locale}
              currentRef={refs[0]}
              labels={{ view: dictionaries[locale].Common.viewVersion, current: m.currentVersion }}
              emptyTitle={m.versions}
              emptyDescription={m.versionsEmpty}
              rows={
                parameters.empty
                  ? []
                  : ["01.01.000", "01.00.000", "00.99.999"].map((version, index) => {
                      const ref = `${refs[0].split("@")[0]}@${version}`;
                      return {
                        ref,
                        version,
                        isLatest: index === 0,
                        modifiedAt: `202${6 - index}-01-01T00:00:00Z`,
                        summary: detailRecord(locale, "process").name,
                        href: `/${locale}/process/${encodeURIComponent(ref)}`,
                      };
                    })
              }
            />
          ) : (
            loaded.overview
          )}
        </div>
      </CompareSelectionProvider>
    );
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<Omit<typeof meta, "component">>;
export const Process: Story = {
  play: async ({ canvas, globals }) => {
    const locale = storyLocale(globals);
    const m = dictionaries[locale].Detail;
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
      detailRecord(locale, "process").name,
    );
    const title = canvas.getByRole("heading", { level: 1 });
    await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
    await expect(canvas.getByRole("link", { name: m.overview })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(canvas.getAllByRole("button", { name: m.citation })).toHaveLength(1);
    await expect(canvas.queryByText(m.citation, { selector: "summary" })).not.toBeInTheDocument();
  },
};
export const Flow: Story = {
  parameters: { flow: true },
  play: async ({ canvas, globals }) => {
    const m = dictionaries[storyLocale(globals)].Detail;
    await expect(canvas.getByText("124-38-9")).toBeVisible();
    await expect(canvas.queryByText(m.functionalUnit)).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: m.lcia })).not.toBeInTheDocument();
  },
};
export const MissingMetadata: Story = { parameters: { missing: true } };
export const MobileGerman: Story = { ...Process, globals: { ...mobileGlobals, locale: "de" } };
export const DarkFrenchFlow: Story = {
  ...Flow,
  globals: { ...mobileGlobals, locale: "fr", theme: "dark" },
};
export const Versions: Story = {
  parameters: { panel: "versions" },
  play: async ({ canvas, globals }) => {
    const locale = storyLocale(globals);
    const m = dictionaries[locale].Detail;
    await expect(canvas.getByText(m.currentVersion)).toBeVisible();
    const links = canvas.getAllByRole("link", { name: dictionaries[locale].Common.viewVersion });
    await expect(links).toHaveLength(3);
    await expect(links[2]).toHaveAttribute("href", expect.stringContaining("%4000.99.999"));
  },
};
export const EmptyVersions: Story = { parameters: { panel: "versions", empty: true } };
export const MobileFrenchVersions: Story = {
  ...Versions,
  globals: { ...mobileGlobals, locale: "fr" },
};
export const Lcia: Story = { parameters: { panel: "lcia" } };
export const MobileGermanLcia: Story = { ...Lcia, globals: { ...mobileGlobals, locale: "de" } };
export const DarkFrenchLcia: Story = { ...Lcia, globals: { locale: "fr", theme: "dark" } };
export const LciaPublication: Story = {
  ...Lcia,
  play: async ({ canvas, userEvent, globals }) => {
    const m = dictionaries[storyLocale(globals)].Detail;
    await userEvent.click(canvas.getByText(m.releaseDetails));
    await expect(
      canvas.getByText(lciaResult(storyLocale(globals)).publication.evidenceHash),
    ).toBeVisible();
  },
};
export const LciaResultContext: Story = {
  ...Lcia,
  play: async ({ canvas, userEvent, globals }) => {
    const locale = storyLocale(globals);
    const m = dictionaries[locale].Detail;
    const row = lciaResult(locale).rows[0]!;
    const value = canvas
      .getAllByText(row.value)
      .find((element) => element.getBoundingClientRect().width > 0)!;
    const range = document.createRange();
    range.selectNodeContents(value);
    await expect(range.getClientRects()).toHaveLength(1);
    const summary = canvas
      .getAllByText(m.lciaContext)
      .find(
        (element) => element.tagName === "SUMMARY" && element.getBoundingClientRect().height > 0,
      )!;
    const disclosure = summary.closest("details")!;
    await expect(disclosure).not.toHaveAttribute("open");
    await userEvent.click(summary);
    await waitFor(() => expect(disclosure).toHaveAttribute("open"));
    await expect(disclosure).toHaveTextContent(row.processRef);
    await expect(disclosure).toHaveTextContent(row.methodRef);
    await expect(value).toHaveTextContent(row.value);
  },
};
export const MobileFrenchLciaContext: Story = {
  ...LciaResultContext,
  globals: { ...mobileGlobals, locale: "fr", theme: "dark" },
};
export const LciaUnavailable: Story = { parameters: { panel: "lcia", unavailable: true } };
export const LciaFailure: Story = { parameters: { panel: "lcia", failure: true } };

export const CitationExpanded: Story = {
  play: async ({ canvas, canvasElement, userEvent, globals }) => {
    const m = dictionaries[storyLocale(globals)].Detail;
    await userEvent.click(canvas.getByRole("button", { name: m.citation }));
    const body = within(canvasElement.ownerDocument.body);
    // Re-query the live portal while locale/viewport rendering and its opening animation settle.
    await waitFor(
      async () => {
        const dialog = within(body.getByRole("dialog", { name: m.citation }));
        await expect(dialog.getByRole("button", { name: m.copyVersionId })).toBeVisible();
        await expect(
          dialog.getByText(detailRecord(storyLocale(globals), "process").citation!),
        ).toBeVisible();
      },
      { timeout: 5000 },
    );
  },
};
export const CitationExpandedMobile: Story = {
  ...CitationExpanded,
  globals: { ...mobileGlobals, locale: "de" },
};
export const ProcessDark: Story = { ...Process, globals: { locale: "fr", theme: "dark" } };
export const CitationCopyAndDenial: Story = {
  play: async ({ canvas, canvasElement, userEvent, globals }) => {
    const m = dictionaries[storyLocale(globals)].Detail;
    await userEvent.click(canvas.getByRole("button", { name: m.citation }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: m.citation }),
    );
    const copy = spyOn(navigator.clipboard, "writeText")
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("Clipboard denied"));
    try {
      await userEvent.click(dialog.getByRole("button", { name: m.copyVersionId }));
      await expect(copy).toHaveBeenCalledWith(refs[0]);
      await userEvent.click(dialog.getByRole("button", { name: m.copyCitation }));
      await expect(dialog.findByRole("alert")).resolves.toHaveTextContent(m.copyFailed);
      await expect(
        dialog.getAllByText(detailRecord(storyLocale(globals), "process").citation!).length,
      ).toBeGreaterThan(0);
    } finally {
      copy.mockRestore();
    }
  },
};

export const CitationKeyboard: Story = {
  play: async ({ canvas, canvasElement, userEvent, globals }) => {
    const m = dictionaries[storyLocale(globals)];
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: m.Detail.citation });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = within(await body.findByRole("dialog", { name: m.Detail.citation }));
    await expect(dialog.getByRole("heading", { name: m.Detail.citation })).toHaveFocus();
    await userEvent.tab();
    await expect(dialog.getByRole("button", { name: m.Detail.copyCitation })).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(dialog.getByRole("button", { name: m.Common.close })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(
      within(await body.findByRole("dialog")).getByRole("button", { name: m.Common.close }),
    );
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};
export const CitationMissingText: Story = {
  parameters: { noCitation: true },
  play: async ({ canvas, canvasElement, userEvent, globals }) => {
    const m = dictionaries[storyLocale(globals)].Detail;
    await userEvent.click(canvas.getByRole("button", { name: m.citation }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    await waitFor(() => expect(dialog.getByText(m.citationUnavailable)).toBeVisible());
    await expect(dialog.queryByRole("button", { name: m.copyCitation })).not.toBeInTheDocument();
    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await userEvent.click(dialog.getByRole("button", { name: m.copyVersionId }));
      await expect(copy).toHaveBeenCalledWith(refs[0]);
    } finally {
      copy.mockRestore();
    }
  },
};
export const CitationDark: Story = {
  ...CitationExpanded,
  globals: { locale: "fr", theme: "dark" },
};

export const DeclaredAttribution: Story = {
  parameters: { attribution: true },
  play: async ({ canvas, globals }) => {
    const m = dictionaries[storyLocale(globals)].Detail;
    await expect(canvas.getByText(m.dataGenerator)).toBeVisible();
    await expect(canvas.getByText("Example research group")).toBeVisible();
    await expect(canvas.getByText(m.dataOwner)).toBeVisible();
    await expect(canvas.getByText("Example data owner")).toBeVisible();
    await expect(canvas.getByText(m.accessRestrictions)).toBeVisible();
    await expect(canvas.queryByRole("link", { name: m.viewLicense })).not.toBeInTheDocument();
  },
};
export const DeclaredAttributionMobileGerman: Story = {
  ...DeclaredAttribution,
  globals: { ...mobileGlobals, locale: "de" },
};
