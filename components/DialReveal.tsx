"use client";

import { useEffect, useId, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   DIAL REVEAL — DISCOVERY MODE  (v2.19)

   "The detail was always there. FairWatchTrade just lets you see it."

   Discovery, not announcement. At rest the collector sees an untouched
   photograph and one small muted-gold square in the lower-right corner.
   Nothing reacts to ordinary pointer movement across the image. Hovering
   the square alone offers "Click for Dial Reveal". Clicking it arms a short
   vertical EQ-style fader at the image's right edge; the fader ALONE drives
   reveal strength. Clicking again clears everything instantly.

   ── REPLACES THE RETIRED IMPLEMENTATION ────────────────────────────────
   This file supersedes the hover-activated version wholesale. Deliberately
   NOT carried forward, per the governing decision — not as fallback, not
   commented out, not behind a flag:
     · hover-driven reveal (onMouseEnter/onMouseLeave -> active)
     · the horizontal slider at inset-x-4 bottom-4
     · the permanent-ish "Dial Reveal · drag to adjust" copy
   (Third-visit activation and mouse-following were named in the brief but
   never existed in the old file — verified against the real source, nothing
   to remove.)

   ── THE ONE THING PRESERVED FROM THE OLD FILE ──────────────────────────
   The `(hover: hover) and (pointer: fine)` matchMedia gate. It is the whole
   reason touch devices don't get a half-working interaction, and it matters
   MORE now, not less: a checkbox toggle works fine on tap, so without this
   gate the new mechanism would SILENTLY ship a mobile Dial Reveal for the
   first time — a 16px target under every touch-target minimum, with a
   hover-only tooltip that can never appear. Mobile Dial Reveal is its own
   Design Gate. Until then, touch devices see the plain dial photograph,
   exactly as they do today. Starts false (matches server-rendered markup —
   no window at SSR); if it never resolves true the component is a plain
   image forever, which is the safe failure.

   ── z-30 IS INTEGRATION, NOT DECORATION ────────────────────────────────
   The approved study places the anchor and fader at z-index 9 — correct in
   the study, whose gallery shell has no other controls over the hero. The
   real gallery does: ListingGallery v1.23 renders explicit prev/next arrow
   BUTTONS, vertically centred at each edge, at z-10.

   z-30 keeps Dial Reveal above those arrows. That matters for two reasons,
   both real rather than theoretical:

     · PAINT. The arrows are positioned siblings rendered AFTER this
       component in the gallery's DOM, so at equal z-index the later sibling
       would paint over the anchor by DOM accident. An explicit z-30 settles
       the order by rule instead.

     · CLICKS. `max-h-[60vh]` + object-contain means a wide/short photo
       yields a SHORT hero, where the right arrow's vertical centre can fall
       inside the fader's 146px column. z-30 over the arrows' z-10 guarantees
       the square and fader win both the paint and the hit-test in that
       overlap — the anchor stays pressable and a fader drag can never leak
       through to "next photo".

   Neither this component's wrapper nor the gallery's hero wrapper opens an
   isolated stacking context, so the comparison is direct. Scoped to the
   anchor and fader wrapper ONLY — arrow navigation is untouched everywhere
   else on the image (verified: elementFromPoint at the square returns this
   component's checkbox; the arrows still advance one photo per press;
   dragging the fader never advances the photo).

   HISTORICAL NOTE, so it is not re-learned the hard way: the retired
   DialReveal's header claimed the gallery gave its old invisible tap zones
   "an explicit z-20". That was never true of ListingGallery v1.22, which
   contained no z-index at all. Those tap zones are gone entirely as of
   v1.23. Do not trust that claim if it resurfaces anywhere.

   ── FILTER: THE APPROVED STUDY GOVERNS ─────────────────────────────────
   Mechanism reused from the repo (CSS filter -> hero <img> inline style).
   Coefficients taken from the approved artifact verbatim, which is a
   DIFFERENT contract from the retired file's and deliberately so:
     old: 50 = neutral, bidirectional, brightness .85–1.15, contrast .9–1.3
     new: 0  = neutral, unidirectional, + saturation, default 46
   Discovery Mode only ever adds; it never pulls the photograph below the
   seller's own exposure.

   ── FADER PROPORTION ───────────────────────────────────────────────────
   146px on the study's 610px hero = 24%, inside the approved 20–25% band.
   The real hero is max-h-[60vh] (~600px at a 1000px viewport), so the fixed
   146px holds the approved proportion at the approved hero height rather
   than drifting with the viewport.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

const FADER_DEFAULT = 46;

/** Approved study's curve, verbatim. Unidirectional: 0 = untouched. */
function revealFilter(level: number): string {
  const v = Number(level) / 100;
  const brightness = 1 + v * 0.13;
  const contrast = 1 + v * 0.52;
  const saturation = 1 + v * 0.1;
  return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(
    3
  )}) saturate(${saturation.toFixed(3)})`;
}

export default function DialReveal({
  photoUrl,
  className,
}: {
  photoUrl: string;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  const [level, setLevel] = useState(FADER_DEFAULT);
  const [tooltipSuppressed, setTooltipSuppressed] = useState(false);
  const [supportsHover, setSupportsHover] = useState(false);
  // v2.25 · MODE ARBITRATION — the mobile Collector's Drawer and Dial
  // Reveal are mutually exclusive (chain ruling). While the Drawer is open
  // this component SUSPENDS: reveal state resets and the controls unmount
  // entirely, so nothing beneath the Drawer is paintable, clickable, or
  // focusable (the old failure: our z-30 sat ABOVE the Drawer's overlay).
  // The channel is a window CustomEvent ("fwt:mobile-drawer", detail
  // {open}) dispatched by MobileCollectorsDrawer — loose coupling only:
  // no imports, no props, ListingGallery still knows nothing of either.
  const [suspended, setSuspended] = useState(false);
  const anchorRef = useRef<HTMLLabelElement>(null);
  const faderId = useId();

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setSupportsHover(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSupportsHover(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const onDrawer = (e: Event) => {
      const open = (e as CustomEvent<{ open?: boolean }>).detail?.open === true;
      setSuspended(open);
      if (open) {
        // Opening the Drawer RESETS Dial Reveal — closing it later returns
        // the gallery to a clean neutral state, never half-active.
        setActive(false);
        setLevel(FADER_DEFAULT);
        setTooltipSuppressed(false);
      }
    };
    window.addEventListener("fwt:mobile-drawer", onDrawer);
    return () => window.removeEventListener("fwt:mobile-drawer", onDrawer);
  }, []);

  // Touch / coarse pointer: the plain photograph, same as before this
  // component existed. No anchor, no fader, no filter, nothing to discover.
  // v2.25: an open mobile Drawer takes the same path — suspension means the
  // photograph and ONLY the photograph.
  if (!supportsHover || suspended) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" className={className ?? "w-full"} />
    );
  }

  /* Deactivation suppresses the tooltip IMMEDIATELY — it must not reappear
     just because the pointer happens to still be resting on the square.
     Only a fresh hover (pointer leaves and re-enters) or fresh focus clears
     the suppression. */
  function toggle() {
    setActive((wasActive) => {
      const nowActive = !wasActive;
      setTooltipSuppressed(!nowActive);
      return nowActive;
    });
  }

  return (
    <div className="relative" data-dial-reveal>
      <style>{`
        .fwt-dial-fader{-webkit-appearance:none;appearance:none;background:transparent;cursor:ns-resize}
        .fwt-dial-fader::-webkit-slider-runnable-track{height:2px;background:rgba(232,228,220,.20);border:0}
        .fwt-dial-fader::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:8px;margin-top:-3px;border:1px solid rgba(201,168,76,.88);background:#171A21;box-shadow:0 0 0 1px rgba(13,15,20,.55),0 0 10px rgba(201,168,76,.10)}
        .fwt-dial-fader::-moz-range-track{height:2px;background:rgba(232,228,220,.20);border:0}
        .fwt-dial-fader::-moz-range-thumb{width:18px;height:8px;border-radius:0;border:1px solid rgba(201,168,76,.88);background:#171A21}
        .fwt-dial-fader:focus-visible{outline:1px solid #C9A84C;outline-offset:5px}
      `}</style>

      {/* HERO — the only thing the fader touches. Ordinary pointer movement
          across this image does nothing: there are no pointer handlers here
          at all, by design. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt=""
        className={className ?? "w-full transition-[filter] duration-200"}
        style={{ filter: active ? revealFilter(level) : "none" }}
      />

      {/* VERTICAL FADER — right edge, above the anchor. Mounted only while
          active, so deactivation removes it immediately rather than fading
          a still-present control. 36 × 146 plate; the 118px range input
          rotated -90deg fills it vertically (up = more reveal). z-30: see
          header. */}
      {active && (
        <div className="absolute bottom-[48px] right-[8px] z-30 flex h-[146px] w-[36px] items-center justify-center">
          {/* smoked-glass plate */}
          <div className="pointer-events-none absolute inset-0 border border-[rgba(232,228,220,0.09)] bg-[rgba(13,15,20,0.28)] shadow-[0_12px_28px_rgba(0,0,0,0.18)] backdrop-blur-[8px]" />
          {/* tick marks — vertical rhythm only. NOT a boundary line: it never
              crosses the photograph, it lives inside the 36px plate. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[17px] left-[9px] right-[9px] top-[17px] opacity-45 [background:repeating-linear-gradient(to_bottom,rgba(232,228,220,0.16)_0_1px,transparent_1px_20px)]"
          />
          <input
            id={faderId}
            type="range"
            min={0}
            max={100}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            aria-label="Dial Reveal level"
            className="fwt-dial-fader relative z-[2] m-0 h-[18px] w-[118px] rotate-[-90deg]"
          />
        </div>
      )}

      {/* ANCHOR — one 16px square, lower-right. The checkbox is the control;
          the square is its visible box; the label is the hit area. This gives
          click-to-toggle, Space/Enter activation, and :focus-visible for
          free, without inventing a keyboard handler. z-30: see header. */}
      <label
        ref={anchorRef}
        className="group absolute bottom-[18px] right-[18px] z-30 h-[16px] w-[16px]"
        onMouseLeave={() => setTooltipSuppressed(false)}
        onBlur={() => {
          if (!anchorRef.current?.matches(":hover")) setTooltipSuppressed(false);
        }}
      >
        <input
          type="checkbox"
          checked={active}
          onChange={toggle}
          aria-label="Dial Reveal"
          className="peer absolute inset-0 m-0 h-[16px] w-[16px] cursor-pointer opacity-0"
        />

        {/* the square itself — resting outline, then full gold with a centred
            dot when active (approved study's active state, verbatim) */}
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none absolute inset-0 border transition-[background,border-color,box-shadow] duration-150",
            "peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[#C9A84C]",
            active
              ? "border-[rgba(201,168,76,0.90)] bg-[rgba(201,168,76,0.10)] shadow-[0_0_12px_rgba(201,168,76,0.10)]"
              : "border-[rgba(201,168,76,0.58)] bg-[rgba(13,15,20,0.30)] shadow-[0_0_0_1px_rgba(13,15,20,0.40)]",
          ].join(" ")}
        >
          <span
            className={[
              "absolute inset-[4px] bg-[var(--gold)] transition-[opacity,transform] duration-150",
              active ? "scale-100 opacity-[0.72]" : "scale-[0.55] opacity-0",
            ].join(" ")}
          />
        </span>

        {/* TOOLTIP — the only copy this feature ever shows, and only from a
            direct hover/focus on the square. Never permanent, never during
            an active reveal, never lingering after deactivation. */}
        <span
          role="tooltip"
          className={[
            "pointer-events-none absolute bottom-[-2px] right-[24px] whitespace-nowrap",
            "border border-[rgba(232,228,220,0.10)] bg-[rgba(13,15,20,0.96)] px-[9px] py-[7px]",
            "text-[10px] text-[var(--dim,#BFC5D2)]",
            "translate-x-[4px] opacity-0 transition-[opacity,transform] duration-150",
            active || tooltipSuppressed
              ? ""
              : "group-hover:translate-x-0 group-hover:opacity-100 peer-focus-visible:translate-x-0 peer-focus-visible:opacity-100",
          ].join(" ")}
        >
          Click for Dial Reveal
        </span>
      </label>
    </div>
  );
}
