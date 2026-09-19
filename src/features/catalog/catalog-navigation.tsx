import Link from "next/link";
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
}: CatalogNavigationProps) {
  return (
    <section
      className={compact ? "catalog-navigation catalog-navigation-compact" : "catalog-navigation"}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <p className="text-muted-foreground text-sm">{countDescription}</p>
      </header>
      {breadcrumbs.length > 0 && (
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
            {currentLabel && <li aria-current="location">{currentLabel}</li>}
          </ol>
        </nav>
      )}
      {(all || direct) && (
        <div className="flex flex-wrap gap-2">
          {all && (
            <Button asChild variant={all.active ? "secondary" : "outline"}>
              <Link prefetch={false} href={all.href} aria-current={all.active ? "true" : undefined}>
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
        </div>
      )}
      {unavailable ? (
        <Alert>
          <AlertDescription>{unavailableLabel}</AlertDescription>
        </Alert>
      ) : entries.length > 0 ? (
        <ul className="catalog-navigation-list">
          {entries.map((entry) => (
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
      ) : (
        <p className="text-muted-foreground text-sm">{emptyLabel}</p>
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
