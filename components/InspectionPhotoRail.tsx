"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { justifyRows } from "@/lib/media/justifiedRows";
import { cardImageSrc } from "@/lib/media/cardImage";

/* ════════════════════════════════════════════════════════════════════════
   SUPPORTING PHOTOGRAPHS — the justified rail

   Every tile keeps its own shape. A wide photograph fills a row alone; two
   narrow ones share. Nothing is cropped, so the SHAPE tells a collector
   what a photograph is before they click it — a dial macro, a caseback, a
   wrist shot and a box flat lay are recognisable as different things at
   rail size, which a grid of identical squares makes impossible.

   ── WHY NOT object-cover ───────────────────────────────────────────────
   The rail used to be h-14 w-14 object-cover: five identical squares, each
   a crop. That is the same trade the inspection stage refuses when it uses
   object-contain, and the same one the resting hero refuses when it
   declines the seller's focal point — subtracting evidence to improve
   presentation. A caseback engraving near the frame edge was simply gone
   from its own thumbnail.

   ── ASPECTS ARE MEASURED, NEVER ASSUMED ────────────────────────────────
   A photograph whose dimensions are not known yet is laid out as a square
   and re-laid the moment it loads. Assuming portrait, or holding the rail
   blank until everything measures, both trade a truthful rail for a
   convenient one.
   ════════════════════════════════════════════════════════════════════════ */

type Props = {
  photos: string[];
  active: number;
  onSelect: (index: number) => void;
  /** Vertical column beside the stage on desktop; horizontal band beneath
      it on narrow screens, where a side column would eat the width the
      photograph needs. */
  orientation: "column" | "row";
};

export default function InspectionPhotoRail({ photos, active, onSelect, orientation }: Props) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [aspects, setAspects] = useState<Record<number, number>>({});

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Measure each source's real proportions. Probes rather than rendered
     elements, so the layout is decided before anything is painted and the
     rail does not reflow visibly as images arrive one by one. */
  useEffect(() => {
    let cancelled = false;
    photos.forEach((url, i) => {
      const probe = new Image();
      probe.onload = () => {
        if (cancelled || !(probe.naturalWidth > 0) || !(probe.naturalHeight > 0)) return;
        setAspects((prev) =>
          prev[i] ? prev : { ...prev, [i]: probe.naturalWidth / probe.naturalHeight }
        );
      };
      probe.src = cardImageSrc(url, { width: 240 });
    });
    return () => {
      cancelled = true;
    };
  }, [photos]);

  const tiles = useMemo(() => {
    if (!(width > 0)) return [];
    return justifyRows(
      photos.map((_, i) => ({ index: i, aspect: aspects[i] ?? 1 })),
      width,
      orientation === "column"
        ? { targetHeight: 78, gap: 6, maxRowHeight: 132 }
        : /* A horizontal band has one row and unlimited width, so the target
             height IS the height and justification has nothing to solve. The
             tiles simply keep their aspects. */
          { targetHeight: 64, gap: 6, maxRowHeight: 64 }
    );
  }, [photos, aspects, width, orientation]);

  if (photos.length <= 1) return null;

  const byRow = new Map<number, typeof tiles>();
  for (const t of tiles) byRow.set(t.row, [...(byRow.get(t.row) ?? []), t]);

  return (
    <div
      ref={railRef}
      className={
        orientation === "column"
          ? "flex w-[168px] shrink-0 flex-col gap-1.5 overflow-y-auto pr-1"
          : "flex w-full gap-1.5 overflow-x-auto"
      }
      aria-label="Other photographs of this watch"
    >
      {orientation === "column"
        ? [...byRow.keys()].sort((a, b) => a - b).map((row) => (
            <div key={row} className="flex gap-1.5">
              {byRow.get(row)!.map((t) => (
                <Tile
                  key={t.index}
                  url={photos[t.index]}
                  index={t.index}
                  active={t.index === active}
                  width={t.width}
                  height={t.height}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))
        : photos.map((url, i) => (
            <Tile
              key={i}
              url={url}
              index={i}
              active={i === active}
              width={64 * (aspects[i] ?? 1)}
              height={64}
              onSelect={onSelect}
            />
          ))}
    </div>
  );
}

function Tile({
  url,
  index,
  active,
  width,
  height,
  onSelect,
}: {
  url: string;
  index: number;
  active: boolean;
  width: number;
  height: number;
  onSelect: (i: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      aria-label={`View photograph ${index + 1}`}
      aria-current={active ? "true" : undefined}
      style={{ width: `${width}px`, height: `${height}px` }}
      /* Selection carries on a light field the same way it did before —
         gold border, a ring standing off the slate, full opacity against
         held-back siblings. Held back at 75%, not washed out: these are
         photographs a collector is choosing between. */
      className={`shrink-0 overflow-hidden rounded-sm border transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] ${
        active
          ? "border-[var(--gold)] opacity-100 ring-1 ring-[var(--gold)] ring-offset-2 ring-offset-[#E8EBEF]"
          : "border-[var(--border-subtle)] opacity-75 hover:border-[var(--border-mid)] hover:opacity-100"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cardImageSrc(url, { width: 240 })}
        alt=""
        draggable={false}
        /* object-cover is correct HERE and only here: the tile was sized
           FROM this photograph's own aspect, so the box already matches the
           image and cover crops nothing. It is present only to absorb
           sub-pixel rounding, not to make a shape fit. */
        className="h-full w-full object-cover"
      />
    </button>
  );
}
