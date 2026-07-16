"use client";

import { useState } from "react";
import DialReveal from "@/components/DialReveal";

/* ────────────────────────────────────────────────────────────────────────
   LISTING GALLERY — buyer-facing photo viewer (v1.23)

   Client child of /listings/[id]. Renders a full-width hero and a scrollable
   strip of the REMAINING photos; clicking a thumbnail swaps it into the hero.
   The parent computes the initial hero index (first "Dial" photo, else 0) and
   passes plain public Blob URLs — no category labels are surfaced to buyers.

   ── v1.23: INVISIBLE TAP ZONES → EXPLICIT ARROWS ───────────────────────
   Removed: two `absolute inset-y-0 {left|right}-0 w-2/5` overlays that made
   80% of the hero a hidden click target. A collector clicking the photograph
   to look at the photograph got moved off it. The photo is now inert; only a
   deliberate press on a real arrow navigates.

   They were also `role="button"` DIVs — announced as buttons, focusable by
   nothing, activated by no key. The replacements are real <button> elements,
   so they are tabbable and Enter/Space-activated for free. This is a repair,
   not an addition: the old markup made an accessibility claim it didn't keep.

   Arrows are conditional, never decorative: left renders only when a previous
   photo exists, right only when a next one does. At the ends the arrow is not
   dimmed or disabled — it is absent, so the control's presence IS the
   affordance and there is nothing to press that does nothing.

   ── ARROWS SIT BELOW DIAL REVEAL (z-10 vs z-30) ────────────────────────
   Deliberate, not incidental. DialReveal's anchor and fader are z-30 and hug
   the hero's lower-right; the right arrow is vertically centred at the same
   edge. On a tall hero they never meet, but `max-h-[60vh]` + object-contain
   means a wide/short photo yields a SHORT container, where the vertical
   centre can fall inside the fader's 146px column. z-10 guarantees the fader
   and square keep both the paint and the click in that overlap — Dial Reveal
   stays fully operable, and a fader drag can never leak into "next photo".
   The arrow remains pressable everywhere it isn't underneath Dial Reveal.
   ──────────────────────────────────────────────────────────────────────── */

export default function ListingGallery({
  photos,
  initialIndex = 0,
  brandLabel,
  dialUrl,
}: {
  photos: string[];
  initialIndex?: number;
  brandLabel: string;
  modelLabel: string | null;
  dialUrl?: string | null;
}) {
  const safeInitial =
    initialIndex >= 0 && initialIndex < photos.length ? initialIndex : 0;
  const [active, setActive] = useState(safeInitial);

  if (photos.length === 0) return null;

  const heroUrl = photos[active] ?? photos[0];
  const hasPrev = active > 0;
  const hasNext = active < photos.length - 1;

  /* Muted at rest, firmer on hover — legible over a dark caseback or a white
     dial without becoming furniture. Identical for both arrows; only the
     chevron and the edge differ. */
  const arrowClass =
    "absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center " +
    "rounded-full border border-white/10 bg-black/30 text-white/45 backdrop-blur-[4px] " +
    "transition hover:border-white/20 hover:bg-black/50 hover:text-white/80 " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 " +
    "focus-visible:outline-[#C9A84C]";

  return (
    <div>
      {/* Hero — large, full-width. The photograph itself carries no click
          handler: clicking it does nothing, by design. */}
      <div className="relative w-full overflow-hidden rounded-lg border border-white/15 bg-[#14161C] p-2 sm:p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {dialUrl && heroUrl === dialUrl ? (
          <DialReveal
            photoUrl={heroUrl}
            className="max-h-[60vh] w-full rounded-lg object-contain transition-[filter] duration-200"
          />
        ) : (
          <img src={heroUrl} alt="" className="max-h-[60vh] w-full rounded-lg object-contain" />
        )}

        {/* Previous — rendered only when there is a previous photo. */}
        {hasPrev && (
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => setActive((i) => Math.max(0, i - 1))}
            className={`${arrowClass} left-3`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18L9 12l6-6" />
            </svg>
          </button>
        )}

        {/* Next — rendered only when there is a next photo. */}
        {hasNext && (
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => setActive((i) => Math.min(photos.length - 1, i + 1))}
            className={`${arrowClass} right-3`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Remaining photos — scrollable horizontal thumbnail strip */}
      {photos.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View photo ${i + 1}`}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border transition ${
                i === active
                  ? "border-[#C9A84C]"
                  : "border-white/15 hover:border-[#C9A84C]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
