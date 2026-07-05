"use client";

/* ────────────────────────────────────────────────────────────────────────
   ALIGNMENT OVERLAY — components/AlignmentOverlay.tsx   (v2.2)

   SVG silhouette rendered absolutely over the live camera feed. A GUIDE,
   never a gate: nothing here measures, blocks, or judges the frame. The
   seller frames loosely; the shutter always fires.

   Six variants matching the capture sequence: front, back, side, clasp,
   full, wrist. Deliberately minimal line work — Swiss patent-drawing
   restraint, not a camera app costume.

   Opacity: 0.4 at rest, 0.2 while the seller is actively framing (the
   parent passes `framing` from its touch/drag detection).
   ──────────────────────────────────────────────────────────────────────── */

export type OverlayVariant = "front" | "back" | "side" | "clasp" | "full" | "wrist";

const STROKE = "rgba(232,228,220,0.9)";
const W = 0.9; // stroke width in viewBox units

function Silhouette({ variant }: { variant: OverlayVariant }) {
  switch (variant) {
    case "front":
      // Dial-up: case circle, four lug stubs, crown nub at 3.
      return (
        <>
          <circle cx="50" cy="70" r="26" />
          <circle cx="50" cy="70" r="21" strokeDasharray="2 3" />
          <line x1="38" y1="46" x2="34" y2="38" />
          <line x1="62" y1="46" x2="66" y2="38" />
          <line x1="38" y1="94" x2="34" y2="102" />
          <line x1="62" y1="94" x2="66" y2="102" />
          <path d="M 76,68 h 5 v 4 h -5" />
        </>
      );
    case "back":
      // Caseback: case circle + inner back circle.
      return (
        <>
          <circle cx="50" cy="70" r="26" />
          <circle cx="50" cy="70" r="16" />
          <line x1="38" y1="46" x2="34" y2="38" />
          <line x1="62" y1="46" x2="66" y2="38" />
          <line x1="38" y1="94" x2="34" y2="102" />
          <line x1="62" y1="94" x2="66" y2="102" />
        </>
      );
    case "side":
      // Case profile lying on its side: slim body + crown nub.
      return (
        <>
          <rect x="18" y="62" width="58" height="16" rx="7" />
          <path d="M 76,66 h 6 v 8 h -6" />
          <line x1="24" y1="62" x2="24" y2="52" />
          <line x1="70" y1="62" x2="70" y2="52" />
          <line x1="24" y1="78" x2="24" y2="88" />
          <line x1="70" y1="78" x2="70" y2="88" />
        </>
      );
    case "clasp":
      // Clasp / buckle between two strap runs.
      return (
        <>
          <rect x="40" y="24" width="20" height="28" rx="3" />
          <rect x="36" y="56" width="28" height="30" rx="2" />
          <line x1="50" y1="56" x2="50" y2="86" />
          <rect x="40" y="90" width="20" height="28" rx="3" />
        </>
      );
    case "full":
      // Full length: head circle with strap bands extending both ways.
      return (
        <>
          <rect x="41" y="8" width="18" height="30" rx="3" />
          <circle cx="50" cy="70" r="22" />
          <rect x="41" y="102" width="18" height="30" rx="3" />
          <line x1="44" y1="20" x2="56" y2="20" />
          <line x1="44" y1="28" x2="56" y2="28" />
          <line x1="44" y1="112" x2="56" y2="112" />
          <line x1="44" y1="120" x2="56" y2="120" />
        </>
      );
    case "wrist":
      // On the wrist: wrist curve with the head sitting on it.
      return (
        <>
          <path d="M 14,96 C 32,80 68,80 86,96" />
          <path d="M 14,116 C 32,100 68,100 86,116" />
          <circle cx="50" cy="66" r="20" />
          <line x1="42" y1="48" x2="40" y2="42" />
          <line x1="58" y1="48" x2="60" y2="42" />
        </>
      );
  }
}

export default function AlignmentOverlay({
  variant,
  framing = false,
}: {
  variant: OverlayVariant;
  /** True while the seller is actively framing (touch/drag) — overlay recedes. */
  framing?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{
        opacity: framing ? 0.2 : 0.4,
        transition: "opacity 250ms ease",
      }}
    >
      <svg
        viewBox="0 0 100 140"
        fill="none"
        stroke={STROKE}
        strokeWidth={W}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ height: "72%", maxHeight: "72vh", width: "auto" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <Silhouette variant={variant} />
      </svg>
    </div>
  );
}
