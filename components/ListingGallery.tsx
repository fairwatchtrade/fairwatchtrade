"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import DialReveal from "@/components/DialReveal";
import FwtListingId from "@/components/FwtListingId";
import InspectionPhotoRail from "@/components/InspectionPhotoRail";
import InspectionViewport, { type InspectionControls } from "@/components/InspectionViewport";
import LoupeIcon from "@/components/LoupeIcon";
import NavArrowMark from "@/components/NavArrowMark";
import { cardImageSrc } from "@/lib/media/cardImage";

/* Geometry the inspection room shares with its own Tailwind classes. Kept
   here so the arithmetic and the paint cannot drift: STAGE_GUTTERS is the
   sm:pl-[4.5rem] + sm:pr-[4.5rem] that holds the arrows, ROOM_GAP is the
   min-[56rem]:gap-6 between stage and rail, RAIL_MIN is the rail column's
   own min-width, and WIDE_ROOM is the min-[56rem] breakpoint at which the
   rail becomes a column instead of a band. */
const STAGE_GUTTERS = 144;
const ROOM_GAP = 24;
const RAIL_MIN = 200;
const WIDE_ROOM = "56rem";

/* ────────────────────────────────────────────────────────────────────────
   LISTING GALLERY — buyer-facing photo viewer (v1.24)

   Client child of /listings/[id]. Renders a full-width hero and a scrollable
   strip of the REMAINING photos; clicking a thumbnail swaps it into the hero.
   The parent computes the initial hero index (first "Dial" photo, else 0) and
   passes plain public Blob URLs — no category labels are surfaced to buyers.

   ── v1.23: INVISIBLE TAP ZONES → EXPLICIT ARROWS ───────────────────────
   Removed: two `absolute inset-y-0 {left|right}-0 w-2/5` overlays that made
   80% of the hero a hidden click target. A collector clicking the photograph
   to look at the photograph got moved off it. The photo is now inert; only a
   deliberate press on a real arrow navigates.

   They were also `role="button"` DIVs — announced as buttons, focusable by
   nothing, activated by no key. The replacements are real <button> elements,
   so they are tabbable and Enter/Space-activated for free. This is a repair,
   not an addition: the old markup made an accessibility claim it didn't keep.

   Arrows are conditional, never decorative: left renders only when a previous
   photo exists, right only when a next one does. At the ends the arrow is not
   dimmed or disabled — it is absent, so the control's presence IS the
   affordance and there is nothing to press that does nothing.

   ── ARROWS SIT BELOW DIAL REVEAL (z-10 vs z-30) ────────────────────────
   Deliberate, not incidental. DialReveal's anchor and fader are z-30 and hug
   the photograph's lower-right; the right arrow is vertically centred in the
   stage at the same edge. On a tall photograph they never meet, but a wide,
   short one sits short inside the governed stage, and the arrow's vertical
   centre can fall inside the fader's 146px column. z-10 guarantees the fader
   and square keep both the paint and the click in that overlap — Dial Reveal
   stays fully operable, and a fader drag can never leak into "next photo".
   The arrow remains pressable everywhere it isn't underneath Dial Reveal.
   ──────────────────────────────────────────────────────────────────────── */

export default function ListingGallery({
  photos,
  initialIndex = 0,
  brandLabel,
  publicCode,
  dialUrl,
  desktopDrawer,
}: {
  photos: string[];
  initialIndex?: number;
  brandLabel: string;
  modelLabel: string | null;
  /* listings.public_code. The identifier follows the watch into inspection —
     a collector looking closely is exactly the collector about to write the
     code down. Null renders nothing; FwtListingId is not an authority. */
  publicCode?: string | null;
  dialUrl?: string | null;
  desktopDrawer?: ReactNode;
}) {
  /* ── WHY NO FOCAL FRAMING HERE (v3.7) ──────────────────────────────────
     The seller's hero CHOICE reaches this component, as initialIndex. Their
     focal point and zoom deliberately do NOT.

     This hero is `object-contain` inside max-h-[60vh]: the whole photograph is
     visible and nothing is cropped. There is no framing decision to honour,
     because there is no frame cutting anything off. Applying object-cover here
     to make the focal point "work" would introduce a crop that does not exist
     today and hide parts of the photograph from the buyer — subtracting
     evidence to improve presentation, which is precisely the trade the
     evidence law forbids.

     Framing applies where a crop is already happening and the seller is
     choosing WHICH part survives it: the Review card and the browse card. ── */
  const safeInitial =
    initialIndex >= 0 && initialIndex < photos.length ? initialIndex : 0;
  const [active, setActive] = useState(safeInitial);

  /* ── INSPECTION STATE (buyer-facing polish, 2026-08-13) ────────────────
     Condition judgment needs the photograph at inspection scale: dial,
     bezel, finishing, wear, scratches. When open, the image IS the
     interface — a fixed overlay where the photo takes the full viewport at
     its own aspect (object-contain, never cropped, no decorative
     treatment), with the same prev/next controls, the thumbnail strip, an
     obvious Close, and Escape. Body scroll is suspended while inspecting.

     This is a distinct state, not an enlarged thumbnail: the surrounding
     listing UI yields completely. The resting hero keeps v1.23's law —
     the photograph itself is inert; inspection opens only from the
     explicit Inspect control. Dial Reveal is a resting-hero instrument
     and deliberately does not follow into the overlay. */
  const [inspecting, setInspecting] = useState(false);
  /* The zoom controls live in the viewer header, not on the watch — so the
     viewport hands up an imperative handle rather than the header reaching
     into its geometry. */
  const zoomControlsRef = useRef<InspectionControls | null>(null);
  const [zoomState, setZoomState] = useState({ scale: 1, maxScale: 1 });
  /* Discovery is remembered for the session. Deriving the hint purely from
     "scale === 1" would bring it back every time the collector returned to
     Fit, which is nagging rather than teaching.

     A one-way latch, set from the viewport's own callback. Not an effect
     watching the scale — an effect would be a second render reacting to the
     first, and the rule against setState in effects is right about why that
     is worse. Not a ref either: this is read during render to decide what
     the room shows, and refs are not for that. */
  const [zoomDiscovered, setZoomDiscovered] = useState(false);
  const handleZoomState = useCallback((next: { scale: number; maxScale: number }) => {
    setZoomState(next);
    if (next.scale > 1) setZoomDiscovered(true);
  }, []);
  const showZoomHint =
    zoomState.maxScale > 1.01 && !zoomDiscovered && zoomState.scale <= 1;
  /* ── THE BOUNDED STAGE ─────────────────────────────────────────────────
     The stage is sized to the widest rectangle any photograph in THIS
     listing actually occupies, which is what lets the arrows sit on the
     stage's own edges and be both close to the watch and perfectly still.

     "ACTUALLY OCCUPIES" is doing the work. A photograph's rectangle is
     bounded by the room's height AND by the source's own pixels. Sizing from
     aspect ratio alone builds a stage that a low-resolution photograph
     cannot fill — which is the same sprawl, in a smaller box. */
  const roomRef = useRef<HTMLDivElement | null>(null);
  const stageAreaRef = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  /* Below this the rail is a band underneath and the stage is simply the
     screen: there is no leftover width to bound and nothing worth probing. */
  const [wideRoom, setWideRoom] = useState(false);
  const [naturals, setNaturals] = useState<Record<number, { w: number; h: number }>>({});

  useEffect(() => {
    if (!inspecting) return;
    const mq = window.matchMedia("(min-width: " + WIDE_ROOM + ")");
    const sync = () => setWideRoom(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [inspecting]);

  /* WIDTH from the room, HEIGHT from the stage area — deliberately two
     different elements. The room's width does not depend on the width this
     computes, so measuring it cannot feed back, and the stage area's height
     does not depend on its own width. Measuring width on the element whose
     width is about to be set is the trap being avoided. */
  useEffect(() => {
    const rowEl = roomRef.current;
    const areaEl = stageAreaRef.current;
    if (!inspecting || !rowEl || !areaEl) return;
    const measure = () => {
      const cs = getComputedStyle(rowEl);
      const num = (v: string) => parseFloat(v) || 0;
      const width = Math.max(0, rowEl.clientWidth - num(cs.paddingLeft) - num(cs.paddingRight));
      const height = areaEl.clientHeight;
      setRoom((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rowEl);
    ro.observe(areaEl);
    return () => ro.disconnect();
  }, [inspecting]);

  /* Desktop only, and deliberately: these are the full-size sources, and on a
     phone that is real bandwidth spent on a measurement the phone has no use
     for. On a desktop they are the very files the collector is about to page
     through, so the probe doubles as a preload. */
  useEffect(() => {
    if (!inspecting || !wideRoom) return;
    let cancelled = false;
    photos.forEach((url, i) => {
      const probe = new Image();
      probe.onload = () => {
        if (cancelled || !(probe.naturalWidth > 0) || !(probe.naturalHeight > 0)) return;
        setNaturals((prev) =>
          prev[i] ? prev : { ...prev, [i]: { w: probe.naturalWidth, h: probe.naturalHeight } }
        );
      };
      probe.src = url;
    });
    return () => {
      cancelled = true;
    };
  }, [inspecting, wideRoom, photos]);

  const stageWidth = useMemo(() => {
    if (!wideRoom || !(room.width > 0) || !(room.height > 0)) return 0;
    /* Reserved against the rail's MINIMUM, never its rendered width — the
       rail grows into whatever this leaves behind, so reading its actual
       width here would be reading a number this line is about to decide. */
    const available = room.width - RAIL_MIN - ROOM_GAP - STAGE_GUTTERS;
    if (!(available > 0)) return 0;
    const measured = photos.map((_, i) => naturals[i]);
    /* Until every photograph has reported, the stage stays as wide as the
       room allows. Bounding on a partial set would size the room to whichever
       files happened to load first, and then move it when the rest arrived. */
    if (measured.some((n) => !n)) return available;
    /* THE MEDIAN, not the widest — this is the part that was wrong first
       time. Sizing to the widest photograph hands the whole room to a single
       outlier: one 16:9 shot among nine portraits set a 984px stage and put
       the arrows 213px from every watch in the listing, which is exactly the
       sprawl this was built to end. The median sizes the stage to the TYPICAL
       photograph, so it is hostage to neither an extreme landscape nor an
       extreme portrait.

       What that costs, stated plainly: a photograph wider than the stage is
       width-bound and renders shorter than the room could technically show
       it. It is not cropped, and inspection zoom reaches the detail. The
       majority fill the stage exactly and the arrows sit against them. */
    const fits = measured
      .map((n) => Math.min(room.height * (n.w / n.h), n.w))
      .sort((a, b) => a - b);
    const typical = fits[Math.floor(fits.length / 2)];
    return Math.min(available, Math.max(1, Math.round(typical)));
  }, [wideRoom, room.width, room.height, photos, naturals]);

  /* Focus return (new this round — it did not exist before, and closing the
     viewer dropped focus to the top of the document). The Inspect control is
     the ONE invoker, so the ref is a single element rather than a registry.
     Restoring on the falling edge, guarded by a flag, is the proven pattern
     from the handoff panel: restoring inside the close handler races the
     unmount, and restoring on every render would steal focus from a
     collector who has since tabbed elsewhere. */
  const inspectOpenerRef = useRef<HTMLButtonElement | null>(null);
  const restoreOpenerFocusRef = useRef(false);
  useEffect(() => {
    if (inspecting) {
      restoreOpenerFocusRef.current = true;
      return;
    }
    if (restoreOpenerFocusRef.current) {
      restoreOpenerFocusRef.current = false;
      inspectOpenerRef.current?.focus();
    }
  }, [inspecting]);

  /* THE INSPECTION ROOM CYCLES; the resting hero above still stops at the
     ends. In a room whose whole purpose is looking through a set, an arrow
     that dies at the last photograph is just a control that stopped working.
     Cycling also means both arrows are always present, so neither can appear
     or vanish — which matters here, where nothing else moves either. */
  const canCycle = photos.length > 1;
  const cycle = useCallback(
    (step: number) =>
      setActive((i) => (photos.length ? (i + step + photos.length) % photos.length : 0)),
    [photos.length]
  );

  useEffect(() => {
    if (!inspecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspecting(false);
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [inspecting, cycle]);

  /* The arrow frame must be the rendered photograph, not merely the column.
     A governed stage can be height-limited or width-limited depending on both
     viewport and source proportions, so one fixed CSS dimension cannot
     describe that rectangle without distorting some photographs. Reading the
     active source's intrinsic ratio lets the neutral wrapper take the largest
     uncropped rectangle that fits both constraints. The outer stage remains
     fixed, so discovering the ratio never moves the listing below it. */
  const heroUrl = photos[active] ?? photos[0] ?? "";
  const [heroAspect, setHeroAspect] = useState(1);
  /* The same probe already knows the source's real pixel size; the viewer
     uses it as a ceiling so a generous room can never enlarge a photograph
     past the detail it actually contains. Zero until known, which reads as
     "no ceiling yet" below. */
  const [heroNatural, setHeroNatural] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!heroUrl) return;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setHeroAspect(probe.naturalWidth / probe.naturalHeight);
        setHeroNatural({ w: probe.naturalWidth, h: probe.naturalHeight });
      }
    };
    probe.src = heroUrl;
    return () => {
      cancelled = true;
    };
  }, [heroUrl]);

  if (photos.length === 0) return null;

  /* Truthful alt identity from the listing itself. It names WHICH photograph
     of which watch, and claims nothing about what is visible in it — a
     description of the image content would be a visual claim nobody here is
     in a position to make. */
  const inspectionAlt = `${brandLabel} — photograph ${active + 1} of ${photos.length}`;

  const hasPrev = active > 0;
  const hasNext = active < photos.length - 1;

  /* Muted at rest, firmer on hover — legible over a dark caseback or a white
     dial without becoming furniture. Identical for both arrows; only the
     chevron and the edge differ. */
  /* v4.98 — the disc is gone. It existed to guarantee a thin chevron stayed
     visible over any photograph, and it paid for that with a slab of
     platform chrome parked on the watch. The mark is a filled silhouette
     now (see NavArrowMark), which carries itself at this size, so the
     container is no longer earning anything. Its shadow does the disc's old
     job without standing between the collector and the object.

     z-10 vs DialReveal's z-30 is UNCHANGED and still deliberate: on a wide,
     short photograph the vertically-centred right arrow can fall inside the
     fader's column, and DialReveal must keep both the paint and the click
     there. Removing the disc does not change that ordering. */
  /* The light room's arrows stand in the MARGIN, not on the photograph, so
     they cannot borrow --on-photo-text: that token is a cream (#D9D2BF)
     shaped for sitting over an image, and on a near-white wall it all but
     disappears. Same geometry and same 44px target as the resting hero's
     arrows; the ink is the room's own. */
  /* Quiet, but a control rather than metadata: --platinum-dim on a real
     border, a visible focus ring, and a 32px target. The readability floor
     applies to functional text however small the button is. */
  const zoomBtn =
    "grid h-8 w-8 place-items-center border border-[var(--border-mid)] text-[13px] " +
    "text-[var(--platinum-dim)] transition hover:border-[var(--border-gold)] hover:text-[var(--gold)] " +
    "disabled:cursor-not-allowed disabled:opacity-40 " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]";

  const roomArrowClass =
    "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center " +
    "text-[var(--platinum-dim)] transition hover:text-[var(--gold)] " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 " +
    "focus-visible:outline-[var(--gold)]";

  const arrowClass =
    "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center " +
    "text-[var(--on-photo-text)] transition hover:text-[var(--on-photo-gold)] " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 " +
    "focus-visible:outline-[var(--gold)]";

  return (
    /* The gallery owns its responsive width; the page grid only tells it the
       maximum space physically available. From the 896px two-column floor
       upward, `viewport - 378px` follows the established gutters, 224px
       minimum rail, 24px gap and measured scrollbar allowance, capped at the
       approved 974px primary ceiling. Below the handoff it holds the measured
       518px edge size until the viewport itself becomes narrower, then w-full
       contracts. The result is monotonic: removing the rail can never enlarge
       the photo. */
    <div data-listing-gallery="" className="w-full max-w-[518px] min-[56rem]:max-w-[min(974px,calc(100vw_-_378px))]">
      {/* Hero — the photograph is the left-column object. v1.24 retires the
          pale bordered shell that used to sit around this stage. The stage
          still governs height so changing photos cannot move the listing,
          but it is now visually neutral: no frame, background, border or
          padding between the collector and the photograph.
          The photograph itself carries no click
          handler: clicking it still does nothing, by design. */}
      <div className="flex aspect-square max-h-[60vh] w-full items-center justify-center [container-type:size]">
        {/* ── THE GOVERNED STAGE ────────────────────────────────────────────
            The stage owns the height. The photograph does not.

            Before this, the hero image was `w-full max-h-[60vh]`, so its
            height was width ÷ source aspect ratio, capped. The element's
            height therefore CHANGED with every photograph, and everything
            below it — OMEGA, Seamaster, REFERENCE, the reference value, the
            case diameter, Collector Snapshot — rode up and down with the
            proportions of whatever the collector happened to click.

            Measured on the Omega Seamaster before the repair: 255px of
            anchor movement across its six thumbnails at 375px wide. It read
            as stable on a 1512×950 desktop, but only by arithmetic accident
            — there the cap engages for any photograph narrower than 1.663:1,
            and every photograph on that listing is 1.333:1 or narrower. A
            single 16:9 photograph would have moved it there too. A defect
            that hides behind the aspect ratios a listing happens to contain
            is not absent; it is waiting.

            So the height is constant for a given responsive composition, and
            the photograph adapts inside it. The stage follows the column until
            it reaches the established 60vh ceiling: photo changes stay stable,
            while a narrow desktop no longer reserves height it cannot use.

            This also removes the transient jump: the stage is sized before
            any image loads, so nothing reflows when a new one arrives —
            cold cache or warm.

            The exact-aspect inner wrapper is deliberate. Container-query
            units let it take the largest rectangle that fits both the stage's
            live width and height, then the image fills that matching rectangle.
            There is no crop, distortion or letterbox margin inside the wrapper,
            so Dial Reveal and the photo arrows share the real image edge as
            their containing geometry.

            NOT solved by cropping, by moving a fact, or by touching a seller
            photo record. The photograph is still whole, still object-contain,
            still full resolution into Inspect. ── */}
        {/* The inline-flex wrapper shrink-wraps the rendered photograph. It is
            the arrows' containing block, so their unchanged 12px inset now
            resolves from the actual image edge instead of the retired
            full-column shell. */}
        <div
          data-listing-hero=""
          className="relative max-h-full max-w-full"
          style={{
            width: `min(100cqw, calc(100cqh * ${heroAspect}))`,
            aspectRatio: heroAspect,
          }}
        >
          {dialUrl && heroUrl === dialUrl ? (
            /* The exact-aspect wrapper passes both dimensions into
               DialReveal, keeping its square and fader on the real image edge
               without asking DialReveal to know anything about the gallery. */
            <DialReveal
              photoUrl={heroUrl}
              frameClassName="relative h-full w-full"
              className="h-full w-full rounded-lg object-contain transition-[filter] duration-200"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroUrl}
              alt=""
              className="h-full w-full rounded-lg object-contain"
            />
          )}

          {/* Previous — rendered only when there is a previous photo. */}
          {hasPrev && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => setActive((i) => Math.max(0, i - 1))}
              className={`${arrowClass} left-3`}
            >
              <NavArrowMark flip />
            </button>
          )}

          {/* Next — rendered only when there is a next photo. */}
          {hasNext && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => setActive((i) => Math.min(photos.length - 1, i + 1))}
              className={`${arrowClass} right-3`}
            >
              <NavArrowMark />
            </button>
          )}

          {/* The desktop Drawer belongs to the rendered photograph, not to
              the governed stage or the gallery flow beneath it. `contents`
              keeps the hero wrapper as the positioned containing block, so
              the Drawer's inset-y-0 resolves to the image's exact top and
              bottom at every responsive size. */}
          {desktopDrawer && (
            <div data-desktop-drawer-slot="" className="hidden min-[56rem]:contents">
              {desktopDrawer}
            </div>
          )}

          {/* Paid folding-loupe asset, now the control by itself. It remains
              just below the photograph's lower-right corner, anchored to this
              exact image box rather than to the wider gallery column. The
              invisible 36px button preserves a usable target without drawing
              a box around the mark. */}
          <button
            ref={inspectOpenerRef}
            type="button"
            aria-label="Inspect photo"
            title="Inspect photo"
            onClick={() => setInspecting(true)}
            className="absolute -bottom-9 right-0 z-20 grid h-9 w-9 place-items-center bg-transparent p-0 text-[var(--platinum)] transition-colors hover:text-[var(--gold)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold)] focus-visible:outline-offset-2"
          >
            <LoupeIcon size={24} />
          </button>
        </div>
      </div>

      {/* Reserve the loupe's below-photo lane so thumbnails never collide
          with the icon-only trigger. */}
      <div aria-hidden="true" className="h-9" />

      {/* ── Inspection overlay — the collector's light room ────────────────
          What this replaced: a black field carrying data-immersive-dark. The
          lesson that survived the swap is OPAQUE, not DARK. An earlier 97%
          wash let the page's own text bleed through and compete with the
          photograph, the desktop SEE-it caught it, and the fill has been
          solid ever since. It still is. Only the colour moved.

          Do not restore black on the strength of that old comment. ── */}
      {inspecting && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo inspection"
          /* data-inspection-light — the room a watch is inspected in is a
             silvered gallery wall, not a cinema.

             This attribute is doing TWO jobs and the second is the one that
             bites. It pins color-scheme: light for the subtree, and it is a
             DECLARING SCOPE for the token block in globals.css. light-dark()
             inside a custom property resolves against the scope where the
             property is declared, not where var() reads it — so merely
             deleting the old dark attribute would have left this near-white
             room drawing dark-arm tokens: pale cream text on pale slate.
             Removing an attribute is not the fix. Declaring the right scope
             is. */
          data-inspection-light=""
          className="fixed inset-0 z-[70] flex flex-col bg-[#E8EBEF]"
        >
          {/* Identity upper-left, close upper-right. The identity block is
              deliberately NOT the old 11px 2px-tracked --muted line: against a
              near-white field that read as disabled metadata, and it is the
              one thing in the room that names the watch. Quiet means low
              emphasis, not low contrast. */}
          <div className="mx-auto flex w-full max-w-[1900px] items-start justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[12px] uppercase tracking-[1.4px] text-[var(--platinum-dim)]">
                  {brandLabel}
                </span>
                {/* The public code follows the watch in. A collector looking
                    this closely is the collector about to write it down. */}
                <FwtListingId code={publicCode} />
              </div>
              <div className="mt-1 text-[12px] text-[var(--muted)]">
                Photo {active + 1} of {photos.length}
              </div>
            </div>
            {/* ACCESSIBLE EQUIVALENT, not a toolbar. Wheel and pinch cannot
                be the only way to operate zoom, but the answer to that is not
                a permanent instrument panel standing between a collector and
                a watch. Three small controls, in the header where the room's
                other controls already live, rendered only when the source
                actually holds more detail — offering Zoom In on a photograph
                that cannot zoom would be a button that lies. */}
            <div className="ml-auto flex items-center gap-2">
              {zoomState.maxScale > 1.01 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => zoomControlsRef.current?.zoomOut()}
                    disabled={zoomState.scale <= 1}
                    aria-label="Zoom out"
                    className={zoomBtn}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomControlsRef.current?.zoomIn()}
                    disabled={zoomState.scale >= zoomState.maxScale - 0.001}
                    aria-label="Zoom in"
                    className={zoomBtn}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomControlsRef.current?.fit()}
                    disabled={zoomState.scale <= 1}
                    aria-label="Reset the photograph to fit the viewer"
                    className={`${zoomBtn} w-auto px-2 text-[10px] uppercase tracking-[1.2px]`}
                  >
                    Reset
                  </button>
                  {/* Truthful, and announced only when it is saying
                      something: at Fit there is no zoom level worth reading
                      aloud. */}
                  <span aria-live="polite" className="sr-only">
                    {zoomState.scale > 1
                      ? `Zoomed ${zoomState.scale.toFixed(1)} times`
                      : "Photograph fitted to the viewer"}
                  </span>
                </div>
              )}
            <button
              type="button"
              autoFocus
              onClick={() => setInspecting(false)}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-2 border border-[var(--border-mid)] px-4 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--platinum-dim)] transition hover:border-[var(--border-gold)] hover:text-[var(--gold)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
            >
              Close ✕
            </button>
            </div>
          </div>

          {/* ── The room: a BOUNDED stage, and the rail takes the rest ─────
              WHAT THIS REPLACED, AND WHY.

              The stage used to be "whatever width is left over", which is how
              a 598px photograph came to sit in a 1150px box with the arrows
              stranded at its far edges. Two attempts at that failed for
              instructive reasons and both are worth knowing:

                · CENTRED, arrows at the room's edges — arrows never moved but
                  were hundreds of pixels from the watch.
                · LEFT-ALIGNED, arrows pinned to the PHOTOGRAPH — arrows hugged
                  the watch but travelled every time a portrait was followed by
                  a landscape.

              Neither is necessary. The stage is now sized to the widest
              rectangle any photograph in THIS listing actually occupies, so
              the arrows can sit on the stage's own edges and be BOTH close and
              still. eBay reaches the same place from the other side — every
              one of their photographs is the same shape, so their stage never
              needs to vary. Ours varies per listing instead of per photograph,
              which is the smallest unit that can hold still while a collector
              is looking. */}
          <div
            ref={roomRef}
            className="mx-auto flex min-h-0 w-full max-w-[1900px] flex-1 flex-col gap-3 px-4 pb-2 sm:px-6 min-[56rem]:flex-row min-[56rem]:justify-center min-[56rem]:gap-6"
          >
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              /* Explicit width once the listing has been measured; flex-1
                 until then, and on a phone forever — flex-1 resolves its main
                 size from the basis and would ignore a width, so the override
                 has to say flex: none too. */
              style={stageWidth > 0 ? { flex: "0 0 auto", width: stageWidth + STAGE_GUTTERS } : undefined}
            >
              {/* This padding is the ARROWS' room. The stage inside it carries
                  none, and that is load-bearing rather than tidy: the Fit
                  rectangle is measured from clientWidth, clientWidth INCLUDES
                  padding, so a padded stage would let a wide photograph
                  compute itself larger than the box it is laid out in and
                  slide under both arrows. */}
              <div
                ref={stageAreaRef}
                className="relative flex min-h-0 flex-1 items-center px-1 sm:pl-[4.5rem] sm:pr-[4.5rem]"
              >
                <div className="relative flex h-full min-w-0 flex-1 items-center justify-center [--arrow-gutter:0px] sm:[--arrow-gutter:4rem]">
                  {/* THE PHOTOGRAPH, and the only thing that accepts
                      inspection gestures. key={heroUrl} is load-bearing rather
                      than tidy: a changed photograph remounts the viewport,
                      which is what guarantees scale, translation, drag records
                      AND the previous source's measured dimensions all go at
                      once. Resetting by hand would leave the old naturals
                      alive for a frame, and in that frame photograph B could
                      be zoomed on the authority of photograph A's pixels. */}
                  <InspectionViewport
                    key={heroUrl}
                    src={heroUrl}
                    alt={inspectionAlt}
                    natural={heroNatural}
                    aspect={heroAspect}
                    controlsRef={zoomControlsRef}
                    onZoomStateChange={handleZoomState}
                  />
                  {/* Pinned to the STAGE, not to the photograph — which is the
                      whole point of bounding the stage, and why these are two
                      plain CSS offsets again rather than a measured number.
                      The gutter is a variable because the two arrows need the
                      same distance with opposite signs; it is 0 on a phone,
                      where there is no margin to stand in and the arrows
                      overlay the photograph's edges as they always have. */}
                  {canCycle && (
                    <button
                      type="button"
                      aria-label="Previous photo"
                      onClick={() => cycle(-1)}
                      className={roomArrowClass}
                      style={{ left: "calc(-1 * var(--arrow-gutter))" }}
                    >
                      <NavArrowMark flip />
                    </button>
                  )}
                  {canCycle && (
                    <button
                      type="button"
                      aria-label="Next photo"
                      onClick={() => cycle(1)}
                      className={roomArrowClass}
                      style={{ right: "calc(-1 * var(--arrow-gutter))" }}
                    >
                      <NavArrowMark />
                    </button>
                  )}
                </div>
              </div>

              {/* THE HINT, off the watch. It used to sit on the photograph's
                  lower edge, which is the one place in this room nothing
                  belongs. The band is reserved whether or not the hint is
                  showing, so its arrival and departure cannot move the stage,
                  and it shares the stage's padding so it centres under the
                  photograph rather than under the room. */}
              <div className="flex h-6 shrink-0 items-center justify-center px-1 sm:pl-[4.5rem] sm:pr-[4.5rem]">
                {showZoomHint && (
                  <span className="whitespace-nowrap text-[11px] tracking-[0.4px] text-[var(--muted)]">
                    Ctrl + scroll to zoom · drag to inspect
                  </span>
                )}
              </div>
            </div>

            {/* The rail takes everything the stage no longer holds — which is
                what the bounding was FOR. Bounded at both ends: never narrower
                than the width the stage reserved for it, never so wide that
                supporting photographs start competing with the watch. */}
            {/* A GUTTER, not a redesign. The stage and the rail were two sets
                of photographs sharing one undivided field, which read as one
                crowded surface. A hairline and a wider channel separate them
                without introducing a panel colour the room does not have. */}
            <div className="hidden min-[56rem]:flex min-[56rem]:min-h-0 min-[56rem]:min-w-[200px] min-[56rem]:max-w-[480px] min-[56rem]:flex-1 min-[56rem]:border-l min-[56rem]:border-[var(--border-subtle)] min-[56rem]:pl-6">
              <InspectionPhotoRail
                photos={photos}
                active={active}
                onSelect={setActive}
                orientation="column"
              />
            </div>
            <div className="min-[56rem]:hidden">
              <InspectionPhotoRail
                photos={photos}
                active={active}
                onSelect={setActive}
                orientation="row"
              />
            </div>
          </div>
        </div>
      )}

      {/* Remaining photos — scrollable horizontal thumbnail strip */}
      {photos.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View photo ${i + 1}`}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border transition ${
                i === active
                  ? "border-[var(--gold)]"
                  : "border-[var(--border-mid)] hover:border-[var(--gold)]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardImageSrc(url, { width: 240 })}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
