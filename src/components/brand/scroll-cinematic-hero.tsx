"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./scroll-cinematic-hero.module.css";

const CHAPTER_THRESHOLDS = [0, 0.22, 0.55, 0.72] as const;

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
    const imagePairs = [
      [primaryImage, primaryAmbient],
      [secondaryImage, secondaryAmbient],
    ] as const;
    const warmFrames = new Map<number, HTMLImageElement>();
    const warmedFrames = new Set<number>([1]);
    let activeImage: 0 | 1 = 0;
    let displayedFrame = 1;
    let requestedFrame = 1;
    let requestVersion = 0;
    let frame = 0;
    let preloadTimer = 0;

    const frameSource = (imageNumber: number) =>
      `${frameBasePath}/frame-${String(imageNumber).padStart(3, "0")}.${frameExtension}`;

    const warmNearFrame = (imageNumber: number) => {
      if (preloadTimer) window.clearTimeout(preloadTimer);
      if (imageNumber === 1 || reducedMotion || motionQuery.matches) return;
      // Initial readers need only the first frame. Warm at most two neighbors after
      // scrolling settles; never download the entire sequence on page entry.
      preloadTimer = window.setTimeout(() => {
        preloadTimer = 0;
        for (const next of [imageNumber + 1, imageNumber - 1]) {
          if (next < 1 || next > frameCount || warmedFrames.has(next) || warmFrames.size >= 2)
            continue;
          const preload = new Image();
          preload.decoding = "async";
          preload.fetchPriority = "low";
          warmedFrames.add(next);
          warmFrames.set(next, preload);
          const release = () => warmFrames.delete(next);
          preload.onload = release;
          preload.onerror = () => {
            warmedFrames.delete(next);
            release();
          };
          preload.src = frameSource(next);
        }
      }, 120);
    };

    const requestFrame = (imageNumber: number) => {
      if (imageNumber === displayedFrame) {
        requestVersion += 1;
        requestedFrame = displayedFrame;
        return;
      }
      if (imageNumber === requestedFrame) return;

      requestedFrame = imageNumber;
      const version = ++requestVersion;
      const nextImageIndex: 0 | 1 = activeImage === 0 ? 1 : 0;
      const nextPair = imagePairs[nextImageIndex];

      const reveal = () => {
        if (version !== requestVersion || displayedFrame === imageNumber) return;
        for (const image of imagePairs[activeImage]) image.dataset.visible = "false";
        for (const image of nextPair) image.dataset.visible = "true";
        activeImage = nextImageIndex;
        displayedFrame = imageNumber;
        root.dataset.renderedFrame = String(imageNumber);
      };

      const loadDecoded = (image: HTMLImageElement, source: string) =>
        new Promise<boolean>((resolve) => {
          let settled = false;
          const finish = (loaded: boolean) => {
            if (settled) return;
            settled = true;
            resolve(loaded);
          };
          image.onload = () => {
            void image
              .decode()
              .then(() => finish(true))
              .catch(() => finish(image.complete && image.naturalWidth > 0));
          };
          image.onerror = () => finish(false);
          image.src = source;
          if (image.complete && image.naturalWidth > 0) image.onload(new Event("load"));
        });

      const source = frameSource(imageNumber);
      void Promise.all(nextPair.map((image) => loadDecoded(image, source))).then((loaded) => {
        if (loaded.every(Boolean)) reveal();
        else if (version === requestVersion) requestedFrame = displayedFrame;
      });
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
      root.dataset.chapter = String(chapter);
      root.dataset.frame = String(imageNumber);
      root.dataset.motion = shouldReduce ? "reduced" : "scrub";
      requestFrame(imageNumber);
      warmNearFrame(imageNumber);
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    motionQuery.addEventListener("change", scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (preloadTimer) window.clearTimeout(preloadTimer);
      for (const preload of warmFrames.values()) {
        preload.onload = null;
        preload.onerror = null;
      }
      warmFrames.clear();
      for (const image of imagePairs.flat()) {
        image.onload = null;
        image.onerror = null;
      }
      window.removeEventListener("scroll", scheduleUpdate);
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
