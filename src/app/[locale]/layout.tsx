import type { Metadata } from "next";

import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { NavigationFeedbackProvider } from "@/components/shell/navigation-feedback";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { isPortalLocale, locales } from "@/i18n/routing";
import { CompareSelectionProvider } from "@/features/compare/selection";

import { RootDocument, portalMetadata } from "../root-document";

import "../globals.css";

export const metadata: Metadata = portalMetadata;
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function PortalLocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isPortalLocale(locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages({ locale });
  const common = await getTranslations({ locale, namespace: "Common" });
  const compare = await getTranslations({ locale, namespace: "Compare" });

  return (
    <RootDocument lang={locale}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <NavigationFeedbackProvider label={common("loading")}>
          <div className="flex min-h-screen flex-col">
            <CompareSelectionProvider
              locale={locale}
              labels={{
                count: compare("selectionCount", { count: "{count}" }),
                clear: compare("clearSelection"),
                remove: compare("removeSelection"),
                continue: compare("continueSelecting"),
                selectedItems: compare("selectedItems"),
                compare: compare("openComparison"),
                hint: compare("selectionHint"),
                limit: compare("limitReached"),
              }}
            >
              <SiteHeader locale={locale} />
              {children}
              <SiteFooter locale={locale} />
            </CompareSelectionProvider>
          </div>
        </NavigationFeedbackProvider>
      </NextIntlClientProvider>
    </RootDocument>
  );
}
