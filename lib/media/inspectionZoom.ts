/* ════════════════════════════════════════════════════════════════════════
   INSPECTION ZOOM — geometry

   Pure. No DOM, no React, no side effects — so the invariants that make
   cursor-anchored zoom feel correct can be proven by arithmetic rather than
   by looking at a screen and deciding it seemed fine.

   Screen-space model, deliberately: the image is drawn with
   transform-origin 0 0 and `translate(x, y) scale(s)`, so a point at image
   coordinate p appears at viewport coordinate p·s + t. Every function below
   speaks that one language. Mixing origins is how anchored zoom drifts.
   ════════════════════════════════════════════════════════════════════════ */

export type Transform = { scale: number; x: number; y: number };
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

/** Fit. Scale 1 is the photograph exactly filling its viewport — never a
    percentage of some absolute pixel size, because Fit is what the collector
    is already looking at. */
export const FIT: Transform = { scale: 1, x: 0, y: 0 };

/**
 * THE NATIVE-DETAIL CEILING.
 *
 * How much more real detail does this source hold than Fit is already
 * showing? That ratio, and not a number somebody liked:
 *
 *   maxScale = max(1, min(naturalW / fitW, naturalH / fitH))
 *
 * A 2× or 3× constant would be a promise the file cannot keep. Past this
 * ceiling the browser is interpolating, and interpolation presented as
 * inspection is the same lie as an upscaled listing photo — it looks like
 * more information and is not. If a source has nothing more to give, the
 * ceiling is exactly 1 and the interaction is not offered at all.
 *
 * `min` of the two axes, not `max`: the first axis to run out of pixels is
 * the one that decides, because past that point the other axis is being
 * invented too.
 */
export function nativeDetailCeiling(natural: Size, fit: Size): number {
  if (!(natural.width > 0) || !(natural.height > 0)) return 1;
  if (!(fit.width > 0) || !(fit.height > 0)) return 1;
  const ratio = Math.min(natural.width / fit.width, natural.height / fit.height);
  if (!Number.isFinite(ratio)) return 1;
  return Math.max(1, ratio);
}

/**
 * THE FIT RECTANGLE, computed rather than coaxed out of CSS.
 *
 * Two CSS attempts failed here and both failed silently, which is why this
 * is arithmetic now. `container-type: size` on the stage made the stage's
 * box independent of its contents, so as a flex item it collapsed. And
 * `aspect-ratio` with `width: 100%` cannot work either: width is then
 * DEFINITE, so the ratio only derives height, and a max-height merely clips
 * — the box keeps the full width and the aspect is quietly violated.
 *
 * object-contain in one line: take the largest box of this aspect that fits
 * the stage, then cap it at the source's own pixels so the viewport never
 * claims more room than the photograph has detail to fill.
 */
export function containRect(stage: Size, aspect: number, natural?: Size): Size {
  if (!(stage.width > 0) || !(stage.height > 0) || !(aspect > 0)) {
    return { width: 0, height: 0 };
  }
  let width = Math.min(stage.width, stage.height * aspect);
  let height = width / aspect;
  if (natural && natural.width > 0 && natural.height > 0) {
    if (width > natural.width) {
      width = natural.width;
      height = width / aspect;
    }
    if (height > natural.height) {
      height = natural.height;
      width = height * aspect;
    }
  }
  return { width, height };
}

export function clampScale(scale: number, maxScale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(Math.max(scale, 1), Math.max(1, maxScale));
}

/**
 * Keep the photograph covering its viewport. With top-left translation:
 *
 *   viewport - viewport·scale  <=  translate  <=  0
 *
 * At scale 1 that collapses to exactly 0, which is why Fit cannot be nudged
 * off-centre. Above 1 it is the band in which the image still covers the
 * frame — so a collector can never drag the watch off to reveal empty room,
 * which reads as a broken viewer rather than as a boundary.
 */
export function clampTranslation(
  translation: Point,
  viewport: Size,
  scale: number
): Point {
  const minX = viewport.width - viewport.width * scale;
  const minY = viewport.height - viewport.height * scale;
  return {
    x: Math.min(0, Math.max(minX, translation.x)),
    y: Math.min(0, Math.max(minY, translation.y)),
  };
}

/**
 * THE CURSOR ANCHOR.
 *
 * The point under the pointer is the thing being inspected, so it must not
 * move. Recover which image coordinate is currently under the pointer, then
 * re-place the image so that same coordinate lands under the pointer at the
 * new scale:
 *
 *   imagePoint     = (pointer - translation) / scale
 *   newTranslation = pointer - imagePoint · newScale
 *
 * Anchoring to the viewport centre instead would be far simpler and would
 * make the detail the collector is pointing at slide away exactly when they
 * lean in — the one moment the interaction exists for.
 */
export function zoomAtPoint(
  current: Transform,
  pointer: Point,
  requestedScale: number,
  viewport: Size,
  maxScale: number
): Transform {
  const nextScale = clampScale(requestedScale, maxScale);
  if (nextScale === current.scale) return current;

  const imagePoint = {
    x: (pointer.x - current.x) / current.scale,
    y: (pointer.y - current.y) / current.scale,
  };
  const translation = clampTranslation(
    { x: pointer.x - imagePoint.x * nextScale, y: pointer.y - imagePoint.y * nextScale },
    viewport,
    nextScale
  );
  return { scale: nextScale, x: translation.x, y: translation.y };
}

/** Pan, clamped. Below Fit+ there is nothing to pan, and saying so here
    keeps every caller from having to remember it. */
export function panBy(
  current: Transform,
  delta: Point,
  viewport: Size
): Transform {
  if (current.scale <= 1) return current;
  const translation = clampTranslation(
    { x: current.x + delta.x, y: current.y + delta.y },
    viewport,
    current.scale
  );
  return { ...current, ...translation };
}

/**
 * Wheel notches vary wildly — a mouse reports ~100 pixel-ish units per
 * detent, a trackpad reports a stream of small ones, and Firefox may report
 * lines or pages instead. Normalising to a bounded factor is what stops the
 * same gesture zooming a hair on one device and leaping on another.
 */
export function wheelScaleFactor(deltaY: number, deltaMode = 0): number {
  const perUnit = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
  const pixels = deltaY * perUnit;
  // Bounded so one violent flick cannot cross the whole range at once.
  const clamped = Math.max(-120, Math.min(120, pixels));
  return Math.exp(-clamped / 320);
}

/** Pinch: the ratio of finger distances, applied to the scale the gesture
    started at. Ratio rather than delta, so a pinch feels the same whether
    the fingers start far apart or close together. */
export function pinchScale(startDistance: number, distance: number, startScale: number): number {
  if (!(startDistance > 0) || !(distance > 0)) return startScale;
  return startScale * (distance / startDistance);
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpointOf(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Geometry changed underneath a zoomed photograph — a resize, an orientation
 * flip, a reflow. The ceiling may now be LOWER than the scale currently in
 * use, and leaving it would show interpolation the source cannot justify.
 * Clamp scale first, then re-clamp translation against the new viewport, in
 * that order: clamping translation against a scale that is about to change
 * produces a valid answer to the wrong question.
 */
export function reconcile(
  current: Transform,
  viewport: Size,
  maxScale: number
): Transform {
  const scale = clampScale(current.scale, maxScale);
  const translation = clampTranslation({ x: current.x, y: current.y }, viewport, scale);
  return { scale, x: translation.x, y: translation.y };
}

/** Is there any more real detail to reach? Drives whether the interaction —
    and its discovery hint — is offered at all. */
export function hasInspectableDetail(maxScale: number): boolean {
  return maxScale > 1.01;
}
