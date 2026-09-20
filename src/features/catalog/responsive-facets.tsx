"use client";

import { FilterIcon } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PendingFeedback } from "@/components/shell/navigation-feedback";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** @import import { ResponsiveFacets } from "@/features/catalog/responsive-facets"; */
export function ResponsiveFacets({
  children,
  labels,
  drawer = false,
}: {
  drawer?: boolean;
  children: ReactNode;
  labels: { title: string; description: string; close: string };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <>
      <PendingFeedback pending={pending} />
      <div className={drawer ? "portal-facets-trigger" : "portal-facets-trigger xl:hidden"}>
        <Sheet onOpenChange={setOpen} open={open}>
          <SheetTrigger asChild>
            <Button
              className="portal-pending-control min-h-11"
              data-pending={pending || undefined}
              aria-busy={pending}
              variant="outline"
            >
              <FilterIcon data-icon="inline-start" />
              {labels.title}
            </Button>
          </SheetTrigger>
          <SheetContent closeLabel={labels.close} side="left">
            <SheetHeader>
              <SheetTitle>{labels.title}</SheetTitle>
              <SheetDescription>{labels.description}</SheetDescription>
            </SheetHeader>
            {/* Delegation observes native anchor clicks, including keyboard activation; the container is not itself interactive. */}
            {/* oxlint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
              className="overflow-y-auto px-4 pb-6 [&_[data-facet-intro]]:hidden"
              onClickCapture={(event) => {
                if (
                  event.defaultPrevented ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                const target = event.target;
                if (!(target instanceof Element)) return;
                const anchor = target.closest("a[href]");
                const href = anchor?.getAttribute("href");
                if (!href || anchor?.hasAttribute("target") || anchor?.hasAttribute("download"))
                  return;
                const url = new URL(href, window.location.href);
                if (url.origin !== window.location.origin) return;
                event.preventDefault();
                setOpen(false);
                startTransition(() => router.push(`${url.pathname}${url.search}${url.hash}`));
              }}
            >
              {children}
            </div>
            {/* oxlint-enable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          </SheetContent>
        </Sheet>
      </div>
      {!drawer && (
        <aside aria-label={labels.title} className="portal-facets-content hidden xl:block">
          {children}
        </aside>
      )}
      <noscript>
        <style>{".portal-facets-content{display:block}.portal-facets-trigger{display:none}"}</style>
      </noscript>
    </>
  );
}
