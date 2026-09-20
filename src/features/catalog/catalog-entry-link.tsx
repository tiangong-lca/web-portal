"use client";
import { FeedbackLink } from "@/components/shell/feedback-link";
import type { ComponentProps } from "react";
/** @import import { CatalogEntryLink } from "@/features/catalog/catalog-entry-link"; */
export function CatalogEntryLink(
  props: Omit<ComponentProps<typeof FeedbackLink>, "href"> & { href: string },
) {
  return <FeedbackLink {...props} scroll={false} />;
}
