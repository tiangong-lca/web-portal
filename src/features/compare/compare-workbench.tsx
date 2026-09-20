import {
  ArrowLeftRightIcon,
  CircleHelpIcon,
  EqualIcon,
  GitCompareArrowsIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { localePath, type PortalLocale } from "@/i18n/routing";
import { formatGeographyCode } from "@/i18n/geography";
import { localizeGeographyPrecision } from "@/i18n/domain-vocabulary";

import {
  evaluateCompatibility,
  type CompareCandidate,
  type CompatibilityDimension,
  type CompatibilityStatus,
} from "./compatibility";

type CompareLabels = {
  attentionFields: string;
  dimension: string;
  emptyDescription: string;
  emptyTitle: string;
  matrix: string;
  member: (index: number) => string;
  metadataOnly: string;
  notProvided: string;
  numericContext: string;
  numericTitle: string;
  impactCategory: string;
  method: string;
  publication: string;
  package: string;
  evidence: string;
  unit: string;
  value: string;
  evidenceNotice: string;
  resultStatus: string;
  status: Record<CompatibilityStatus, string>;
};

export type ComparableLciaPresentation = {
  evidenceHash: string;
  impactName: string;
  methodRef: string;
  packageRef: string;
  publicationRef: string;
  publishedAt: string;
  unit: string;
};

const dimensionLabels: Record<CompatibilityDimension, Record<PortalLocale, string>> = {
  referenceProduct: {
    "zh-CN": "参考产品",
    en: "Reference product",
    de: "Referenzprodukt",
    fr: "Produit de référence",
  },
  allocationMethod: {
    "zh-CN": "分配方法",
    en: "Allocation method",
    de: "Allokationsmethode",
    fr: "Méthode d’allocation",
  },
  cutoffRule: {
    "zh-CN": "截止规则",
    en: "Cutoff rule",
    de: "Abschneideregel",
    fr: "Règle de coupure",
  },
  functionalUnit: {
    "zh-CN": "功能单位",
    en: "Functional unit",
    de: "Funktionelle Einheit",
    fr: "Unité fonctionnelle",
  },
  geography: { "zh-CN": "地区", en: "Geography", de: "Region", fr: "Région" },
  geographyPrecision: {
    "zh-CN": "地区精度",
    en: "Geographic precision",
    de: "Geografische Genauigkeit",
    fr: "Précision géographique",
  },
  lciaMethodRef: {
    "zh-CN": "LCIA 方法",
    en: "LCIA method",
    de: "LCIA-Methode",
    fr: "Méthode d’ÉICV",
  },
  modelingApproach: {
    "zh-CN": "建模方法",
    en: "Modeling approach",
    de: "Modellierungsansatz",
    fr: "Approche de modélisation",
  },
  publicationRef: {
    "zh-CN": "发布批次",
    en: "Publication",
    de: "Veröffentlichung",
    fr: "Publication",
  },
  referenceUnit: {
    "zh-CN": "参考流单位",
    en: "Reference-flow unit",
    de: "Einheit des Referenzflusses",
    fr: "Unité du flux de référence",
  },
  referenceYear: {
    "zh-CN": "参考年",
    en: "Reference year",
    de: "Referenzjahr",
    fr: "Année de référence",
  },
  technology: { "zh-CN": "技术描述", en: "Technology", de: "Technologie", fr: "Technologie" },
};

const statusPresentation = {
  direct: { icon: EqualIcon, className: "text-muted-foreground" },
  converted: {
    icon: ArrowLeftRightIcon,
    className: "border-warning/40 bg-warning-subtle text-warning",
  },
  reference_only: {
    icon: CircleHelpIcon,
    className: "border-warning/40 bg-warning-subtle text-warning",
  },
  insufficient: {
    icon: CircleHelpIcon,
    className: "border-warning/40 bg-warning-subtle text-warning",
  },
  incompatible: {
    icon: TriangleAlertIcon,
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
} as const;

function CompatibilityBadge({ status, label }: { status: CompatibilityStatus; label: string }) {
  const { icon: Icon, className } = statusPresentation[status];
  return (
    <Badge className={`h-auto gap-1.5 py-1 whitespace-normal ${className}`} variant="outline">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {label}
    </Badge>
  );
}

function dimensionValue(
  dimension: CompatibilityDimension,
  value: string | undefined,
  locale: PortalLocale,
  notProvided: string,
) {
  if (!value) return notProvided;
  if (dimension === "geography") return formatGeographyCode(value, locale) ?? notProvided;
  if (dimension === "geographyPrecision") return localizeGeographyPrecision(value, locale);
  return value;
}

function valueClass(dimension: CompatibilityDimension, value: string | undefined) {
  return `[overflow-wrap:anywhere] ${!value ? "text-warning" : ""} ${dimension === "lciaMethodRef" || dimension === "publicationRef" ? "font-mono text-xs" : "text-sm"}`;
}

/** @import import { CompareWorkbench } from "@/features/compare/compare-workbench"; */
export function CompareWorkbench({
  candidates,
  labels,
  locale,
  numericContext,
}: {
  candidates: CompareCandidate[];
  labels: CompareLabels;
  locale: PortalLocale;
  numericContext?: ComparableLciaPresentation;
}) {
  if (candidates.length < 2) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitCompareArrowsIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{labels.emptyTitle}</EmptyTitle>
          <EmptyDescription>{labels.emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const result = evaluateCompatibility(candidates);
  const attention = result.rows.filter((row) => row.status !== "direct");
  const rows = [...attention, ...result.rows.filter((row) => row.status === "direct")];
  const StatusIcon = statusPresentation[result.status].icon;

  return (
    <div className="flex flex-col gap-6">
      <Alert
        className={
          result.status === "incompatible"
            ? "border-destructive/40"
            : result.status !== "direct"
              ? "border-warning/40"
              : undefined
        }
      >
        <StatusIcon aria-hidden="true" />
        <AlertTitle>{labels.status[result.status]}</AlertTitle>
        <AlertDescription>
          <p>{labels.evidenceNotice}</p>
          {!result.canAlignLcia ? <p>{labels.metadataOnly}</p> : null}
        </AlertDescription>
      </Alert>
      {attention.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">
            {labels.attentionFields.replace("{count}", String(attention.length))}
          </h2>
          <p className="text-muted-foreground text-sm">
            {attention.map((row) => dimensionLabels[row.dimension][locale]).join(" · ")}
          </p>
        </div>
      ) : null}
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableCaption>{labels.matrix}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32 whitespace-normal lg:w-40" scope="col">
                {labels.dimension}
              </TableHead>
              {candidates.map((candidate, index) => (
                <TableHead className="py-3 align-top" key={candidate.ref} scope="col">
                  <Link
                    className="block [overflow-wrap:anywhere] whitespace-normal"
                    href={localePath(locale, `process/${encodeURIComponent(candidate.ref)}`)}
                  >
                    {candidate.name || labels.member(index + 1)}
                  </Link>
                  <span className="text-muted-foreground mt-1 block font-mono text-xs">
                    {candidate.ref.split("@")[1]}
                  </span>
                </TableHead>
              ))}
              <TableHead className="w-36 whitespace-normal lg:w-48" scope="col">
                {labels.resultStatus}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                className={row.status !== "direct" ? "bg-muted/40" : undefined}
                key={row.dimension}
              >
                <TableHead className="py-3 align-top whitespace-normal" scope="row">
                  {dimensionLabels[row.dimension][locale]}
                </TableHead>
                {row.values.map((value, index) => (
                  <TableCell
                    className={`py-3 ${valueClass(row.dimension, value)}`}
                    key={candidates[index]?.ref}
                  >
                    {dimensionValue(row.dimension, value, locale, labels.notProvided)}
                  </TableCell>
                ))}
                <TableCell className="py-3">
                  <CompatibilityBadge status={row.status} label={labels.status[row.status]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-4 md:hidden">
        <ol aria-label={labels.matrix} className="grid gap-3 border-y py-4">
          {candidates.map((candidate, index) => (
            <li className="flex items-start gap-3" key={candidate.ref}>
              <span
                className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-xs"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <Link
                className="min-w-0 text-sm [overflow-wrap:anywhere]"
                href={localePath(locale, `process/${encodeURIComponent(candidate.ref)}`)}
              >
                <span className="sr-only">{labels.member(index + 1)}: </span>
                {candidate.name || labels.member(index + 1)}
                <span className="text-muted-foreground mt-0.5 block font-mono text-xs">
                  {candidate.ref.split("@")[1]}
                </span>
              </Link>
            </li>
          ))}
        </ol>
        {rows.map((row) => (
          <section className="border-b pb-4" key={row.dimension}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{dimensionLabels[row.dimension][locale]}</h3>
              <CompatibilityBadge status={row.status} label={labels.status[row.status]} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              {row.values.map((value, index) => (
                <div className="min-w-0" key={candidates[index]?.ref}>
                  <dt className="text-muted-foreground mb-1 text-xs">{labels.member(index + 1)}</dt>
                  <dd className={valueClass(row.dimension, value)}>
                    {dimensionValue(row.dimension, value, locale, labels.notProvided)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      {result.canAlignLcia && numericContext ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{labels.numericTitle}</h2>
            </CardTitle>
            <CardDescription>{labels.numericContext}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                [labels.impactCategory, numericContext.impactName],
                [labels.method, numericContext.methodRef],
                [
                  labels.publication,
                  `${numericContext.publicationRef} · ${numericContext.publishedAt}`,
                ],
                [labels.package, numericContext.packageRef],
                [labels.evidence, numericContext.evidenceHash],
              ].map(([label, value]) => (
                <div className="flex flex-col gap-1" key={label}>
                  <dt className="text-muted-foreground text-xs uppercase">{label}</dt>
                  <dd className="font-mono text-xs break-all">{value}</dd>
                </div>
              ))}
            </dl>
            <Table>
              <TableCaption>{labels.numericTitle}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.dimension}</TableHead>
                  <TableHead className="text-right" scope="col">
                    {labels.value}
                  </TableHead>
                  <TableHead scope="col">{labels.unit}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((candidate) => (
                  <TableRow key={candidate.ref}>
                    <TableHead scope="row">{candidate.name}</TableHead>
                    <TableCell className="text-right font-mono font-semibold whitespace-nowrap">
                      {candidate.lciaValue?.value}
                    </TableCell>
                    <TableCell>{candidate.lciaValue?.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
