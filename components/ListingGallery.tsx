"use client";

import { useState } from "react";

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
  modelLabel,
}: {
  photos: string[];
  initialIndex?: number;
  brandLabel: string;
  modelLabel: string | null;
}) {
  const safeInitial =
    initialIndex >= 0 && initialIndex < photos.length ? initialIndex : 0;
  const [active, setActive] = useState(safeInitial);

  if (photos.length === 0) return null;

  const heroUrl = photos[active] ?? photos[0];

  return (
    <div>
      {/* Hero — large, full-width */}
      <div className="relative w-full overflow-hidden rounded-lg border border-white/15 bg-[#0D0F14]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={heroUrl} alt="" className="max-h-[60vh] w-full rounded-lg object-cover object-top" />
        <div className="pointer-events-none absolute left-3 top-2 text-[10px] font-light uppercase tracking-[0.15em] text-[#E8E4DC]/60">
          {modelLabel ? `${brandLabel} ${modelLabel}` : brandLabel}
        </div>
      </div>

      {/* Remaining photos — scrollable horizontal thumbnail strip */}
      {photos.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) =>
            i === active ? null : (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`View photo ${i + 1}`}
                className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-white/15 transition hover:border-[#C9A84C]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
