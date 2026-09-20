import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";
import { MapLibreExplorer } from "../maplibre-reference/explorer";
import { MapScene } from "../maplibre-reference/map-scene";
import { Button } from "@/components/ui/button";
import { mobileGlobals, storyLocale } from "../fixtures";

const meta = {
  title: "Design references/MapLibre geography",
  component: MapLibreExplorer,
  subcomponents: { MapScene, Button },
  tags: ["!autodocs"],
  globals: { viewport: { value: "desktop", isRotated: false } },
  parameters: { layout: "fullscreen", pageLayout: true },
  args: { initialLevel: "world", initialMode: "globe", unavailable: false },
  render: (args, { globals }) => (
    <MapLibreExplorer {...args} locale={storyLocale(globals)} dark={globals.theme === "dark"} />
  ),
} satisfies Meta<typeof MapLibreExplorer>;
export default meta;
type Story = StoryObj<typeof meta>;

async function ready(canvasElement: HTMLElement) {
  await waitFor(
    () =>
      expect(canvasElement.querySelector(".globe-prototype")).toHaveAttribute(
        "data-map-ready",
        "true",
      ),
    { timeout: 20000 },
  );
}

export const Globe: Story = {
  globals: { locale: "zh-CN" },
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    await expect(canvasElement.querySelector("canvas")).toBeVisible();
    await expect(canvasElement.querySelector(".globe-scene-canvas")).toHaveAttribute(
      "data-camera-longitude",
      "137.000",
    );
    await expect(canvasElement.querySelector(".globe-scene-canvas")).toHaveAttribute(
      "data-camera-latitude",
      "24.000",
    );
    await expect(canvasElement).toHaveTextContent("公开数据快照");
  },
};
export const GlobeDark: Story = { ...Globe, globals: { locale: "zh-CN", theme: "dark" } };
export const ChinaSmallTargets: Story = {
  args: { initialLevel: "geo:cn" },
  globals: { locale: "zh-CN" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await ready(canvasElement);
    for (const name of ["澳门 · 3", "台湾 · 0"]) {
      const marker = canvas.getByRole("button", { name });
      await userEvent.click(marker);
      await expect(canvasElement.querySelector(".globe-selection")).toHaveTextContent(
        name.split(" · ")[0]!,
      );
      await expect(canvas.getByRole("link", { name: "查看数据" })).toHaveAttribute(
        "href",
        expect.stringMatching(/geoNode=geo%3A(mo|tw)/u),
      );
    }
    await expect(canvasElement.querySelector(".globe-selection-count")).toHaveTextContent(
      "0 个公开版本",
    );
  },
};
export const WorldToCity: Story = {
  globals: { locale: "zh-CN" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await ready(canvasElement);
    const originalCanvas = canvasElement.querySelector("canvas");
    for (const id of ["geo:cn", "geo:cn-ah"]) {
      await userEvent.click(
        canvasElement.querySelector<HTMLButtonElement>(`button[data-node-id="${id}"]`)!,
      );
      await userEvent.click(canvas.getByRole("button", { name: "浏览下级地区" }));
      await ready(canvasElement);
      await expect(canvasElement.querySelector("canvas")).toBe(originalCanvas);
    }
    await userEvent.click(
      canvasElement.querySelector<HTMLButtonElement>('button[data-node-id="geo:cn-ah-hfe"]')!,
    );
    await expect(canvasElement.querySelector(".globe-selection")).toHaveTextContent("合肥市");
    await expect(canvas.getByRole("link", { name: "查看数据" })).toHaveAttribute(
      "href",
      expect.stringContaining("geo%3Acn-ah-hfe"),
    );
    await expect(canvasElement.querySelector(".globe-prototype")).toHaveAttribute(
      "data-level",
      "geo:cn-ah",
    );
    await waitFor(async () => {
      const zoom = Number(
        canvasElement.querySelector<HTMLElement>(".globe-scene-canvas")?.dataset.cameraZoom,
      );
      await expect(zoom).toBeGreaterThan(4); // Beyond the completed globe-to-Mercator transition.
    });
  },
};
export const Mobile: Story = {
  args: { initialLevel: "geo:cn", initialMode: undefined },
  globals: { ...mobileGlobals, locale: "zh-CN" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvasElement.querySelector(".globe-prototype")).toHaveAttribute(
      "data-mode",
      "list",
    );
    await expect(canvasElement.querySelector("canvas")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "平面" }));
    await ready(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "澳门 · 3" }));
    await expect(canvasElement.querySelector(".globe-selection")).toHaveTextContent("澳门");
  },
};
export const WebglUnavailable: Story = {
  args: { unavailable: true, initialLevel: "geo:cn" },
  globals: { locale: "en" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByText(/interactive map is unavailable/u)).toBeVisible();
    await userEvent.click(
      canvasElement.querySelector<HTMLButtonElement>('button[data-node-id="geo:cn-ah"]')!,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Explore subregions" }));
    await expect(canvasElement.querySelector(".globe-prototype")).toHaveAttribute(
      "data-level",
      "geo:cn-ah",
    );
  },
};

export const KeyboardReducedMotion: Story = {
  args: { initialLevel: "geo:cn", reducedMotion: true },
  globals: { locale: "de" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await ready(canvasElement);
    const marker = canvasElement.querySelector<HTMLButtonElement>(".globe-region-callout-mo")!;
    const rect = marker.getBoundingClientRect();
    const mapRect = canvasElement.querySelector(".globe-scene")!.getBoundingClientRect();
    await expect(rect.width).toBeGreaterThanOrEqual(44);
    await expect(rect.height).toBeGreaterThanOrEqual(44);
    await expect(rect.left).toBeGreaterThan(mapRect.left);
    await expect(rect.right).toBeLessThan(mapRect.right);
    marker.focus();
    await expect(marker).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(canvasElement.querySelector(".globe-prototype")).toHaveAttribute(
      "data-selected-node",
      "geo:mo",
    );
    await waitFor(() =>
      expect(
        Number(canvasElement.querySelector<HTMLElement>(".globe-scene-canvas")?.dataset.cameraZoom),
      ).toBeGreaterThan(8),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Auswahl aufheben" }));
    await expect(canvasElement.querySelector(".globe-prototype")).toHaveAttribute(
      "data-selected-node",
      "",
    );
  },
};
export const FrenchFlat: Story = {
  args: { initialLevel: "world", initialMode: "flat" },
  globals: { locale: "fr" },
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    await expect(canvasElement.querySelector(".globe-prototype")).toHaveAttribute(
      "data-mode",
      "flat",
    );
    await expect(canvasElement.querySelector(".globe-scene-canvas")).toHaveAttribute(
      "data-camera-longitude",
      "137.000",
    );
  },
};
