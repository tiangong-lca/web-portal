import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { usePathname } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor } from "storybook/test";
import { BrandHome } from "@/components/brand/brand-home";
import { ScrollCinematicHero } from "@/components/brand/scroll-cinematic-hero";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { publicCatalogSummarySchema } from "@/server/contracts/portal";
import fixture from "../../tests/fixtures/portal/catalog-v1.json";
import { dictionaries, mobileGlobals, storyLocale } from "../fixtures";

const summary = publicCatalogSummarySchema.parse(fixture.catalogSummary);
const cinematicChapters = {
  "zh-CN": ["02 — 数字孪生", "03 — 可追溯证据"],
  en: ["02 — Digital twin", "03 — Traceable evidence"],
  de: ["02 — Digitaler Zwilling", "03 — Nachverfolgbare Nachweise"],
  fr: ["02 — Jumeau numérique", "03 — Preuves traçables"],
} as const;

const meta = {
  title: "Brand/Homepage",
  component: BrandHome,
  subcomponents: {
    ScrollCinematicHero,
    SiteHeader,
    SiteFooter,
  },
  tags: ["!autodocs"],
  parameters: {
    pageLayout: true,
    viewport: {
      options: {
        wide: { name: "Wide · 1920", styles: { width: "1920px", height: "1080px" } },
        ultrawide: { name: "Ultrawide · 2560", styles: { width: "2560px", height: "1440px" } },
        panoramic: { name: "Panoramic · 21:9", styles: { width: "2560px", height: "1080px" } },
        tall: { name: "Tall desktop", styles: { width: "1440px", height: "1200px" } },
      },
    },
    docs: {
      description: {
        component:
          "Production brand homepage with synthetic catalog summary fixtures. The same cinematic frame sequence, CSS, dictionaries and navigation are used by the public route.",
      },
    },
  },
  args: { summary, locale: "zh-CN" },
  globals: { viewport: { value: "desktop", isRotated: false } },
  beforeEach({ globals }) {
    const key = "tiangong.portal.theme.v1";
    const saved = localStorage.getItem(key);
    localStorage.setItem(key, globals.theme === "dark" ? "dark" : "light");
    usePathname.mockReturnValue(`/${storyLocale(globals)}`);
    return () => {
      if (saved === null) localStorage.removeItem(key);
      else localStorage.setItem(key, saved);
      usePathname.mockReset();
    };
  },
  loaders: [
    async ({ args, globals, parameters }) => {
      const locale = storyLocale(globals);
      const text = dictionaries[locale].BrandHome;
      const hero =
        parameters.hero === "cinematic" || parameters.reducedMotion || parameters.holdLoading ? (
          <ScrollCinematicHero
            eyebrow={text.eyebrow}
            titleLead={text.titleLead}
            titleFocus={text.titleFocus}
            titleSeparator={locale === "zh-CN" ? "" : " "}
            description={text.description}
            chapterTwoLabel={text.chapterTwoLabel}
            chapterTwoTitle={text.chapterTwoTitle}
            chapterTwoDescription={text.chapterTwoDescription}
            chapterThreeLabel={text.chapterThreeLabel}
            chapterThreeTitle={text.chapterThreeTitle}
            chapterThreeDescription={text.chapterThreeDescription}
            reducedMotion={Boolean(parameters.reducedMotion)}
            holdLoading={Boolean(parameters.holdLoading)}
          />
        ) : undefined;
      const [home, header, footer] = await Promise.all([
        BrandHome({ locale, summary: args.summary ?? null, hero }),
        SiteHeader({ locale }),
        SiteFooter({ locale }),
      ]);
      return { home, header, footer };
    },
  ],
  render: (_, { loaded }) => (
    <>
      {loaded.header}
      {loaded.home}
      {loaded.footer}
    </>
  ),
  play: async ({ canvas, canvasElement, globals }) => {
    const locale = storyLocale(globals);
    const text = dictionaries[locale].BrandHome;
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
      `${text.titleLead}${locale === "zh-CN" ? "" : " "}${text.titleFocus}`,
    );
    await expect(canvasElement.querySelector(".brand-hero")).not.toBeInTheDocument();
    await expect(canvasElement.querySelector(".brand-cinematic-hero")).toBeInTheDocument();
    for (const chapter of cinematicChapters[locale]) {
      await expect(canvasElement).toHaveTextContent(chapter);
    }
    await expect(canvasElement.querySelector(".brand-team-section")).not.toBeInTheDocument();
    const firstFrame = canvasElement.querySelector(".brand-cinematic-hero img");
    await expect(firstFrame).toHaveAttribute("fetchpriority", "high");
    await expect(firstFrame).toHaveAttribute("decoding", "async");
    await expect(
      canvasElement.querySelector('[aria-label="Cinematic chapters"]'),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText("Scroll to trace")).not.toBeInTheDocument();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
} satisfies Meta<typeof BrandHome>;
export default meta;
type Story = StoryObj<Omit<typeof meta, "component">>;

export const Light: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const WideLight: Story = {
  globals: { viewport: { value: "wide", isRotated: false } },
};
export const WideDark: Story = {
  globals: { theme: "dark", viewport: { value: "wide", isRotated: false } },
};
export const Ultrawide: Story = {
  globals: { viewport: { value: "ultrawide", isRotated: false } },
};
export const English: Story = {
  globals: { locale: "en" },
};
export const CinematicPrototype: Story = {
  globals: { locale: "en", viewport: { value: "wide", isRotated: false } },
  parameters: { hero: "cinematic" },
  play: async ({ canvasElement }) => {
    const hero = canvasElement.querySelector<HTMLElement>(".brand-cinematic-hero");
    const frame = canvasElement.querySelector<HTMLImageElement>(
      'img[src="/brand/cinematic-v4/frame-001.webp"]',
    );
    const header = canvasElement.querySelector<HTMLElement>(".site-header");
    const sticky = canvasElement.querySelector<HTMLElement>(".brand-cinematic-sticky");
    await expect(hero).toBeInTheDocument();
    await expect(header).toBeInTheDocument();
    await expect(sticky).toBeInTheDocument();
    window.scrollTo({ top: 0, behavior: "auto" });
    const headerHeight = header!.getBoundingClientRect().height;
    const initialStickyTop = sticky!.getBoundingClientRect().top;
    await expect(
      Math.abs(sticky!.getBoundingClientRect().height - (window.innerHeight - headerHeight)),
    ).toBeLessThanOrEqual(1);
    await expect(canvasElement.querySelector(".brand-cinematic-masthead")).not.toBeInTheDocument();
    await expect(canvasElement).toHaveTextContent(`01 — ${dictionaries.en.BrandHome.eyebrow}`);
    const chapterLabels = [...(hero?.querySelectorAll("p") ?? [])].filter((label) =>
      /^(01|02|03) —/.test(label.textContent?.trim() ?? ""),
    );
    await expect(chapterLabels).toHaveLength(3);
    const [referenceLabel, ...remainingChapterLabels] = chapterLabels;
    await expect(referenceLabel).toBeDefined();
    if (!referenceLabel) throw new Error("Missing first cinematic chapter label");
    const referenceLabelStyle = getComputedStyle(referenceLabel);
    for (const label of remainingChapterLabels) {
      const labelStyle = getComputedStyle(label);
      await expect(labelStyle.color).toBe(referenceLabelStyle.color);
      await expect(labelStyle.fontSize).toBe(referenceLabelStyle.fontSize);
      await expect(labelStyle.fontWeight).toBe(referenceLabelStyle.fontWeight);
      await expect(labelStyle.letterSpacing).toBe(referenceLabelStyle.letterSpacing);
      await expect(labelStyle.textTransform).toBe(referenceLabelStyle.textTransform);
    }
    await expect(hero?.querySelectorAll("a")).toHaveLength(0);
    const chapterTitles = [...(hero?.querySelectorAll("h1, h2") ?? [])];
    await expect(chapterTitles).toHaveLength(3);
    const [referenceTitle, ...remainingChapterTitles] = chapterTitles;
    await expect(referenceTitle).toBeDefined();
    if (!referenceTitle) throw new Error("Missing first cinematic chapter title");
    const referenceTitleStyle = getComputedStyle(referenceTitle);
    const emphasizedTitle = referenceTitle.querySelector("strong");
    await expect(emphasizedTitle).toBeInTheDocument();
    await expect(getComputedStyle(emphasizedTitle!).color).toBe(referenceTitleStyle.color);
    const referencePanelStyle = getComputedStyle(referenceTitle.parentElement!);
    const referencePanelTransform = referencePanelStyle.transform;
    const initialPanelTop = referenceTitle.parentElement!.getBoundingClientRect().top;
    const headerContainer = canvasElement.querySelector<HTMLElement>(
      ".site-header .site-shell-container",
    );
    await expect(headerContainer).toBeInTheDocument();
    const headerContentLeft =
      headerContainer!.getBoundingClientRect().left +
      Number.parseFloat(getComputedStyle(headerContainer!).paddingLeft);
    await expect(
      Math.abs(referenceTitle.parentElement!.getBoundingClientRect().left - headerContentLeft),
    ).toBeLessThanOrEqual(2);
    for (const title of remainingChapterTitles) {
      const titleStyle = getComputedStyle(title);
      const panelStyle = getComputedStyle(title.parentElement!);
      await expect(titleStyle.fontSize).toBe(referenceTitleStyle.fontSize);
      await expect(titleStyle.fontWeight).toBe(referenceTitleStyle.fontWeight);
      await expect(titleStyle.lineHeight).toBe(referenceTitleStyle.lineHeight);
      await expect(titleStyle.letterSpacing).toBe(referenceTitleStyle.letterSpacing);
      await expect(panelStyle.left).toBe(referencePanelStyle.left);
      await expect(panelStyle.top).toBe(referencePanelStyle.top);
      await expect(panelStyle.width).toBe(referencePanelStyle.width);
    }
    await expect(frame).toHaveAttribute("src", "/brand/cinematic-v4/frame-001.webp");
    const frameBuffers = canvasElement.querySelectorAll('[data-cinematic-layer="foreground"]');
    const ambientBuffers = canvasElement.querySelectorAll('[data-cinematic-layer="ambient"]');
    await expect(frameBuffers).toHaveLength(2);
    await expect(ambientBuffers).toHaveLength(2);
    const firstForeground = frameBuffers.item(0);
    const secondForeground = frameBuffers.item(1);
    const firstAmbient = ambientBuffers.item(0);
    const secondAmbient = ambientBuffers.item(1);
    await expect(getComputedStyle(firstForeground).objectFit).toBe("cover");
    await expect(getComputedStyle(firstAmbient).objectFit).toBe("cover");
    if (window.innerWidth <= 760) {
      await expect(getComputedStyle(firstForeground).objectPosition).toBe("50% 50%");
    }
    await expect(firstForeground).toHaveAttribute("data-visible", "true");
    await expect(secondForeground).toHaveAttribute("data-visible", "false");
    await expect(firstAmbient).toHaveAttribute("data-visible", "true");
    await expect(secondAmbient).toHaveAttribute("data-visible", "false");
    await expect(firstAmbient).toHaveAttribute("src", firstForeground.getAttribute("src"));
    window.scrollTo({ top: 24, behavior: "auto" });
    await waitFor(() => expect(Number(hero?.dataset.frame)).toBeGreaterThan(1), { timeout: 1000 });
    await expect(
      Math.abs(sticky!.getBoundingClientRect().top - initialStickyTop),
    ).toBeLessThanOrEqual(1);
    await expect(
      Math.abs(referenceTitle.parentElement!.getBoundingClientRect().top - initialPanelTop),
    ).toBeLessThanOrEqual(1);
    const scrollRange = Math.max((hero?.offsetHeight ?? 0) - window.innerHeight, 1);
    window.scrollTo({ top: scrollRange * 0.3, behavior: "auto" });
    await waitFor(() => expect(hero).toHaveAttribute("data-chapter", "1"), { timeout: 1000 });
    await waitFor(
      () =>
        expect(getComputedStyle(referenceTitle.parentElement!).transform).toBe(
          referencePanelTransform,
        ),
      { timeout: 1000 },
    );
    window.scrollTo({ top: (hero?.offsetHeight ?? 0) * 0.58, behavior: "auto" });
    await waitFor(() => expect(Number(hero?.dataset.frame)).toBeGreaterThan(50), { timeout: 5000 });
    await waitFor(() => expect(Number(hero?.dataset.renderedFrame)).toBeGreaterThan(50), {
      timeout: 5000,
    });
    await expect(
      [...frameBuffers].filter((buffer) => buffer.getAttribute("data-visible") === "true"),
    ).toHaveLength(1);
    await expect(
      [...ambientBuffers].filter((buffer) => buffer.getAttribute("data-visible") === "true"),
    ).toHaveLength(1);
    await waitFor(
      () => {
        const visibleForeground = [...frameBuffers].find(
          (buffer) => buffer.getAttribute("data-visible") === "true",
        );
        const visibleAmbient = [...ambientBuffers].find(
          (buffer) => buffer.getAttribute("data-visible") === "true",
        );
        return expect(visibleAmbient).toHaveAttribute(
          "src",
          visibleForeground?.getAttribute("src"),
        );
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(hero).toHaveAttribute("data-media", "ready"), { timeout: 3000 });
    window.scrollTo({ top: 0, behavior: "auto" });
  },
};
export const CinematicLoading: Story = {
  globals: { locale: "en", viewport: { value: "wide", isRotated: false } },
  parameters: { hero: "cinematic", holdLoading: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector(".brand-cinematic-hero")).toHaveAttribute(
      "data-media",
      "loading",
    );
    await expect(
      canvas.getByRole("status", { name: "Preparing cinematic experience" }),
    ).toBeVisible();
  },
};
export const CinematicPrototypeDark: Story = {
  globals: {
    locale: "en",
    theme: "dark",
    viewport: { value: "wide", isRotated: false },
  },
  parameters: { hero: "cinematic" },
  play: CinematicPrototype.play,
};
export const CinematicPrototypeMobile: Story = {
  globals: { ...mobileGlobals, locale: "en" },
  parameters: { hero: "cinematic" },
  play: CinematicPrototype.play,
};
export const CinematicPrototypePanoramic: Story = {
  globals: { locale: "en", viewport: { value: "panoramic", isRotated: false } },
  parameters: { hero: "cinematic" },
  play: CinematicPrototype.play,
};
export const CinematicPrototypeTall: Story = {
  globals: { locale: "en", viewport: { value: "tall", isRotated: false } },
  parameters: { hero: "cinematic" },
  play: CinematicPrototype.play,
};
export const CinematicPrototypeReducedMotion: Story = {
  globals: { locale: "en", viewport: { value: "wide", isRotated: false } },
  parameters: { hero: "cinematic", reducedMotion: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(".brand-cinematic-hero")).toHaveAttribute(
      "data-motion",
      "reduced",
    );
  },
};
export const FrenchDark: Story = {
  globals: { locale: "fr", theme: "dark" },
};
export const Mobile: Story = { globals: mobileGlobals };
export const MobileDark: Story = {
  globals: { ...mobileGlobals, theme: "dark" },
};
export const GermanMobile: Story = {
  globals: { ...mobileGlobals, locale: "de" },
};
export const ReducedMotion: Story = {
  parameters: { reducedMotion: true },
};
export const SummaryUnavailable: Story = { args: { summary: null } };
