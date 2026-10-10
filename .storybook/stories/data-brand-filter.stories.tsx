import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { DataBrandFilter } from "../../src/features/catalog/data-brand-filter";
import { dataBrandNames } from "../../src/config/data-brands";
import { dictionaries, storyLocale } from "../fixtures";

const meta = {
  title: "Catalog/Data Brand Filter",
  component: DataBrandFilter,
  args: {
    allowedBrandCodes: ["bafu", "tiangong_lca", "uslci", "worldsteel"],
    label: "Database brand",
    allLabel: "All available brands",
    onChange: () => {},
  },
  render: function Render(args, { globals }) {
    const [value, setValue] = useState(args.value);
    const messages = dictionaries[storyLocale(globals)].Common;
    return (
      <div className="w-80 max-w-full">
        <DataBrandFilter
          {...args}
          label={messages.dataBrand}
          allLabel={messages.allDataBrands}
          value={value}
          onChange={setValue}
        />
        <output className="mt-4 block" aria-live="polite">
          {value ? dataBrandNames[value] : messages.allDataBrands}
        </output>
      </div>
    );
  },
} satisfies Meta<typeof DataBrandFilter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MultipleBrands: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("combobox"));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("option", { name: /^BAFU$/ }));
    await expect(canvas.getByRole("status")).toHaveTextContent("BAFU");
  },
};
export const SingleBrand: Story = {
  args: { allowedBrandCodes: ["tiangong_lca"] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("combobox")).toBeNull();
  },
};
export const TwoBrandsFrench: Story = {
  args: { allowedBrandCodes: ["tiangong_lca", "worldsteel"], value: "worldsteel" },
  globals: { locale: "fr" },
};
export const GermanKeyboard: Story = {
  globals: { locale: "de" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole("combobox").focus();
    await userEvent.keyboard("{Enter}{ArrowDown}{Enter}");
    await expect(canvas.getByRole("combobox")).toHaveFocus();
  },
};
