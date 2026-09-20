"use client";

import { useLayoutEffect, useRef } from "react";
import { fitViewBox, interpolateViewBox, parseViewBox, type ViewBox } from "./map-viewport";

/** Animate only the SVG viewport, not React's tree of geographic paths. */
export function useMapCamera(
  viewBox?: string,
  coverage?: string,
  coordinateSpace?: string,
  world = false,
) {
  const svg = useRef<SVGSVGElement>(null);
  const camera = useRef<{ space?: string; box: ViewBox } | null>(null);
  useLayoutEffect(() => {
    const element = svg.current;
    const preferred = parseViewBox(viewBox);
    if (!element || !preferred) return;
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const background = parseViewBox(coverage) ?? preferred;
    // Match ResizeObserver's content box. Including the SVG frame's border here would
    // make its initial observer delivery look like a resize and cancel every zoom.
    let width = element.clientWidth;
    let height = element.clientHeight;
    const target = () => (world ? preferred : fitViewBox(preferred, width / height, background));
    const write = (box: ViewBox) => {
      element.setAttribute("viewBox", box.join(" "));
      camera.current = { space: coordinateSpace, box };
    };
    const settle = () => {
      cancelAnimationFrame(frame);
      write(target());
      element.removeAttribute("data-camera-moving");
    };
    const previous = camera.current;
    const end = target();
    const canAnimate =
      previous &&
      coordinateSpace &&
      previous.space === coordinateSpace &&
      !reduced.matches &&
      !document.hidden &&
      previous.box.some((v, i) => Math.abs(v - end[i]!) > 0.01);
    if (canAnimate) {
      const start = previous.box;
      write(start);
      element.setAttribute("data-camera-moving", "true");
      let began: number | undefined;
      const step = (timestamp: number) => {
        began ??= timestamp;
        const progress = Math.min(1, (timestamp - began) / 420);
        write(interpolateViewBox(start, end, progress));
        if (progress < 1) frame = requestAnimationFrame(step);
        else settle();
      };
      frame = requestAnimationFrame(step);
    } else settle();

    const observer = new ResizeObserver(([entry]) => {
      if (
        !entry ||
        (Math.abs(entry.contentRect.width - width) < 1 &&
          Math.abs(entry.contentRect.height - height) < 1)
      )
        return;
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      // A layout change fits immediately rather than chasing a moving window.
      settle();
    });
    observer.observe(element);
    const preferenceChanged = () => {
      if (reduced.matches) settle();
    };
    const visibilityChanged = () => {
      if (document.hidden) settle();
    };
    reduced.addEventListener("change", preferenceChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      reduced.removeEventListener("change", preferenceChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [viewBox, coverage, coordinateSpace, world]);
  return svg;
}
