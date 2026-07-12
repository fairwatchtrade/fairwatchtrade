"use client";

import { useEffect, useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   DIAL REVEAL — hover-activated contrast/brightness slider

   "Pull left and the MOP depth opens. Pull right and the printing surfaces.
   The detail was always there. FairWatchTrade just lets you see it."

   No zoom. No magnifying glass. A single CSS filter on the dial photo,
   controlled by one range input, visible only while hovering.

   WIRED (v1.58, via app/listings/[id]/page.tsx passing dialUrl to
   ListingGallery). The stale "not yet wired — see Bundle 3 flag" note is
   removed; this is live on the listing detail page now.

   z-30 ON THE SLIDER WRAPPER — fixes a real conflict found during wiring
   verification, not cosmetic. ListingGallery's hero container gives its
   prev/next tap zones an explicit z-20; this component's wrapper (and
   ListingGallery's own hero wrapper) never establish an isolated stacking
   context, so without an explicit z-index here the slider's "auto" layer
   loses to the tap zones' explicit z-20 regardless of DOM order — the tap
   zones would silently eat the slider's clicks across roughly its outer 40%
   on each side. z-30 wins that comparison. Scoped to the range input's own
   wrapper only — the tap zones' navigation is untouched everywhere else on
   the image.

   HOVER-CAPABILITY GATE — deliberate, not accidental (per product ruling).
   Touch devices have no real hover state; some touch browsers fire synthetic
   mouseenter/mouseleave on tap, which would produce a half-working, flickery
   version of this interaction. Rather than ship that, this component checks
   `(hover: hover) and (pointer: fine)` via matchMedia and simply never
   activates on devices that don't support genuine hover — touch devices see
   the plain dial photo, same as before this component existed. No tap-to-
   reveal alternative is implemented; that would be a separate, deliberate
   feature, not a fallback bolted on here.
   ──────────────────────────────────────────────────────────────────────── */

export default function DialReveal({
  photoUrl,
  className,
}: {
  photoUrl: string;
  className?: string;
}) {
  const [value, setValue] = useState(50); // 0-100, 50 = neutral
  const [active, setActive] = useState(false);

  // Starts false (matches server-rendered markup — no window at SSR time),
  // then set from matchMedia after mount. Safe default: if this never
  // resolves true, the component simply behaves like a plain image forever,
  // never a broken/flickery hover state.
  const [supportsHover, setSupportsHover] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setSupportsHover(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSupportsHover(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Map slider 0-100 to a contrast/brightness filter range.
  // 50 = neutral (no filter change). Below 50 pulls brightness down,
  // reveals shadow detail. Above 50 pushes contrast up, reveals
  // printing/guilloché on light dials.
  const brightness = 0.85 + (value / 100) * 0.3; // 0.85 to 1.15
  const contrast = 0.9 + (value / 100) * 0.4; // 0.9 to 1.3

  return (
    <div
      className="relative"
      data-dial-reveal
      onMouseEnter={() => {
        if (supportsHover) setActive(true);
      }}
      onMouseLeave={() => setActive(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt=""
        className={className ?? "w-full transition-[filter] duration-200"}
        style={{
          filter: active
            ? `brightness(${brightness}) contrast(${contrast})`
            : "none",
        }}
      />
      {active && (
        <div className="absolute inset-x-4 bottom-4 z-30">
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-full accent-[#C9A84C]"
          />
        </div>
      )}
    </div>
  );
}
