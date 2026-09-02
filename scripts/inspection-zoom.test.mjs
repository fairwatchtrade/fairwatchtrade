/* ════════════════════════════════════════════════════════════════════════
   INSPECTION ZOOM — the interaction contract

   Run: node --experimental-strip-types scripts/inspection-zoom.test.mjs

   Two layers, because two different things can break:

     · GEOMETRY — anchoring, clamping, the native-detail ceiling. Pure
       arithmetic, so it is proven by arithmetic rather than by looking at a
       screen and deciding it seemed about right.
     · THE BOUNDARIES — which element hears the wheel, what resets when the
       photograph changes, which keys belong to whom. Source pins, because a
       later reader "simplifying" any of them would break the feature in a
       way no type checker notices.
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FIT,
  clampScale,
  clampTranslation,
  distanceBetween,
  hasInspectableDetail,
  midpointOf,
  nativeDetailCeiling,
  panBy,
  pinchScale,
  reconcile,
  wheelScaleFactor,
  zoomAtPoint,
} from "../lib/media/inspectionZoom.ts";

let n = 0;
const ok = (label, cond) => { n += 1; assert.ok(cond, label); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const near = (a, b, tol = 0.0001) => Math.abs(a - b) <= tol;

const VP = { width: 800, height: 600 };

/* ── 1 · NATIVE-DETAIL CEILING ─────────────────────────────────────────
   The ceiling is what the file actually holds, never a number somebody
   liked. Past it the browser interpolates, and interpolation presented as
   inspection is the same lie as an upscaled listing photo. */
{
  ok("G1 a 2400x1800 source in an 800x600 fit yields 3x",
    near(nativeDetailCeiling({ width: 2400, height: 1800 }, VP), 3));

  ok("G1 the SHORTER axis decides — the first to run out of pixels",
    near(nativeDetailCeiling({ width: 2400, height: 900 }, VP), 1.5));

  ok("G1 a source with nothing more to give yields exactly 1",
    nativeDetailCeiling({ width: 800, height: 600 }, VP) === 1);
  ok("G1 a source SMALLER than the fit is never scaled up to fake detail",
    nativeDetailCeiling({ width: 400, height: 300 }, VP) === 1);
  ok("G1 and that case offers no inspection at all",
    !hasInspectableDetail(nativeDetailCeiling({ width: 400, height: 300 }, VP)));

  ok("G1 landscape computes truthfully",
    near(nativeDetailCeiling({ width: 4000, height: 2000 }, { width: 1000, height: 500 }), 4));
  ok("G1 portrait computes truthfully",
    near(nativeDetailCeiling({ width: 2000, height: 4000 }, { width: 500, height: 1000 }), 4));

  ok("G1 unknown natural size never authorises zoom",
    nativeDetailCeiling({ width: 0, height: 0 }, VP) === 1);
  ok("G1 an unmeasured viewport never authorises zoom",
    nativeDetailCeiling({ width: 2400, height: 1800 }, { width: 0, height: 0 }) === 1);
}

/* ── 2 · THE CURSOR ANCHOR ─────────────────────────────────────────────
   The point under the pointer is the thing being inspected. It must not
   move — not on one zoom, and not measurably after many. */
{
  const max = 4;
  const pointer = { x: 250, y: 180 };

  const once = zoomAtPoint(FIT, pointer, 2, VP, max);
  const imagePointAfter = {
    x: (pointer.x - once.x) / once.scale,
    y: (pointer.y - once.y) / once.scale,
  };
  ok("G2 the image point under the pointer is unchanged by one zoom",
    near(imagePointAfter.x, pointer.x) && near(imagePointAfter.y, pointer.y));

  /* Repeated zoom is where a naive implementation drifts: each step
     re-derives from the previous transform, so an error compounds. */
  let t = FIT;
  for (let i = 0; i < 25; i += 1) t = zoomAtPoint(t, pointer, t.scale * 1.06, VP, max);
  const drift = {
    x: (pointer.x - t.x) / t.scale,
    y: (pointer.y - t.y) / t.scale,
  };
  ok("G2 25 successive zooms do not drift the anchor",
    near(drift.x, pointer.x, 0.5) && near(drift.y, pointer.y, 0.5));

  /* And back down again returns to Fit exactly. */
  let back = t;
  for (let i = 0; i < 60; i += 1) back = zoomAtPoint(back, pointer, back.scale / 1.2, VP, max);
  ok("G2 zooming back out lands on Fit exactly",
    back.scale === 1 && back.x === 0 && back.y === 0);

  /* A corner anchor is the case that exposes sign errors. */
  const corner = zoomAtPoint(FIT, { x: 0, y: 0 }, 3, VP, max);
  ok("G2 anchoring at the top-left corner needs no translation",
    corner.x === 0 && corner.y === 0);
  const far = zoomAtPoint(FIT, { x: VP.width, y: VP.height }, 2, VP, max);
  ok("G2 anchoring at the bottom-right pins that corner",
    near(far.x, VP.width - VP.width * 2) && near(far.y, VP.height - VP.height * 2));
}

/* ── 3 · CLAMPS — no empty space, ever ─────────────────────────────────── */
{
  ok("G3 scale is bounded below by Fit", clampScale(0.2, 4) === 1);
  ok("G3 scale is bounded above by the ceiling", clampScale(99, 4) === 4);
  ok("G3 a ceiling below 1 still yields 1", clampScale(2, 0.5) === 1);
  ok("G3 nonsense scale falls back to Fit", clampScale(NaN, 4) === 1);

  ok("G3 at Fit the image cannot be nudged off centre",
    JSON.stringify(clampTranslation({ x: 40, y: -40 }, VP, 1)) === JSON.stringify({ x: 0, y: 0 }));

  const c = clampTranslation({ x: 500, y: 500 }, VP, 2);
  ok("G3 translation cannot expose space at the top-left", c.x === 0 && c.y === 0);
  const d = clampTranslation({ x: -5000, y: -5000 }, VP, 2);
  ok("G3 translation cannot expose space at the bottom-right",
    d.x === VP.width - VP.width * 2 && d.y === VP.height - VP.height * 2);

  ok("G3 panning does nothing at Fit — there is nothing to pan",
    panBy(FIT, { x: 50, y: 50 }, VP) === FIT);

  const zoomed = zoomAtPoint(FIT, { x: 400, y: 300 }, 2, VP, 4);
  const panned = panBy(zoomed, { x: 10_000, y: 10_000 }, VP);
  ok("G3 a violent pan is clamped, not obeyed", panned.x === 0 && panned.y === 0);
}

/* ── 4 · RESIZE REDUCES THE CEILING ────────────────────────────────────
   A bigger viewport means Fit already shows more of the source, so LESS
   remains to zoom into. State that was legal a moment ago may not be. */
{
  const small = { width: 400, height: 300 };
  const maxSmall = nativeDetailCeiling({ width: 2400, height: 1800 }, small); // 6
  let t = zoomAtPoint(FIT, { x: 200, y: 150 }, 6, small, maxSmall);
  ok("G4 a small viewport permits deep zoom", near(t.scale, 6));

  const large = { width: 1200, height: 900 };
  const maxLarge = nativeDetailCeiling({ width: 2400, height: 1800 }, large); // 2
  const after = reconcile(t, large, maxLarge);
  ok("G4 growing the viewport lowers the ceiling", near(maxLarge, 2));
  ok("G4 and the live scale is clamped down to it", near(after.scale, 2));
  const bound = clampTranslation({ x: after.x, y: after.y }, large, after.scale);
  ok("G4 translation is re-clamped against the new geometry",
    after.x === bound.x && after.y === bound.y);
  ok("G4 no empty space survives the resize",
    after.x <= 0 && after.y <= 0 &&
    after.x >= large.width - large.width * after.scale &&
    after.y >= large.height - large.height * after.scale);
}

/* ── 5 · WHEEL NORMALISATION ───────────────────────────────────────────── */
{
  ok("W1 scrolling up zooms in", wheelScaleFactor(-100) > 1);
  ok("W1 scrolling down zooms out", wheelScaleFactor(100) < 1);
  ok("W1 no movement is no change", wheelScaleFactor(0) === 1);
  ok("W1 a line-mode wheel is not a thousand times a pixel-mode one",
    wheelScaleFactor(3, 1) < 1 && wheelScaleFactor(3, 1) > 0.5);
  ok("W1 one violent flick cannot cross the whole range",
    wheelScaleFactor(-100000) < 1.5);
  ok("W1 trackpad micro-deltas move gently",
    wheelScaleFactor(-4) > 1 && wheelScaleFactor(-4) < 1.05);
}

/* ── 6 · PINCH ─────────────────────────────────────────────────────────── */
{
  ok("M1 fingers apart doubles the scale", near(pinchScale(100, 200, 1), 2));
  ok("M1 fingers together halve it", near(pinchScale(200, 100, 2), 1));
  ok("M1 a degenerate distance changes nothing", pinchScale(0, 100, 2) === 2);
  ok("M1 distance is euclidean", near(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 }), 5));
  ok("M1 the centroid sits between the fingers",
    JSON.stringify(midpointOf({ x: 0, y: 0 }, { x: 10, y: 20 })) === JSON.stringify({ x: 5, y: 10 }));

  /* The centroid anchors exactly as the pointer does on desktop. */
  const centroid = midpointOf({ x: 300, y: 200 }, { x: 500, y: 400 });
  const t = zoomAtPoint(FIT, centroid, pinchScale(100, 250, 1), VP, 4);
  const stillUnder = { x: (centroid.x - t.x) / t.scale, y: (centroid.y - t.y) / t.scale };
  ok("M1 the detail between the fingers stays between the fingers",
    near(stillUnder.x, centroid.x) && near(stillUnder.y, centroid.y));
  ok("M1 the ceiling governs pinch too", zoomAtPoint(FIT, centroid, 99, VP, 3).scale === 3);
}

/* ── 7 · THE EVENT BOUNDARY, pinned at the source ──────────────────────── */
{
  const vp = read("components/InspectionViewport.tsx");
  const gallery = read("components/ListingGallery.tsx");

  ok("E1 the wheel listener is native and non-passive",
    /addEventListener\("wheel", onWheel, \{ passive: false \}\)/.test(vp));
  ok("E1 it is attached to the photograph viewport element, not a global",
    /el\.addEventListener\("wheel"/.test(vp) &&
    /const el = viewportRef\.current;/.test(vp) &&
    !/window\.addEventListener\("wheel"|document\.addEventListener\("wheel"/.test(vp));
  ok("E1 and it is removed from that same element on cleanup",
    /return \(\) => el\.removeEventListener\("wheel", onWheel\)/.test(vp));

  ok("E2 ordinary wheel is returned untouched — no Ctrl, no interception",
    /if \(!e\.ctrlKey\) return;/.test(vp));
  ok("E2 preventDefault runs BEFORE the ceiling is consulted, so the gesture stays consumed at max",
    vp.indexOf("e.preventDefault();") < vp.indexOf("if (!canInspect) return;"));

  ok("E3 the untransformed fit box is measured, never getBoundingClientRect",
    /clientWidth/.test(vp) && !/getBoundingClientRect\(\)[\s\S]{0,80}(width|height)/.test(vp));
  ok("E3 geometry is observed rather than assumed", /new ResizeObserver/.test(vp));

  ok("E4 touch-action is scoped to the photograph viewport only",
    /touchAction: canInspect \? "none" : undefined/.test(vp));
  ok("E4 global browser accessibility zoom is never disabled",
    !/user-scalable|maximum-scale/.test(vp) && !/user-scalable|maximum-scale/.test(gallery));

  ok("E5 no smoothing animation fights the hand",
    !/transition:[^;]*transform/.test(vp));
}

/* ── 8 · PHOTO CHANGE RESETS TO FIT ────────────────────────────────────
   Not by hand. The viewport is keyed by the photograph, so a change
   remounts it and takes scale, translation, drag records AND the previous
   source's measured dimensions with it. Resetting by hand would leave the
   old naturals alive for a frame, and for that frame photograph B could be
   zoomed on the authority of photograph A's pixels. */
{
  const gallery = read("components/ListingGallery.tsx");
  ok("P1 the viewport is keyed by the photograph itself",
    /<InspectionViewport\s+key=\{heroUrl\}/.test(gallery));
  ok("P1 every navigation path drives that same active photo state",
    /setActive\(\(i\) => Math\.max\(0, i - 1\)\)/.test(gallery) &&
    /setActive\(\(i\) => Math\.min\(photos\.length - 1, i \+ 1\)\)/.test(gallery) &&
    /onClick=\{\(\) => setActive\(i\)\}/.test(gallery));
  ok("P1 keyboard photo navigation drives it too",
    /if \(e\.key === "ArrowLeft"\) setActive/.test(gallery));
  ok("P1 the transform state starts at Fit", /useState<Transform>\(FIT\)/.test(read("components/InspectionViewport.tsx")));
}

/* ── 9 · ACCESSIBILITY ─────────────────────────────────────────────────── */
{
  const vp = read("components/InspectionViewport.tsx");
  const gallery = read("components/ListingGallery.tsx");

  ok("A1 Zoom In, Zoom Out and Fit exist as real buttons",
    /aria-label="Zoom in"/.test(gallery) && /aria-label="Zoom out"/.test(gallery) &&
    /aria-label="Fit photograph to the viewer"/.test(gallery));
  ok("A1 they are <button>, so they are keyboard operable for free",
    /type="button"[\s\S]{0,200}aria-label="Zoom in"/.test(gallery));
  ok("A1 they carry a visible focus state",
    /focus-visible:outline-\[var\(--gold\)\]/.test(gallery));
  ok("A1 they are not offered when the source cannot zoom",
    /zoomState\.maxScale > 1\.01 &&/.test(gallery));
  ok("A1 zoom level is announced truthfully",
    /aria-live="polite"/.test(gallery) && /Zoomed \$\{zoomState\.scale\.toFixed\(1\)\} times/.test(gallery));

  ok("A2 the photograph surface is focusable and named",
    /tabIndex=\{0\}/.test(vp) && /role="img"/.test(vp) && /aria-label=\{/.test(vp));
  ok("A2 keyboard zoom keys work on the focused surface",
    /e\.key === "\+" \|\| e\.key === "="/.test(vp) && /e\.key === "0"/.test(vp));

  /* ARBITRATION: while zoomed, arrows pan and the event is stopped, so the
     viewer's document-level handler cannot also change photograph. */
  ok("A3 arrow keys pan only while zoomed",
    /const panning = transform\.scale > 1;/.test(vp) && /if \(panning && pans\[e\.key\]\)/.test(vp));
  ok("A3 and a panning key never reaches the photo-navigation handler",
    /e\.stopPropagation\(\);/.test(vp));
  ok("A3 unzoomed, the arrows are left alone for photo navigation",
    /if \(panning && pans\[e\.key\]\) \{[\s\S]{0,200}return;\s*\}/.test(vp));

  ok("A4 Close autofocus and focus return to Inspect are preserved",
    /autoFocus/.test(gallery) && /inspectOpenerRef\.current\?\.focus\(\)/.test(gallery));
  ok("A4 the alt identity comes from the listing, and claims nothing visual",
    /const inspectionAlt = `\$\{brandLabel\} — photograph/.test(gallery));
}

/* ── 10 · THE HINT, now beneath the stage rather than on the watch ──────
   It used to overlay the photograph's lower edge, which is the one place in
   this room nothing belongs. It lives in a reserved band under the stage. */
{
  const vp = read("components/InspectionViewport.tsx");
  const gallery = read("components/ListingGallery.tsx");
  ok("H1 the hint says what the gesture is",
    /Ctrl \+ scroll to zoom · drag to inspect/.test(gallery));
  ok("H1 it is no longer drawn on the photograph",
    !/Ctrl \+ scroll/.test(vp));
  ok("H1 it never appears when there is no detail to reach",
    /zoomState\.maxScale > 1\.01 && !zoomDiscovered/.test(gallery));
  ok("H1 it retires once zoom has been discovered",
    /setZoomDiscovered\(true\)/.test(gallery));
  ok("H1 its band is reserved, so showing and hiding cannot move the stage",
    /flex h-6 shrink-0 items-center/.test(gallery));
  ok("H1 it is functional text at the readable floor, not decoration",
    /text-\[var\(--muted\)\]/.test(gallery));
}

console.log(`inspection-zoom: ${n} assertions passed`);
