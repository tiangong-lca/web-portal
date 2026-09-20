"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { ChevronRightIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import type { PortalLocale } from "@/i18n/routing";
import type { BrowseSearchInput } from "@/server/contracts/navigation";
import {
  classificationBranchKey,
  classificationContext,
  classificationContextKey,
  mergeClassificationNodes,
  type ClassificationNode,
  type ClassificationSeed,
} from "@/lib/classification-navigation";
import { ClassificationBranches, type ClassificationSnapshot } from "./classification-branches";
import { CatalogNavigation, type CatalogNavigationProps } from "./catalog-navigation";
import { navigationHref } from "./navigation-links";
import "./classification-navigation.css";

type Kind = "process" | "flow";
type Header = Omit<CatalogNavigationProps, "entries" | "more" | "children" | "visual">;
type TreeContext = {
  locale: PortalLocale;
  input: BrowseSearchInput;
  store: ClassificationBranches;
  snapshot: ClassificationSnapshot;
  open: ReadonlySet<string>;
  required: ClassificationNode[];
  toggle: (id: string, open: boolean) => void;
};

const ClassificationState = createContext<TreeContext | null>(null);

function unmodified(event: MouseEvent<HTMLAnchorElement>) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function Branch({
  parentNodeId,
  context,
  ancestors = [],
}: {
  parentNodeId: string | null;
  context: TreeContext;
  ancestors?: string[];
}) {
  const t = useTranslations("Navigation");
  const branch = context.snapshot.branches.get(classificationBranchKey(parentNodeId));
  const required = context.required.filter((node) => node.parentNodeId === parentNodeId);
  const nodes = mergeClassificationNodes(branch?.page?.nodes ?? [], required);
  return (
    <div className="classification-branch" aria-busy={branch?.loading || undefined}>
      {(!branch || branch.loading) && (
        <output className="classification-status">{t("loadingCategories")}</output>
      )}
      {nodes.length > 0 && (
        <ul>
          {nodes.map((node) =>
            ancestors.includes(node.nodeId) ? null : (
              <ClassificationRow
                key={node.nodeId}
                node={node}
                context={context}
                ancestors={ancestors}
              />
            ),
          )}
        </ul>
      )}
      {branch?.failed && (
        <Alert className="classification-error">
          <AlertDescription>{t("classificationUnavailable")}</AlertDescription>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void context.store.load(parentNodeId, { retry: true });
            }}
          >
            {t("retryCategories")}
          </Button>
        </Alert>
      )}
      {branch?.page && !nodes.length && !branch.loading && !branch.failed && (
        <p className="classification-status">{t("empty")}</p>
      )}
      {branch?.page?.nextCursor && (
        <Button asChild variant="ghost" size="sm">
          <Link
            prefetch={false}
            href={navigationHref(context.locale, context.input, "classification", parentNodeId, {
              cursor: branch.page.nextCursor,
              code: branch.page.parent?.code,
            })}
            className="classification-more"
            aria-disabled={branch.loading || undefined}
            onClickCapture={(event) => {
              if (!unmodified(event)) return;
              event.preventDefault();
              if (!branch.loading) void context.store.load(parentNodeId, { more: true });
            }}
          >
            {t("moreCategories")}
          </Link>
        </Button>
      )}
    </div>
  );
}

function ClassificationRow({
  node,
  context,
  ancestors,
}: {
  node: ClassificationNode;
  context: TreeContext;
  ancestors: string[];
}) {
  const t = useTranslations("Navigation");
  const open = context.open.has(node.nodeId);
  const expandable = node.hasChildren && ancestors.length < 32;
  useEffect(() => {
    if (open && expandable) void context.store.load(node.nodeId);
  }, [context.store, open, expandable, node.nodeId, context.snapshot.contextKey]);
  const direct = context.input.filters.classificationScope === "direct";
  const count = direct ? node.directCount : node.count;
  const selected = context.input.filters.classificationNodeId === node.nodeId;
  const row = (
    <div className="classification-row">
      {expandable ? (
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="classification-toggle"
            aria-label={t(open ? "collapseCategory" : "expandCategory", { name: node.label })}
          >
            <ChevronRightIcon aria-hidden="true" data-icon="inline-start" />
          </Button>
        </CollapsibleTrigger>
      ) : (
        <span className="classification-toggle-placeholder" aria-hidden="true" />
      )}
      <Link
        prefetch={false}
        className="classification-link"
        aria-current={selected ? "page" : undefined}
        href={navigationHref(context.locale, context.input, "classification", node.nodeId, {
          results: true,
          scope: direct ? "direct" : "subtree",
          code: node.code,
        })}
      >
        <span className="classification-node-text">
          <span>{node.label}</span>
          {node.code !== node.label && node.code !== "ALL" && node.code !== "~" && (
            <small>{node.code}</small>
          )}
        </span>
        <span className="classification-count" title={t("versions", { count })}>
          {count.toLocaleString(context.locale)}
          <span className="sr-only"> {t("counts")}</span>
        </span>
      </Link>
    </div>
  );
  return expandable ? (
    <Collapsible asChild open={open} onOpenChange={(value) => context.toggle(node.nodeId, value)}>
      <li data-node-id={node.nodeId}>
        {row}
        <CollapsibleContent className="classification-children">
          <Branch
            parentNodeId={node.nodeId}
            context={context}
            ancestors={[...ancestors, node.nodeId]}
          />
        </CollapsibleContent>
      </li>
    </Collapsible>
  ) : (
    <li data-node-id={node.nodeId}>{row}</li>
  );
}

/** Keeps expansion and the branch cache across the search mode boundary and kind changes.
 * @import import { ClassificationNavigationProvider } from "@/features/catalog/classification-navigation";
 */
export function ClassificationNavigationProvider({
  locale,
  input,
  seeds,
  selectedPath,
  children,
}: {
  locale: PortalLocale;
  input: BrowseSearchInput;
  children: ReactNode;
  seeds: ClassificationSeed[];
  selectedPath: string[];
}) {
  const context = useMemo(() => classificationContext(locale, input), [locale, input]);
  const contextKey = classificationContextKey(context);
  const [store] = useState(() => new ClassificationBranches(context, seeds));
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [expanded, setExpanded] = useState<Record<Kind, Set<string>>>(() => ({
    process: new Set(),
    flow: new Set(),
    [input.kind]: new Set(selectedPath),
  }));
  const [pathState, setPathState] = useState({
    kind: input.kind,
    path: JSON.stringify(selectedPath),
  });
  const nextPath = JSON.stringify(selectedPath);
  // A changed URL reopens its path. Explicit disclosure changes remain independent of that URL.
  if (pathState.kind !== input.kind || pathState.path !== nextPath) {
    setPathState({ kind: input.kind, path: nextPath });
    setExpanded((previous) => ({
      ...previous,
      [input.kind]: new Set([...previous[input.kind], ...selectedPath]),
    }));
  }
  useLayoutEffect(() => {
    store.activate(context, seeds);
  }, [store, context, seeds]);
  useEffect(() => () => store.cancel(), [store]);
  const toggle = useCallback(
    (id: string, open: boolean) => {
      setExpanded((previous) => {
        const next = new Set(previous[input.kind]);
        if (open) next.add(id);
        else next.delete(id);
        return { ...previous, [input.kind]: next };
      });
    },
    [input.kind],
  );
  const required = useMemo(
    () => seeds.flatMap((seed) => (seed.page?.parent ? [seed.page.parent] : [])),
    [seeds],
  );
  // Never display a previous filter/type/locale snapshot while the store adopts incoming RSC props.
  const visibleSnapshot =
    snapshot.contextKey === contextKey
      ? snapshot
      : {
          contextKey,
          branches: new Map(
            seeds.map((seed) => [
              classificationBranchKey(seed.parentNodeId),
              {
                page: seed.page,
                loadedAt: 0,
                loading: false,
                loadingMore: false,
                failed: seed.page === null,
              },
            ]),
          ),
        };
  return (
    <ClassificationState.Provider
      value={{
        locale,
        input,
        store,
        snapshot: visibleSnapshot,
        open: expanded[input.kind],
        required,
        toggle,
      }}
    >
      {children}
    </ClassificationState.Provider>
  );
}

/** Links select a classification; sibling disclosure buttons only load its children.
 * @import import { ClassificationNavigation } from "@/features/catalog/classification-navigation";
 */
export function ClassificationNavigation({ navigation }: { navigation: Header }) {
  const context = useContext(ClassificationState);
  if (!context) throw new Error("ClassificationNavigation requires its provider");
  return (
    <CatalogNavigation {...navigation} entries={[]} unavailable={false}>
      <nav
        className="classification-navigation"
        aria-label={navigation.title}
        data-classification-kind={context.input.kind}
      >
        <Branch parentNodeId={null} context={context} />
      </nav>
      <noscript>
        <style>
          {
            ".classification-toggle,.classification-toggle-placeholder{display:none}.classification-row{grid-template-columns:minmax(0,1fr)}.classification-link{grid-column:1}"
          }
        </style>
      </noscript>
    </CatalogNavigation>
  );
}
