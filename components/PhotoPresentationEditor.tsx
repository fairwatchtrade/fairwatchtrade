"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { type ListingPhoto } from "@/lib/listing";
import { sortByPhotoRole } from "@/lib/photoRoles";
import {
  type PhotoFrame,
  type PhotoPresentation,
  ZOOM_MAX,
  ZOOM_STEP,
  zoomMinFor,
  defaultFrame,
  frameFor,
  frameStyle,
  movableAxes,
  sanitizeRotation,
  screenToImageDelta,
  withFrame,
  withHero,
} from "@/lib/photoPresentation";

/* ════════════════════════════════════════════════════════════════════════
   PHOTO PRESENTATION EDITOR — "Center the watch for buyers"   (v3)

   A multi-photo workspace. The seller adjusts the dial, moves to the clasp,
   comes back and finds their work intact, then saves the whole set once.

   ── THREE STATES THAT MUST NEVER MERGE ─────────────────────────────────
     ACTIVE   the photo currently being adjusted
     HERO     the listing's lead image        (SET AS HERO only)
     ORDER    the sequence, governed by photo role

   ── STAGED WORK IS PROTECTED (v3) ──────────────────────────────────────
   A backdrop click never closes this editor. Multi-photo staging makes an
   accidental dismissal expensive — four adjusted photographs gone to a stray
   click — so the backdrop is inert, Escape closes only a CLEAN session, and
   a dirty session must pass through an explicit governed confirmation:
   KEEP EDITING / DISCARD CHANGES. Save commits and closes; Cancel asks first
   when dirty. Focus is trapped inside while open.

   ── LAYOUT STABILITY LAW (v3) ──────────────────────────────────────────
   Photo changes may update content, but they may not move the controls.
   The inspector is a fixed vertical contract: every region has a reserved
   height, long role names truncate inside their row, both previews live in
   one fixed-size box, and the metadata block never wraps taller. A pointer
   parked on EDIT NEXT PHOTO stays on it through every photograph.

   ── ROTATION (v3) ──────────────────────────────────────────────────────
   Quarter-turns, presentation-only, per photo, staged with everything else.
   Drag deltas are mapped through the inverse rotation so the photograph
   always follows the pointer on screen regardless of orientation.

   ── WHAT THIS DELIBERATELY CANNOT DO ───────────────────────────────────
   No delete, no replace, no reorder, no blur, no destructive crop. It
   returns a small metadata object; draft.photos is never mutated. That is
   the evidence law expressed as an API surface.
   ════════════════════════════════════════════════════════════════════════ */

/* The editing stage is 4:3, matching the Review card's hero frame. */
const STAGE_ASPECT = 4 / 3;
/* Fixed preview frames — identical outer box for both tabs, so switching
   Desktop/Mobile crop cannot move anything below it. */
const PREVIEW_REGION_H = 196; // px

/* ── THE ENTRY CONTROL ─────────────────────────────────────────────────
   A quiet utility, not a CTA. Exported here rather than written twice so
   desktop and mobile Review cannot drift apart. */
export function PhotoPresentationEntry({
  onOpen,
  className = "",
  buttonRef,
}: {
  onOpen: () => void;
  className?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <div className={`flex items-center gap-[11px] ${className}`}>
      <span className="h-px flex-1 bg-[rgba(200,173,88,0.32)]" aria-hidden="true" />
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-[7px] whitespace-nowrap bg-transparent py-[3px] text-[9px] font-semibold uppercase leading-none tracking-[0.12em] text-[#d8c273] transition hover:text-[var(--gold)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#ead37e]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="shrink-0 opacity-[0.92]">
          <path
            d="M0 0h5M0 0v5M10 0H5M10 0v5M0 10h5M0 10V5M10 10H5M10 10V5"
            stroke="var(--gold)"
            strokeWidth="1"
          />
        </svg>
        <span>Adjust photo presentation</span>
      </button>
      <span className="h-px flex-1 bg-[rgba(200,173,88,0.32)]" aria-hidden="true" />
    </div>
  );
}

export default function PhotoPresentationEditor({
  photos,
  value,
  automaticHeroPathname,
  onSave,
  onClose,
}: {
  photos: ListingPhoto[];
  value: PhotoPresentation;
  /** The hero the role rule would choose on its own. */
  automaticHeroPathname: string | null;
  onSave: (next: PhotoPresentation) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const confirmTitleId = useId();

  /* Thumbnails and EDIT NEXT PHOTO both follow canonical role order, never
     upload order. One resolver, shared with Review and the published gallery. */
  const ordered = useMemo(() => sortByPhotoRole(photos, (p) => p.category), [photos]);

  /* Staged working copy. Seeded once from the committed value — deliberately
     NOT resynced from props, or a parent re-render would wipe the seller's
     in-progress work mid-session. */
  const [staged, setStaged] = useState<PhotoPresentation>(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [confirmOpen, setConfirmOpen] = useState(false);
  /* Measured aspect per photograph, keyed by pathname — no reset effect
     needed when switching photos; the active one is simply looked up. */
  const [aspects, setAspects] = useState<Record<string, number>>({});

  const stageRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);

  /* Dirty = the staged set differs from what was committed when we opened.
     The snapshot lives in state (initializer runs once), so no ref is read
     during render; every handler closes over the current values. */
  const [openedWith] = useState(() => JSON.stringify(value));
  const dirty = JSON.stringify(staged) !== openedWith;

  const active = ordered[activeIndex];
  const activePath = active?.photo.pathname ?? null;
  const frame = frameFor(staged, activePath);
  const heroPath = staged.heroPathname ?? automaticHeroPathname;
  const isActiveHero = activePath !== null && activePath === heroPath;

  const axes = movableAxes(
    activePath ? (aspects[activePath] ?? null) : null,
    STAGE_ASPECT,
    frame.zoom,
    frame.rotationDeg
  );

  const setFrame = useCallback(
    (next: PhotoFrame) => {
      if (!activePath) return;
      setStaged((s) => withFrame(s, activePath, next));
    },
    [activePath]
  );

  const rotate = useCallback(
    (deltaDeg: 90 | 270) => {
      const rotationDeg = sanitizeRotation((frame.rotationDeg + deltaDeg) % 360);
      /* Returning to upright raises the floor back to 1.00 — a matte-resting
         zoom must not survive into an orientation whose floor forbids it. */
      setFrame({
        ...frame,
        rotationDeg,
        zoom: Math.max(frame.zoom, zoomMinFor(rotationDeg)),
      });
    },
    [frame, setFrame]
  );

  /* ── Close discipline ──
     requestClose is the ONLY exit that discards: clean → close, dirty →
     governed confirmation. The backdrop calls nothing at all. */
  function requestClose() {
    if (dirty) setConfirmOpen(true);
    else onClose();
  }

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  /* Keyboard discipline, handled ON the panel — focus is moved into it on
     mount and trapped there, so every key event arrives here with a fresh
     closure over dirty/confirmOpen. Escape inside the confirmation returns
     to editing; on a dirty session it asks; only a clean session closes. */
  function onTrapKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (confirmOpen) setConfirmOpen(false);
      else if (dirty) setConfirmOpen(true);
      else onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const root = panelRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled"));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!active) return;
    stageRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, fx: frame.focalX, fy: frame.focalY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    const el = stageRef.current;
    if (!start || !el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    /* Screen deltas are mapped through the inverse rotation, so the photo
       follows the pointer ON SCREEN whatever its orientation. Both axes are
       always written — focalX matters even when this 4:3 stage can't show it,
       because the portrait browse card crops the other way. Negated because
       dragging RIGHT reveals what is off the LEFT edge: this is "grab the
       photo", not "move a crop window". */
    const d = screenToImageDelta(
      frame.rotationDeg,
      (e.clientX - start.x) / rect.width,
      (e.clientY - start.y) / rect.height
    );
    setFrame({
      ...frame,
      focalX: Math.min(1, Math.max(0, start.fx - d.dx)),
      focalY: Math.min(1, Math.max(0, start.fy - d.dy)),
    });
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      stageRef.current?.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }

  function onStageKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const d = screenToImageDelta(frame.rotationDeg, m[0], m[1]);
    setFrame({
      ...frame,
      focalX: Math.min(1, Math.max(0, frame.focalX + d.dx)),
      focalY: Math.min(1, Math.max(0, frame.focalY + d.dy)),
    });
  }

  const stageStyle = frameStyle(frame, STAGE_ASPECT);
  const btn =
    "border text-[8px] uppercase tracking-[0.1em] transition disabled:opacity-40 " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ead37e]";

  return (
    /* The backdrop is deliberately inert: no click handler of any kind.
       Staged multi-photo work must never die to a stray click outside. */
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(3,4,6,0.72)] p-3 sm:p-8">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onTrapKeyDown}
        className="relative w-full max-w-[900px] border border-[#39352a] bg-[#0d0f14] shadow-[0_28px_72px_rgba(0,0,0,0.72)] outline-none"
      >
        <div className="flex items-start justify-between gap-5 border-b border-[var(--border-subtle)] bg-[#101217] px-4 py-3.5">
          <div>
            <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--gold)]">
              Photo presentation
            </div>
            <h3 id={titleId} className="mt-1 font-display text-[19px] font-light text-[var(--platinum)]">
              Center the watch for buyers
            </h3>
          </div>
          <div className="text-right text-[9px] leading-[1.4] text-[var(--muted)]">
            Original upload preserved
            <br />
            Presentation metadata only
          </div>
        </div>

        <div className="grid gap-3.5 p-4 md:grid-cols-[minmax(0,1.42fr)_minmax(250px,0.58fr)]">
          {/* ── Stage column ────────────────────────────────────────── */}
          <div className="min-w-0">
            {ordered.length > 1 && (
              <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-1" aria-label="Photos in gallery order">
                {ordered.map((p, i) => {
                  const isActive = i === activeIndex;
                  const isHero = p.photo.pathname === heroPath;
                  const framed = staged.frames[p.photo.pathname] !== undefined;
                  return (
                    <button
                      key={`${p.photo.pathname}-${i}`}
                      type="button"
                      aria-pressed={isActive}
                      aria-label={`Adjust ${p.category} photo${isHero ? " (hero)" : ""}`}
                      onClick={() => setActiveIndex(i)}
                      className={`relative h-[42px] w-[52px] shrink-0 overflow-hidden border transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ead37e] ${
                        isActive
                          ? "border-[var(--gold)] shadow-[0_0_0_1px_rgba(197,170,85,0.34)]"
                          : "border-[#343740] hover:border-[var(--gold-dim)]"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.photo.url} alt="" draggable={false} className="h-full w-full select-none object-cover" />
                      {isHero && (
                        <span className="absolute left-0 top-0 bg-[var(--gold)] px-[3px] text-[7px] font-semibold leading-[1.4] text-[var(--ink)]">
                          HERO
                        </span>
                      )}
                      {framed && !isHero && (
                        <span className="absolute right-0 top-0 bg-[rgba(197,170,85,0.85)] px-[3px] text-[7px] leading-[1.4] text-[var(--ink)]">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div
              ref={stageRef}
              role="application"
              aria-label="Drag or use arrow keys to position the watch in frame"
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onStageKeyDown}
              /* Native drag produces the translucent ghost seen in production
                 verification — the browser stealing the gesture. The image is
                 draggable={false}, AND dragstart is refused at the surface, so
                 no path remains to a ghost. touch-none routes touch gestures
                 here instead of scrolling; select-none stops text selection. */
              onDragStart={(e) => e.preventDefault()}
              className="relative aspect-[4/3] w-full cursor-grab touch-none select-none overflow-hidden border border-[#353840] bg-[#090a0d] active:cursor-grabbing focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ead37e]"
            >
              {active ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={activePath ?? ""}
                  src={active.photo.url}
                  alt=""
                  draggable={false}
                  style={stageStyle}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (activePath && img.naturalWidth && img.naturalHeight) {
                      const a = img.naturalWidth / img.naturalHeight;
                      setAspects((m) => (m[activePath] === a ? m : { ...m, [activePath]: a }));
                    }
                  }}
                  className="pointer-events-none h-full w-full select-none"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[12px] text-[var(--muted)]">
                  No photos to adjust
                </div>
              )}
              <div className="pointer-events-none absolute inset-[6%] border border-dashed border-[rgba(213,188,101,0.55)]" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2">
                <div className="absolute left-1/2 top-0 h-7 w-px bg-[rgba(213,188,101,0.58)]" />
                <div className="absolute left-0 top-1/2 h-px w-7 bg-[rgba(213,188,101,0.58)]" />
              </div>
            </div>

            {/* The honest axis note — RESERVED height so its coming and going
                never moves the modal. Empty when everything is movable. */}
            <p className="mt-1.5 min-h-[30px] text-[10px] leading-[1.5] text-[var(--muted)]">
              {active && !axes.horizontal && axes.vertical
                ? "This photograph fills the frame exactly side to side, so only up-and-down movement changes this crop. Add a little zoom or a quarter-turn to move it sideways."
                : active && axes.horizontal && !axes.vertical
                  ? "This photograph fills the frame exactly top to bottom, so only side-to-side movement changes this crop. Add a little zoom or a quarter-turn to move it vertically."
                  : active && !axes.horizontal && !axes.vertical
                    ? "This photograph already fits the frame. Add a little zoom or a quarter-turn to reposition it."
                    : ""}
            </p>
          </div>

          {/* ── Inspector — FIXED vertical contract ──────────────────────
              Every region has a reserved height. Long role names truncate in
              their row; the count line stays put; both previews share one
              fixed box. Nothing here may move when the photo changes. */}
          <div className="md:border-l md:border-[var(--border-subtle)] md:pl-3.5">
            <h4 className="h-[22px] truncate font-display text-[16px] font-light text-[var(--platinum)]">
              {active?.category ?? "Hero presentation"}
            </h4>
            <p className="mt-1 h-[48px] overflow-hidden text-[11px] leading-[1.45] text-[var(--muted)]">
              Drag to position. Zoom stays within safe limits so the image cannot
              expose empty borders or crop away material watch evidence.
            </p>

            {/* Rotation — quarter-turns, active photo only. */}
            <div className="mt-2 grid h-[34px] grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={!activePath}
                onClick={() => rotate(270)}
                className={`${btn} border-[#363940] bg-[#101217] px-2 text-[#c8c4b9]`}
              >
                ⟲ Rotate left
              </button>
              <button
                type="button"
                disabled={!activePath}
                onClick={() => rotate(90)}
                className={`${btn} border-[#363940] bg-[#101217] px-2 text-[#c8c4b9]`}
              >
                Rotate right ⟳
              </button>
            </div>

            <div className="mt-2.5 h-[46px]">
              <label
                htmlFor="fw-zoom"
                className="mb-1.5 flex justify-between text-[8px] uppercase tracking-[0.12em] text-[#bbb5a8]"
              >
                <span>Zoom</span>
                <span>{frame.zoom.toFixed(2)}×</span>
              </label>
              <input
                id="fw-zoom"
                type="range"
                /* The floor is orientation-aware: rotated photographs may
                   zoom out onto the matte to recover a full side profile. */
                min={zoomMinFor(frame.rotationDeg)}
                max={ZOOM_MAX}
                step={ZOOM_STEP}
                value={frame.zoom}
                onChange={(e) => setFrame({ ...frame, zoom: Number(e.target.value) })}
                className="w-full accent-[var(--gold)]"
              />
            </div>

            <div className="mt-2 flex h-[28px] gap-1.5">
              {(["desktop", "mobile"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={preview === k}
                  onClick={() => setPreview(k)}
                  className={`${btn} border px-2 ${
                    preview === k
                      ? "border-[#78683a] bg-[#17140e] text-[#dec66f]"
                      : "border-[#373a42] bg-[#101217] text-[#aaaeb8]"
                  }`}
                >
                  {k === "desktop" ? "Desktop crop" : "Mobile crop"}
                </button>
              ))}
            </div>

            {/* One fixed-size preview region for BOTH tabs. The frames inside
                are constant-sized, so toggling crops moves nothing below. */}
            <div
              className="mt-2 flex items-center justify-center"
              style={{ height: PREVIEW_REGION_H }}
            >
              {active &&
                (preview === "desktop" ? (
                  <div className="relative h-[186px] w-[248px] overflow-hidden border border-[#353840] bg-[#090a0d]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={active.photo.url}
                      alt="Desktop crop preview"
                      draggable={false}
                      style={frameStyle(frame, 4 / 3)}
                      className="h-full w-full select-none"
                    />
                  </div>
                ) : (
                  <div className="relative h-[150px] w-[120px] overflow-hidden border border-[#353840] bg-[#090a0d]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={active.photo.url}
                      alt="Mobile crop preview"
                      draggable={false}
                      style={frameStyle(frame, 120 / 150)}
                      className="h-full w-full select-none"
                    />
                  </div>
                ))}
            </div>

            {/* Metadata — reserved two-line block, truncating, never taller. */}
            <div className="mt-2 h-[44px] overflow-hidden border-t border-[#292c33] pt-2 text-[9px] leading-[1.5] text-[#89919f]">
              <div className="truncate">
                focal_x={frame.focalX.toFixed(3)} · focal_y={frame.focalY.toFixed(3)} · zoom=
                {frame.zoom.toFixed(2)} · rot={sanitizeRotation(frame.rotationDeg)}°
              </div>
              <div className="truncate">
                {Object.keys(staged.frames).length} of {ordered.length} photographs adjusted
                {dirty ? " · unsaved changes" : ""}
              </div>
            </div>

            {/* ── Bottom-anchored action stack — approved order ──
                  SET AS HERO
                  RESET THIS PHOTO | EDIT NEXT PHOTO →
                  CANCEL           | SAVE PRESENTATION            */}
            <button
              type="button"
              disabled={!activePath || isActiveHero}
              onClick={() => activePath && setStaged((s) => withHero(s, activePath))}
              className={`${btn} mt-2 h-[34px] w-full px-2 ${
                isActiveHero
                  ? "border-[#5d5233] bg-[#17140e] text-[#dec66f]"
                  : "border-[#5d5233] bg-[#101217] text-[#cfb866] hover:bg-[#17140e]"
              }`}
            >
              {isActiveHero ? "✦ This is the hero photo" : "Set as hero"}
            </button>

            <div className="mt-1.5 grid h-[34px] grid-cols-2 gap-1.5">
              {/* RESET left (local action, near the photo's own controls);
                  EDIT NEXT right (forward navigation reads left-to-right). */}
              <button
                type="button"
                disabled={!activePath}
                onClick={() => setFrame(defaultFrame())}
                className={`${btn} border-[#363940] bg-[#101217] px-2 text-[#c8c4b9]`}
              >
                Reset this photo
              </button>
              <button
                type="button"
                disabled={ordered.length < 2}
                onClick={() => setActiveIndex((i) => (i + 1) % ordered.length)}
                className={`${btn} border-[#363940] bg-[#101217] px-2 text-[#c8c4b9]`}
              >
                Edit next photo →
              </button>
            </div>

            <div className="mt-1.5 grid h-[34px] grid-cols-[1fr_1.6fr] gap-1.5">
              <button
                type="button"
                onClick={requestClose}
                className={`${btn} border-[#363940] bg-[#101217] px-2 text-[#c8c4b9]`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave(staged);
                  onClose();
                }}
                className={`${btn} border-[#d1b862] bg-[#c3a951] px-2 text-[#17140d]`}
              >
                Save presentation
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border-subtle)] px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="h-px flex-1 bg-[rgba(201,168,76,0.32)]" aria-hidden="true" />
            <span className="text-center text-[9px] leading-[1.4] text-[var(--muted)]">
              Photo roles govern gallery order. Your source photographs are unchanged.
            </span>
            <span className="h-px flex-1 bg-[rgba(201,168,76,0.32)]" aria-hidden="true" />
          </div>
        </div>

        {/* ── Governed unsaved-changes confirmation ── the only gate through
            which a dirty session may be discarded. */}
        {confirmOpen && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(3,4,6,0.62)] p-6">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={confirmTitleId}
              className="w-full max-w-[380px] border border-[#39352a] bg-[#101217] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.6)]"
            >
              <h5 id={confirmTitleId} className="font-display text-[17px] font-light text-[var(--platinum)]">
                Discard photo adjustments?
              </h5>
              <p className="mt-2 text-[12px] leading-[1.5] text-[var(--muted)]">
                You have unsaved presentation changes for this listing.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirmOpen(false)}
                  className={`${btn} h-[34px] border-[#d1b862] bg-[#c3a951] px-2 text-[#17140d]`}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmOpen(false);
                    onClose();
                  }}
                  className={`${btn} h-[34px] border-[#5d5233] bg-[#101217] px-2 text-[#cfb866]`}
                >
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
