"use client";

import { useEffect, useState } from "react";
import { PendingFeedback } from "./navigation-feedback";
import { LanguagesIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isPortalLocale, localeNames, locales, type PortalLocale } from "@/i18n/routing";

type LocaleSwitcherProps = {
  currentLocale: PortalLocale;
  label: string;
};

export function LocaleSwitcher({ currentLocale, label }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const restored = () => setPending(false);
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  function switchLocale(nextLocale: string) {
    if (!isPortalLocale(nextLocale) || nextLocale === currentLocale) return;
    setPending(true);
    const segments = pathname.split("/");
    segments[1] = nextLocale;
    window.location.assign(`${segments.join("/")}${window.location.search}${window.location.hash}`);
  }

  return (
    <div className="flex items-center gap-2">
      <PendingFeedback pending={pending} />
      <LanguagesIcon aria-hidden="true" className="hidden sm:block" />
      <Select onValueChange={switchLocale} value={currentLocale}>
        <SelectTrigger
          aria-label={label}
          className="portal-pending-control min-h-11 w-16 sm:min-w-28"
          aria-busy={pending}
          data-pending={pending || undefined}
        >
          <SelectValue>
            <span aria-hidden="true" className="sm:hidden">
              {currentLocale === "zh-CN" ? "中" : currentLocale.toUpperCase()}
            </span>
            <span className="sr-only sm:not-sr-only">{localeNames[currentLocale]}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent aria-label={label} position="popper">
          <SelectGroup>
            {locales.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {localeNames[locale]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <noscript>
        <span className="flex flex-wrap gap-2">
          {locales
            .filter((locale) => locale !== currentLocale)
            .map((locale) => (
              <a href={`/${locale}`} hrefLang={locale} key={locale}>
                {localeNames[locale]}
              </a>
            ))}
        </span>
      </noscript>
    </div>
  );
}
