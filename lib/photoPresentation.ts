/* ════════════════════════════════════════════════════════════════════════
   PHOTO PRESENTATION — the ONE metadata contract governing photo framing

   A seller may improve how a photograph is PRESENTED. They may never alter,
   replace, delete, or subtract the photograph itself. Everything here is
   derived styling over an untouched source image: no canvas, no re-encode,
   no new upload, no destructive crop. The stored bytes are identical before
   and after.

   ── v2 · PER-PHOTO FRAMES ──────────────────────────────────────────────
   v1 stored ONE framing record, which silently meant "the hero's framing".
   v2 keys framing by stable PATHNAME:

     {
       heroPathname: "listings/dial-abc.jpg" | null,
       frames: {
         "listings/dial-abc.jpg":  { focalX, focalY, zoom, rotationDeg },
         "listings/clasp-xyz.jpg": { focalX, focalY, zoom, rotationDeg }
       }
     }

   Pathname, never URL: a signed or CDN URL can be reissued, a pathname is the
   stable identity of the stored object.

   ── v2.1 · QUARTER-TURN ROTATION ───────────────────────────────────────
   rotationDeg ∈ {0, 90, 180, 270}, clockwise, presentation-only. The proven
   case: a Non-Crown Side photograph captured vertically reads awkwardly
   north-to-south; turned east-west, the whole side silhouette and both
   teardrop lugs read as one horizontal object. The upload is never rewritten
   — rotation is a CSS transform, exactly like focal position and zoom.

   ── BACKWARD COMPATIBILITY IS MANDATORY ────────────────────────────────
   The v1 single-record shape is already in production rows. sanitize()
   migrates v1 → v2 by attaching the old focal values to the hero they
   belonged to; a v1 record with NO hero carried framing for an unknowable
   automatic hero, so that framing is dropped rather than guessed onto the
   wrong photograph. Rows without rotation read as rotationDeg 0.

   ── WHY ONE FILE GOVERNS DESKTOP AND MOBILE ────────────────────────────
   Focal position is stored NORMALIZED (0..1 of the image itself), so
   `object-position` puts the same point of the photograph at the same
   relative spot in ANY container. Rotation is the one property that needs to
   know the container's aspect (see frameStyle), so cropped surfaces pass
   theirs; everything else is aspect-independent.

   ── WHY ZOOM IS CAPPED AT 1.14 ─────────────────────────────────────────
   Approved in the Design Gate. Below 1.0 the image stops filling its frame
   and exposes empty borders; far above it the seller begins cropping away
   material watch evidence — the subtraction the evidence law forbids.
   ════════════════════════════════════════════════════════════════════════ */

import type { CSSProperties } from "react";

export type PhotoFrame = {
  focalX: number;
  focalY: number;
  zoom: number;
  /** Clockwise quarter-turns: 0 | 90 | 180 | 270. Presentation only. */
  rotationDeg: number;
};

export type PhotoPresentation = {
  heroPathname: string | null;
  frames: Record<string, PhotoFrame>;
};

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 1.14;
export const ZOOM_STEP = 0.01;

export const ROTATION_VALUES = [0, 90, 180, 270] as const;

/** Automatic framing for one photograph: centred, unzoomed, unrotated. */
export function defaultFrame(): PhotoFrame {
  return { focalX: 0.5, focalY: 0.5, zoom: 1, rotationDeg: 0 };
}

/** Automatic presentation: role-governed hero, nothing framed. */
export function defaultPresentation(): PhotoPresentation {
  return { heroPathname: null, frames: {} };
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** 3dp so a saved value survives reload without float drift. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function boundPath(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 512) : null;
}

/** Strictly one of the four quarter-turns; anything else is upright. A 45°
    would tilt evidence and a "90" string is a type error — both refuse to 0. */
export function sanitizeRotation(v: unknown): number {
  return typeof v === "number" && (ROTATION_VALUES as readonly number[]).includes(v) ? v : 0;
}

/** Unknown → a valid frame, always. Never throws. */
export function sanitizeFrame(input: unknown): PhotoFrame {
  const d = defaultFrame();
  if (!input || typeof input !== "object" || Array.isArray(input)) return d;
  const raw = input as Record<string, unknown>;
  return {
    focalX: round3(clamp(num(raw.focalX, d.focalX), 0, 1)),
    focalY: round3(clamp(num(raw.focalY, d.focalY), 0, 1)),
    zoom: round3(clamp(num(raw.zoom, d.zoom), ZOOM_MIN, ZOOM_MAX)),
    rotationDeg: sanitizeRotation(raw.rotationDeg),
  };
}

export function isDefaultFrame(f: PhotoFrame): boolean {
  return (
    f.focalX === 0.5 && f.focalY === 0.5 && f.zoom === ZOOM_MIN && (f.rotationDeg ?? 0) === 0
  );
}

/** Cap on stored frames — one listing cannot carry unbounded photo keys. */
const MAX_FRAMES = 40;

/* Unknown → valid, always. Runs on the client (draft resume), on the server
   (publish), and over rows written by v1 and by no version at all. */
export function sanitizePhotoPresentation(input: unknown): PhotoPresentation {
  const out = defaultPresentation();
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  const raw = input as Record<string, unknown>;

  out.heroPathname = boundPath(raw.heroPathname);

  // ── v2 ── frames map
  if (raw.frames && typeof raw.frames === "object" && !Array.isArray(raw.frames)) {
    let n = 0;
    for (const [key, value] of Object.entries(raw.frames as Record<string, unknown>)) {
      const path = boundPath(key);
      if (!path) continue;
      const frame = sanitizeFrame(value);
      // Storing a default frame is noise — "unframed" and "framed to centre"
      // are the same picture, and omitting it keeps rows honest and small.
      if (isDefaultFrame(frame)) continue;
      out.frames[path] = frame;
      if (++n >= MAX_FRAMES) break;
    }
    return out;
  }

  /* ── v1 migration ── the deployed single-record shape carried focal values
     that belonged to the hero. Attach them there; drop them if the hero is
     unknown rather than framing an arbitrary photograph with them. */
  const hasV1 = "focalX" in raw || "focalY" in raw || "zoom" in raw;
  if (hasV1 && out.heroPathname) {
    const frame = sanitizeFrame(raw);
    if (!isDefaultFrame(frame)) out.frames[out.heroPathname] = frame;
  }
  return out;
}

/** True when the seller has chosen nothing at all. */
export function isDefaultPresentation(p: PhotoPresentation): boolean {
  return p.heroPathname === null && Object.keys(p.frames).length === 0;
}

/** The framing for one photograph — automatic unless the seller set it. */
export function frameFor(
  presentation: PhotoPresentation,
  pathname: string | null | undefined
): PhotoFrame {
  if (!pathname) return defaultFrame();
  const f = presentation.frames[pathname];
  return f ? { ...defaultFrame(), ...f } : defaultFrame();
}

/** Replace one photograph's framing, leaving every other photo untouched. */
export function withFrame(
  presentation: PhotoPresentation,
  pathname: string,
  frame: PhotoFrame
): PhotoPresentation {
  const frames = { ...presentation.frames };
  if (isDefaultFrame(frame)) delete frames[pathname];
  else frames[pathname] = frame;
  return { ...presentation, frames };
}

/** Explicit hero selection. Framing is untouched — choosing a hero is not a
    framing decision, and the two must never move together. */
export function withHero(
  presentation: PhotoPresentation,
  pathname: string | null
): PhotoPresentation {
  return { ...presentation, heroPathname: pathname };
}

/* ── ROTATION GEOMETRY ─────────────────────────────────────────────────
   object-fit:cover fills the container FIRST; the rotate transform then
   turns that already-fitted box. After a quarter-turn its footprint is the
   container's dimensions swapped, so in a non-square container the corners
   would show background. The correction is a further scale of
   max(aspect, 1/aspect) — exactly enough to cover again, never more, so the
   extra crop stays minimal. This is the ONE place presentation needs the
   container's aspect, which is why cropped surfaces pass theirs. */
export function rotationCoverScale(rotationDeg: number, containerAspect: number): number {
  if (rotationDeg !== 90 && rotationDeg !== 270) return 1;
  if (!Number.isFinite(containerAspect) || containerAspect <= 0) return 1;
  return Math.round(Math.max(containerAspect, 1 / containerAspect) * 10000) / 10000;
}

/* The framing itself. Applied to the <img>; the parent MUST be
   `overflow-hidden` so zoom and rotation crop inside the frame rather than
   spilling over siblings. */
export function frameStyle(frame: PhotoFrame, containerAspect = 4 / 3): CSSProperties {
  const rot = sanitizeRotation(frame.rotationDeg);
  const scale = Math.round(frame.zoom * rotationCoverScale(rot, containerAspect) * 10000) / 10000;
  const parts: string[] = [];
  if (rot !== 0) parts.push(`rotate(${rot}deg)`);
  if (scale !== 1) parts.push(`scale(${scale})`);
  return {
    objectFit: "cover",
    objectPosition: `${round3(frame.focalX * 100)}% ${round3(frame.focalY * 100)}%`,
    transform: parts.length ? parts.join(" ") : undefined,
    transformOrigin: "center",
  };
}

/** Convenience: the style for one photograph in a presentation. */
export function presentationStyleFor(
  presentation: PhotoPresentation,
  pathname: string | null | undefined,
  containerAspect = 4 / 3
): CSSProperties {
  return frameStyle(frameFor(presentation, pathname), containerAspect);
}

/* ── HERO SELECTION ──────────────────────────────────────────────────── */
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

/* ── POINTER GEOMETRY UNDER ROTATION ───────────────────────────────────
   When the photograph is rotated, a sideways gesture on screen must move it
   sideways ON SCREEN — which is a different axis of the underlying image.
   Screen deltas are mapped into image space through the inverse rotation, so
   the photo always follows the pointer regardless of orientation. */
export function screenToImageDelta(
  rotationDeg: number,
  dx: number,
  dy: number
): { dx: number; dy: number } {
  switch (sanitizeRotation(rotationDeg)) {
    case 90:
      return { dx: dy, dy: -dx };
    case 180:
      return { dx: -dx, dy: -dy };
    case 270:
      return { dx: -dy, dy: dx };
    default:
      return { dx, dy };
  }
}

/* ── AXIS AVAILABILITY — the honest "why won't it move" answer ─────────
   object-position can only move an image along an axis where it OVERFLOWS
   its container. A 3:4 portrait in the 4:3 stage overflows vertically only,
   so at 1.00× sideways drag genuinely has nothing to reveal — the original
   "horizontal drag does not work" report. Zoom creates overflow on both
   axes; so does a quarter-turn in a non-square container, because the
   rotation cover-scale enlarges the image. The editor uses this to explain
   rather than pretend. */
export function movableAxes(
  imageAspect: number | null,
  containerAspect: number,
  zoom: number,
  rotationDeg = 0
): { horizontal: boolean; vertical: boolean } {
  const rot = sanitizeRotation(rotationDeg);
  const quarter = rot === 90 || rot === 270;
  if (quarter && Math.abs(containerAspect - 1) > 0.01) {
    // The rotation cover-scale overflows both axes in any non-square frame.
    return { horizontal: true, vertical: true };
  }
  const eff = quarter && imageAspect ? 1 / imageAspect : imageAspect;
  if (!eff || !Number.isFinite(eff) || eff <= 0) {
    return { horizontal: zoom > 1, vertical: zoom > 1 };
  }
  const EPS = 0.01;
  return {
    horizontal: eff > containerAspect + EPS || zoom > 1,
    vertical: eff < containerAspect - EPS || zoom > 1,
  };
}
