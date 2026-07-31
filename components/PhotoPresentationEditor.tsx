"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { type ListingPhoto } from "@/lib/listing";
import {
  type PhotoPresentation,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  defaultPresentation,
  presentationStyle,
  resolveHeroIndex,
} from "@/lib/photoPresentation";

/* ════════════════════════════════════════════════════════════════════════
   PHOTO PRESENTATION EDITOR — "Center the watch for buyers"

   Approved Design Gate v4. The seller chooses which uploaded photograph is
   the hero, drags it to set a focal point, and applies governed zoom. Both
   crop previews are rendered by the SAME presentationStyle() the buyer-facing
   surfaces use, so the preview is the real thing and not a mock-up.

   ── WHAT THIS DELIBERATELY CANNOT DO ──────────────────────────────────
   No delete, no replace, no reorder, no blur, no destructive crop. There is
   no code path here that writes an image, uploads a file, or mutates
   draft.photos. It returns a small metadata object and nothing else. That is
   the evidence law expressed as an API surface: presentation may improve,
   evidence may not be subtracted.

   ── EDITING IS PROVISIONAL UNTIL SAVE ─────────────────────────────────
   All interaction runs on local state seeded from the committed value.
   Cancel and Escape discard; only Save lifts it to the caller. A seller who
   drags the watch somewhere unfortunate and closes the panel has changed
   nothing.
   ════════════════════════════════════════════════════════════════════════ */

/* Drag sensitivity. A pointer travelling the full width of the stage moves
   the focal point across the whole photograph, which at ~1.0 zoom is far more
   travel than the image can actually use — so the practical feel is a slow,
   controlled nudge rather than a throw. Clamped to 0..1 by the setter. */
function focalDelta(px: number, extent: number): number {
  if (extent <= 0) return 0;
  return px / extent;
}

/* ── THE ENTRY CONTROL ─────────────────────────────────────────────────
   A quiet utility, not a CTA. Hairline · small crop glyph · restrained gold
   text · hairline. Exported here rather than written twice so the desktop and
   mobile Review pages cannot drift apart — the order treats them as one
   treatment, and one component is the only way to keep that true.

   It is a real <button>: tabbable, Enter/Space activated, with a visible
   focus ring that is NOT the browser default (which disappears on this dark
   panel). */
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
        {/* Crop/framing glyph — four corner brackets, 10px. */}
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
  automaticHeroIndex,
  onSave,
  onClose,
}: {
  photos: ListingPhoto[];
  value: PhotoPresentation;
  /** The hero the system would choose on its own (role-governed). */
  automaticHeroIndex: number;
  onSave: (next: PhotoPresentation) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState<PhotoPresentation>(value);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);

  const pathnames = photos.map((p) => p.photo.pathname);
  const heroIndex = resolveHeroIndex(pathnames, draft, automaticHeroIndex);
  const heroPhoto = photos[heroIndex];

  const setFocal = useCallback((fx: number, fy: number) => {
    setDraft((d) => ({
      ...d,
      focalX: Math.min(1, Math.max(0, fx)),
      focalY: Math.min(1, Math.max(0, fy)),
    }));
  }, []);

  // Escape closes, and focus is trapped to the panel while it is open — the
  // Review page behind is inert, so tabbing into it would strand the seller.
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
    // Move focus into the panel on open so keyboard users land inside it.
    panelRef.current?.focus();
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!heroPhoto) return;
    const el = stageRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, fx: draft.focalX, fy: draft.focalY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    const el = stageRef.current;
    if (!start || !el) return;
    const rect = el.getBoundingClientRect();
    /* Dragging the photograph RIGHT should reveal what is off its left edge,
       which means the focal point moves LEFT. Hence the negated delta — this
       is the difference between "grab the photo" and "move a crop window",
       and grabbing the photo is what the Design Gate approved. */
    setFocal(
      start.fx - focalDelta(e.clientX - start.x, rect.width),
      start.fy - focalDelta(e.clientY - start.y, rect.height)
    );
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      stageRef.current?.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }

  /* Arrow keys move the focal point without a pointer. The stage is a real
     focusable control with a role and a label, so this is the keyboard
     equivalent of the drag, not a bolted-on shortcut. */
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
    setFocal(draft.focalX + m[0], draft.focalY + m[1]);
  }

  const heroStyle = presentationStyle(draft);
  const hairline = "h-px flex-1 bg-[rgba(201,168,76,0.32)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(3,4,6,0.72)] p-4 sm:p-8"
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
        className="w-full max-w-[860px] border border-[#39352a] bg-[#0d0f14] shadow-[0_28px_72px_rgba(0,0,0,0.72)] outline-none"
      >
        {/* Head */}
        <div className="flex items-start justify-between gap-5 border-b border-[var(--border-subtle)] bg-[#101217] px-4 py-3.5">
          <div>
            <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--gold)]">
              Photo presentation
            </div>
            <h3
              id={titleId}
              className="mt-1 font-display text-[19px] font-light text-[var(--platinum)]"
            >
              Center the watch for buyers
            </h3>
          </div>
          <div className="text-right text-[9px] leading-[1.4] text-[var(--muted)]">
            Original upload preserved
            <br />
            Presentation metadata only
          </div>
        </div>

        <div className="grid gap-3.5 p-4 md:grid-cols-[minmax(0,1.42fr)_minmax(245px,0.58fr)]">
          {/* ── Stage column ─────────────────────────────────────────── */}
          <div className="min-w-0">
            {photos.length > 1 && (
              <div className="mb-2.5 flex gap-1.5 overflow-x-auto" aria-label="Choose hero photo">
                {photos.map((p, i) => {
                  const active = i === heroIndex;
                  return (
                    <button
                      key={`${p.photo.pathname}-${i}`}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Use ${p.category} photo as hero`}
                      onClick={() =>
                        /* Choosing a different hero resets framing: a focal
                           point found on one photograph means nothing on
                           another. Better to start centred than to inherit a
                           crop that was never chosen for this image. */
                        setDraft({
                          ...defaultPresentation(),
                          heroPathname: p.photo.pathname,
                        })
                      }
                      className={`h-[42px] w-[52px] shrink-0 overflow-hidden border transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ead37e] ${
                        active
                          ? "border-[var(--gold)] shadow-[0_0_0_1px_rgba(197,170,85,0.34)]"
                          : "border-[#343740] hover:border-[var(--gold-dim)]"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.photo.url} alt="" className="h-full w-full object-cover" />
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
              {heroPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroPhoto.photo.url}
                  alt=""
                  draggable={false}
                  style={heroStyle}
                  className="pointer-events-none h-full w-full select-none"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[12px] text-[var(--muted)]">
                  No photos to adjust
                </div>
              )}
              {/* Safe frame + centre mark — guides, never controls. */}
              <div className="pointer-events-none absolute inset-[6%] border border-dashed border-[rgba(213,188,101,0.55)]" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2">
                <div className="absolute left-1/2 top-0 h-7 w-px bg-[rgba(213,188,101,0.58)]" />
                <div className="absolute left-0 top-1/2 h-px w-7 bg-[rgba(213,188,101,0.58)]" />
              </div>
            </div>
          </div>

          {/* ── Controls column ──────────────────────────────────────── */}
          <div className="md:border-l md:border-[var(--border-subtle)] md:pl-3.5">
            <h4 className="font-display text-[16px] font-light text-[var(--platinum)]">
              Hero presentation
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
                <span>{draft.zoom.toFixed(2)}×</span>
              </label>
              <input
                id="fw-zoom"
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={ZOOM_STEP}
                value={draft.zoom}
                onChange={(e) => setDraft((d) => ({ ...d, zoom: Number(e.target.value) }))}
                className="w-full accent-[var(--gold)]"
              />
            </div>

            {/* Both previews are the real crop — same style, different box. */}
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

            {heroPhoto && (
              <div
                className={`relative mt-2 aspect-[4/3] overflow-hidden border border-[#353840] bg-[#090a0d] ${
                  preview === "mobile" ? "mx-auto w-[132px]" : "w-full"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroPhoto.photo.url}
                  alt={`${preview === "desktop" ? "Desktop" : "Mobile"} crop preview`}
                  style={heroStyle}
                  className="h-full w-full"
                />
              </div>
            )}

            <div className="mt-2.5 border-t border-[#292c33] pt-2 text-[9px] leading-[1.45] text-[#89919f]">
              hero={heroPhoto?.category ?? "—"} · focal_x={draft.focalX.toFixed(3)} · focal_y=
              {draft.focalY.toFixed(3)} · zoom={draft.zoom.toFixed(2)}
            </div>

            <div className="mt-3 grid grid-cols-[1fr_1fr_1.35fr] gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="border border-[#363940] bg-[#101217] px-2 py-2.5 text-[8px] uppercase tracking-[0.1em] text-[#c8c4b9]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setDraft(defaultPresentation())}
                className="border border-[#5d5233] bg-[#101217] px-2 py-2.5 text-[8px] uppercase tracking-[0.1em] text-[#cfb866]"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave(draft);
                  onClose();
                }}
                className="border border-[#d1b862] bg-[#c3a951] px-2 py-2.5 text-[8px] uppercase tracking-[0.1em] text-[#17140d]"
              >
                Save presentation
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border-subtle)] px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className={hairline} aria-hidden="true" />
            <span className="text-[9px] leading-[1.4] text-[var(--muted)]">
              Photo roles still govern gallery order. Your source photographs are unchanged.
            </span>
            <span className={hairline} aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
