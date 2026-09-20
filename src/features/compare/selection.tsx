"use client";

import { CheckIcon, ChevronDownIcon, GitCompareArrowsIcon, XIcon } from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { PendingFeedback } from "@/components/shell/navigation-feedback";
import { Button } from "@/components/ui/button";
import { isExactDatasetRef } from "@/features/catalog/exact-ref";
import { localePath, type PortalLocale } from "@/i18n/routing";

export type CompareSelectionItem = { ref: string; name: string };
type SelectionContext = {
  members: CompareSelectionItem[];
  toggle: (item: CompareSelectionItem) => void;
  replace: (items: CompareSelectionItem[]) => void;
  open: () => void;
};
const CompareSelectionContext = createContext<SelectionContext | null>(null);

export function compareSelectionHref(locale: PortalLocale, items: CompareSelectionItem[]) {
  const query = new URLSearchParams({ v: "1", ids: items.map((item) => item.ref).join(",") });
  return `${localePath(locale, "compare")}?${query}`;
}

/** @import import { CompareSelectionProvider } from "@/features/compare/selection"; */
export function CompareSelectionProvider({
  children,
  locale,
  labels,
}: {
  children: ReactNode;
  locale: PortalLocale;
  labels: {
    count: string;
    clear: string;
    remove: string;
    continue: string;
    selectedItems: string;
    compare: string;
    hint: string;
    limit: string;
  };
}) {
  const [members, setMembers] = useState<CompareSelectionItem[]>([]);
  const [limited, setLimited] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const replace = useCallback((items: CompareSelectionItem[]) => {
    const valid = [
      ...new Map(
        items.filter((item) => isExactDatasetRef(item.ref)).map((item) => [item.ref, item]),
      ).values(),
    ];
    if (valid.length <= 4) {
      setMembers(valid);
      setLimited(false);
    }
  }, []);
  const toggle = useCallback(
    (item: CompareSelectionItem) => {
      if (!isExactDatasetRef(item.ref)) return;
      if (members.some((entry) => entry.ref === item.ref)) {
        setMembers(members.filter((entry) => entry.ref !== item.ref));
        setLimited(false);
      } else if (members.length < 4) {
        setMembers([...members, item]);
        setLimited(false);
      } else setLimited(true);
    },
    [members],
  );
  const open = useCallback(
    () => startTransition(() => router.push(compareSelectionHref(locale, members))),
    [router, locale, members],
  );
  const value = useMemo(
    () => ({ members, toggle, replace, open }),
    [members, toggle, replace, open],
  );

  return (
    <CompareSelectionContext.Provider value={value}>
      {children}
      <PendingFeedback pending={pending} />
      {members.length > 0 ? (
        <>
          <div aria-hidden="true" className="h-44 shrink-0" />
          <aside
            aria-label={labels.compare}
            className="bg-background fixed inset-x-0 bottom-0 z-30 border-t shadow-lg"
          >
            <div className="mx-auto flex max-h-[45vh] max-w-[1440px] flex-col gap-2 overflow-y-auto px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <output className="font-semibold">
                  {labels.count.replace("{count}", String(members.length))}
                </output>
                <div className="flex items-center gap-2">
                  <Button onClick={() => replace([])} type="button" variant="ghost">
                    {labels.clear}
                  </Button>
                  {members.length >= 2 ? (
                    <Button asChild>
                      <Link href={compareSelectionHref(locale, members)} prefetch={false}>
                        <GitCompareArrowsIcon data-icon="inline-start" />
                        {labels.compare}
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled title={labels.hint}>
                      {labels.compare}
                    </Button>
                  )}
                </div>
              </div>
              <details className="group/selection">
                <summary className="text-link focus-visible:outline-ring flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="size-4 transition-transform group-open/selection:rotate-180"
                  />
                  {labels.selectedItems}
                </summary>
                <ul className="flex flex-col gap-2">
                  {members.map((item) => (
                    <li className="flex items-start justify-between gap-3" key={item.ref}>
                      <Link
                        className="min-w-0 text-sm break-words"
                        href={localePath(locale, `process/${encodeURIComponent(item.ref)}`)}
                        prefetch={false}
                      >
                        {item.name}
                        <span className="text-muted-foreground block font-mono text-xs break-all">
                          {item.ref}
                        </span>
                      </Link>
                      <Button
                        aria-label={`${labels.remove}: ${item.name} ${item.ref}`}
                        className="size-11 shrink-0"
                        onClick={() => toggle(item)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon />
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href={localePath(locale, "search?kind=process")}>{labels.continue}</Link>
                  </Button>
                  <Button onClick={() => replace([])} type="button" variant="ghost">
                    {labels.clear}
                  </Button>
                </div>
              </details>
              {limited ? (
                <p className="text-destructive text-sm" role="alert">
                  {labels.limit}
                </p>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </CompareSelectionContext.Provider>
  );
}

/** @import import { CompareChoice } from "@/features/compare/selection"; */
export function CompareChoice({
  item,
  label,
  locale,
  checkbox = false,
}: {
  item: CompareSelectionItem;
  label: string;
  locale: PortalLocale;
  checkbox?: boolean;
}) {
  const selection = useContext(CompareSelectionContext);
  const checked = selection?.members.some((member) => member.ref === item.ref) ?? false;
  if (checkbox)
    return (
      <label className="flex min-h-11 w-fit items-center gap-2 text-sm font-medium">
        <input
          aria-label={`${label} ${item.name} ${item.ref}`}
          checked={selection ? checked : undefined}
          className="accent-primary size-5 shrink-0"
          name="ids"
          onChange={selection ? () => selection.toggle(item) : undefined}
          type="checkbox"
          value={item.ref}
        />
        {label}
      </label>
    );
  if (!selection)
    return (
      <Button asChild variant="outline">
        <Link href={compareSelectionHref(locale, [item])}>{label}</Link>
      </Button>
    );
  return (
    <>
      <Button
        aria-pressed={checked}
        className="aria-pressed:border-primary aria-pressed:bg-primary-subtle aria-pressed:text-link"
        onClick={() => selection.toggle(item)}
        type="button"
        variant="outline"
      >
        {checked ? (
          <CheckIcon aria-hidden="true" data-icon="inline-start" />
        ) : (
          <GitCompareArrowsIcon aria-hidden="true" data-icon="inline-start" />
        )}
        {label}
      </Button>
      <noscript>
        <Link href={compareSelectionHref(locale, [item])}>{label}</Link>
      </noscript>
    </>
  );
}

/** @import import { CompareSelectionSeed } from "@/features/compare/selection"; */
export function CompareSelectionSeed({ items }: { items: CompareSelectionItem[] }) {
  const replace = useContext(CompareSelectionContext)?.replace;
  const serialized = JSON.stringify(items);
  useEffect(() => {
    replace?.(JSON.parse(serialized) as CompareSelectionItem[]);
  }, [replace, serialized]);
  return null;
}

export function CompareSelectionForm({
  children,
  action,
}: {
  children: ReactNode;
  action: string;
}) {
  const selection = useContext(CompareSelectionContext);
  return (
    <form
      action={action}
      className="flex flex-col gap-4"
      method="get"
      onSubmit={(event) => {
        if (selection) {
          event.preventDefault();
          selection.open();
        }
      }}
    >
      {children}
    </form>
  );
}
