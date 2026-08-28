/* ────────────────────────────────────────────────────────────────────────
   FOLDING LOUPE — the inspection mark

   A purpose-built small-control drawing, optimised for 16px and verified at
   18px and 24px. It is NOT the previous artwork scaled down, and it is not a
   trace of one: the earlier licensed asset was a 1200×1200 filled illustration
   carrying a double-ring bezel, three lens hatches, a slotted hinge screw and
   a separate body outline. At an 18px control that is roughly a 70x reduction
   — its strokes land near a fifth of a pixel and collapse into grey mush. This
   drawing keeps the folding-loupe identity and spends its detail budget only
   where a mark that small can still hold it: two lens rings, ONE glint, the
   arm, the hinge, the folded cover, the end catch.

   STROKED, not filled, and deliberately so. `stroke="currentColor"` with
   `fill="none"` means the mark inherits whatever state its button is in —
   charcoal at rest, gold on hover, focus, and while the panel is open. A
   multi-tone or filled-colour drawing would have frozen that state language.

   The stroke is allowed to scale with the icon (no non-scaling-stroke): 1.8 in
   a 24 viewBox renders 1.8px at 24, 1.35px at 18, 1.2px at 16, so the weight
   stays proportionally identical at every size it is used.

   Geometry fits the box with room to spare — extents run 1.6 to 23.35 once the
   0.9 stroke half-width is counted — so nothing clips at any size.

   There is no second loupe drawing anywhere in the product; this one component
   feeds Listing Detail (24px), the Browse card (18px) and the Quick Specs
   panel heading (16px). The `⌕` marks on the Browse search field and in
   Marketplace Control are a different affordance and are not this.

   The size is the caller's business.
   ──────────────────────────────────────────────────────────────────────── */

export default function LoupeIcon({
  size = 19,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Lens — outer bezel and inner glass. */}
      <circle cx="7.5" cy="7.2" r="4.7" />
      <circle cx="7.5" cy="7.2" r="3.15" />

      {/* One glint. Two would merge into a smudge at 16px. */}
      <path d="M5.55 5.45 6.65 4.35" />

      {/* Folding arm, lens to hinge. */}
      <path d="M10.95 10.4 12.55 12.1" />
      <path d="M10.45 4.8 13.35 11.25" />

      {/* Hinge and its slot. */}
      <circle cx="13.55" cy="12.45" r="1.35" />
      <path d="M12.95 13.05 14.15 11.85" />

      {/* Folded cover / handle. */}
      <path
        d="M14.75 12.25
           C17.35 13.65 20.15 15.15 21.25 17.45
           C22.2 19.45 21.1 21.65 18.85 22.2
           C16.75 22.7 14.55 21.45 14.1 19.25
           C13.7 17.2 13.95 14.55 14.75 12.25Z"
      />

      {/* Small end catch. */}
      <path
        d="M21.1 18.6 C22 18.65 22.45 19.25 22.15 20.05
           C21.95 20.55 21.55 20.9 21.05 21.05"
      />

      {/* Lower lens housing cue — what makes it read as a folding loupe
          rather than a plain magnifier. */}
      <path
        d="M3.65 10.05
           C4.4 11.95 6.1 13.05 8.15 12.9
           C9.3 12.85 10.35 12.5 11.2 11.85"
      />
    </svg>
  );
}
