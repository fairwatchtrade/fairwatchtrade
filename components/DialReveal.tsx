"use client";

import { useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   DIAL REVEAL — hover-activated contrast/brightness slider (Phase 2)

   "Pull left and the MOP depth opens. Pull right and the printing surfaces.
   The detail was always there. FairWatchTrade just lets you see it."

   No zoom. No magnifying glass. A single CSS filter on the dial photo,
   controlled by one range input, visible only while hovering.

   Not yet wired into ListingGallery — see Bundle 3 flag. This component is
   self-contained and ready to be dropped in once that's resolved.
   ──────────────────────────────────────────────────────────────────────── */

export default function DialReveal({ photoUrl }: { photoUrl: string }) {
  const [value, setValue] = useState(50); // 0-100, 50 = neutral
  const [active, setActive] = useState(false);

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
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt=""
        className="w-full transition-[filter] duration-200"
        style={{
          filter: active
            ? `brightness(${brightness}) contrast(${contrast})`
            : "none",
        }}
      />
      {active && (
        <div className="absolute inset-x-4 bottom-4">
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
