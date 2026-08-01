"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { type ListingPhoto } from "@/lib/listing";
import { sortByPhotoRole } from "@/lib/photoRoles";
import {
  type PhotoFrame,
  type PhotoPresentation,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  defaultFrame,
  frameFor,
  frameStyle,
  movableAxes,
  withFrame,
  withHero,
} from "@/lib/photoPresentation";

/* ════════════════════════════════════════════════════════════════════════
   PHOTO PRESENTATION EDITOR — "Center the watch for buyers"   (v2)

   A multi-photo workspace, not a hero editor. The seller adjusts the dial,
   moves to the clasp, comes back to the dial and finds their work intact,
   then saves the whole set once.

   ── THREE STATES THAT MUST NEVER MERGE ─────────────────────────────────
     ACTIVE   the photo currently being adjusted
     HERO     the listing's lead image
     ORDER    the sequence, governed by photo role

   Selecting a thumbnail changes ACTIVE only. Editing the clasp must never
   quietly promote it to hero — that conflation is what made the previous
   build feel possessed. Hero moves only through SET AS HERO.

   ── EDITS ARE STAGED UNTIL SAVE ────────────────────────────────────────
   All work happens on a local copy seeded from the committed presentation.
   Switching photos keeps staged edits; Cancel and Escape discard everything
   since the editor opened; only SAVE lifts the whole set to the caller. A
   seller who drags four photos somewhere unfortunate and closes has changed
   nothing.

   ── WHAT THIS DELIBERATELY CANNOT DO ───────────────────────────────────
   No delete, no replace, no reorder, no blur, no destructive crop. There is
   no code path that writes an image, uploads a file, or mutates draft.photos.
   It returns a small metadata object. That is the evidence law expressed as
   an API surface.
   ════════════════════════════════════════════════════════════════════════ */

/* The editing stage is 4:3, matching the Review card's hero frame. */
const STAGE_ASPECT = 4 / 3;

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

  /* Thumbnails and EDIT NEXT PHOTO both follow canonical role order, never
     upload order. One resolver, shared with Review and the published gallery. */
  const ordered = useMemo(() => sortByPhotoRole(photos, (p) => p.category), [photos]);

  /* Staged working copy. Seeded once from the committed value — deliberately
     NOT resynced from props, or a parent re-render would wipe the seller's
     in-progress work mid-session. */
  const [staged, setStaged] = useState<PhotoPresentation>(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  /* Measured aspect per photograph, keyed by pathname. Keyed rather than
     reset-on-change so switching photos needs no effect: the value for the
     newly active photo is simply looked up, and is already there if it has
     been seen before. */
  const [aspects, setAspects] = useState<Record<string, number>>({});

  const stageRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);

  const active = ordered[activeIndex];
  const activePath = active?.photo.pathname ?? null;
  const frame = frameFor(staged, activePath);
  const heroPath = staged.heroPathname ?? automaticHeroPathname;
  const isActiveHero = activePath !== null && activePath === heroPath;

  const axes = movableAxes(activePath ? (aspects[activePath] ?? null) : null, STAGE_ASPECT, frame.zoom);

  const setFrame = useCallback(
    (next: PhotoFrame) => {
      if (!activePath) return;
      setStaged((s) => withFrame(s, activePath, next));
    },
    [activePath]
  );

  // Escape discards, matching Cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

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

    /* BOTH axes are always written. focalX is stored even when this 4:3 stage
       cannot show its effect, because other surfaces crop differently — the
       browse card is portrait, where a landscape photo overflows sideways.
       Locking the axis here would silently discard a real setting.

       Dragging the photograph RIGHT reveals what is off its left edge, so the
       focal point moves LEFT. Hence the negated delta: this is "grab the
       photo", not "move a crop window". */
    setFrame({
      ...frame,
      focalX: Math.min(1, Math.max(0, start.fx - (e.clientX - start.x) / rect.width)),
      focalY: Math.min(1, Math.max(0, start.fy - (e.clientY - start.y) / rect.height)),
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
    setFrame({
      ...frame,
      focalX: Math.min(1, Math.max(0, frame.focalX + m[0])),
      focalY: Math.min(1, Math.max(0, frame.focalY + m[1])),
    });
  }

  const style = frameStyle(frame);
  const btn =
    "border px-2 py-2.5 text-[8px] uppercase tracking-[0.1em] transition disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(3,4,6,0.72)] p-3 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[900px] border border-[#39352a] bg-[#0d0f14] shadow-[0_28px_72px_rgba(0,0,0,0.72)] outline-none"
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
          {/* ── Stage ──────────────────────────────────────────────── */}
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
                      <img src={p.photo.url} alt="" className="h-full w-full object-cover" />
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
              className="relative aspect-[4/3] w-full cursor-grab touch-none overflow-hidden border border-[#353840] bg-[#090a0d] active:cursor-grabbing focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ead37e]"
            >
              {active ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={activePath ?? ""}
                  src={active.photo.url}
                  alt=""
                  draggable={false}
                  style={style}
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

            {/* The honest axis note. A portrait photo in this 4:3 frame has no
                hidden left or right — telling the seller beats letting them
                drag against nothing and conclude the tool is broken. */}
            {active && (!axes.horizontal || !axes.vertical) && (
              <p className="mt-1.5 text-[10px] leading-[1.5] text-[var(--muted)]">
                {axes.vertical && !axes.horizontal
                  ? "This photograph fills the frame exactly side to side, so only up-and-down movement changes this crop. Add a little zoom to move it sideways."
                  : axes.horizontal && !axes.vertical
                    ? "This photograph fills the frame exactly top to bottom, so only side-to-side movement changes this crop. Add a little zoom to move it vertically."
                    : "This photograph already fits the frame. Add a little zoom to reposition it."}
              </p>
            )}
          </div>

          {/* ── Controls ───────────────────────────────────────────── */}
          <div className="md:border-l md:border-[var(--border-subtle)] md:pl-3.5">
            <h4 className="font-display text-[16px] font-light text-[var(--platinum)]">
              {active?.category ?? "Hero presentation"}
            </h4>
            <p className="mt-1.5 text-[11px] leading-[1.45] text-[var(--muted)]">
              Drag the photograph to recover a clipped dial. Zoom stays within safe
              limits so the image cannot expose empty borders or crop away material
              watch evidence.
            </p>

            <div className="mt-3.5">
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
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={ZOOM_STEP}
                value={frame.zoom}
                onChange={(e) => setFrame({ ...frame, zoom: Number(e.target.value) })}
                className="w-full accent-[var(--gold)]"
              />
            </div>

            <div className="mt-4 flex gap-1.5">
              {(["desktop", "mobile"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={preview === k}
                  onClick={() => setPreview(k)}
                  className={`border px-2 py-1.5 text-[8px] uppercase tracking-[0.09em] transition ${
                    preview === k
                      ? "border-[#78683a] bg-[#17140e] text-[#dec66f]"
                      : "border-[#373a42] bg-[#101217] text-[#aaaeb8]"
                  }`}
                >
                  {k === "desktop" ? "Desktop crop" : "Mobile crop"}
                </button>
              ))}
            </div>

            {active && (
              <div
                className={`relative mt-2 overflow-hidden border border-[#353840] bg-[#090a0d] ${
                  preview === "mobile" ? "mx-auto aspect-[4/5] w-[120px]" : "aspect-[4/3] w-full"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={active.photo.url}
                  alt={`${preview === "desktop" ? "Desktop" : "Mobile"} crop preview`}
                  style={style}
                  className="h-full w-full"
                />
              </div>
            )}

            <div className="mt-2.5 border-t border-[#292c33] pt-2 text-[9px] leading-[1.45] text-[#89919f]">
              {active?.category ?? "—"} · focal_x={frame.focalX.toFixed(3)} · focal_y=
              {frame.focalY.toFixed(3)} · zoom={frame.zoom.toFixed(2)}
              <br />
              {Object.keys(staged.frames).length} of {ordered.length} photographs adjusted
            </div>

            {/* Hero is its own explicit act. */}
            <button
              type="button"
              disabled={!activePath || isActiveHero}
              onClick={() => activePath && setStaged((s) => withHero(s, activePath))}
              className={`${btn} mt-3 w-full ${
                isActiveHero
                  ? "border-[#5d5233] bg-[#17140e] text-[#dec66f]"
                  : "border-[#5d5233] bg-[#101217] text-[#cfb866] hover:bg-[#17140e]"
              }`}
            >
              {isActiveHero ? "✦ This is the hero photo" : "Set as hero"}
            </button>

            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={ordered.length < 2}
                onClick={() => setActiveIndex((i) => (i + 1) % ordered.length)}
                className={`${btn} border-[#363940] bg-[#101217] text-[#c8c4b9]`}
              >
                Edit next photo
              </button>
              <button
                type="button"
                disabled={!activePath}
                onClick={() => setFrame(defaultFrame())}
                className={`${btn} border-[#363940] bg-[#101217] text-[#c8c4b9]`}
              >
                Reset this photo
              </button>
            </div>

            <div className="mt-1.5 grid grid-cols-[1fr_1.6fr] gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className={`${btn} border-[#363940] bg-[#101217] text-[#c8c4b9]`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave(staged);
                  onClose();
                }}
                className={`${btn} border-[#d1b862] bg-[#c3a951] text-[#17140d]`}
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
      </div>
    </div>
  );
}
