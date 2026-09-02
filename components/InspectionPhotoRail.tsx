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

/** Kept in one place: the layout solves rows against it and the flex
    container has to draw the same distance, or the arithmetic and the paint
    disagree by a pixel per gap. */
const GAP = 6;

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
    const measure = () => {
      /* clientWidth INCLUDES padding, and the rail now carries some so the
         thumbnails are not shoved against the scrollbar. Justifying rows
         against a padded width would make every row too wide by exactly that
         padding, and the last tile in each row would clip. */
      const cs = getComputedStyle(el);
      const num = (v: string) => parseFloat(v) || 0;
      setWidth(Math.max(0, el.clientWidth - num(cs.paddingLeft) - num(cs.paddingRight)));
    };
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
        ? /* TWO ACROSS, derived rather than typed. A row of two square tiles
             plus the gap between them IS the column, so the target height
             falls out of the width — which means widening the rail enlarges
             the photographs instead of packing more of them in. The old 78
             was this same rule at the old 168, written down as a number and
             therefore silently wrong the moment the column changed. */
          { targetHeight: (width - GAP) / 2, gap: GAP, maxRowHeight: width * 0.79 }
        : /* A horizontal band has one row and unlimited width, so the target
             height IS the height and justification has nothing to solve. The
             tiles simply keep their aspects. */
          { targetHeight: 64, gap: GAP, maxRowHeight: 64 }
    );
  }, [photos, aspects, width, orientation]);

  /* AUTO-FOLLOW, minimally. Cycling with the arrows must not leave the
     selected thumbnail somewhere off the rail — but a rail that RECENTRES on
     every step is worse than one that never moves, because the whole set
     slides under the collector's eye at each press. So: if the tile is
     already visible, do nothing at all; if it is not, scroll exactly far
     enough to bring it in, plus one gap so it does not sit flush against the
     edge. offsetTop is why the rail is positioned. */
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const rail = railRef.current;
    const el = activeRef.current;
    if (!rail || !el) return;
    if (orientation === "column") {
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (top < rail.scrollTop) rail.scrollTop = Math.max(0, top - GAP);
      else if (bottom > rail.scrollTop + rail.clientHeight) {
        rail.scrollTop = bottom - rail.clientHeight + GAP;
      }
      return;
    }
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < rail.scrollLeft) rail.scrollLeft = Math.max(0, left - GAP);
    else if (right > rail.scrollLeft + rail.clientWidth) {
      rail.scrollLeft = right - rail.clientWidth + GAP;
    }
  }, [active, orientation, tiles]);

  if (photos.length <= 1) return null;

  const byRow = new Map<number, typeof tiles>();
  for (const t of tiles) byRow.set(t.row, [...(byRow.get(t.row) ?? []), t]);

  return (
    <div
      ref={railRef}
      className={
        orientation === "column"
          /* The column no longer carries its own width. The room bounds the
             stage to the listing's own photographs and hands the rail
             everything left over, so the rail fills the space it is given —
             and because tile height is derived from that width, a wider room
             enlarges the supporting photographs rather than stacking more of
             them. */
          ? "relative flex w-full shrink-0 flex-col gap-1.5 overflow-y-auto pr-3"
          : "relative flex w-full gap-1.5 overflow-x-auto"
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
                  innerRef={t.index === active ? activeRef : undefined}
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
              innerRef={i === active ? activeRef : undefined}
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
  innerRef,
  width,
  height,
  onSelect,
}: {
  url: string;
  index: number;
  active: boolean;
  innerRef?: React.RefObject<HTMLButtonElement | null>;
  width: number;
  height: number;
  onSelect: (i: number) => void;
}) {
  return (
    <button
      ref={innerRef}
      type="button"
      onClick={() => onSelect(index)}
      aria-label={`View photograph ${index + 1}`}
      aria-current={active ? "true" : undefined}
      style={{ width: `${width}px`, height: `${height}px` }}
      /* ONE selection line. This was a gold border AND an offset gold ring —
         two gold edges with a gap between them, which at rail size read as a
         smudge rather than a selection. The ring is INSET, which matters at
         more than one level: an offset ring would reach 4px into a 6px gap
         and collide with its neighbours. The neutral border stays on every
         tile so unselected ones keep their definition, held back at 75%
         rather than washed out — these are photographs a collector is
         choosing between, not disabled controls.

         Focus is deliberately NOT gold. Gold means "this is the photograph
         you are looking at"; a keyboard ring in the same colour made the two
         indistinguishable. Focus is ink, and stands outside the tile. */
      className={`shrink-0 overflow-hidden rounded-sm border border-[var(--border-subtle)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--ink)] ${
        active
          ? "opacity-100 ring-2 ring-inset ring-[var(--gold)]"
          : "opacity-75 hover:border-[var(--border-mid)] hover:opacity-100"
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
