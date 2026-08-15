/* ────────────────────────────────────────────────────────────────────────
   NAV ARROW MARK — the directional mark for photo navigation

   One drawing, everywhere photographs are stepped through: the Browse
   inspection and the listing gallery, resting and inspecting. `flip` mirrors
   it for the opposite direction rather than a second path, so "previous" and
   "next" can never drift apart the way two hand-kept drawings would.

   WHY A FILLED SILHOUETTE. It replaced a chevron sitting inside a dark disc.
   The disc existed to guarantee the stroke was visible over any photograph,
   and it cost the evidence: a slab of platform chrome parked on the watch.
   A solid shape carries its own presence at small sizes where fine strokes
   surrender, so the container is no longer earning anything and the mark can
   stand on the photograph alone. The shadow does the work the disc did —
   it keeps the mark readable over a bright dial or a busy background without
   putting a box between the collector and the object.

   Bare by law: no circle, no square, no button slab. The hit target belongs
   to the button around it, which stays generous while this stays quiet.
   ──────────────────────────────────────────────────────────────────────── */

export default function NavArrowMark({
  flip = false,
  width = 15,
  height = 20,
  className,
}: {
  /** Mirror for the previous direction. */
  flip?: boolean;
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 15 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
      className={className ?? "drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"}
    >
      <path d="M1 0 L15 10 L1 20 C5.2 15.4 5.2 4.6 1 0 Z" />
    </svg>
  );
}
