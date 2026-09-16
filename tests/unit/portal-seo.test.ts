import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { defaultLocale, localePath, locales } from "@/i18n/routing";
import {
  absolutePortalUrl,
  defaultLanguagePath,
  localizedMetadata,
  publicIndexingEnabled,
  publicSiteUrl,
  siteVerificationMetadata,
} from "@/lib/seo";

const siteOrigin = "https://portal.example";

const metadata = (overrides: Partial<Parameters<typeof localizedMetadata>[0]> = {}) =>
  localizedMetadata({
    description: "Portal SEO fixture",
    locale: "zh-CN",
    title: "Portal SEO fixture",
    ...overrides,
  });

/** Locale and content path of one sitemap URL, so reciprocity can be checked without guessing. */
function entryCoordinates(url: string): { locale: string; path: string } {
  const [locale = "", ...rest] = new URL(url).pathname.replace(/^\//u, "").split("/");
  return { locale, path: rest.join("/") };
}

describe("public indexing gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens only for the explicit enabled value and stays closed when unset", () => {
    expect(publicIndexingEnabled({})).toBe(false);
    expect(publicIndexingEnabled({ PORTAL_PUBLIC_INDEXING: "disabled" })).toBe(false);
    expect(publicIndexingEnabled({ PORTAL_PUBLIC_INDEXING: "true" })).toBe(false);
    expect(publicIndexingEnabled({ PORTAL_PUBLIC_INDEXING: "enabled" })).toBe(true);
  });

  it("drives page robots metadata and robots.txt from the same switch", () => {
    vi.stubEnv("SITE_URL", siteOrigin);
    vi.stubEnv("PORTAL_PUBLIC_INDEXING", "disabled");

    expect(metadata({ locale: "en" }).robots).toEqual({ follow: true, index: false });
    expect(robots().rules).toEqual({ disallow: "/", userAgent: "*" });

    vi.stubEnv("PORTAL_PUBLIC_INDEXING", "enabled");

    expect(metadata({ locale: "en" }).robots).toEqual({ follow: true, index: true });
    const open = robots();
    expect(Array.isArray(open.rules)).toBe(true);
    expect(open.sitemap).toHaveLength(3);
  });

  it("lets the global gate win over an explicit index:true", () => {
    vi.stubEnv("PORTAL_PUBLIC_INDEXING", "disabled");
    expect(metadata({ index: true }).robots).toEqual({ follow: true, index: false });

    vi.stubEnv("PORTAL_PUBLIC_INDEXING", "enabled");
    expect(metadata({ index: true }).robots).toEqual({ follow: true, index: true });
  });

  it("still honours an explicit opt-out and follow override", () => {
    vi.stubEnv("PORTAL_PUBLIC_INDEXING", "enabled");
    expect(metadata({ index: false }).robots).toEqual({ follow: true, index: false });

    vi.stubEnv("PORTAL_PUBLIC_INDEXING", "disabled");
    expect(metadata({ index: false }).robots).toEqual({ follow: true, index: false });

    vi.stubEnv("PORTAL_PUBLIC_INDEXING", "enabled");
    expect(metadata({ follow: false }).robots).toEqual({ follow: false, index: true });
  });
});

describe("canonical and alternate links", () => {
  it("keeps x-default on the same content in the default language", () => {
    const deep = metadata({ locale: "en", path: "browse/flow" });
    const languages = deep.alternates?.languages ?? {};

    expect(deep.alternates?.canonical).toBe("/en/browse/flow");
    expect(languages["x-default"]).toBe(`/${defaultLocale}/browse/flow`);
    expect(languages["zh-CN"]).toBe("/zh-CN/browse/flow");
    expect(languages.en).toBe("/en/browse/flow");
    expect(languages.de).toBe("/de/browse/flow");
    expect(languages.fr).toBe("/fr/browse/flow");
  });

  it("never advertises the redirecting root as the default-language page", () => {
    expect(defaultLanguagePath("")).toBe("/zh-CN");

    const home = metadata({ locale: "zh-CN" });
    expect(home.alternates?.canonical).toBe("/zh-CN");
    expect(home.alternates?.languages?.["x-default"]).toBe("/zh-CN");
    expect(Object.values(home.alternates?.languages ?? {})).not.toContain("/");
  });

  it("keeps the share image and OpenGraph locale on every page", () => {
    const page = metadata({ locale: "de", path: "methodology" });
    expect(page.openGraph?.images).toHaveLength(1);
    expect(page.openGraph?.locale).toBe("de_DE");
    expect(page.openGraph?.description).toBe("Portal SEO fixture");
  });
});

describe("base sitemap", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", siteOrigin);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists every language version of every path exactly once, without redirects", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(entries).toHaveLength(8 * locales.length);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).not.toContain(`${siteOrigin}/`);
    for (const locale of locales) expect(urls).toContain(`${siteOrigin}${localePath(locale)}`);
  });

  it("gives every entry reciprocal alternates and a same-content x-default", () => {
    const entries = sitemap();
    const urlToEntry = new Map(entries.map((entry) => [entry.url, entry]));

    for (const entry of entries) {
      const { locale, path } = entryCoordinates(entry.url);
      const languages: Record<string, string | undefined> = { ...entry.alternates?.languages };

      for (const candidate of locales) {
        const alternate = languages[candidate];
        expect(alternate).toBe(`${siteOrigin}${localePath(candidate, path)}`);

        const counterpart = urlToEntry.get(alternate ?? "");
        expect(counterpart).toBeDefined();
        const counterpartLanguages: Record<string, string | undefined> = {
          ...counterpart?.alternates?.languages,
        };
        expect(counterpartLanguages[locale]).toBe(entry.url);
      }

      expect(languages["x-default"]).toBe(`${siteOrigin}${defaultLanguagePath(path)}`);
      expect(urlToEntry.has(languages["x-default"] ?? "")).toBe(true);
    }
  });

  it("keeps the browse paths on the daily/0.7 schedule and other pages monthly", () => {
    const entries = sitemap();
    const browse = entries.find((entry) => entry.url === `${siteOrigin}/en/browse/process`);
    const team = entries.find((entry) => entry.url === `${siteOrigin}/en/team`);

    expect(browse?.changeFrequency).toBe("daily");
    expect(browse?.priority).toBe(0.7);
    expect(team?.changeFrequency).toBe("monthly");
    expect(team?.priority).toBe(0.5);
  });
});

describe("public origin guidance", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("publishes the canonical www origin in production metadata and sitemaps", () => {
    vi.stubEnv("SITE_URL", "https://www.tiangong.earth");
    vi.stubEnv("PORTAL_PUBLIC_INDEXING", "enabled");

    const entries = sitemap();
    expect(entries).not.toHaveLength(0);
    for (const entry of entries) {
      expect(entry.url.startsWith("https://www.tiangong.earth/")).toBe(true);
      for (const alternate of Object.values(entry.alternates?.languages ?? {})) {
        expect(String(alternate).startsWith("https://www.tiangong.earth/")).toBe(true);
      }
    }

    expect(absolutePortalUrl("/zh-CN")).toBe("https://www.tiangong.earth/zh-CN");
    expect(robots().sitemap?.[0]).toBe("https://www.tiangong.earth/sitemap.xml");
  });

  it("keeps the loopback fixture origin usable for local and CI runs", () => {
    vi.stubEnv("SITE_URL", "http://localhost:3000");

    expect(sitemap()[0]?.url.startsWith("http://localhost:3000/")).toBe(true);
    expect(absolutePortalUrl("/en")).toBe("http://localhost:3000/en");
    vi.stubEnv("PORTAL_PUBLIC_INDEXING", "disabled");
    expect(robots().rules).toEqual({ disallow: "/", userAgent: "*" });
  });
});

describe("public origin contract", () => {
  it("accepts the canonical origin and strips any path", () => {
    expect(publicSiteUrl({ SITE_URL: "https://www.tiangong.earth" }).origin).toBe(
      "https://www.tiangong.earth",
    );
    expect(publicSiteUrl({ SITE_URL: "https://www.tiangong.earth/portal" }).origin).toBe(
      "https://www.tiangong.earth",
    );
  });

  it("fails closed in production when the public origin is missing or unusable", () => {
    for (const env of [
      { NODE_ENV: "production" },
      { NODE_ENV: "production", SITE_URL: "   " },
      { NODE_ENV: "production", SITE_URL: "not-a-url" },
      { NODE_ENV: "production", SITE_URL: "ftp://www.tiangong.earth" },
      { NODE_ENV: "production", SITE_URL: "https://user:secret@www.tiangong.earth" },
    ]) {
      expect(() => publicSiteUrl(env)).toThrow(/SITE_URL/u);
    }
  });

  it("keeps explicit loopback fixtures usable for local and CI runs", () => {
    expect(publicSiteUrl({ SITE_URL: "http://127.0.0.1:4317" }).origin).toBe(
      "http://127.0.0.1:4317",
    );
    expect(publicSiteUrl({}).origin).toBe("http://localhost:3000");
    // The fixture-backed E2E lane builds with NODE_ENV=production against its own host.
    expect(
      publicSiteUrl({ NODE_ENV: "production", SITE_URL: "http://127.0.0.1:4317" }).origin,
    ).toBe("http://127.0.0.1:4317");
  });
});

describe("provider verification marker", () => {
  it("publishes the configured code verbatim and nothing when unset", () => {
    expect(siteVerificationMetadata({ BAIDU_SITE_VERIFICATION: "codeva-public-code" })).toEqual({
      verification: { other: { "baidu-site-verification": "codeva-public-code" } },
    });
    expect(siteVerificationMetadata({})).toEqual({});
    expect(siteVerificationMetadata({ BAIDU_SITE_VERIFICATION: "   " })).toEqual({});
    expect("verification" in siteVerificationMetadata({ BAIDU_SITE_VERIFICATION: "" })).toBe(false);
  });
});
