"use client";

/* ────────────────────────────────────────────────────────────────────────
   CHAPTER WATCH — the companion illustration.

   A Swiss-patent / blueprint drawing of a watch that sits in the sticky right
   panel of Step 3. It has NO controls. The active layer is driven entirely by
   which chapter is in the viewport (see SellFlow's IntersectionObserver, which
   sets `active`). As the seller scrolls the six chapters, the matching region
   turns gold; everything else stays ghost-blueprint. Chapter VI fades the whole
   watch back to ghost and lights only a small document icon — "the story is
   complete."

   The governing invariant (GPT): at a glance the seller thinks "that's
   beautiful" and immediately returns to the form. If they stop to admire or
   interact with it, it was overbuilt. So: faint, no glow, no bounce, no motion —
   only a soft 250ms opacity fade. It is a companion, not a decoration.
   ──────────────────────────────────────────────────────────────────────── */

export type WatchChapter =
  | "movement"
  | "case"
  | "dial"
  | "wearing"
  | "complications"
  | "provenance"
  | null;

// Which drawn layers light for each chapter. Chapter VI ("provenance") lights
// nothing on the watch — only the document icon — so the watch reads as handed
// over, the paperwork the only thing that remains.
const LIT: Record<string, string[]> = {
  movement: ["movement", "case", "dial"],
  case: ["case", "lugs"],
  dial: ["dial"],
  wearing: ["strap", "lugs"],
  complications: ["complications"],
  provenance: [],
};

const REST = 0.06;
const ACTIVE = 0.55;
const GOLD = "#C9A84C";
const GHOST = "#E8E4DC";

export default function ChapterWatch({ active }: { active: WatchChapter }) {
  const lit = active ? LIT[active] ?? [] : [];
  const isLit = (layer: string) => lit.includes(layer);
  // A layer's stroke + opacity. Ghost at rest, gold + brighter when lit.
  const layer = (name: string) => ({
    stroke: isLit(name) ? GOLD : GHOST,
    opacity: isLit(name) ? ACTIVE : REST,
    transition: "stroke 250ms ease-out, opacity 250ms ease-out",
    fill: "none" as const,
  });
  const docLit = active === "provenance";

  return (
    <svg
      viewBox="0 0 460 600"
      className="pointer-events-none w-full select-none overflow-visible"
      aria-hidden="true"
    >
      {/* Construction circles + center marks — the blueprint scaffolding.
          Always at rest opacity; they are the "paper", not a chapter layer. */}
      <g style={{ stroke: GHOST, opacity: REST, fill: "none" }} strokeWidth={0.75}>
        <circle cx="230" cy="300" r="182" strokeDasharray="2 6" />
        <line x1="230" y1="92" x2="230" y2="508" strokeDasharray="2 6" />
        <line x1="22" y1="300" x2="438" y2="300" strokeDasharray="2 6" />
        <circle cx="230" cy="300" r="4" />
      </g>

      <g transform="translate(230 300) rotate(-16) translate(-230 -300)">
        {/* STRAP + clasp */}
        <g style={layer("strap")} strokeWidth={1.3}>
          <path d="M188 140 L272 140 L286 60 L200 60 Z" />
          <line x1="204" y1="86" x2="270" y2="86" />
          <line x1="204" y1="112" x2="270" y2="112" />
          <path d="M188 460 L272 460 L286 540 L200 540 Z" />
          <line x1="204" y1="488" x2="270" y2="488" />
          <line x1="204" y1="514" x2="270" y2="514" />
          <rect x="214" y="548" width="52" height="30" rx="3" />
          <line x1="240" y1="548" x2="240" y2="578" />
        </g>

        {/* LUGS */}
        <g style={layer("lugs")} strokeWidth={1.3}>
          <path d="M188 146 Q174 166 184 190" />
          <path d="M272 146 Q286 166 276 190" />
          <path d="M188 454 Q174 434 184 410" />
          <path d="M272 454 Q286 434 276 410" />
        </g>

        {/* CASE + crown */}
        <g style={layer("case")} strokeWidth={1.3}>
          <circle cx="230" cy="300" r="150" />
          <circle cx="230" cy="300" r="136" />
          <path d="M96 322 Q104 402 168 448" />
          <path d="M110 314 Q118 392 176 438" />
          <rect x="378" y="286" width="22" height="28" rx="2" />
          <line x1="380" y1="293" x2="398" y2="293" />
          <line x1="380" y1="300" x2="398" y2="300" />
          <line x1="380" y1="307" x2="398" y2="307" />
        </g>

        {/* DIAL + hands + indices */}
        <g style={layer("dial")} strokeWidth={1.3}>
          <circle cx="230" cy="300" r="116" />
          <line x1="230" y1="196" x2="230" y2="212" />
          <line x1="230" y1="388" x2="230" y2="404" />
          <line x1="126" y1="300" x2="142" y2="300" />
          <line x1="318" y1="300" x2="334" y2="300" />
          <line x1="230" y1="300" x2="230" y2="228" strokeWidth={1.8} />
          <line x1="230" y1="300" x2="282" y2="326" strokeWidth={1.8} />
          <circle cx="230" cy="300" r="5" />
        </g>

        {/* COMPLICATIONS / subdials */}
        <g style={layer("complications")} strokeWidth={1.3}>
          <circle cx="230" cy="352" r="28" />
          <line x1="230" y1="352" x2="230" y2="332" />
          <circle cx="188" cy="272" r="22" />
          <line x1="188" y1="272" x2="202" y2="262" />
          <circle cx="272" cy="272" r="22" />
          <line x1="272" y1="272" x2="258" y2="262" />
        </g>

        {/* MOVEMENT — ghost gear plate behind (Ch I "the whole watch") */}
        <g style={layer("movement")} strokeWidth={1.1}>
          <circle cx="230" cy="300" r="116" strokeDasharray="2 5" />
          <circle cx="196" cy="314" r="24" strokeDasharray="2 4" />
          <circle cx="270" cy="284" r="20" strokeDasharray="2 4" />
          <circle cx="238" cy="356" r="15" strokeDasharray="2 4" />
          <circle cx="196" cy="314" r="4" />
          <circle cx="270" cy="284" r="4" />
        </g>
      </g>

      {/* DOCUMENT ICON — only this lights on Ch VI. Three lines + a corner fold.
          "The story is complete." No fanfare. */}
      <g
        style={{
          stroke: docLit ? GOLD : GHOST,
          opacity: docLit ? ACTIVE : REST,
          transition: "stroke 250ms ease-out, opacity 250ms ease-out",
          fill: "none",
        }}
        strokeWidth={1.3}
      >
        <path d="M196 512 L252 512 L252 566 L196 566 Z" />
        <path d="M240 512 L252 524 L240 524 Z" />
        <line x1="206" y1="530" x2="242" y2="530" />
        <line x1="206" y1="542" x2="242" y2="542" />
        <line x1="206" y1="554" x2="228" y2="554" />
      </g>
    </svg>
  );
}
