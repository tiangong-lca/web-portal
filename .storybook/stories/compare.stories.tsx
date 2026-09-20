import { AddCompareVersion } from "@/features/compare/add-version";
import { FeedbackLink } from "@/components/shell/feedback-link";
import { Button } from "@/components/ui/button";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import {
  CompareChoice,
  CompareSelectionProvider,
  CompareSelectionSeed,
} from "../../src/features/compare/selection";
import { CompareWorkbench } from "../../src/features/compare/compare-workbench";
import {
  compareCandidates,
  compareLabels,
  dictionaries,
  mobileGlobals,
  refs,
  sampleNames,
  selectionLabels,
  storyLocale,
} from "../fixtures";

const meta = {
  component: CompareWorkbench,
  subcomponents: {
    CompareSelectionSeed,
    CompareChoice,
    CompareSelectionProvider,
    AddCompareVersion,
    FeedbackLink,
    Button,
  },
  title: "Compare/Workbench",
  tags: ["!autodocs"],
} satisfies Meta;
export default meta;
type Story = StoryObj<Omit<typeof meta, "component">>;

export const MatchingFields: Story = {
  render: (_, { globals, parameters }) => {
    const locale = storyLocale(globals);
    const candidates = compareCandidates(locale);
    if (parameters.four) {
      candidates.push(
        ...[2, 3].map((index) => ({
          ...candidates[index % 2]!,
          ref: refs[index]!,
          name: `${sampleNames[locale][index % 2]} · ${index + 1}`,
        })),
      );
    }
    if (parameters.missing && candidates[1]) delete candidates[1].cutoffRule;
    if (parameters.incompatible && candidates[1]) candidates[1].referenceUnit = "kg";
    if (parameters.referenceOnly && candidates[1]) candidates[1].referenceYear = "2018";
    if (parameters.converted && candidates[1]) {
      candidates[1].referenceUnit = "MWh";
      for (const candidate of candidates)
        candidate.conversion = { contractRef: "fixture-conversion@1", dimension: "energy" };
    }
    return (
      <CompareWorkbench
        candidates={parameters.empty ? [] : candidates}
        labels={compareLabels(locale)}
        locale={locale}
        numericContext={{
          evidenceHash: "fixture-evidence-only",
          impactName: "Climate change (fixture)",
          methodRef: "fixture-method@1",
          packageRef: "fixture-package@1",
          publicationRef: "fixture-publication@1",
          publishedAt: "2026-01-01",
          unit: "kg CO₂ eq",
        }}
      />
    );
  },
};
export const MissingEvidence: Story = {
  ...MatchingFields,
  parameters: { missing: true },
  play: async ({ canvas, globals }) => {
    const m = dictionaries[storyLocale(globals)].Compare;
    await expect(
      canvas.getByRole("heading", { name: m.attentionFields.replace("{count}", "1") }),
    ).toBeVisible();
    const firstDataRow = canvas.queryByRole("table")?.querySelector("tbody tr");
    if (firstDataRow) await expect(firstDataRow).toHaveTextContent(m.statusInsufficient);
    else
      await expect(
        canvas.getAllByRole("heading", { level: 3 })[0]?.parentElement,
      ).toHaveTextContent(m.statusInsufficient);
  },
};
export const Incompatible: Story = { ...MatchingFields, parameters: { incompatible: true } };
export const FurtherAssessment: Story = { ...MatchingFields, parameters: { referenceOnly: true } };
export const Conversion: Story = { ...MatchingFields, parameters: { converted: true } };
export const Empty: Story = { ...MatchingFields, parameters: { empty: true } };
export const MobileGerman: Story = {
  ...MissingEvidence,
  globals: { ...mobileGlobals, locale: "de" },
};
export const Dark: Story = { ...MatchingFields, globals: { theme: "dark" } };
export const SelectionTray: Story = {
  render: (_, { globals, parameters }) => {
    const locale = storyLocale(globals);
    const items = refs.map((ref, index) => ({
      ref,
      name: `${sampleNames[locale][0]} · ${index + 1}`,
    }));
    return (
      <CompareSelectionProvider locale={locale} labels={selectionLabels(locale)}>
        <CompareSelectionSeed items={items.slice(0, parameters.full ? 4 : 1)} />
        <div className="flex flex-col items-start gap-3">
          {items.map((item) => (
            <section className="flex flex-col gap-2 rounded-xl border p-4" key={item.ref}>
              <h2>{item.name}</h2>
              <CompareChoice
                item={item}
                label={dictionaries[locale].Detail.compare}
                locale={locale}
              />
            </section>
          ))}
        </div>
      </CompareSelectionProvider>
    );
  },
};
export const SelectionLimit: Story = {
  ...SelectionTray,
  parameters: { full: true },
  play: async ({ canvas, userEvent, globals }) => {
    const m = dictionaries[storyLocale(globals)];
    await userEvent.click(canvas.getAllByRole("button", { name: m.Detail.compare })[4]!);
    await expect(canvas.getByRole("alert")).toHaveTextContent(m.Compare.limitReached);
    await expect(canvas.getByRole("status")).toHaveTextContent(
      m.Compare.selectionCount.replace("{count}", "4"),
    );
  },
};
export const MobileTray: Story = { ...SelectionTray, globals: mobileGlobals };

export const FourCandidates: Story = {
  ...MissingEvidence,
  parameters: { missing: true, four: true },
};
export const FourCandidatesMobile: Story = {
  ...FourCandidates,
  globals: { ...mobileGlobals, locale: "fr" },
};
export const DarkMissingEvidence: Story = { ...MissingEvidence, globals: { theme: "dark" } };
export const SelectionDisclosure: Story = {
  ...SelectionTray,
  play: async ({ canvas, userEvent, globals }) => {
    const m = dictionaries[storyLocale(globals)];
    const disclosure = canvas.getByText(m.Compare.selectedItems);
    await userEvent.click(disclosure);
    await expect(canvas.getByRole("link", { name: m.Compare.continueSelecting })).toBeVisible();
    await expect(disclosure.closest("details")).toHaveAttribute("open");
    const choices = canvas.getAllByRole("button", { name: m.Detail.compare });
    await expect(choices[0]).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(choices[1]!);
    await expect(choices[1]).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("link", { name: m.Compare.openComparison })).toBeVisible();
    await userEvent.click(choices[1]!);
    await expect(choices[1]).toHaveAttribute("aria-pressed", "false");
  },
};

export const CompareControls: Story = {
  render: (_, { globals }) => {
    const locale = storyLocale(globals);
    const t = dictionaries[locale].Compare;
    return (
      <div className="compare-member-actions max-w-6xl p-4">
        <AddCompareVersion
          ids={[refs[0]!]}
          locale={locale}
          labels={{
            title: t.addVersion,
            hint: t.addVersionHint,
            invalid: t.invalidRef,
            add: t.addVersion,
          }}
        />
        <Button asChild variant="outline">
          <FeedbackLink href={`/${locale}/search?kind=process`}>{t.continueSelecting}</FeedbackLink>
        </Button>
      </div>
    );
  },
  play: async ({ canvas, globals, userEvent }) => {
    const t = dictionaries[storyLocale(globals)].Compare;
    await userEvent.type(canvas.getByRole("textbox", { name: t.addVersion }), "invalid-version");
    await userEvent.click(canvas.getByRole("button", { name: t.addVersion }));
    await expect(canvas.getByText(t.invalidRef)).toBeVisible();
  },
};
export const CompareControlsMobile: Story = {
  ...CompareControls,
  globals: { ...mobileGlobals, locale: "de" },
};
