"use client";

/* ────────────────────────────────────────────────────────────────────────
   ALIGNMENT OVERLAY — components/AlignmentOverlay.tsx   (v2.2)

   SVG silhouette rendered absolutely over the live camera feed. A GUIDE,
   never a gate: nothing here measures, blocks, or judges the frame. The
   seller frames loosely; the shutter always fires.

   Seven variants matching the capture sequence: front (dial, with faint
   hands so it never reads as the caseback), back, crown-side and
   non-crown-side (the case edge seen end-on — crown+pushers as circular
   forms, or clean), clasp, full, wrist. Deliberately minimal line work —
   Swiss patent-drawing restraint, not a camera app costume.

   Opacity: 0.4 at rest, 0.2 while the seller is actively framing (the
   parent passes `framing` from its touch/drag detection).
   ──────────────────────────────────────────────────────────────────────── */

export type OverlayVariant =
  | "front"
  | "back"
  | "crown-side"
  | "non-crown-side"
  | "clasp"
  | "full"
  | "wrist";

const STROKE = "rgba(232,228,220,0.9)";
const W = 0.9; // stroke width in viewBox units

function Silhouette({ variant }: { variant: OverlayVariant }) {
  switch (variant) {
    case "front":
      // Dial-up: case circle, dashed chapter ring, four lug stubs, crown nub —
      // plus faint 10:10 hands so the FACE is never mistaken for the caseback.
      return (
        <>
          <circle cx="50" cy="70" r="26" />
          <circle cx="50" cy="70" r="21" strokeDasharray="2 3" />
          <line x1="38" y1="46" x2="34" y2="38" />
          <line x1="62" y1="46" x2="66" y2="38" />
          <line x1="38" y1="94" x2="34" y2="102" />
          <line x1="62" y1="94" x2="66" y2="102" />
          <path d="M 76,68 h 5 v 4 h -5" />
          {/* Faint hands — a subtle recognition cue, never a branded dial. */}
          <g opacity="0.5">
            <line x1="50" y1="70" x2="67" y2="60" />
            <line x1="50" y1="70" x2="39" y2="64" />
            <circle cx="50" cy="70" r="1.8" />
          </g>
        </>
      );
    case "back":
      // Caseback: case circle + inner back circle. No hands — that is the tell.
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
    case "crown-side":
      // Camera aimed straight at the CROWN edge — crown + pushers seen end-on
      // as circular forms on the case flank, centered. Not a side profile; the
      // guide says where to point the camera. Sized to fill the frame.
      return (
        <>
          <rect x="10" y="56" width="80" height="28" rx="14" />
          <rect x="15.5" y="61.5" width="69" height="17" rx="8.5" />
          <circle cx="50" cy="70" r="7.5" />
          <circle cx="50" cy="70" r="3.5" />
          <circle cx="31" cy="70" r="4" />
          <circle cx="69" cy="70" r="4" />
        </>
      );
    case "non-crown-side":
      // The opposite edge, same level camera angle — clean flank, no controls.
      // Its whole job is to be the crown-side's twin, minus the crown/pushers.
      return (
        <>
          <rect x="10" y="56" width="80" height="28" rx="14" />
          <rect x="15.5" y="61.5" width="69" height="17" rx="8.5" />
        </>
      );
    case "clasp":
      // Buckle / clasp is the hero: large central hardware, straps thin and
      // secondary, so the shot reads "photograph the fastening," not the strap.
      return (
        <>
          <rect x="44" y="14" width="12" height="42" rx="2" />
          <rect x="44" y="84" width="12" height="42" rx="2" />
          <rect x="28" y="52" width="44" height="36" rx="4" />
          <line x1="28" y1="70" x2="72" y2="70" />
          <rect x="44" y="52" width="12" height="6" rx="1" />
          <line x1="35" y1="60" x2="65" y2="60" />
        </>
      );
    case "full":
      // The whole watch: head is the hero, bracelet extended full length to a
      // small clasp at the end — clearly the complete piece, not a detail.
      return (
        <>
          <circle cx="50" cy="46" r="21" />
          <circle cx="50" cy="46" r="15" strokeDasharray="2 3" />
          <path d="M 71,44 h 4 v 4 h -4" />
          <rect x="42" y="67" width="16" height="50" rx="2" />
          <line x1="46" y1="80" x2="54" y2="80" />
          <line x1="46" y1="92" x2="54" y2="92" />
          <line x1="46" y1="104" x2="54" y2="104" />
          <rect x="43" y="119" width="14" height="14" rx="2" />
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
        style={{ height: "88%", maxHeight: "86vh", width: "auto" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <Silhouette variant={variant} />
      </svg>
    </div>
  );
}
