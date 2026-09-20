"use client";

import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type MapInformationLabels = {
  count: string;
  lower: string;
  higher: string;
  information: string;
  explanation: string;
  sources: string;
};

/** Compact count legend and attribution with a keyboard-operable explanation.
 * @import import { MapInformation } from "@/features/catalog/map-information";
 */
export function MapInformation({
  labels,
  noticeUrl,
}: {
  labels: MapInformationLabels;
  noticeUrl?: string;
}) {
  return (
    <Collapsible asChild>
      <figcaption className="map-information">
        <div className="map-information-bar">
          <div className="map-information-legend">
            <span>{labels.count}</span>
            <span className="map-information-scale">
              <i className="map-information-ramp" aria-hidden="true" />
              <span>
                {labels.lower} <span aria-hidden="true">→</span> {labels.higher}
              </span>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={labels.information}>
                  <InfoIcon aria-hidden="true" data-icon="inline-start" />
                </Button>
              </CollapsibleTrigger>
            </span>
          </div>
          <p className="map-information-sources" aria-label={labels.sources}>
            <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">
              Natural Earth
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="https://datav.aliyun.com/portal/school/atlas/area_selector"
              target="_blank"
              rel="noreferrer"
            >
              DataV GeoAtlas
            </a>
          </p>
        </div>
        <CollapsibleContent className="map-information-explanation">
          <p>{labels.explanation}</p>
          {noticeUrl && (
            <a href={noticeUrl} target="_blank" rel="noreferrer">
              MapLibre
            </a>
          )}
        </CollapsibleContent>
      </figcaption>
    </Collapsible>
  );
}
