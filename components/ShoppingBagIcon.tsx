/* ────────────────────────────────────────────────────────────────────────
   SHOPPING BAG ICON — the locked Design Gate mark
   (Accepted Purchase Continuity + Shopping Bag, 2026-09-11)

   Drawn to the founder-locked Design Gate image handed on 2026-09-11: a
   graphite shopping-bag in linework — rounded handle
   ending in two rivet dots, a fold line down the left face — with a warm
   FairWatchTrade gold disc carrying a white check, overlapping the bag's
   bottom-right corner.

   The check is celebratory acceptance meaning: SELLER SAID YES / YOU GOT
   IT. It is not payment-complete semantics, and it is part of the icon
   whenever the icon renders — a member count sits beside the mark and
   never on top of the disc.

   This is not persistent site furniture: the entrance that mounts it
   renders only when the buyer has a Bag (or when membership could not be
   established). No generic cart glyph is substituted for it anywhere.

   currentColor drives the bag line, so the entrance's colour states
   (resting / hover / active) apply to the linework while the gold disc
   stays gold: the disc is the meaning, the line is the control.
   ──────────────────────────────────────────────────────────────────────── */

export default function ShoppingBagIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      data-shopping-bag-icon=""
    >
      {/* Bag body: a slight taper, open at the bottom-right where the disc sits. */}
      <path
        d="M4.9 8.1h13.2l1.05 7.2M4.9 8.1L3.4 19.5c-.06.5.32.9.82.9H12.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left fold line. */}
      <path d="M6.7 8.1L5.9 20.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
      {/* Handle with rivets. */}
      <path d="M8.3 8.1V6.4a3.7 3.7 0 0 1 7.4 0v1.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8.3" cy="9.3" r="0.95" fill="currentColor" />
      <circle cx="15.7" cy="9.3" r="0.95" fill="currentColor" />
      {/* The gold acceptance disc, white check. Painted last so it sits over
          the bag's corner exactly as the gate image has it. */}
      <circle cx="17.6" cy="17.4" r="4.6" fill="#B08D3E" data-shopping-bag-check="" />
      <path d="M15.4 17.5l1.5 1.5 3-3.1" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
