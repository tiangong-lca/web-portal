import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import "./catalog-navigation.css";

export type NavigationEntry = {
  nodeId: string;
  label: string;
  code: string;
  description?: string;
  count: number;
  countLabel: string;
  countText?: string;
  hasChildren: boolean;
  href: string;
};
export type CatalogNavigationProps = {
  title: string;
  countDescription: string;
  entries: NavigationEntry[];
  breadcrumbs: { label: string; href: string }[];
  breadcrumbLabel: string;
  currentLabel?: string;
  all?: { href: string; label: string; active?: boolean };
  direct?: { href: string; label: string; active?: boolean };
  more?: { href: string; label: string };
  unavailableLabel: string;
  emptyLabel: string;
  unavailable?: boolean;
  compact?: boolean;
  visual?: ReactNode;
  actions?: ReactNode;
  zeroCountLabel?: string;
  headingLabel?: string;
  pathAsHeading?: boolean;
  children?: ReactNode;
};

/** One server-renderable level of the public catalog; every node remains a native link.
 * @import import { CatalogNavigation } from "@/features/catalog/catalog-navigation";
 */
export function CatalogNavigation({
  title,
  countDescription,
  entries,
  breadcrumbs,
  breadcrumbLabel,
  currentLabel,
  all,
  direct,
  more,
  unavailableLabel,
  emptyLabel,
  unavailable = false,
  compact = false,
  visual,
  actions,
  zeroCountLabel,
  headingLabel,
  pathAsHeading = false,
  children,
}: CatalogNavigationProps) {
  const zeroEntries = zeroCountLabel ? entries.filter((entry) => entry.count === 0) : [];
  const visibleEntries = zeroCountLabel ? entries.filter((entry) => entry.count > 0) : entries;
  const renderEntries = (items: NavigationEntry[]) => (
    <ul className="catalog-navigation-list">
      {items.map((entry) => (
        <li key={entry.nodeId}>
          <Link prefetch={false} href={entry.href}>
            <span className="catalog-navigation-name">
              {entry.label}
              {entry.code && entry.code !== entry.label && (
                <span className="text-muted-foreground text-xs">{entry.code}</span>
              )}
              {entry.description && (
                <span className="text-muted-foreground text-xs">{entry.description}</span>
              )}
            </span>
            <span className="catalog-navigation-count" title={entry.countLabel}>
              {entry.countText ?? String(entry.count)}
              <span className="sr-only"> {countDescription}</span>
            </span>
            {entry.hasChildren && <ChevronRightIcon aria-hidden="true" />}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <section
      className={compact ? "catalog-navigation catalog-navigation-compact" : "catalog-navigation"}
      aria-label={title}
    >
      <header className="catalog-navigation-header">
        <div className="catalog-navigation-context">
          {!pathAsHeading && (
            <h2 tabIndex={visual ? -1 : undefined} aria-label={headingLabel}>
              {title}
            </h2>
          )}
          {(breadcrumbs.length > 0 || pathAsHeading) && (
            <nav aria-label={breadcrumbLabel}>
              <ol className="catalog-navigation-breadcrumbs">
                {breadcrumbs.map((crumb) => (
                  <li key={crumb.href}>
                    <Link href={crumb.href} prefetch={false}>
                      {crumb.label}
                    </Link>
                    <ChevronRightIcon aria-hidden="true" />
                  </li>
                ))}
                {(currentLabel || pathAsHeading) && (
                  <li aria-current="location">
                    {pathAsHeading ? (
                      <h2 tabIndex={-1} aria-label={headingLabel}>
                        {currentLabel ?? title}
                      </h2>
                    ) : (
                      currentLabel
                    )}
                  </li>
                )}
              </ol>
            </nav>
          )}
          <p className="text-muted-foreground text-sm">{countDescription}</p>
        </div>
        {(all || direct || actions) && (
          <div className="catalog-navigation-actions">
            {all && (
              <Button asChild variant={all.active ? "secondary" : "outline"}>
                <Link
                  prefetch={false}
                  href={all.href}
                  aria-current={all.active ? "true" : undefined}
                >
                  {all.label}
                </Link>
              </Button>
            )}
            {direct && (
              <Button asChild variant={direct.active ? "secondary" : "ghost"}>
                <Link
                  prefetch={false}
                  href={direct.href}
                  aria-current={direct.active ? "true" : undefined}
                >
                  {direct.label}
                </Link>
              </Button>
            )}
            {actions}
          </div>
        )}
      </header>
      {visual}
      {unavailable ? (
        <Alert>
          <AlertDescription>{unavailableLabel}</AlertDescription>
        </Alert>
      ) : children ? (
        children
      ) : (
        <>
          {visibleEntries.length > 0 ? (
            renderEntries(visibleEntries)
          ) : zeroEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">{emptyLabel}</p>
          ) : null}
          {zeroEntries.length > 0 && (
            <details className="catalog-zero-regions">
              <summary>
                {zeroCountLabel} <span>({zeroEntries.length})</span>
              </summary>
              {renderEntries(zeroEntries)}
            </details>
          )}
        </>
      )}
      {more && (
        <Button asChild variant="outline">
          <Link href={more.href} prefetch={false}>
            {more.label}
          </Link>
        </Button>
      )}
    </section>
  );
}
