"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import LoupeIcon from "@/components/LoupeIcon";
import NavArrowMark from "@/components/NavArrowMark";
import { cardImageSrc } from "@/lib/media/cardImage";

/* ────────────────────────────────────────────────────────────────────────
   BROWSE CARD INSPECTOR — the peek

   GOVERNING LAW, locked at the Design Gate:

     The inspection panel is a peek, not a room. The collector must never
     feel they have left Browse.

   Which is why this is an ordinary grid item that grew, not an overlay.
   It occupies its own card plus the one beside it and nothing more: the
   rest of the grid stays exactly where it was, visible above, below and
   alongside. There is no fixed positioning here, no full-viewport scrim,
   no portal — a collector's place in the results is never taken from them
   to show them one watch more closely.

   ── COLOUR ─────────────────────────────────────────────────────────────
   The approved mockup is a light-only study and states its surfaces as raw
   hex. Those values are NOT copied here. The product has an appearance
   system, and a hardcoded ivory panel would be a bright slab in Galaxy.
   Tokens carry the same design language — warm paper, charcoal type, gold
   reserved for labels — into both appearances honestly.

   ── THE PHOTOGRAPH ─────────────────────────────────────────────────────
   The panel image is a derivative, not the original. It is larger than a
   card's, so it asks for the larger allowlisted width; full resolution
   still belongs to the listing hero and photo inspection, where looking
   closely is the whole purpose.
   ──────────────────────────────────────────────────────────────────────── */

export type QuickSpec = { label: string; value: string };

export default function BrowseCardInspector({
  brand,
  title,
  meta,
  priceText,
  photos,
  photoIndex,
  onPhotoIndex,
  specs,
  href,
  onClose,
}: {
  brand: string;
  title: string;
  meta: string | null;
  priceText: string;
  photos: string[];
  photoIndex: number;
  onPhotoIndex: (index: number) => void;
  specs: QuickSpec[];
  href: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const count = photos.length;
  const active = count > 0 ? Math.min(Math.max(photoIndex, 0), count - 1) : 0;
  const step = (delta: number) => {
    if (count < 2) return;
    onPhotoIndex((active + delta + count) % count);
  };

  /* Escape closes; the arrows walk the photographs. Bound to the document
     because the collector's hands may be anywhere on the page — but never
     stolen from a field, where the same keys mean something else. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest("input, textarea, select")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  /* Anywhere outside closes. mousedown rather than click so a press that
     began outside cannot be swallowed by the panel re-rendering under it. */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  /* The panel took the collector's attention deliberately, so it takes the
     keyboard with it — and Close is the one control every escape route
     shares. */
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  /* A bare directional mark — no square, no circle, no button slab. The
     filled silhouette is deliberate: fine line art dies at this size, a
     solid shape survives it. The hit target stays generous (44px) while the
     visible mark stays small, so the control is easy to press and quiet to
     look at. Muted at rest, gold on hover — it reads as navigation without
     becoming an object in its own right. */
  const arrow =
    "group absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center " +
    "text-[var(--slate)] transition hover:text-[var(--gold)] " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]";

  /* The mark is shared with the listing gallery — see NavArrowMark. It lived
     here first; keeping a private copy would have been two drawings to keep
     in agreement, which is the drift this component's own arrows exist to
     avoid. */

  return (
    <div
      ref={panelRef}
      className="flex h-full flex-col bg-[var(--surface)] shadow-[0_18px_50px_rgba(58,49,32,0.10)]"
      role="group"
      aria-label={`Quick Specs — ${brand} ${title}`}
    >
      <div className="flex items-center justify-end border-b border-[var(--border-faint)] px-3 py-2">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Return to Browse"
          className="flex h-9 w-9 items-center justify-center text-[18px] leading-none text-[var(--muted)] transition hover:text-[var(--platinum)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
        >
          ×
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 md:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.82fr)]">
        {/* The photograph */}
        <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden border-b border-[var(--border-faint)] bg-[var(--image-well)] md:border-b-0 md:border-r">
          {photos[active] ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={cardImageSrc(photos[active], { width: 720 })}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-[11px] tracking-[0.3px] text-[var(--muted)]">No photo</span>
          )}

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous photo"
                className={`${arrow} left-1`}
              >
                <NavArrowMark flip />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next photo"
                className={`${arrow} right-1`}
              >
                <NavArrowMark />
              </button>

              {/* Position, not narration. "Photo 1 / 2" told the collector
                  something the bars already say and the photograph makes
                  obvious. One bar per photograph, the current one gold —
                  legible at a glance, secondary to the watch, and carrying
                  no container of its own. */}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-[5px]">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPhotoIndex(i)}
                    aria-label={`Photo ${i + 1}`}
                    aria-current={i === active}
                    className={`h-[2px] w-[18px] transition ${
                      i === active
                        ? "bg-[var(--gold)]"
                        : "bg-[var(--slate)] opacity-45 hover:opacity-80"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* The facts */}
        <div className="flex min-w-0 flex-col p-6">
          <div className="mb-2 truncate text-[11px] uppercase tracking-[1.4px] text-[var(--gold-dim)]">
            {brand}
          </div>
          <h3 className="mb-3 font-display text-[24px] font-light leading-[1.1] text-[var(--platinum)]">
            {title}
          </h3>
          {meta && (
            <div className="mb-3 text-[12px] leading-[1.55] text-[var(--slate)]">{meta}</div>
          )}
          <p className="mb-5 font-display text-[20px] font-light text-[var(--platinum)]">
            {priceText}
          </p>

          {specs.length > 0 && (
            <>
              <div className="mb-4 h-px bg-[var(--border-faint)]" />
              <h4 className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[1.4px] text-[var(--gold-dim)]">
                <LoupeIcon size={16} />
                <span>Quick Specs</span>
              </h4>
              {/* Only what the listing actually holds. A row that would read
                  "N/A" is simply not a row — no penalty for missing data,
                  only a penalty for bad data. */}
              <dl className="m-0 p-0">
                {specs.map((spec) => (
                  <div
                    key={spec.label}
                    className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 border-t border-[var(--border-faint)] py-2 first:border-t-0 text-[12px]"
                  >
                    <dt className="pt-[2px] text-[11px] uppercase tracking-[0.8px] text-[var(--muted)]">
                      {spec.label}
                    </dt>
                    <dd className="m-0 text-[var(--platinum-dim)]">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[34px] items-center justify-center border border-[var(--border-subtle)] px-3 py-2 text-[11px] uppercase tracking-[1.2px] text-[var(--slate)] transition hover:border-[var(--border-mid)] hover:text-[var(--platinum-dim)]"
            >
              Return to Browse
            </button>
            <Link
              href={href}
              className="inline-flex min-h-[34px] items-center justify-center border border-[var(--border-gold)] px-3 py-2 text-[11px] uppercase tracking-[1.2px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)]"
            >
              View Full Listing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
