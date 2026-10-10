import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { ExchangesPanel } from "../../src/features/catalog/exchanges-panel";
import { HashDisclosure } from "../../src/components/shell/hash-disclosure";
import { dictionaries, exchangeRows, mobileGlobals, storyLocale } from "../fixtures";

const meta = {
  component: ExchangesPanel,
  subcomponents: { HashDisclosure },
  title: "Catalog/Exchanges and disclosure",
} satisfies Meta;
export default meta;
type Story = StoryObj<Omit<typeof meta, "component">>;
export const DataTable: Story = {
  render: (_, { globals, parameters }) => {
    const locale = storyLocale(globals);
    const { Common: c, Detail: d } = dictionaries[locale];
    return (
      <ExchangesPanel
        caption={d.exchangesTitle}
        emptyDescription={d.exchangesEmpty}
        emptyTitle={d.exchangesTitle}
        labels={{
          amount: d.value,
          context: d.exchangeContext,
          direction: d.direction,
          flow: c.flow,
          functionalUnit: d.functionalUnit,
          kind: d.exchangeKind,
          policy: d.policyVersion,
          process: c.process,
          quantitativeReference: d.quantitativeReference,
          yes: d.yes,
          no: d.no,
        }}
        rows={
          parameters.empty
            ? []
            : exchangeRows(locale).map((row, index) => ({
                ...row,
                ...(parameters.scopedLinks && index === 0
                  ? { flowHref: `/${locale}/flow/${encodeURIComponent(row.flowRef)}` }
                  : {}),
              }))
        }
        locale={locale}
      />
    );
  },
};
export const Empty: Story = { ...DataTable, parameters: { empty: true } };
export const MobileFrench: Story = { ...DataTable, globals: { ...mobileGlobals, locale: "fr" } };
export const Dark: Story = { ...DataTable, globals: { theme: "dark" } };
export const EvidenceDisclosure: Story = {
  render: (_, { globals }) => {
    const m = dictionaries[storyLocale(globals)].Detail;
    return (
      <HashDisclosure id="storybook-evidence" label={m.releaseDetails}>
        <dl>
          <dt>{m.verificationCode}</dt>
          <dd className="font-mono text-xs break-all">{"abcdef0123456789".repeat(4)}</dd>
        </dl>
      </HashDisclosure>
    );
  },
  play: async ({ canvas, userEvent, globals }) => {
    const m = dictionaries[storyLocale(globals)].Detail;
    await userEvent.click(canvas.getByText(m.releaseDetails));
    await expect(canvas.getByText(m.verificationCode)).toBeVisible();
  },
};

export const ProvenanceDisclosure: Story = {
  ...DataTable,
  play: async ({ canvas, userEvent, globals }) => {
    const locale = storyLocale(globals);
    const row = exchangeRows(locale)[0]!;
    const triggers = canvas
      .getAllByText(dictionaries[locale].Detail.exchangeContext)
      .filter(
        (element) => element.tagName === "SUMMARY" && element.getBoundingClientRect().height > 0,
      );
    const disclosure = triggers[0]!.closest("details")!;
    await expect(disclosure).not.toHaveAttribute("open");
    await userEvent.click(triggers[0]!);
    await expect(disclosure).toHaveAttribute("open");
    await expect(disclosure).toHaveTextContent(row.flowRef);
    await expect(disclosure).toHaveTextContent(row.processRef);
    await expect(disclosure).toHaveTextContent(row.capabilityPolicyVersion);
    await expect(disclosure).toHaveTextContent(row.functionalUnit);
  },
};
export const MobileProvenance: Story = {
  ...ProvenanceDisclosure,
  globals: { ...mobileGlobals, locale: "fr" },
};

export const ScopedFlowLinks: Story = { ...DataTable, parameters: { scopedLinks: true } };
