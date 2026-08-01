/* ════════════════════════════════════════════════════════════════════════
   PHOTO PRESENTATION — the ONE metadata contract governing photo framing

   A seller may improve how a photograph is PRESENTED. They may never alter,
   replace, delete, or subtract the photograph itself. Everything here is
   derived styling over an untouched source image: no canvas, no re-encode,
   no new upload, no destructive crop. The stored bytes are identical before
   and after.

   ── v2 · PER-PHOTO FRAMES ──────────────────────────────────────────────
   v1 stored ONE framing record, which silently meant "the hero's framing".
   A seller could centre the dial, then open the clasp photo — and either
   overwrite the dial's framing or find their work gone. One record cannot
   describe seven photographs.

   v2 keys framing by stable PATHNAME:

     {
       heroPathname: "listings/dial-abc.jpg" | null,
       frames: {
         "listings/dial-abc.jpg":  { focalX, focalY, zoom },
         "listings/clasp-xyz.jpg": { focalX, focalY, zoom }
       }
     }

   Pathname, never URL: a signed or CDN URL can be reissued, a pathname is the
   stable identity of the stored object.

   ── BACKWARD COMPATIBILITY IS MANDATORY ────────────────────────────────
   The v1 shape is already deployed and already in production rows. Reading it
   must never lose the seller's hero choice or their framing. sanitize()
   migrates v1 → v2 by attaching the old focal values to the hero they
   belonged to. A v1 record with NO hero carried framing for whichever photo
   was automatically the hero — unknowable here — so that framing is dropped
   rather than guessed onto the wrong photograph. Losing a centring is a
   nuisance; applying it to the wrong image is a wrong picture.

   ── WHY ONE FILE GOVERNS DESKTOP AND MOBILE ────────────────────────────
   Focal position is stored NORMALIZED (0..1 of the image itself), so
   `object-position` puts the same point of the photograph at the same
   relative spot in ANY container at ANY aspect ratio. Desktop and mobile
   differ only in the box they paint into.

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
};

export type PhotoPresentation = {
  heroPathname: string | null;
  frames: Record<string, PhotoFrame>;
};

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 1.14;
export const ZOOM_STEP = 0.01;

/** Automatic framing for one photograph: dead centre, no zoom. */
export function defaultFrame(): PhotoFrame {
  return { focalX: 0.5, focalY: 0.5, zoom: 1 };
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

/** Unknown → a valid frame, always. Never throws. */
export function sanitizeFrame(input: unknown): PhotoFrame {
  const d = defaultFrame();
  if (!input || typeof input !== "object" || Array.isArray(input)) return d;
  const raw = input as Record<string, unknown>;
  return {
    focalX: round3(clamp(num(raw.focalX, d.focalX), 0, 1)),
    focalY: round3(clamp(num(raw.focalY, d.focalY), 0, 1)),
    zoom: round3(clamp(num(raw.zoom, d.zoom), ZOOM_MIN, ZOOM_MAX)),
  };
}

export function isDefaultFrame(f: PhotoFrame): boolean {
  return f.focalX === 0.5 && f.focalY === 0.5 && f.zoom === ZOOM_MIN;
}

/** Cap on stored frames — one listing cannot carry unbounded photo keys. */
const MAX_FRAMES = 40;

/* Unknown → valid, always. Runs on the client (draft resume), on the server
   (publish), and over rows written by v1 and by no version at all. It must
   never throw and never return a partial: malformed input is not an error to
   show a seller, it is simply automatic framing. */
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
  return presentation.frames[pathname] ?? defaultFrame();
}

/** Replace one photograph's framing, leaving every other photo untouched.
    Returns a NEW presentation — callers hold this in React state. */
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

/* The framing itself. Applied to the <img>; the parent MUST be
   `overflow-hidden` so zoom crops inside the frame rather than spilling.

   object-fit:cover + object-position is what makes this aspect-independent:
   the browser scales the photograph to fill the box, then slides it so the
   focal point sits at the requested relative position. */
export function frameStyle(frame: PhotoFrame): CSSProperties {
  return {
    objectFit: "cover",
    objectPosition: `${round3(frame.focalX * 100)}% ${round3(frame.focalY * 100)}%`,
    transform: frame.zoom === 1 ? undefined : `scale(${frame.zoom})`,
    transformOrigin: "center",
  };
}

/** Convenience: the style for one photograph in a presentation. */
export function presentationStyleFor(
  presentation: PhotoPresentation,
  pathname: string | null | undefined
): CSSProperties {
  return frameStyle(frameFor(presentation, pathname));
}

/* ── HERO SELECTION ────────────────────────────────────────────────────
   Hero choice is INDEPENDENT of gallery order. Roles govern the sequence
   buyers scroll through; this only answers "which one leads". A hero whose
   photograph has since disappeared falls back to the automatic choice rather
   than rendering nothing. */
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

/* ── AXIS AVAILABILITY — why horizontal drag appeared broken ────────────
   `object-position` can only move an image along an axis where it OVERFLOWS
   its container. With object-fit:cover exactly one axis overflows: the one
   whose ratio exceeds the container's.

   A 3:4 portrait photograph (0.75) inside the editor's 4:3 stage (1.333) is
   scaled to cover — its width fits exactly and its height spills. So vertical
   drag moved the picture and horizontal drag did nothing at all. That was
   never a bug in the drag handler: there was genuinely nothing hidden to the
   left or right to reveal.

   Zoom above 1.0 creates overflow on BOTH axes, which is why zooming makes
   horizontal movement begin working.

   The editor uses this to tell the seller the truth rather than letting them
   drag against nothing. focalX is still stored and still matters, because
   other surfaces crop differently — the browse card is portrait, and a
   landscape photograph overflows horizontally there. */
export function movableAxes(
  imageAspect: number | null,
  containerAspect: number,
  zoom: number
): { horizontal: boolean; vertical: boolean } {
  if (!imageAspect || !Number.isFinite(imageAspect) || imageAspect <= 0) {
    return { horizontal: zoom > 1, vertical: zoom > 1 };
  }
  const EPS = 0.01;
  const wider = imageAspect > containerAspect + EPS;
  const taller = imageAspect < containerAspect - EPS;
  return {
    horizontal: wider || zoom > 1,
    vertical: taller || zoom > 1,
  };
}
