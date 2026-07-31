/* ════════════════════════════════════════════════════════════════════════
   PHOTO PRESENTATION — the ONE metadata contract governing hero framing

   A seller may improve how a photograph is PRESENTED. They may never alter,
   replace, delete, or subtract the photograph itself. Everything in this file
   is derived styling over an untouched source image: no canvas, no re-encode,
   no new upload, no destructive crop. The stored bytes at photo.url are the
   same bytes before and after.

   ── WHY ONE FILE GOVERNS BOTH DESKTOP AND MOBILE ──────────────────────
   The order forbids duplicate desktop/mobile framing logic. The temptation is
   two crop functions — one per breakpoint — because the two containers have
   different sizes. They don't need different logic: focal position is stored
   NORMALIZED (0..1 of the image's own dimensions), so `object-position` places
   the same point of the photograph at the same relative spot in ANY container,
   at any aspect ratio. Desktop and mobile differ only in the box they paint
   into. presentationStyle() is therefore the single source of truth, and both
   previews in the editor are the real thing rather than an approximation.

   ── THE STORED SHAPE ──────────────────────────────────────────────────
     heroPathname  which uploaded photo is the hero (storage pathname, the
                   stable identity — a URL can be re-signed, a pathname can't)
     focalX/focalY 0..1, the point of the photograph kept centred in frame
     zoom          1.00 .. 1.14, governed

   ── WHY ZOOM IS CAPPED AT 1.14 ────────────────────────────────────────
   Approved in the Design Gate reference. Below 1.0 the image would no longer
   fill its frame and would expose empty borders; far above it the seller
   begins cropping away material watch evidence — the exact subtraction the
   evidence law forbids. 1.14 is enough to recover a clipped lower dial and
   not enough to remove a bezel.
   ════════════════════════════════════════════════════════════════════════ */

import type { CSSProperties } from "react";

export type PhotoPresentation = {
  heroPathname: string | null;
  focalX: number;
  focalY: number;
  zoom: number;
};

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 1.14;
export const ZOOM_STEP = 0.01;

/** Automatic framing: dead centre, no zoom, hero chosen by photo role. */
export function defaultPresentation(): PhotoPresentation {
  return { heroPathname: null, focalX: 0.5, focalY: 0.5, zoom: 1 };
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Round to 3dp so the stored value is stable and comparable across saves. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/* Unknown → valid, always. This runs on the client (draft resume), on the
   server (publish), and over rows written by earlier versions that have no
   presentation at all. It must never throw and never return a partial:
   a malformed value is not an error to surface to a seller, it is simply
   automatic framing. */
export function sanitizePhotoPresentation(input: unknown): PhotoPresentation {
  const d = defaultPresentation();
  if (!input || typeof input !== "object" || Array.isArray(input)) return d;
  const raw = input as Record<string, unknown>;

  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const hero = raw.heroPathname;
  return {
    heroPathname:
      typeof hero === "string" && hero.trim() !== "" ? hero.trim().slice(0, 512) : null,
    focalX: round3(clamp(num(raw.focalX, d.focalX), 0, 1)),
    focalY: round3(clamp(num(raw.focalY, d.focalY), 0, 1)),
    zoom: round3(clamp(num(raw.zoom, d.zoom), ZOOM_MIN, ZOOM_MAX)),
  };
}

/** True when the seller has not moved anything away from automatic framing. */
export function isDefaultPresentation(p: PhotoPresentation): boolean {
  return p.heroPathname === null && p.focalX === 0.5 && p.focalY === 0.5 && p.zoom === ZOOM_MIN;
}

/* The framing itself. Applied to the <img>; the parent must be
   `overflow-hidden` so zoom crops inside the frame instead of spilling.

   object-fit:cover + object-position is what makes this aspect-independent:
   the browser scales the photograph to fill the box and then slides it so the
   focal point sits at the requested relative position. A 4:3 desktop hero and
   a narrow mobile card get the same watch centre for free. */
export function presentationStyle(p: PhotoPresentation): CSSProperties {
  return {
    objectFit: "cover",
    objectPosition: `${round3(p.focalX * 100)}% ${round3(p.focalY * 100)}%`,
    transform: p.zoom === 1 ? undefined : `scale(${p.zoom})`,
    transformOrigin: "center",
  };
}

/* ── HERO SELECTION ────────────────────────────────────────────────────
   Hero choice is INDEPENDENT of gallery order. Photo roles continue to
   govern the order buyers scroll through; this only answers "which one is
   shown first/large". A hero whose photo has since disappeared falls back to
   the automatic choice rather than rendering nothing. */
export function resolveHeroIndex(
  pathnames: readonly (string | null | undefined)[],
  presentation: PhotoPresentation,
  automaticIndex = 0
): number {
  if (presentation.heroPathname) {
    const i = pathnames.findIndex((p) => p === presentation.heroPathname);
    if (i >= 0) return i;
  }
  return automaticIndex >= 0 && automaticIndex < pathnames.length ? automaticIndex : 0;
}

/* Framing is a property of ONE photograph — the hero. Applying a focal point
   chosen on the dial shot to a caseback shot would frame it by coincidence.
   So any photo that is not the stored hero renders automatically. */
export function presentationForPhoto(
  pathname: string | null | undefined,
  presentation: PhotoPresentation,
  isHero: boolean
): CSSProperties {
  if (!isHero || !pathname) return presentationStyle(defaultPresentation());
  if (presentation.heroPathname && presentation.heroPathname !== pathname) {
    return presentationStyle(defaultPresentation());
  }
  return presentationStyle(presentation);
}
