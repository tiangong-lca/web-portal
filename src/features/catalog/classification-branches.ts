import {
  classificationBranchKey,
  classificationContextKey,
  classificationPageMatches,
  classificationPageSchema,
  mergeClassificationNodes,
  type ClassificationContext,
  type ClassificationPage,
  type ClassificationRequest,
  type ClassificationSeed,
} from "@/lib/classification-navigation";

const cacheMilliseconds = 30000;
const maximumCachedPages = 64;
export type ClassificationBranch = {
  page: ClassificationPage | null;
  loadedAt: number;
  loading: boolean;
  loadingMore: boolean;
  failed: boolean;
};
export type ClassificationSnapshot = {
  contextKey: string;
  branches: ReadonlyMap<string, ClassificationBranch>;
};
type ReadPage = (input: ClassificationRequest, signal: AbortSignal) => Promise<ClassificationPage>;

export async function fetchClassificationPage(input: ClassificationRequest, signal: AbortSignal) {
  const response = await fetch("/internal/navigation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Classification unavailable");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 64 * 1024)
    throw new Error("Classification response too large");
  const page = classificationPageSchema.parse(JSON.parse(text));
  if (!classificationPageMatches(page, input))
    throw new Error("Classification response does not match the branch");
  return page;
}

/** One mounted navigation owns its cache. Queries never enter browser storage or a global SSR store. */
export class ClassificationBranches {
  private context: ClassificationContext;
  private snapshot: ClassificationSnapshot;
  private readonly serverSnapshot: ClassificationSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly pages = new Map<string, { page: ClassificationPage; time: number }>();
  private readonly pending = new Map<
    string,
    { controller: AbortController; promise: Promise<void>; timer: ReturnType<typeof setTimeout> }
  >();
  private generation = 0;
  private readonly read: ReadPage;

  constructor(
    context: ClassificationContext,
    seeds: ClassificationSeed[],
    read: ReadPage = fetchClassificationPage,
  ) {
    this.read = read;
    this.context = context;
    this.snapshot = { contextKey: classificationContextKey(context), branches: new Map() };
    this.activate(context, seeds);
    this.serverSnapshot = this.snapshot;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => this.serverSnapshot;

  private publish(branches: ReadonlyMap<string, ClassificationBranch>) {
    this.snapshot = { contextKey: classificationContextKey(this.context), branches };
    this.listeners.forEach((listener) => listener());
  }
  activate(context: ClassificationContext, seeds: ClassificationSeed[]) {
    const changed = classificationContextKey(context) !== this.snapshot.contextKey;
    if (changed) this.cancel();
    this.context = context;
    const branches = new Map(changed ? [] : this.snapshot.branches);
    for (const seed of seeds) {
      const key = classificationBranchKey(seed.parentNodeId);
      if (seed.page) {
        this.pages.set(
          JSON.stringify([classificationContextKey(context), key, seed.cursor ?? null]),
          {
            page: seed.page,
            time: Date.now(),
          },
        );
        if (this.pages.size > maximumCachedPages)
          this.pages.delete(this.pages.keys().next().value!);
      }
      branches.set(key, {
        page: seed.page,
        loadedAt: Date.now(),
        loading: false,
        loadingMore: false,
        failed: seed.page === null,
      });
    }
    this.publish(branches);
  }
  cancel() {
    this.generation++;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.controller.abort();
    }
    this.pending.clear();
  }
  private setBranch(key: string, branch: ClassificationBranch) {
    const branches = new Map(this.snapshot.branches);
    branches.set(key, branch);
    this.publish(branches);
  }
  async load(parentNodeId: string | null, options: { more?: boolean; retry?: boolean } = {}) {
    const key = classificationBranchKey(parentNodeId);
    const previous = this.snapshot.branches.get(key);
    if (previous?.loading) return this.pending.get(key)?.promise;
    if (
      !options.more &&
      !options.retry &&
      previous?.page &&
      Date.now() - previous.loadedAt < cacheMilliseconds
    )
      return;
    const cursor = options.more ? previous?.page?.nextCursor : null;
    if (options.more && !cursor) return;
    const input = { ...this.context, parentNodeId, cursor: cursor ?? null };
    const requestKey = JSON.stringify([this.snapshot.contextKey, key, cursor ?? null]);
    const generation = this.generation;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 12000);
    this.setBranch(key, {
      page: options.more ? (previous?.page ?? null) : null,
      loadedAt: previous?.loadedAt ?? 0,
      loading: true,
      loadingMore: !!options.more,
      failed: false,
    });
    const cached = this.pages.get(requestKey);
    const read =
      cached && Date.now() - cached.time < cacheMilliseconds && !options.retry
        ? Promise.resolve(cached.page)
        : this.read(input, controller.signal);
    const promise = read
      .then((page) => {
        if (generation !== this.generation || controller.signal.aborted) return;
        if (!classificationPageMatches(page, input) || (cursor && cursor === page.nextCursor))
          throw new Error("Classification page mismatch");
        this.pages.delete(requestKey);
        this.pages.set(requestKey, { page, time: Date.now() });
        if (this.pages.size > maximumCachedPages)
          this.pages.delete(this.pages.keys().next().value!);
        const merged =
          options.more && previous?.page
            ? { ...page, nodes: mergeClassificationNodes(previous.page.nodes, page.nodes) }
            : page;
        this.setBranch(key, {
          page: merged,
          loadedAt: Date.now(),
          loading: false,
          loadingMore: false,
          failed: false,
        });
      })
      .catch(() => {
        if (generation === this.generation && (!controller.signal.aborted || timedOut))
          this.setBranch(key, {
            page: options.more ? (previous?.page ?? null) : null,
            loadedAt: previous?.loadedAt ?? 0,
            loading: false,
            loadingMore: false,
            failed: true,
          });
      })
      .finally(() => {
        clearTimeout(timer);
        if (generation === this.generation) this.pending.delete(key);
      });
    this.pending.set(key, { controller, promise, timer });
    return promise;
  }
}
