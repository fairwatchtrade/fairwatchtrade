"use client";

import { useEffect, useState, type CSSProperties } from "react";

/* ════════════════════════════════════════════════════════════════════════
   THE ENGINEERING PLATE — components/WatchBlueprint.tsx   (v1.88)

   FairWatchTrade's canonical visual language: a technical drawing of a watch in
   quartering view, Swiss patent-filing aesthetic — not a product render.
   Infrastructure, not artwork. The bar: at a glance someone thinks "that's
   beautiful" and returns to the form. If they stop to admire it, it's overbuilt.

   Ten named layers, each a <g id="bp-*">. Three states per layer (ghost /
   completed / active) driven purely by the `completed` and `active` props, with
   a 250ms transition. The wrapper carries a static rotate(-15deg) for the
   quartering view. The only motion is the caseback flip: when active === "case"
   and autoRotateOnCaseback is set, the plate turns over (rotateY 165°, composed
   with the -15° tilt), 350ms ease, then settles.

   V-split: autoRotateOnCaseback ships now. `rotatable` (free drag) is v1.89 —
   accepted but inert. `view` switching and fuller `perspective` use are future —
   props accepted and defaulted now so no call site changes when they land.
   ════════════════════════════════════════════════════════════════════════ */

export type Layer =
  | "movement"
  | "case"
  | "dial"
  | "hands"
  | "crown"
  | "lugs"
  | "strap"
  | "clasp"
  | "complications"
  | "provenance";

export type View = "front-quarter" | "front" | "back-quarter" | "back";

export interface WatchBlueprintProps {
  /** Completed layers (faint gold), or "all" to complete every layer at once. */
  completed: Layer[] | "all";
  /** The single layer in focus (bright gold). Absent = nothing active. */
  active?: Layer;
  /** Face/angle. Default "front-quarter" — the only value used now; accepted
   *  and defaulted for a stable API as future surfaces need other defaults. */
  view?: View;
  /** v1.89 — accepted but inert here. No drag, no cursor change, no rotation. */
  rotatable?: boolean;
  /** When true and active === "case", the plate flips to reveal the caseback. */
  autoRotateOnCaseback?: boolean;
  /** CSS perspective (rem) for the 3D wrapper. Default 18. */
  perspective?: number;
}

export default function WatchBlueprint({
  completed,
  active,
  view = "front-quarter",
  rotatable = false,
  autoRotateOnCaseback = false,
  perspective = 18,
}: WatchBlueprintProps) {
  // `view` and `rotatable` are part of the locked API but inert in v1.88.
  // Referenced via void so they read as intentional, not forgotten.
  void view;
  void rotatable;

  // ── Caseback flip — the only motion ──
  const [rotation, setRotation] = useState(0); // rotateY, degrees
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (autoRotateOnCaseback && active === "case") {
      // Turn the plate over to reveal the caseback, then settle.
      setIsAnimating(true);
      setRotation(165);
      const t = setTimeout(() => setIsAnimating(false), 350);
      return () => clearTimeout(t);
    }
    // No other layer triggers rotation — return to the front-quarter (rotateY 0).
    // Animate the return (never snap) so the flip reads both ways.
    setIsAnimating(true);
    setRotation(0);
    const t = setTimeout(() => setIsAnimating(false), 350);
    return () => clearTimeout(t);
  }, [active, autoRotateOnCaseback]);

  function getLayerStyle(layer: Layer): CSSProperties {
    const isActive = active === layer;
    const isCompleted =
      completed === "all" ||
      (Array.isArray(completed) && completed.includes(layer));

    // Active wins over completed when a layer is both.
    if (isActive) {
      return {
        stroke: "#C9A84C",
        opacity: 0.65,
        transition: "stroke 250ms ease, opacity 250ms ease",
      };
    }
    if (isCompleted) {
      return {
        stroke: "#C9A84C",
        opacity: 0.2,
        transition: "stroke 250ms ease, opacity 250ms ease",
      };
    }
    return {
      stroke: "rgba(232,228,220,0.09)",
      opacity: 1,
      transition: "stroke 250ms ease, opacity 250ms ease",
    };
  }

  return (
    <div style={{ perspective: `${perspective}rem` }}>
      {/* Wrapper carries the static quartering tilt; the caseback flip composes
          rotateY onto it. Perspective lives on the parent so rotateY has depth. */}
      <div
        style={{
          transform: `rotate(-15deg) rotateY(${rotation}deg)`,
          transition: isAnimating ? "transform 350ms ease" : undefined,
          transformStyle: "preserve-3d",
        }}
      >
        <svg
          viewBox="0 0 240 420"
          fill="none"
          aria-hidden="true"
          preserveAspectRatio="xMidYMid meet"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            aspectRatio: "240 / 420",
          }}
        >
          {/* STRAP */}
          <g id="bp-strap" style={getLayerStyle("strap")} strokeWidth="0.8" fill="none">
            <rect x="94" y="32" width="52" height="72" rx="4" />
            <line x1="100" y1="48" x2="140" y2="48" />
            <line x1="100" y1="60" x2="140" y2="60" />
            <line x1="100" y1="72" x2="140" y2="72" />
            <rect x="94" y="316" width="52" height="68" rx="4" />
            <circle cx="120" cy="336" r="2.5" />
            <circle cx="120" cy="350" r="2.5" />
            <circle cx="120" cy="364" r="2.5" />
          </g>

          {/* CLASP */}
          <g id="bp-clasp" style={getLayerStyle("clasp")} strokeWidth="0.8" fill="none">
            <rect x="103" y="385" width="34" height="20" rx="2" />
            <line x1="120" y1="385" x2="120" y2="405" />
            <circle cx="120" cy="388" r="2.5" />
            <line x1="108" y1="396" x2="132" y2="396" />
          </g>

          {/* LUGS */}
          <g id="bp-lugs" style={getLayerStyle("lugs")} strokeWidth="0.8" fill="none">
            <path d="M 94,104 L 84,116 L 82,134 L 96,134 L 97,118 L 104,104 Z" />
            <path d="M 146,104 L 156,116 L 158,134 L 144,134 L 143,118 L 136,104 Z" />
            <path d="M 94,276 L 84,288 L 82,306 L 96,306 L 97,292 L 104,276 Z" />
            <path d="M 146,276 L 156,288 L 158,306 L 144,306 L 143,292 L 136,276 Z" />
          </g>

          {/* CASE */}
          <g id="bp-case" style={getLayerStyle("case")} strokeWidth="0.8" fill="none">
            <circle cx="120" cy="210" r="76" />
            <circle cx="120" cy="210" r="70" />
            <circle cx="120" cy="210" r="63" />
          </g>

          {/* CROWN */}
          <g id="bp-crown" style={getLayerStyle("crown")} strokeWidth="0.8" fill="none">
            <path d="M 196,203 L 210,203 C 214,203 216,206 216,210 C 214,214 216,217 210,217 L 196,217 Z" />
            <line x1="199" y1="205" x2="199" y2="215" />
            <line x1="203" y1="205" x2="203" y2="215" />
            <line x1="207" y1="205" x2="207" y2="215" />
          </g>

          {/* DIAL */}
          <g id="bp-dial" style={getLayerStyle("dial")} strokeWidth="0.8" fill="none">
            <circle cx="120" cy="210" r="56" />
            <line x1="120" y1="156" x2="120" y2="163" />
            <line x1="174" y1="210" x2="167" y2="210" />
            <line x1="120" y1="264" x2="120" y2="257" />
            <line x1="66" y1="210" x2="73" y2="210" />
            <circle cx="120" cy="210" r="50" strokeDasharray="2 4" />
          </g>

          {/* MOVEMENT */}
          <g id="bp-movement" style={getLayerStyle("movement")} strokeWidth="0.8" fill="none">
            <circle cx="108" cy="198" r="22" />
            <circle cx="134" cy="194" r="15" />
            <circle cx="144" cy="214" r="11" />
            <path d="M 88,182 C 102,174 128,172 144,186" />
            <path d="M 98,178 A 24,24 0 0 1 132,178" strokeDasharray="3 3" />
          </g>

          {/* HANDS */}
          <g id="bp-hands" style={getLayerStyle("hands")} strokeWidth="0.8" fill="none">
            <line x1="120" y1="210" x2="96" y2="178" />
            <line x1="120" y1="210" x2="154" y2="176" />
            <line x1="120" y1="218" x2="120" y2="163" />
            <circle cx="120" cy="210" r="3.5" />
          </g>

          {/* COMPLICATIONS */}
          <g id="bp-complications" style={getLayerStyle("complications")} strokeWidth="0.8" fill="none">
            <circle cx="120" cy="252" r="16" />
            <line x1="120" y1="240" x2="120" y2="237" />
            <rect x="162" y="204" width="14" height="12" rx="1" />
            <path d="M 107,168 A 13,4 0 0 1 133,168" />
            <line x1="120" y1="165" x2="126" y2="170" />
          </g>

          {/* PROVENANCE
              The title block of a technical blueprint — the authentication /
              specification block bottom-right on every engineering drawing ever
              made. Three lines of different lengths, a corner fold. The collector
              who knows technical drawings recognizes it; the one who doesn't
              reads it as "paperwork" — exactly right. Last layer to light; when
              it goes gold the story is complete. Not a physical part of the
              watch — the record of its life. */}
          <g id="bp-provenance" style={getLayerStyle("provenance")} strokeWidth="0.8" fill="none">
            <rect x="158" y="340" width="68" height="52" rx="1" />
            <path d="M 210,340 L 226,340 L 226,356 Z" />
            <line x1="165" y1="354" x2="218" y2="354" />
            <line x1="165" y1="363" x2="218" y2="363" />
            <line x1="165" y1="372" x2="202" y2="372" />
            <line x1="165" y1="381" x2="210" y2="381" />
          </g>
        </svg>
      </div>
    </div>
  );
}
