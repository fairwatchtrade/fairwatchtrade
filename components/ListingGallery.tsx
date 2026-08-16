"use client";

import { useEffect, useState } from "react";
import DialReveal from "@/components/DialReveal";
import NavArrowMark from "@/components/NavArrowMark";
import { cardImageSrc } from "@/lib/media/cardImage";

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
   the photograph's lower-right; the right arrow is vertically centred in the
   stage at the same edge. On a tall photograph they never meet, but a wide,
   short one sits short inside the governed stage, and the arrow's vertical
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
  /* ── WHY NO FOCAL FRAMING HERE (v3.7) ──────────────────────────────────
     The seller's hero CHOICE reaches this component, as initialIndex. Their
     focal point and zoom deliberately do NOT.

     This hero is `object-contain` inside max-h-[60vh]: the whole photograph is
     visible and nothing is cropped. There is no framing decision to honour,
     because there is no frame cutting anything off. Applying object-cover here
     to make the focal point "work" would introduce a crop that does not exist
     today and hide parts of the photograph from the buyer — subtracting
     evidence to improve presentation, which is precisely the trade the
     evidence law forbids.

     Framing applies where a crop is already happening and the seller is
     choosing WHICH part survives it: the Review card and the browse card. ── */
  const safeInitial =
    initialIndex >= 0 && initialIndex < photos.length ? initialIndex : 0;
  const [active, setActive] = useState(safeInitial);

  /* ── INSPECTION STATE (buyer-facing polish, 2026-08-13) ────────────────
     Condition judgment needs the photograph at inspection scale: dial,
     bezel, finishing, wear, scratches. When open, the image IS the
     interface — a fixed overlay where the photo takes the full viewport at
     its own aspect (object-contain, never cropped, no decorative
     treatment), with the same prev/next controls, the thumbnail strip, an
     obvious Close, and Escape. Body scroll is suspended while inspecting.

     This is a distinct state, not an enlarged thumbnail: the surrounding
     listing UI yields completely. The resting hero keeps v1.23's law —
     the photograph itself is inert; inspection opens only from the
     explicit Inspect control. Dial Reveal is a resting-hero instrument
     and deliberately does not follow into the overlay. */
  const [inspecting, setInspecting] = useState(false);
  useEffect(() => {
    if (!inspecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspecting(false);
      if (e.key === "ArrowLeft") setActive((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setActive((i) => Math.min(photos.length - 1, i + 1));
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [inspecting, photos.length]);

  if (photos.length === 0) return null;

  const heroUrl = photos[active] ?? photos[0];
  const hasPrev = active > 0;
  const hasNext = active < photos.length - 1;

  /* Muted at rest, firmer on hover — legible over a dark caseback or a white
     dial without becoming furniture. Identical for both arrows; only the
     chevron and the edge differ. */
  /* v4.98 — the disc is gone. It existed to guarantee a thin chevron stayed
     visible over any photograph, and it paid for that with a slab of
     platform chrome parked on the watch. The mark is a filled silhouette
     now (see NavArrowMark), which carries itself at this size, so the
     container is no longer earning anything. Its shadow does the disc's old
     job without standing between the collector and the object.

     z-10 vs DialReveal's z-30 is UNCHANGED and still deliberate: on a wide,
     short photograph the vertically-centred right arrow can fall inside the
     fader's column, and DialReveal must keep both the paint and the click
     there. Removing the disc does not change that ordering. */
  const arrowClass =
    "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center " +
    "text-[var(--on-photo-text)] transition hover:text-[var(--on-photo-gold)] " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 " +
    "focus-visible:outline-[var(--gold)]";

  return (
    <div>
      {/* Hero — large, full-width. The photograph itself carries no click
          handler: clicking it does nothing, by design. */}
      <div className="relative w-full overflow-hidden rounded-lg border border-[var(--border-mid)] bg-[color:light-dark(#F1EDE3,#14161C)] p-2 sm:p-3">
        {/* ── THE GOVERNED STAGE ────────────────────────────────────────────
            The stage owns the height. The photograph does not.

            Before this, the hero image was `w-full max-h-[60vh]`, so its
            height was width ÷ source aspect ratio, capped. The element's
            height therefore CHANGED with every photograph, and everything
            below it — OMEGA, Seamaster, REFERENCE, the reference value, the
            case diameter, Collector Snapshot — rode up and down with the
            proportions of whatever the collector happened to click.

            Measured on the Omega Seamaster before the repair: 255px of
            anchor movement across its six thumbnails at 375px wide. It read
            as stable on a 1512×950 desktop, but only by arithmetic accident
            — there the cap engages for any photograph narrower than 1.663:1,
            and every photograph on that listing is 1.333:1 or narrower. A
            single 16:9 photograph would have moved it there too. A defect
            that hides behind the aspect ratios a listing happens to contain
            is not absent; it is waiting.

            So the height is now a constant per viewport, and the photograph
            adapts inside it. 60vh is the SAME height the tallest photograph
            already occupied, so the roomiest case is unchanged; what changed
            is that a short photograph no longer pulls the facts up to meet
            it.

            This also removes the transient jump: the stage is sized before
            any image loads, so nothing reflows when a new one arrives —
            cold cache or warm.

            max-h/max-w rather than h-full/w-full is deliberate. It makes the
            image element hug the photograph itself, which is what Dial
            Reveal's controls anchor to; h-full would stretch the element
            across the whole stage and carry the muted-gold square off into a
            letterbox margin, away from the lower-right corner of the hero
            image where its law puts it. Every real listing photograph is
            wider than this stage, so the fit is identical to before.

            NOT solved by cropping, by moving a fact, or by touching a seller
            photo record. The photograph is still whole, still object-contain,
            still full resolution into Inspect. ── */}
        <div className="relative flex h-[60vh] items-center justify-center">
          {dialUrl && heroUrl === dialUrl ? (
            /* The frame carries the stage's height down to the photograph.
               Without it, `h-full` inside DialReveal's own height-auto
               wrapper resolves against nothing and a tall photograph — a
               phone screenshot at 0.448, say — renders at full natural size
               and is clipped by the hero's overflow. Caught in production
               measurement, not in review: the anchor held perfectly while
               the photograph was quietly being cropped. `w-fit` keeps the
               frame hugging the photograph so Dial Reveal's square stays in
               the corner of the hero image. */
            <DialReveal
              photoUrl={heroUrl}
              frameClassName="relative h-full w-fit"
              className="h-full w-auto max-w-full rounded-lg object-contain transition-[filter] duration-200"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroUrl}
              alt=""
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          )}
        </div>

        {/* Previous — rendered only when there is a previous photo. */}
        {hasPrev && (
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => setActive((i) => Math.max(0, i - 1))}
            className={`${arrowClass} left-3`}
          >
            <NavArrowMark flip />
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
            <NavArrowMark />
          </button>
        )}
      </div>

      {/* Inspect — the explicit door into the inspection state. Sits at the
          hero's upper-right, clear of the arrows (vertical centre) and Dial
          Reveal (lower-right). */}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setInspecting(true)}
          className="inline-flex min-h-[36px] items-center gap-2 border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] uppercase tracking-[1.5px] text-[var(--slate)] transition hover:border-[var(--border-gold)] hover:text-[var(--platinum-dim)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          Inspect photo
        </button>
      </div>

      {/* ── Inspection overlay ── */}
      {inspecting && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo inspection"
          /* Opaque, deliberately: the desktop SEE-it showed page text bleeding
             through a 97% wash and competing with the photograph. In the
             inspection state the image is the only interface.
             data-immersive-dark — full-screen photo inspection is the second
             authorized immersive-dark surface (appearance order §18): the
             room around a photograph under inspection is always night, so
             the overlay's tokens resolve dark in every page appearance. */
          data-immersive-dark=""
          className="fixed inset-0 z-[70] flex flex-col bg-[#05060A]"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[11px] uppercase tracking-[2px] text-[var(--muted)]">
              {brandLabel} · Photo {active + 1} of {photos.length}
            </span>
            <button
              type="button"
              autoFocus
              onClick={() => setInspecting(false)}
              className="inline-flex min-h-[44px] items-center gap-2 border border-[var(--border-subtle)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--platinum-dim)] transition hover:border-[var(--border-gold)] hover:text-[var(--gold)]"
            >
              Close ✕
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroUrl}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
            {hasPrev && (
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => setActive((i) => Math.max(0, i - 1))}
                className={`${arrowClass} left-4`}
              >
                <NavArrowMark flip />
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => setActive((i) => Math.min(photos.length - 1, i + 1))}
                className={`${arrowClass} right-4`}
              >
                <NavArrowMark />
              </button>
            )}
          </div>

          {photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto px-4 py-3">
              {photos.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`View photo ${i + 1}`}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border transition ${
                    i === active ? "border-[var(--gold)]" : "border-[var(--border-mid)] hover:border-[var(--gold)]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                src={cardImageSrc(url, { width: 240 })}
                alt=""
                className="h-full w-full object-cover"
              />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
                  ? "border-[var(--gold)]"
                  : "border-[var(--border-mid)] hover:border-[var(--gold)]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardImageSrc(url, { width: 240 })}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
