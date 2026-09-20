import type { ReactNode, Ref } from "react";
import "./search-workspace.css";

/** @import import { CatalogResultsToolbar } from "@/features/catalog/catalog-results-toolbar"; */
export function CatalogResultsToolbar({
  title,
  titleId,
  scope,
  actions,
  headingRef,
  hideTitle = false,
}: {
  title: ReactNode;
  titleId: string;
  scope?: ReactNode;
  actions: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  hideTitle?: boolean;
}) {
  return (
    <div className="catalog-results-toolbar">
      <div className="catalog-results-toolbar-summary">
        {title && (
          <h2
            className={hideTitle ? "sr-only" : undefined}
            id={titleId}
            ref={headingRef}
            tabIndex={headingRef ? -1 : undefined}
          >
            {title}
          </h2>
        )}
        {scope}
      </div>
      <div className="catalog-results-toolbar-actions">{actions}</div>
    </div>
  );
}
