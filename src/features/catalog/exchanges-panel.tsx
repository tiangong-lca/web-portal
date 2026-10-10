import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { ArrowDownLeftIcon, ArrowUpRightIcon, ChevronDownIcon, NetworkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExchangeViewModel } from "@/features/catalog/view-model";
import { localizeDirection, localizeFlowType } from "@/i18n/domain-vocabulary";
import type { PortalLocale } from "@/i18n/routing";

import { DetailEmpty } from "./detail-empty";

type ExchangesPanelProps = {
  caption: string;
  emptyDescription: string;
  emptyTitle: string;
  labels: {
    amount: string;
    context: string;
    direction: string;
    flow: string;
    functionalUnit: string;
    kind: string;
    policy: string;
    process: string;
    quantitativeReference: string;
    yes: string;
    no: string;
  };
  rows: ExchangeViewModel[];
  locale: PortalLocale;
};

function ExchangeContext({
  row,
  labels,
}: {
  row: ExchangeViewModel;
  labels: ExchangesPanelProps["labels"];
}) {
  return (
    <details className="group/exchange min-w-0">
      <summary className="text-link focus-visible:outline-ring flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-open/exchange:rotate-180"
        />
        {labels.context}
      </summary>
      <dl className="mt-2 grid gap-3 border-l pl-3">
        {[
          [labels.flow, row.flowRef],
          [labels.process, row.processRef],
          [labels.functionalUnit, row.functionalUnit],
          [labels.policy, row.capabilityPolicyVersion],
        ].map(([label, value]) => (
          <div className="min-w-0" key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 font-mono text-xs [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function ExchangeDirection({ row, locale }: { row: ExchangeViewModel; locale: PortalLocale }) {
  const Icon = row.direction === "input" ? ArrowDownLeftIcon : ArrowUpRightIcon;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {localizeDirection(row.direction, locale)}
    </span>
  );
}

function ExchangeAmount({ row }: { row: ExchangeViewModel }) {
  return (
    <span className="inline-block max-w-full overflow-x-auto align-middle font-mono font-medium whitespace-nowrap tabular-nums">
      {row.amount} <span className="text-muted-foreground">{row.unit}</span>
    </span>
  );
}

/** @import import { ExchangesPanel } from "@/features/catalog/exchanges-panel"; */
export function ExchangesPanel({
  caption,
  emptyDescription,
  emptyTitle,
  labels,
  rows,
  locale,
}: ExchangesPanelProps) {
  if (rows.length === 0) {
    return <DetailEmpty description={emptyDescription} icon={NetworkIcon} title={emptyTitle} />;
  }

  return (
    <>
      <ul aria-label={caption} className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="[overflow-wrap:anywhere]">
                  {row.flowHref ? (
                    <Link href={row.flowHref} prefetch={false}>
                      {row.flowName}
                    </Link>
                  ) : (
                    row.flowName
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <ExchangeDirection row={row} locale={locale} />
                  <Badge variant="outline">{localizeFlowType(row.kind, locale)}</Badge>
                </div>
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{labels.amount}</dt>
                  <dd className="min-w-0 text-right">
                    <ExchangeAmount row={row} />
                  </dd>
                  <dt className="text-muted-foreground">{labels.quantitativeReference}</dt>
                  <dd className="text-right">
                    {row.isQuantitativeReference ? labels.yes : labels.no}
                  </dd>
                </dl>
                <div className="border-t">
                  <ExchangeContext row={row} labels={labels} />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableCaption>{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3" scope="col">
                {labels.flow}
              </TableHead>
              <TableHead scope="col">{labels.direction}</TableHead>
              <TableHead scope="col">{labels.kind}</TableHead>
              <TableHead className="text-right" scope="col">
                {labels.amount}
              </TableHead>
              <TableHead className="whitespace-normal" scope="col">
                {labels.quantitativeReference}
              </TableHead>
              <TableHead className="w-1/5 whitespace-normal" scope="col">
                {labels.context}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableHead
                  className="py-3 align-top [overflow-wrap:anywhere] whitespace-normal"
                  scope="row"
                >
                  {row.flowHref ? (
                    <Link href={row.flowHref} prefetch={false}>
                      {row.flowName}
                    </Link>
                  ) : (
                    row.flowName
                  )}
                </TableHead>
                <TableCell className="py-3">
                  <ExchangeDirection row={row} locale={locale} />
                </TableCell>
                <TableCell className="py-3">
                  <Badge variant="outline">{localizeFlowType(row.kind, locale)}</Badge>
                </TableCell>
                <TableCell className="py-3 text-right whitespace-nowrap">
                  <ExchangeAmount row={row} />
                </TableCell>
                <TableCell className="py-3">
                  {row.isQuantitativeReference ? labels.yes : labels.no}
                </TableCell>
                <TableCell className="pt-0">
                  <ExchangeContext row={row} labels={labels} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
