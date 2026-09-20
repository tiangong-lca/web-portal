import { HistoryIcon } from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { VersionViewModel } from "@/features/catalog/view-model";
import type { PortalLocale } from "@/i18n/routing";

import { DetailEmpty } from "./detail-empty";

/** @import import { VersionsPanel } from "@/features/catalog/versions-panel"; */
export function VersionsPanel({
  emptyDescription,
  emptyTitle,
  rows,
  currentRef,
  labels,
  locale,
}: {
  emptyDescription: string;
  emptyTitle: string;
  rows: VersionViewModel[];
  currentRef?: string;
  labels: { view: string; current: string };
  locale: PortalLocale;
}) {
  if (rows.length === 0) {
    return <DetailEmpty description={emptyDescription} icon={HistoryIcon} title={emptyTitle} />;
  }

  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.ref}>
          <Card size="sm">
            <CardHeader>
              <CardTitle>{row.version}</CardTitle>
              <CardDescription>
                {row.summary}
                {row.modifiedAt ? (
                  <time className="block" dateTime={row.modifiedAt}>
                    {new Intl.DateTimeFormat(locale, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(row.modifiedAt))}
                  </time>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground min-w-0 flex-1 font-mono text-xs break-all">
                {row.ref}
              </span>
              {row.ref === currentRef ? <Badge variant="secondary">{labels.current}</Badge> : null}
              <Button asChild className="h-auto min-h-11 whitespace-normal" variant="outline">
                <Link href={row.href}>{labels.view}</Link>
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}
