import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useMemo, useState } from "react";
import { expect, waitFor } from "storybook/test";
import { RegionMapLibre } from "@/features/catalog/region-maplibre";
import { RegionMapScene } from "@/features/catalog/region-maplibre-scene";
import { MapInformation } from "@/features/catalog/map-information";
import { RegionExplorer } from "@/features/catalog/region-explorer";
import { Button } from "@/components/ui/button";
import { regionMapAssets } from "@/features/catalog/region-map-assets";
import type { PortalLocale } from "@/i18n/routing";
import { dictionaries, mobileGlobals, storyLocale } from "../fixtures";
import { regionMapEntries, regionMapLabels } from "../region-map-fixtures";

async function ready(element: HTMLElement) {
  await waitFor(
    () =>
      expect(element.querySelector(".region-maplibre")).toHaveAttribute("data-map-ready", "true"),
    { timeout: 20000 },
  );
  await expect(
    element.querySelector(".region-maplibre-canvas")!.getBoundingClientRect().height,
  ).toBeGreaterThanOrEqual(380);
}
const meta = {
  title: "Catalog/Globe geography",
  component: RegionMapLibre,
  subcomponents: { RegionMapScene, RegionExplorer, MapInformation, Button },
  globals: { viewport: { value: "desktop", isRotated: false } },
  args: {
    assets: regionMapAssets("world")!,
    entries: [],
    locale: "zh-CN",
    globe: true,
    labels: regionMapLabels("zh-CN"),
  },
  parameters: { layout: "fullscreen" },
  afterEach: async ({ canvasElement, args }) => {
    if (args.unavailable || !canvasElement.querySelector(".region-maplibre")) return;
    await ready(canvasElement);
    await waitFor(
      () =>
        expect(canvasElement.querySelector(".region-maplibre-scene")).not.toHaveAttribute(
          "data-moving",
        ),
      { timeout: 10000 },
    );
  },
  render: (args, { globals }) => {
    const locale = storyLocale(globals);
    return (
      <RegionMapLibre
        {...args}
        locale={locale}
        labels={regionMapLabels(locale)}
        entries={regionMapEntries(locale, args.assets.layer)}
      />
    );
  },
} satisfies Meta<typeof RegionMapLibre>;
export default meta;
type Story = StoryObj<typeof meta>;

export const World: Story = {
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    await expect(canvasElement.querySelector("canvas")).toBeVisible();
  },
};
export const FlatWorld: Story = { ...World, args: { globe: false } };
export const Dark: Story = { ...World, globals: { theme: "dark", locale: "en" } };
export const ChinaSmallTargets: Story = {
  args: { assets: regionMapAssets("geo:cn")! },
  globals: { locale: "zh-CN" },
  play: async ({ canvasElement, canvas, userEvent }) => {
    await ready(canvasElement);
    for (const id of ["geo:mo", "geo:tw", "geo:hk"]) {
      await userEvent.click(
        canvasElement.querySelector<HTMLButtonElement>(`[data-region-shortcut="${id}"]`)!,
      );
      await expect(canvasElement.querySelector(".region-maplibre")).toHaveAttribute(
        "data-selected-node",
        id,
      );
      await expect(canvas.getByRole("link", { name: "查看数据" })).toHaveAttribute(
        "href",
        expect.stringContaining(encodeURIComponent(id)),
      );
    }
    await userEvent.click(
      canvasElement.querySelector<HTMLButtonElement>('[data-region-shortcut="geo:tw"]')!,
    );
    await expect(
      canvasElement.querySelector(".region-maplibre-selection-summary"),
    ).toHaveTextContent("0 个公开版本");
  },
};
export const Province: Story = {
  ...World,
  args: { assets: regionMapAssets("geo:cn-ah")! },
  globals: { locale: "de" },
};
export const FrenchInformation: Story = {
  args: { assets: regionMapAssets("geo:cn")! },
  globals: { ...mobileGlobals, locale: "fr" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await ready(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: dictionaries.fr.Navigation.mapInformation }),
    );
    await expect(canvas.getByText(dictionaries.fr.Navigation.mapExplanation)).toBeVisible();
  },
};
export const Unavailable: Story = {
  args: { unavailable: true },
  globals: { locale: "en" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(dictionaries.en.Navigation.mapUnavailable)).toBeVisible();
  },
};

function Journey({ locale }: { locale: PortalLocale }) {
  const [layer, setLayer] = useState("world");
  const [zero, setZero] = useState(false);
  const entries = useMemo(
    () =>
      regionMapEntries(locale, layer).map((entry) =>
        zero
          ? {
              ...entry,
              count: 0,
              countLabel: dictionaries[locale].Navigation.versions.replace("{count}", "0"),
            }
          : entry,
      ),
    [locale, layer, zero],
  );
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-2">
        {["world", "geo:cn", "geo:cn-ah"].map((id) => (
          <Button key={id} onClick={() => setLayer(id)}>
            {id === "world"
              ? dictionaries[locale].Navigation.world
              : id === "geo:cn"
                ? "中国"
                : "安徽省"}
          </Button>
        ))}
        <Button onClick={() => setZero(!zero)}>
          {dictionaries[locale].Navigation.zeroRegions}
        </Button>
      </div>
      <RegionMapLibre
        assets={regionMapAssets(layer)!}
        entries={entries}
        locale={locale}
        globe
        labels={regionMapLabels(locale)}
      />
    </div>
  );
}
export const ContinuousLevels: Story = {
  globals: { locale: "zh-CN" },
  render: (_, { globals }) => <Journey locale={storyLocale(globals)} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await ready(canvasElement);
    const original = canvasElement.querySelector("canvas");
    await userEvent.click(canvas.getByRole("button", { name: "中国" }));
    await ready(canvasElement);
    await expect(canvasElement.querySelector("canvas")).toBe(original);
    await userEvent.click(canvas.getByRole("button", { name: "安徽省" }));
    await ready(canvasElement);
    await expect(canvasElement.querySelector("canvas")).toBe(original);
    const camera = canvasElement.querySelector<HTMLElement>(".region-maplibre-canvas")!;
    const before = camera.dataset.cameraZoom;
    await userEvent.click(
      canvas.getByRole("button", { name: dictionaries["zh-CN"].Navigation.zeroRegions }),
    );
    await ready(canvasElement);
    await expect(camera.dataset.cameraZoom).toBe(before);
    await expect(canvasElement.querySelector("canvas")).toBe(original);
  },
};
