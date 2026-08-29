/* ────────────────────────────────────────────────────────────────────────
   FOLDING LOUPE — the inspection mark

   ONE governed drawing, rendered at the detail the size can actually hold.
   This is not two icons and not a redesign: the small variant WITHHOLDS
   elements, it never adds or reinterprets any.

   WHY THE FULL DRAWING FAILS SMALL. At 18px the scale factor is 0.75, so:

     · the two lens rings sit 1.55 units apart — 1.16px — while the stroke
       drawing them is 1.35px. The gap is NARROWER THAN THE LINES, so two
       concentric rings cannot resolve; they merge into one smudge. That is
       geometry, not rendering quality, and it is the single biggest reason
       the full drawing reads as a squiggle on a card.
     · the hinge circle is 2.03px across with a 1.35px stroke — a dot, not a
       ring — and the slot inside it lands at 1.27px, invisible.
     · the glint is 1.17px long; its round caps alone are 1.35px, so it is a
       dot pretending to be a highlight.

   At 16px every one of those is worse (1.03px ring gap against a 1.2px
   stroke). Below the threshold those four elements are therefore omitted:
   they spend ink to produce mush.

   WHAT SURVIVES, and why it is enough: the outer lens ring reads as a clean
   7px circle once its twin is gone, the arm and the folded cover carry the
   silhouette, and the lower housing cue is what makes the object a FOLDING
   loupe rather than a plain magnifier. That cue is deliberately kept — it
   resolves at ~5.6px, and it is identity-bearing.

   The lens is NOT enlarged in the small variant, though that was permitted:
   the housing cue begins 4.79 units from the lens centre, so any enlargement
   past r≈4.8 buries it inside the ring. The cue is worth more than the
   millimetre.

   At 22px and above the full drawing renders exactly as delivered.

   STROKED, not filled. `stroke="currentColor"` with `fill="none"` means the
   mark inherits whatever state its button is in — charcoal at rest, gold on
   hover, focus, and while the panel is open. A filled multi-tone drawing
   would have frozen that. The stroke scales with the icon, so its weight is
   proportionally identical at every size.

   One component feeds Listing Detail (24px), the Browse card (18px) and the
   Quick Specs panel heading (16px). The `⌕` marks on the Browse search field
   and in Marketplace Control are a different affordance and are not this.
   ──────────────────────────────────────────────────────────────────────── */

export default function LoupeIcon({
  size = 19,
  className,
}: {
  size?: number;
  className?: string;
}) {
  /* The threshold is where the ring gap finally clears the stroke weight.
     16px and 18px fall below it; 24px sits above. */
  const detailed = size >= 22;

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
      {/* Lens — the outer bezel always reads. */}
      <circle cx="7.5" cy="7.2" r="4.7" />

      {/* Inner glass ring: only where it can sit clear of its twin. */}
      {detailed && <circle cx="7.5" cy="7.2" r="3.15" />}

      {/* Glint: 1.17px below the threshold, shorter than its own round caps. */}
      {detailed && <path d="M5.55 5.45 6.65 4.35" />}

      {/* Folding arm, lens to hinge — both edges of the taper. */}
      <path d="M10.95 10.4 12.55 12.1" />
      <path d="M10.45 4.8 13.35 11.25" />

      {/* Hinge and its slot: a 2px circle drawn with a 1.35px stroke is a
          blob, so both are withheld small. The arm's round caps close the
          gap to the cover on their own at that size. */}
      {detailed && <circle cx="13.55" cy="12.45" r="1.35" />}
      {detailed && <path d="M12.95 13.05 14.15 11.85" />}

      {/* Folded cover / handle — the silhouette that carries the object. */}
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

      {/* Lower lens housing cue — kept at every size. This is what says
          FOLDING loupe rather than magnifying glass. */}
      <path
        d="M3.65 10.05
           C4.4 11.95 6.1 13.05 8.15 12.9
           C9.3 12.85 10.35 12.5 11.2 11.85"
      />
    </svg>
  );
}
