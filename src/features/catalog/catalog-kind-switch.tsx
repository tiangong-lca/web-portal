"use client";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { Button } from "@/components/ui/button";
/** @import import { CatalogKindSwitch } from "@/features/catalog/catalog-kind-switch"; */
export function CatalogKindSwitch({
  value,
  label,
  labels,
  hrefs,
  onChange,
  counts,
}: {
  counts?: { process: string; flow: string };
  value: string;
  label: string;
  labels: { process: string; flow: string; region?: string; source?: string };
  hrefs?: { process: string; flow: string; region?: string; source?: string };
  onChange?: (kind: "process" | "flow") => void;
}) {
  return (
    <fieldset aria-label={label} className="catalog-kind-switch flex flex-wrap gap-5">
      {(["process", "flow", "region", "source"] as const)
        .filter((kind) => labels[kind])
        .map((kind) =>
          hrefs ? (
            <Button asChild key={kind} variant="ghost">
              <Link
                prefetch={false}
                href={hrefs[kind]!}
                aria-current={value === kind ? "page" : undefined}
              >
                {labels[kind]}
                {counts && (kind === "process" || kind === "flow") ? ` (${counts[kind]})` : ""}
              </Link>
            </Button>
          ) : (
            <Button
              key={kind}
              variant="ghost"
              type="button"
              aria-pressed={value === kind}
              onClick={() => {
                if (kind === "process" || kind === "flow") onChange?.(kind);
              }}
            >
              {labels[kind]}
            </Button>
          ),
        )}
    </fieldset>
  );
}
