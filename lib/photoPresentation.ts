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
  /* STORY PHOTO - the photograph the seller chose to accompany Story /
     Provenance on the listing. Optional: null means "no choice made", and
     the reader falls back automatically.

     It lives HERE, beside the hero, rather than in a new listings column
     because this record already is the governed seller-photo-choice
     contract: same owner, same stable pathname identity, same sanitizer,
     same persistence path, same backward-compatibility rules. A second
     column would have been a second authority over the same kind of fact.

     Pathname, never URL or index. A URL can be reissued and an index moves
     the moment the gallery is reordered; a pathname is the stored object's
     stable identity, which is exactly why the hero uses it.

     Cross-listing assignment is structurally impossible rather than
     validated: the resolver only ever matches this value against the
     pathnames of THIS listing's own photographs, so a pathname belonging to
     another listing simply never matches and the reader falls back.

     REQUIRED, not optional, in the type on purpose - it makes the compiler
     find every place that rebuilds this record without carrying the field
     across. Two such places existed. */
  storyPathname: string | null;
  frames: Record<string, PhotoFrame>;
};

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 1.14;
export const ZOOM_STEP = 0.01;

export const ROTATION_VALUES = [0, 90, 180, 270] as const;

/* Rotated photographs may zoom OUT below the fitted baseline, down to a
   governed floor. A vertically-captured side profile often cannot show both
   lugs at the fitted crop; the gap is filled by the surface's own dark matte
   -- background space, never a stretched or distorted photograph. Upright
   photos keep the 1.00 floor: below it they would expose borders with no
   compositional reason to. */
export const ZOOM_OUT_MIN_ROTATED = 0.85;

/** The governed zoom floor for a given orientation. */
export function zoomMinFor(rotationDeg: number): number {
  const r = sanitizeRotation(rotationDeg);
  return r === 90 || r === 270 ? ZOOM_OUT_MIN_ROTATED : ZOOM_MIN;
}

/** Automatic framing for one photograph: centred, unzoomed, unrotated. */
export function defaultFrame(): PhotoFrame {
  return { focalX: 0.5, focalY: 0.5, zoom: 1, rotationDeg: 0 };
}

/** Automatic presentation: role-governed hero, nothing framed. */
export function defaultPresentation(): PhotoPresentation {
  return { heroPathname: null, storyPathname: null, frames: {} };
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
  const rotationDeg = sanitizeRotation(raw.rotationDeg);
  return {
    focalX: round3(clamp(num(raw.focalX, d.focalX), 0, 1)),
    focalY: round3(clamp(num(raw.focalY, d.focalY), 0, 1)),
    // The floor depends on orientation: rotated frames may sit on the matte.
    zoom: round3(clamp(num(raw.zoom, d.zoom), zoomMinFor(rotationDeg), ZOOM_MAX)),
    rotationDeg,
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
  /* Read before the v2 branch below returns, so a row carrying frames does
     not lose its story selection on the way through. */
  out.storyPathname = boundPath(raw.storyPathname);

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
  return (
    p.heroPathname === null &&
    p.storyPathname === null &&
    Object.keys(p.frames).length === 0
  );
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

/** Explicit Story Photo selection.

    INDEPENDENT OF THE HERO, in both directions and deliberately: a seller
    may want the same photograph in both places, or two entirely different
    ones, and neither choice may quietly rewrite the other. Passing null
    clears the selection and returns the listing to automatic fallback.

    Framing is untouched here for the same reason it is untouched in
    withHero - choosing which photograph tells the story is not a decision
    about how any photograph is cropped. */
export function withStoryPhoto(
  presentation: PhotoPresentation,
  pathname: string | null
): PhotoPresentation {
  return { ...presentation, storyPathname: pathname };
}

/* -- ROTATION GEOMETRY -- the swapped box -------------------------------
   The naive approach -- cover-fit, rotate, scale back up to cover -- has two
   defects proven in production: object-fit crops BEFORE the transform, so
   the discarded part of the photo can never be revealed again, and the
   compensating scale silently magnifies (a third, in the 4:3 stage) while
   the zoom control still reads 1.00x.

   The correct construction sizes the element as the container with its
   dimensions SWAPPED -- width equal to the container's height, height equal
   to its width, both pure percentages derived from the container's own
   aspect -- centres it, and rotates it a quarter-turn. The rotated element
   then occupies exactly the container, and object-fit:cover inside the
   swapped box IS cover of the rotated photograph:

     - 1.00x is the true fitted baseline for the current orientation;
     - no pre-crop is baked in, so zoom-out genuinely reveals more;
     - below 1.00 the surface's own dark matte shows -- nothing stretches.

   No image measurement, no pixel values: the same static style works on
   every surface. The parent MUST be `relative` and `overflow-hidden`. */
export function frameStyle(frame: PhotoFrame, containerAspect = 4 / 3): CSSProperties {
  const rot = sanitizeRotation(frame.rotationDeg);
  const zoom = Math.round(frame.zoom * 10000) / 10000;
  const focal = `${round3(frame.focalX * 100)}% ${round3(frame.focalY * 100)}%`;

  /* -- THE ZOOM PAN ------------------------------------------------------
     object-position can only slide the image within its LAYOUT overflow --
     the excess object-fit:cover creates from an aspect mismatch. A
     transform scale() enlarges the picture but adds NO layout overflow, so
     on the zoomed axis the focal point silently did nothing: proven in
     production when a rotated photo (which fits its swapped box exactly,
     zero layout overflow) would not move at all at any zoom.

     The zoom excess is (z - 1) of the element per axis, so a translate of
     (0.5 - focal) * (z - 1) in ELEMENT units pans exactly across it. The
     two mechanisms compose without gaps: object-position spans the aspect
     overflow, the pan spans the zoom overflow, and their sum is precisely
     the total travel available -- the picture reaches its true edge and
     stops, on both axes, at any orientation.

     The pan sits between rotate and scale in the chain, so it acts in the
     element's own (image-space) axes -- the same space the stored focal and
     screenToImageDelta already use. At zoom <= 1 there is no excess and the
     pan is zero. */
  const panX = zoom > 1 ? Math.round((0.5 - frame.focalX) * (zoom - 1) * 1000) / 10 : 0;
  const panY = zoom > 1 ? Math.round((0.5 - frame.focalY) * (zoom - 1) * 1000) / 10 : 0;
  const pan = panX !== 0 || panY !== 0 ? `translate(${panX}%, ${panY}%)` : null;

  if (rot === 90 || rot === 270) {
    const a =
      Number.isFinite(containerAspect) && containerAspect > 0 ? containerAspect : 4 / 3;
    const w = Math.round((100 / a) * 1000) / 1000; // % of container WIDTH  = its height
    const h = Math.round(100 * a * 1000) / 1000; //   % of container HEIGHT = its width
    const parts = [`translate(-50%, -50%)`, `rotate(${rot}deg)`];
    if (pan) parts.push(pan);
    if (zoom !== 1) parts.push(`scale(${zoom})`);
    return {
      objectFit: "cover",
      objectPosition: focal,
      position: "absolute",
      left: "50%",
      top: "50%",
      width: `${w}%`,
      height: `${h}%`,
      maxWidth: "none",
      transform: parts.join(" "),
      transformOrigin: "center",
    };
  }

  const parts: string[] = [];
  if (rot !== 0) parts.push(`rotate(${rot}deg)`);
  if (pan) parts.push(pan);
  if (zoom !== 1) parts.push(`scale(${zoom})`);
  return {
    objectFit: "cover",
    objectPosition: focal,
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

/* ── STORY PHOTO SELECTION ─────────────────────────────────────────────
   The product law in one function: the Story Photo is seller-selected when
   provided, and automatic fallback exists ONLY when it is not.

   Three tiers, in order:
     1. the seller's explicit choice, IF that photograph is still present;
     2. otherwise the first photograph that is not the hero - the automatic
        behaviour, unchanged, so a listing that never chose reads exactly as
        it did before this existed;
     3. otherwise the hero, which is the honest answer for a listing with a
        single photograph.

   Tier 1 collapses three separate requirements into one comparison. A
   selection whose photograph was DELETED does not match and falls through;
   a pathname belonging to ANOTHER listing does not match and falls through;
   and a gallery REORDER changes nothing, because the match is on identity
   rather than position. There is no dangling reference to clean up because
   nothing here dereferences - it compares.

   THE AUTOMATIC CHOICE IS THE CALLER'S, passed in - exactly as
   resolveHeroIndex takes automaticIndex. This function owns one rule and
   one only: an explicit, still-valid selection beats the automatic answer.
   It deliberately does not re-implement what "the best non-hero photograph"
   means, so the existing fallback keeps its existing behaviour and there is
   no second definition of it to drift.

   Returns an index into `pathnames`, or -1 when there is nothing to show. */
export function resolveStoryIndex(
  pathnames: readonly (string | null | undefined)[],
  presentation: PhotoPresentation,
  automaticIndex: number
): number {
  if (pathnames.length === 0) return -1;

  if (presentation.storyPathname) {
    const i = pathnames.findIndex((p) => p === presentation.storyPathname);
    if (i >= 0) return i;
  }

  return automaticIndex >= 0 && automaticIndex < pathnames.length ? automaticIndex : -1;
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
  const eff = quarter && imageAspect ? 1 / imageAspect : imageAspect;
  if (!eff || !Number.isFinite(eff) || eff <= 0) {
    return { horizontal: zoom > 1, vertical: zoom > 1 };
  }
  /* cover fits the tighter axis exactly and overflows the other by the
     aspect mismatch; zoom multiplies both. An axis is movable when its net
     overflow factor exceeds 1 -- which also answers zoomed-OUT rotated
     frames honestly: sitting on the matte, nothing overflows, nothing
     moves, and the note says so. */
  const LIMIT = 1.01;
  const h = (eff >= containerAspect ? eff / containerAspect : 1) * zoom;
  const v = (eff < containerAspect ? containerAspect / eff : 1) * zoom;
  return { horizontal: h > LIMIT, vertical: v > LIMIT };
}
