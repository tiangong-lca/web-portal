"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./scroll-cinematic-hero.module.css";

const CHAPTER_THRESHOLDS = [0, 0.22, 0.55, 0.72] as const;

type PortalNetworkInformation = {
  effectiveType?: string;
  saveData?: boolean;
};

export type ScrollCinematicHeroProps = {
  eyebrow: string;
  titleLead: string;
  titleFocus: string;
  titleSeparator?: string;
  description: string;
  chapterTwoLabel: string;
  chapterTwoTitle: string;
  chapterTwoDescription: string;
  chapterThreeLabel: string;
  chapterThreeTitle: string;
  chapterThreeDescription: string;
  reducedMotion?: boolean;
  holdLoading?: boolean;
  frameCount?: number;
  frameBasePath?: string;
  frameExtension?: "jpg" | "webp";
};

/**
 * A cinematic hero that maps document scroll progress onto a decoded image sequence.
 * @import import { ScrollCinematicHero } from "@/components/brand/scroll-cinematic-hero";
 */
export function ScrollCinematicHero({
  eyebrow,
  titleLead,
  titleFocus,
  titleSeparator = " ",
  description,
  chapterTwoLabel,
  chapterTwoTitle,
  chapterTwoDescription,
  chapterThreeLabel,
  chapterThreeTitle,
  chapterThreeDescription,
  reducedMotion = false,
  holdLoading = false,
  frameCount = 226,
  frameBasePath = "/brand/cinematic-v4",
  frameExtension = "webp",
}: ScrollCinematicHeroProps) {
  const rootRef = useRef<HTMLElement>(null);
  const primaryImageRef = useRef<HTMLImageElement>(null);
  const secondaryImageRef = useRef<HTMLImageElement>(null);
  const primaryAmbientRef = useRef<HTMLImageElement>(null);
  const secondaryAmbientRef = useRef<HTMLImageElement>(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);

  useEffect(() => {
    const image = primaryImageRef.current;
    if (!image || holdLoading) return;

    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;

    const reveal = () => {
      void image
        .decode()
        .catch(() => undefined)
        .then(() => {
          if (cancelled) return;
          firstFrame = window.requestAnimationFrame(() => {
            secondFrame = window.requestAnimationFrame(() => {
              if (!cancelled) setMediaReady(true);
            });
          });
        });
    };

    setMediaReady(false);
    if (image.complete && image.naturalWidth > 0) reveal();
    else image.addEventListener("load", reveal, { once: true });

    return () => {
      cancelled = true;
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      image.removeEventListener("load", reveal);
    };
  }, [frameBasePath, frameExtension, holdLoading]);

  useEffect(() => {
    const root = rootRef.current;
    const primaryImage = primaryImageRef.current;
    const secondaryImage = secondaryImageRef.current;
    const primaryAmbient = primaryAmbientRef.current;
    const secondaryAmbient = secondaryAmbientRef.current;
    const sticky = root?.querySelector<HTMLElement>(".brand-cinematic-sticky");
    if (
      !root ||
      !sticky ||
      !primaryImage ||
      !secondaryImage ||
      !primaryAmbient ||
      !secondaryAmbient
    )
      return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const foregroundImages = [primaryImage, secondaryImage] as const;
    const ambientImages = [primaryAmbient, secondaryAmbient] as const;
    const connection = (navigator as Navigator & { connection?: PortalNetworkInformation })
      .connection;
    const compactViewport = window.matchMedia("(max-width: 760px)").matches;
    const constrainedNetwork =
      connection?.saveData === true || /^(?:slow-2g|2g|3g)$/.test(connection?.effectiveType ?? "");
    const cacheLimit = compactViewport
      ? constrainedNetwork
        ? 8
        : 12
      : constrainedNetwork
        ? 16
        : 20;
    const startupWarmCount = compactViewport
      ? constrainedNetwork
        ? 4
        : 6
      : constrainedNetwork
        ? 6
        : 8;
    const activeLookahead = compactViewport
      ? constrainedNetwork
        ? 4
        : 6
      : constrainedNetwork
        ? 6
        : 8;
    const settledLookahead = compactViewport
      ? constrainedNetwork
        ? 6
        : 10
      : constrainedNetwork
        ? 10
        : 16;
    const prefetchConcurrency = compactViewport || constrainedNetwork ? 1 : 2;
    const frameCache = new Map<number, HTMLImageElement>();
    const inFlightFrames = new Map<number, Promise<HTMLImageElement | null>>();
    const prefetchQueue: number[] = [];
    const queuedFrames = new Set<number>();
    let activeForeground: 0 | 1 = 0;
    let activeAmbient: 0 | 1 = 0;
    let displayedFrame = 1;
    let requestedFrame = 1;
    let desiredFrame = 1;
    let lastDesiredFrame = 1;
    let scrollDirection: 1 | -1 = 1;
    let requestVersion = 0;
    let ambientRequestVersion = 0;
    let frame = 0;
    let settleTimer = 0;
    let activePrefetches = 0;
    let initialUpdate = true;
    let scrollUpdatePending = false;
    let disposed = false;

    const frameSource = (imageNumber: number) =>
      `${frameBasePath}/frame-${String(imageNumber).padStart(3, "0")}.${frameExtension}`;

    const touchCachedFrame = (imageNumber: number) => {
      const cached = frameCache.get(imageNumber);
      if (!cached) return undefined;
      frameCache.delete(imageNumber);
      frameCache.set(imageNumber, cached);
      return cached;
    };

    const trimCache = () => {
      while (frameCache.size > cacheLimit) {
        let removable: [number, HTMLImageElement] | undefined;
        for (const entry of frameCache) {
          if (entry[0] !== desiredFrame && entry[0] !== displayedFrame) {
            removable = entry;
            break;
          }
        }
        if (!removable) break;
        const [imageNumber, image] = removable;
        frameCache.delete(imageNumber);
        image.onload = null;
        image.onerror = null;
        image.removeAttribute("src");
      }
    };

    const waitForDecodedImage = (
      image: HTMLImageElement,
      source: string,
      priority: "high" | "low",
    ) =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (loaded: boolean) => {
          if (settled) return;
          settled = true;
          if (image.onload === loadHandler) image.onload = null;
          if (image.onerror === errorHandler) image.onerror = null;
          resolve(loaded);
        };
        const loadHandler = () => {
          void image
            .decode()
            .then(() => finish(true))
            .catch(() => finish(image.complete && image.naturalWidth > 0));
        };
        const errorHandler = () => finish(false);

        image.decoding = "async";
        image.fetchPriority = priority;
        image.onload = loadHandler;
        image.onerror = errorHandler;
        image.src = source;
        if (image.complete && image.naturalWidth > 0) loadHandler();
      });

    const warmFrame = (imageNumber: number) => {
      const cached = touchCachedFrame(imageNumber);
      if (cached) return Promise.resolve(cached);

      const existing = inFlightFrames.get(imageNumber);
      if (existing) return existing;

      const preload = new Image();
      const pending = waitForDecodedImage(preload, frameSource(imageNumber), "low")
        .then((loaded) => {
          if (!loaded || disposed) return null;
          frameCache.set(imageNumber, preload);
          trimCache();
          return preload;
        })
        .catch(() => null);
      inFlightFrames.set(imageNumber, pending);
      void pending.then(() => {
        if (inFlightFrames.get(imageNumber) === pending) inFlightFrames.delete(imageNumber);
      });
      return pending;
    };

    const pumpPrefetch = () => {
      if (disposed || reducedMotion || motionQuery.matches) return;
      while (activePrefetches < prefetchConcurrency && prefetchQueue.length > 0) {
        const imageNumber = prefetchQueue.shift();
        if (imageNumber === undefined) break;
        queuedFrames.delete(imageNumber);
        if (
          imageNumber === desiredFrame ||
          frameCache.has(imageNumber) ||
          inFlightFrames.has(imageNumber)
        )
          continue;

        activePrefetches += 1;
        void warmFrame(imageNumber).then(
          () => {
            activePrefetches -= 1;
            pumpPrefetch();
          },
          () => {
            activePrefetches -= 1;
            pumpPrefetch();
          },
        );
      }
    };

    const clearQueuedPrefetch = () => {
      prefetchQueue.length = 0;
      queuedFrames.clear();
    };

    const queueDirectionalFrames = (center: number, direction: 1 | -1, count: number) => {
      if (reducedMotion || motionQuery.matches) return;
      for (let offset = 1; offset <= count; offset += 1) {
        const imageNumber = center + direction * offset;
        if (
          imageNumber < 1 ||
          imageNumber > frameCount ||
          imageNumber === desiredFrame ||
          frameCache.has(imageNumber) ||
          inFlightFrames.has(imageNumber) ||
          queuedFrames.has(imageNumber)
        )
          continue;
        queuedFrames.add(imageNumber);
        prefetchQueue.push(imageNumber);
      }
      pumpPrefetch();
    };

    const scheduleSettledPrefetch = () => {
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = 0;
        queueDirectionalFrames(desiredFrame, scrollDirection, settledLookahead);
      }, 120);
    };

    const requestFrame = (imageNumber: number) => {
      if (imageNumber === displayedFrame) {
        requestVersion += 1;
        ambientRequestVersion += 1;
        requestedFrame = displayedFrame;
        return;
      }
      if (imageNumber === requestedFrame) return;

      requestedFrame = imageNumber;
      const version = ++requestVersion;
      const nextForegroundIndex: 0 | 1 = activeForeground === 0 ? 1 : 0;
      const nextAmbientIndex: 0 | 1 = activeAmbient === 0 ? 1 : 0;
      const source = frameSource(imageNumber);

      void waitForDecodedImage(foregroundImages[nextForegroundIndex], source, "high").then(
        (loaded) => {
          if (!loaded) {
            if (version === requestVersion) requestedFrame = displayedFrame;
            return;
          }
          if (version !== requestVersion || displayedFrame === imageNumber) return;

          foregroundImages[activeForeground].dataset.visible = "false";
          foregroundImages[nextForegroundIndex].dataset.visible = "true";
          activeForeground = nextForegroundIndex;
          displayedFrame = imageNumber;
          root.dataset.renderedFrame = String(imageNumber);

          const ambientVersion = ++ambientRequestVersion;
          void waitForDecodedImage(ambientImages[nextAmbientIndex], source, "low").then(
            (ambientLoaded) => {
              if (
                !ambientLoaded ||
                ambientVersion !== ambientRequestVersion ||
                displayedFrame !== imageNumber
              )
                return;
              ambientImages[activeAmbient].dataset.visible = "false";
              ambientImages[nextAmbientIndex].dataset.visible = "true";
              activeAmbient = nextAmbientIndex;
            },
          );
        },
      );

      touchCachedFrame(imageNumber);
    };

    const update = () => {
      frame = 0;
      const shouldReduce = reducedMotion || motionQuery.matches;
      const scrollRange = Math.max(root.offsetHeight - sticky.offsetHeight, 1);
      const progress = shouldReduce ? 0 : Math.min(1, Math.max(0, window.scrollY / scrollRange));
      const chapter = CHAPTER_THRESHOLDS.reduce<number>(
        (current, threshold, index) => (progress >= threshold ? index : current),
        0,
      );
      const imageNumber = Math.min(
        frameCount,
        Math.max(1, Math.round(progress * (frameCount - 1)) + 1),
      );
      const direction = imageNumber >= lastDesiredFrame ? 1 : -1;
      if (imageNumber !== lastDesiredFrame && direction !== scrollDirection) {
        clearQueuedPrefetch();
        scrollDirection = direction;
      }
      desiredFrame = imageNumber;
      lastDesiredFrame = imageNumber;
      root.dataset.chapter = String(chapter);
      root.dataset.frame = String(imageNumber);
      root.dataset.motion = shouldReduce ? "reduced" : "scrub";
      requestFrame(imageNumber);
      if (shouldReduce) {
        clearQueuedPrefetch();
      } else if (initialUpdate) {
        queueDirectionalFrames(imageNumber, 1, startupWarmCount);
      } else if (scrollUpdatePending) {
        // A jump makes the old runway stale; keep the queue focused on the current
        // direction so startup work cannot delay the next visible frames.
        clearQueuedPrefetch();
        queueDirectionalFrames(imageNumber, scrollDirection, activeLookahead);
        scheduleSettledPrefetch();
      }
      initialUpdate = false;
      scrollUpdatePending = false;
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const scheduleScrollUpdate = () => {
      scrollUpdatePending = true;
      scheduleUpdate();
    };

    update();
    window.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    motionQuery.addEventListener("change", scheduleUpdate);

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (settleTimer) window.clearTimeout(settleTimer);
      clearQueuedPrefetch();
      for (const preload of frameCache.values()) {
        preload.onload = null;
        preload.onerror = null;
        preload.removeAttribute("src");
      }
      frameCache.clear();
      for (const image of [...foregroundImages, ...ambientImages]) {
        image.onload = null;
        image.onerror = null;
      }
      window.removeEventListener("scroll", scheduleScrollUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      motionQuery.removeEventListener("change", scheduleUpdate);
    };
  }, [frameBasePath, frameCount, frameExtension, reducedMotion]);

  return (
    <section
      ref={rootRef}
      className={`brand-cinematic-hero ${styles.root}`}
      data-chapter="0"
      data-frame="1"
      data-rendered-frame="1"
      data-motion={reducedMotion ? "reduced" : "scrub"}
      data-media={mediaReady ? "ready" : "loading"}
      aria-label="TianGong LCA cinematic introduction"
    >
      <div className={`brand-cinematic-sticky ${styles.sticky}`}>
        {!mediaFailed && (
          <>
            {/* oxlint-disable-next-line next/no-img-element -- A raw image is required for imperative frame-sequence scrubbing. */}
            <img
              ref={primaryImageRef}
              className={`${styles.media} ${styles.foregroundMedia}`}
              src={`${frameBasePath}/frame-001.${frameExtension}`}
              alt=""
              aria-hidden="true"
              decoding="async"
              fetchPriority="high"
              loading="eager"
              data-visible="true"
              data-cinematic-layer="foreground"
              onError={() => {
                setMediaFailed(true);
                setMediaReady(true);
              }}
            />
            {/* oxlint-disable-next-line next/no-img-element -- A second decoded buffer prevents blank paints between frames. */}
            <img
              ref={secondaryImageRef}
              className={`${styles.media} ${styles.foregroundMedia}`}
              alt=""
              aria-hidden="true"
              decoding="async"
              data-visible="false"
              data-cinematic-layer="foreground"
            />
            {/* oxlint-disable-next-line next/no-img-element -- The synchronized duplicate extends the active frame into unused aspect-ratio space. */}
            <img
              ref={primaryAmbientRef}
              className={`${styles.media} ${styles.ambientMedia}`}
              src={`${frameBasePath}/frame-001.${frameExtension}`}
              alt=""
              aria-hidden="true"
              decoding="async"
              loading="eager"
              data-visible="true"
              data-cinematic-layer="ambient"
            />
            {/* oxlint-disable-next-line next/no-img-element -- A second ambient buffer stays paired with the decoded foreground frame. */}
            <img
              ref={secondaryAmbientRef}
              className={`${styles.media} ${styles.ambientMedia}`}
              alt=""
              aria-hidden="true"
              decoding="async"
              data-visible="false"
              data-cinematic-layer="ambient"
            />
          </>
        )}
        {mediaFailed && <div className={styles.fallback} aria-hidden="true" />}
        <div className={styles.wash} aria-hidden="true" />
        <div className={styles.grain} aria-hidden="true" />

        <output
          className={styles.loadingCurtain}
          aria-label="Preparing cinematic experience"
          aria-hidden={mediaReady}
        >
          <div className={styles.loaderMark} aria-hidden="true">
            <span>TIANGONG LCA</span>
            <span className={styles.loaderTrack}>
              <span />
            </span>
          </div>
        </output>

        <div className={styles.content}>
          <p className={styles.chapterLabel}>01 — {eyebrow}</p>
          <h1 id="brand-title" className={styles.title}>
            <span>
              {titleLead}
              {titleSeparator}
            </span>
            <strong>{titleFocus}</strong>
          </h1>
          <p className={styles.description}>{description}</p>
        </div>

        <div className={styles.chapterCopy} data-index="1">
          <p className={styles.chapterLabel}>02 — {chapterTwoLabel}</p>
          <h2>{chapterTwoTitle}</h2>
          <p>{chapterTwoDescription}</p>
        </div>

        <div className={styles.chapterCopy} data-index="2">
          <p className={styles.chapterLabel}>03 — {chapterThreeLabel}</p>
          <h2>{chapterThreeTitle}</h2>
          <p>{chapterThreeDescription}</p>
        </div>
      </div>
    </section>
  );
}
