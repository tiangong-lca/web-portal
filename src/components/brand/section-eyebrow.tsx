import type { ReactNode } from "react";
import "./section-eyebrow.css";

export type SectionEyebrowProps = {
  /** Display order within a brand page, for example 01. */
  number: string;
  /** Localized section label, supplied by the owning page. */
  children: ReactNode;
};

/**
 * Shared numbered eyebrow above brand section headings.
 * @import import { SectionEyebrow } from "@/components/brand/section-eyebrow";
 */
export function SectionEyebrow({ number, children }: SectionEyebrowProps) {
  return (
    <p className="brand-section-eyebrow">
      <span className="brand-section-eyebrow-number" aria-hidden="true">
        {number}
      </span>
      <span className="brand-section-eyebrow-divider" aria-hidden="true">
        /
      </span>
      <span>{children}</span>
    </p>
  );
}
