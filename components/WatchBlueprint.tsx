"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent } from "react";

/* ════════════════════════════════════════════════════════════════════════
   THE ENGINEERING PLATE — components/WatchBlueprint.tsx   (v2.39 · layered 3D)

   The platform's canonical illustration, now built from real spatial planes:
   the movement sits behind the dial, the hands above it, the crystal on top,
   the crown and lugs proud of the midcase. At rest the watch is nearly
   face-on (a −4° / 5° breath of tilt) so it reads as an object in space, not
   a flat diagram. When `rotatable`, a gentle drag turns the physical watch
   core — revealing the layered mechanics — while the provenance papers stay
   fixed beside it.

   Illumination (unchanged law): ghost at rest, faint gold when completed,
   brighter gold + a whisper of glow when active. Fine dial details
   (five-minute markers, chronograph subdials, date) appear ONLY when the
   active chapter needs them (`details`); the one-minute track exists but is
   never shown. Single-focus, informative, never the hero.

   Locked rotation spec (Layout Duck's Step-III gate): yaw ±30°, pitch ±16°,
   8px threshold, holds on release — no inertia, no auto-return, no bounce, no
   handle/hint/cursor/copy. The papers never rotate.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type Region =
  | "strap"
  | "clasp"
  | "lugs"
  | "case"
  | "crown"
  | "dial"
  | "hands"
  | "movement"
  | "glass"
  | "provenance";

export type Detail = "5min" | "minute-track" | "chrono" | "date";

/** Props still speak "layers" — regions plus the toggle-able fine details. */
export type Layer = Region | Detail;

const DETAIL_IDS: ReadonlySet<string> = new Set([
  "5min",
  "minute-track",
  "chrono",
  "date",
]);

/* Resting pose + locked drag spec. */
const REST_RX = -4;
const REST_RY = 5;
const YAW = 30;
const PITCH = 16;
const THRESHOLD = 8;
const SENSITIVITY = 0.28;

const STROKE_GHOST = "rgba(232,228,220,0.09)";
const STROKE_COMPLETED = "#c9a84c";
const STROKE_ACTIVE = "#e0c56f";

export interface WatchBlueprintProps {
  /** Completed regions (faint gold), or "all" to complete every layer. */
  completed: Layer[] | "all";
  /** The layer(s) in focus (brighter gold + glow). */
  active?: Layer | Layer[];
  /** Which fine-detail groups are visible (5min / chrono / date). Absent = none. */
  details?: Detail[];
  /** Enable the physical-core drag rotation (Details step only). */
  rotatable?: boolean;
  /** CSS perspective in px for the 3D scene. Default 650. */
  perspective?: number;
}

export default function WatchBlueprint({
  completed,
  active,
  details = [],
  rotatable = false,
  perspective = 650,
}: WatchBlueprintProps) {
  const coreRef = useRef<HTMLDivElement>(null);
  const hourHandRef = useRef<SVGGElement>(null);
  const minHandRef = useRef<SVGGElement>(null);
  const drag = useRef({
    rx: 0,
    ry: 0,
    dragging: false,
    moved: false,
    sx: 0,
    sy: 0,
    srx: 0,
    sry: 0,
    pid: -1,
  });

  /* ── Live local time — hour & minute hands show the visitor's real time (same
        clock math as the homepage, app/page.tsx). Written IMPERATIVELY via refs,
        never React state, so a time tick can't re-render the core and wipe the
        Step-III drag rotation. The center chronograph seconds hand stays parked
        at 12 (chrono at rest) — no sweep. ── */
  useEffect(() => {
    const setHands = () => {
      const now = new Date();
      const h = now.getHours() % 12;
      const m = now.getMinutes();
      const s = now.getSeconds();
      hourHandRef.current?.setAttribute("transform", `rotate(${h * 30 + m * 0.5} 130 214)`);
      minHandRef.current?.setAttribute("transform", `rotate(${m * 6 + s * 0.1} 130 214)`);
    };
    setHands();
    const id = setInterval(setHands, 30000);
    return () => clearInterval(id);
  }, []);

  const isAll = completed === "all";
  const completedSet = new Set<string>(isAll ? [] : (completed as Layer[]));
  const activeSet = new Set<string>(
    Array.isArray(active) ? active : active ? [active] : []
  );
  const detailSet = new Set<string>(details);

  /* Per-region stroke state. Detail groups are hidden unless listed in
     `details`; everything else follows the ghost / completed / active law. */
  function groupStyle(id: Layer): CSSProperties {
    const base: CSSProperties = {
      fill: "none",
      transition: "stroke 250ms ease, opacity 250ms ease, filter 250ms ease",
    };
    if (DETAIL_IDS.has(id) && !detailSet.has(id)) {
      return { ...base, stroke: STROKE_GHOST, opacity: 0 };
    }
    if (activeSet.has(id)) {
      return {
        ...base,
        stroke: STROKE_ACTIVE,
        opacity: 0.65,
        filter: "drop-shadow(0 0 3px rgba(201,168,76,0.18))",
      };
    }
    if (isAll || completedSet.has(id)) {
      return { ...base, stroke: STROKE_COMPLETED, opacity: 0.34 };
    }
    return { ...base, stroke: STROKE_GHOST, opacity: 1 };
  }

  /* ── Drag — the physical core turns; the papers never do. Imperative CSS
        writes (no React state per move) keep pointer tracking smooth. ── */
  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!rotatable) return;
      if (!(e.target as Element).closest("[data-wb-hit]")) return;
      const d = drag.current;
      d.pid = e.pointerId;
      d.sx = e.clientX;
      d.sy = e.clientY;
      d.srx = d.rx;
      d.sry = d.ry;
      d.dragging = true;
      d.moved = false;
      if (coreRef.current) coreRef.current.style.transition = "none";
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [rotatable]
  );

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.dragging || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < THRESHOLD) return;
    d.moved = true;
    e.preventDefault();
    d.ry = Math.max(-YAW, Math.min(YAW, d.sry + dx * SENSITIVITY));
    d.rx = Math.max(-PITCH, Math.min(PITCH, d.srx - dy * SENSITIVITY));
    if (coreRef.current) {
      coreRef.current.style.transform = `rotateX(${REST_RX + d.rx}deg) rotateY(${REST_RY + d.ry}deg)`;
    }
  }, []);

  const endDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.dragging || e.pointerId !== d.pid) return;
    d.dragging = false;
    d.pid = -1;
    // Holds where it was left — no auto-return, no bounce.
    if (coreRef.current) {
      coreRef.current.style.transition = "transform 160ms cubic-bezier(.2,.75,.25,1)";
    }
  }, []);

  const planeStyle = (z: number): CSSProperties => ({
    position: "absolute",
    inset: 0,
    transformStyle: "preserve-3d",
    transform: `translateZ(${z}px)`,
    pointerEvents: "none",
  });
  const svgStyle: CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
    overflow: "visible",
  };
  const surfaceStyle: CSSProperties = {
    fill: "rgba(16,20,26,0.72)",
    stroke: "rgba(232,228,220,0.07)",
  };
  const G = { strokeWidth: 0.8, vectorEffect: "non-scaling-stroke" as const };

  return (
    <div
      style={{ position: "relative", width: "100%", aspectRatio: "260 / 430", perspective: `${perspective}px`, touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* ── The physical watch core — the only thing that rotates ── */}
      <div
        ref={coreRef}
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: `rotateX(${REST_RX}deg) rotateY(${REST_RY}deg)`,
          transition: "transform 160ms cubic-bezier(.2,.75,.25,1)",
        }}
      >
        {/* STRAP / rear form */}
        <div style={planeStyle(-24)}>
          <svg viewBox="0 0 260 430" fill="none" aria-hidden="true" style={svgStyle}>
            <g style={groupStyle("strap")} {...G}>
              <path d="M101 25 C94 57 94 92 99 121 L161 121 C166 92 166 57 159 25 C144 15 116 15 101 25 Z" />
              <path d="M99 301 C93 338 94 380 104 406 C118 416 142 416 156 406 C166 380 167 338 161 301 Z" />
              <path d="M108 34 C104 62 104 91 108 112" />
              <path d="M152 34 C156 62 156 91 152 112" />
              <path d="M108 311 C103 342 104 376 111 398" />
              <path d="M152 311 C157 342 156 376 149 398" />
              <circle cx="130" cy="333" r="2.5" />
              <circle cx="130" cy="349" r="2.5" />
              <circle cx="130" cy="365" r="2.5" />
            </g>
            <g style={groupStyle("clasp")} {...G}>
              <path d="M87 360 C77 354 72 343 76 333 L88 329 C92 341 93 351 87 360 Z" />
              <line x1="80" y1="336" x2="89" y2="348" />
              <rect x="96" y="73" width="14" height="30" rx="3" />
              <rect x="96" y="53" width="14" height="15" rx="3" />
            </g>
          </svg>
        </div>

        {/* MOVEMENT — behind the dial */}
        <div style={planeStyle(-13)}>
          <svg viewBox="0 0 260 430" fill="none" aria-hidden="true" style={svgStyle}>
            <g style={surfaceStyle}>
              <circle cx="130" cy="214" r="63" />
            </g>
            <g style={groupStyle("movement")} {...G}>
              <circle cx="111" cy="198" r="22" />
              <circle cx="146" cy="195" r="16" />
              <circle cx="151" cy="224" r="11" />
              <circle cx="119" cy="237" r="17" />
              <path d="M92 183 C111 168 145 168 164 188" />
              <path d="M96 249 C116 262 148 260 164 242" />
              {/* Centering crosshairs removed — they cluttered the dial and the
                  12↔6 line hid the parked second hand at 12. */}
              <circle cx="130" cy="214" r="5" />
            </g>
          </svg>
        </div>

        {/* MIDCASE + LUGS */}
        <div style={planeStyle(0)}>
          <svg viewBox="0 0 260 430" fill="none" aria-hidden="true" style={svgStyle}>
            <g style={groupStyle("lugs")} {...G}>
              <path d="M99 112 L84 124 L82 148 L101 145 L106 124 Z" />
              <path d="M161 112 L176 124 L178 148 L159 145 L154 124 Z" />
              <path d="M99 288 L84 300 L82 324 L101 321 L106 300 Z" />
              <path d="M161 288 L176 300 L178 324 L159 321 L154 300 Z" />
              <line x1="101" y1="122" x2="159" y2="122" />
              <line x1="101" y1="306" x2="159" y2="306" />
              <circle cx="102" cy="122" r="2" />
              <circle cx="158" cy="122" r="2" />
              <circle cx="102" cy="306" r="2" />
              <circle cx="158" cy="306" r="2" />
            </g>
            <g style={groupStyle("case")} {...G}>
              <circle cx="130" cy="214" r="82" />
              <circle cx="130" cy="214" r="75" />
            </g>
          </svg>
        </div>

        {/* CROWN — proud of the case */}
        <div style={planeStyle(5)}>
          <svg viewBox="0 0 260 430" fill="none" aria-hidden="true" style={svgStyle}>
            <g style={groupStyle("crown")} {...G}>
              {/* v2.41 tune — crown pulled in ~⅓ (was jutting to x235; now x227),
                  a snug fluted nub at 3 o'clock instead of a long stem. */}
              <path d="M212 204 L220 204 C224 204 227 208 227 214 C227 220 224 224 220 224 L212 224 Z" />
              <line x1="216" y1="207" x2="216" y2="221" />
              <line x1="219" y1="207" x2="219" y2="221" />
              <line x1="222" y1="207" x2="222" y2="221" />
            </g>
          </svg>
        </div>

        {/* DIAL + fine details */}
        <div style={planeStyle(8)}>
          <svg viewBox="0 0 260 430" fill="none" aria-hidden="true" style={svgStyle}>
            <g style={surfaceStyle}>
              <circle cx="130" cy="214" r="66" />
            </g>
            <g style={groupStyle("dial")} {...G}>
              <circle cx="130" cy="214" r="58" />
            </g>
            <g style={groupStyle("5min")} {...G}>
              <line x1="130" y1="158" x2="130" y2="166" />
              <line x1="186" y1="214" x2="178" y2="214" />
              <line x1="130" y1="270" x2="130" y2="262" />
              <line x1="74" y1="214" x2="82" y2="214" />
            </g>
            <g style={groupStyle("minute-track")} {...G}>
              <circle cx="130" cy="214" r="52" strokeDasharray="1.3 4.3" />
            </g>
            <g style={groupStyle("chrono")} {...G}>
              <circle cx="130" cy="251" r="14" />
              <circle cx="106" cy="196" r="13" />
              <circle cx="154" cy="196" r="13" />
            </g>
            <g style={groupStyle("date")} {...G}>
              <rect x="163" y="207" width="15" height="13" rx="1" />
            </g>
          </svg>
        </div>

        {/* HANDS — above the dial */}
        <div style={planeStyle(15)}>
          <svg viewBox="0 0 260 430" fill="none" aria-hidden="true" style={svgStyle}>
            <g style={groupStyle("hands")} {...G}>
              {/* Hour & minute drawn straight up (12), rotated to the visitor's
                  live local time imperatively (see effect above). Approved length
                  hierarchy kept: seconds 46 > minute 42 > hour 35. The center
                  chronograph seconds hand stays parked at 12 (chrono at rest). */}
              <g ref={hourHandRef}>
                <line x1="130" y1="214" x2="130" y2="179" />
              </g>
              <g ref={minHandRef}>
                <line x1="130" y1="214" x2="130" y2="172" />
              </g>
              <line x1="130" y1="222" x2="130" y2="168" />
              <circle cx="130" cy="214" r="3.5" />
            </g>
          </svg>
        </div>

        {/* CRYSTAL / BEZEL — top plane */}
        <div style={planeStyle(22)}>
          <svg viewBox="0 0 260 430" fill="none" aria-hidden="true" style={svgStyle}>
            <g style={groupStyle("glass")} {...G}>
              <circle cx="130" cy="214" r="67" />
              <path d="M82 177 C98 151 122 143 145 147" />
              <path d="M178 250 C162 274 139 282 116 279" />
            </g>
          </svg>
        </div>

        {/* Invisible hit surface — the drag target. Only present when rotatable. */}
        {rotatable && (
          <div style={{ position: "absolute", inset: 0, transform: "translateZ(25px)", pointerEvents: "auto" }}>
            <svg viewBox="0 0 260 430" fill="none" aria-hidden="true" style={svgStyle}>
              <g data-wb-hit="" style={{ fill: "transparent", stroke: "none", pointerEvents: "all" }}>
                <rect x="72" y="16" width="116" height="398" rx="22" />
                <circle cx="130" cy="214" r="98" />
                <rect x="204" y="193" width="38" height="44" rx="8" />
              </g>
            </svg>
          </div>
        )}
      </div>

      {/* ── Provenance papers — fixed beside the watch, never rotate ── */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <svg viewBox="0 0 260 430" fill="none" aria-hidden="true" style={svgStyle}>
          <g style={groupStyle("provenance")} {...G}>
            <rect x="172" y="343" width="66" height="49" rx="1" />
            <path d="M222 343 L238 343 L238 358 Z" />
            <line x1="179" y1="357" x2="230" y2="357" />
            <line x1="179" y1="366" x2="230" y2="366" />
            <line x1="179" y1="375" x2="216" y2="375" />
            <line x1="179" y1="384" x2="223" y2="384" />
          </g>
        </svg>
      </div>
    </div>
  );
}
