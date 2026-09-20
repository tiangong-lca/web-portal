import { NavigationFeedbackProvider } from "../src/components/shell/navigation-feedback";
import type { Preview } from "@storybook/nextjs-vite";
import { NextIntlClientProvider } from "next-intl";
import { setupWorker } from "msw/browser";
import { mswLoader } from "msw-storybook-addon/csf3";

import { localeNames, locales } from "../src/i18n/routing";
import { dictionaries, storyLocale } from "./fixtures";
import "./preview.css";

const preview: Preview = {
  tags: ["autodocs"],
  initialGlobals: { locale: "zh-CN", theme: "light" },
  globalTypes: {
    locale: {
      description: "Portal language",
      toolbar: {
        icon: "globe",
        dynamicTitle: true,
        items: locales.map((value) => ({ value, title: localeNames[value] })),
      },
    },
    theme: {
      description: "Portal theme",
      toolbar: {
        icon: "circlehollow",
        dynamicTitle: true,
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
  },
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
    a11y: { test: "error" },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: { disable: true },
    viewport: {
      options: {
        mobile: { name: "Mobile · 390", styles: { width: "390px", height: "844px" } },
        tablet: { name: "Tablet · 768", styles: { width: "768px", height: "1024px" } },
        desktop: { name: "Desktop · 1280", styles: { width: "1280px", height: "900px" } },
      },
    },
    options: {
      storySort: {
        order: ["Foundations", "Primitives", "Shell", "Catalog", "Compare", "Shortlist"],
      },
    },
  },
  loaders: [
    mswLoader(async () => {
      const worker = setupWorker();
      await worker.start({
        quiet: true,
        onUnhandledRequest(request, print) {
          // Only fixture handlers may service product API calls in this workspace.
          if (new URL(request.url).pathname.startsWith("/internal/")) print.error();
        },
      });
      return worker;
    }),
  ],
  beforeEach({ globals }) {
    const url = window.location.href;
    document.documentElement.lang = storyLocale(globals);
    document.documentElement.classList.toggle("dark", globals.theme === "dark");
    document.documentElement.dataset.theme = globals.theme === "dark" ? "dark" : "light";
    return () => window.history.replaceState(null, "", url);
  },
  decorators: [
    (Story, { globals, parameters }) => {
      const locale = storyLocale(globals);
      const Surface = parameters.pageLayout ? "div" : "main";
      return (
        <NextIntlClientProvider locale={locale} messages={dictionaries[locale]} timeZone="UTC">
          <NavigationFeedbackProvider label={dictionaries[locale].Common.loading}>
            <Surface
              className={`bg-background text-foreground min-h-screen ${parameters.pageLayout ? "" : "p-4 sm:p-6"}`}
            >
              <Story key={locale} />
            </Surface>
          </NavigationFeedbackProvider>
        </NextIntlClientProvider>
      );
    },
  ],
};

export default preview;
