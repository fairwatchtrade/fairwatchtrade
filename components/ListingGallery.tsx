"use client";

import { useState } from "react";
import DialReveal from "@/components/DialReveal";

/* ────────────────────────────────────────────────────────────────────────
   LISTING GALLERY — buyer-facing photo viewer (v1.22)

   Client child of /listings/[id]. Renders a full-width hero and a scrollable
   strip of the REMAINING photos; clicking a thumbnail swaps it into the hero.
   The parent computes the initial hero index (first "Dial" photo, else 0) and
   passes plain public Blob URLs — no category labels are surfaced to buyers.
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

  return (
    <div>
      {/* Hero — large, full-width */}
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
        {/* Invisible tap zones — left 40% prev, right 40% next */}
        <div
          role="button"
          aria-label="Previous photo"
          onClick={() => setActive((i) => Math.max(0, i - 1))}
          className="absolute inset-y-0 left-0 w-2/5 cursor-pointer"
        />
        <div
          role="button"
          aria-label="Next photo"
          onClick={() => setActive((i) => Math.min(photos.length - 1, i + 1))}
          className="absolute inset-y-0 right-0 w-2/5 cursor-pointer"
        />
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
