/* Photo presentation v2 — per-photo frames, hero independence, role order.

   Run: node --experimental-strip-types scripts/photo-presentation.test.mjs

   Every assertion here corresponds to a defect found in production on
   2026-07-31: framing forgotten on reopen, one record shared by seven
   photographs, editing a clasp promoting it to hero, thumbnails following
   upload order, and horizontal drag appearing to do nothing. */
import assert from "node:assert/strict";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  defaultFrame,
  defaultPresentation,
  frameFor,
  frameStyle,
  isDefaultFrame,
  isDefaultPresentation,
  movableAxes,
  presentationStyleFor,
  resolveHeroIndex,
  sanitizeFrame,
  sanitizePhotoPresentation,
  sanitizeRotation,
  screenToImageDelta,
  ZOOM_OUT_MIN_ROTATED,
  zoomMinFor,
  withFrame,
  withHero,
} from "../lib/photoPresentation.ts";
import {
  CANONICAL_PHOTO_ROLES,
  automaticHeroIndex,
  photoRoleRank,
  sortByPhotoRole,
} from "../lib/photoRoles.ts";

let n = 0;
const ok = (name) => console.log(`  PASS ${++n}  ${name}`);

/* ── 1 · Defaults ───────────────────────────────────────────────────── */
assert.deepEqual(defaultFrame(), { focalX: 0.5, focalY: 0.5, zoom: 1, rotationDeg: 0 });
assert.deepEqual(defaultPresentation(), {
  heroPathname: null,
  /* Story Photo joined the contract. Asserted here rather than loosened
     to a subset check: this line exists to catch the shape CHANGING
     silently, so a new field should fail it once and be acknowledged. */
  storyPathname: null,
  frames: {},
});
assert.equal(isDefaultPresentation(defaultPresentation()), true);
ok("defaults are centred, unzoomed, role-chosen hero, no frames");

/* ── 2 · Malformed input never throws ───────────────────────────────── */
for (const bad of [null, undefined, "", 0, [], "centred", { frames: 7 }, { frames: [] }]) {
  const s = sanitizePhotoPresentation(bad);
  assert.equal(isDefaultPresentation(s), true, `expected default for ${JSON.stringify(bad)}`);
}
ok("malformed, missing, and wrong-typed input all resolve to automatic framing");

/* ── 3 · Clamping ───────────────────────────────────────────────────── */
assert.equal(sanitizeFrame({ focalX: -3 }).focalX, 0);
assert.equal(sanitizeFrame({ focalX: 99 }).focalX, 1);
assert.equal(sanitizeFrame({ focalY: 1.5 }).focalY, 1);
assert.equal(sanitizeFrame({ zoom: 0.2 }).zoom, ZOOM_MIN);
assert.equal(sanitizeFrame({ zoom: 4 }).zoom, ZOOM_MAX);
assert.equal(ZOOM_MAX, 1.14, "cap must match the approved Design Gate value");
ok("focal clamps to 0..1 and zoom to the governed 1.00–1.14 band");

/* ── 4 · THE DEFECT: independent framing per photograph ─────────────
   Centring the dial then adjusting the clasp must not disturb the dial. */
let p = defaultPresentation();
p = withFrame(p, "dial.jpg", { focalX: 0.42, focalY: 0.68, zoom: 1.1 });
p = withFrame(p, "clasp.jpg", { focalX: 0.5, focalY: 0.58, zoom: 1.04 });
assert.equal(frameFor(p, "dial.jpg").focalY, 0.68, "the dial's framing must survive");
assert.equal(frameFor(p, "clasp.jpg").focalY, 0.58);
assert.deepEqual(frameFor(p, "never-edited.jpg"), defaultFrame());
ok("each photograph keeps its OWN framing — editing one never disturbs another");

/* ── 5 · THE DEFECT: framing survives a save/reload round trip ───────
   Production reopened a centred dial at 0.500/0.500/1.00. */
const reloaded = sanitizePhotoPresentation(JSON.parse(JSON.stringify(p)));
assert.deepEqual(frameFor(reloaded, "dial.jpg"), { focalX: 0.42, focalY: 0.68, zoom: 1.1, rotationDeg: 0 });
assert.deepEqual(reloaded, sanitizePhotoPresentation(reloaded), "sanitize must be idempotent");
ok("saved framing survives serialize → sanitize → reopen, and is idempotent");

/* ── 6 · THE DEFECT: hero is independent of editing ─────────────────
   Editing or framing the clasp must never promote it to hero. */
let h = defaultPresentation();
h = withFrame(h, "clasp.jpg", { focalX: 0.3, focalY: 0.3, zoom: 1.05 });
assert.equal(h.heroPathname, null, "framing a photo must NOT make it the hero");
h = withHero(h, "dial.jpg");
h = withFrame(h, "buckle.jpg", { focalX: 0.7, focalY: 0.2, zoom: 1.02 });
assert.equal(h.heroPathname, "dial.jpg", "hero must survive editing other photos");
const heroFrame = frameFor(h, "dial.jpg");
h = withHero(h, "caseback.jpg");
assert.deepEqual(frameFor(h, "dial.jpg"), heroFrame, "changing hero must not alter framing");
ok("hero changes ONLY through explicit selection, and never moves with framing");

/* ── 7 · Reset affects only the active photo ────────────────────────── */
let r = withFrame(
  withFrame(defaultPresentation(), "a.jpg", { focalX: 0.2, focalY: 0.2, zoom: 1.1 }),
  "b.jpg",
  { focalX: 0.8, focalY: 0.8, zoom: 1.05 }
);
r = withFrame(r, "a.jpg", defaultFrame());
assert.equal(r.frames["a.jpg"], undefined, "a reset photo drops back to automatic");
assert.equal(r.frames["b.jpg"].focalX, 0.8, "the other photo is untouched");
ok("Reset clears only the active photo — every other frame survives");

/* ── 8 · BACKWARD COMPATIBILITY with the deployed v1 shape ──────────── */
const v1 = sanitizePhotoPresentation({
  heroPathname: "listings/dial.jpg",
  focalX: 0.25,
  focalY: 0.8,
  zoom: 1.14,
});
assert.equal(v1.heroPathname, "listings/dial.jpg", "a v1 hero choice must never be lost");
assert.deepEqual(frameFor(v1, "listings/dial.jpg"), { focalX: 0.25, focalY: 0.8, zoom: 1.14, rotationDeg: 0 });
/* A v1 record with no hero referred to an unknowable automatic hero. Its
   framing is dropped rather than applied to the wrong photograph. */
const v1NoHero = sanitizePhotoPresentation({ focalX: 0.25, focalY: 0.8, zoom: 1.1 });
assert.equal(Object.keys(v1NoHero.frames).length, 0);
ok("v1 rows migrate: hero and framing preserved; ambiguous framing dropped, never misapplied");

/* ── 9 · Unknown keys and junk frames are refused ───────────────────── */
const dirty = sanitizePhotoPresentation({
  heroPathname: "a.jpg",
  frames: {
    "a.jpg": { focalX: 0.4, focalY: 0.4, zoom: 1.1, cropRect: [0, 0], blurRadius: 5 },
    "": {},
  },
});
assert.deepEqual(Object.keys(dirty.frames["a.jpg"]).sort(), ["focalX", "focalY", "rotationDeg", "zoom"]);
assert.equal(dirty.frames[""], undefined, "an empty pathname is not a photo");
ok("unknown frame keys (crop, blur) are stripped and empty pathnames rejected");

/* ── 10 · One aspect-independent style governs desktop AND mobile ──── */
const style = frameStyle({ focalX: 0.25, focalY: 0.8, zoom: 1.1, rotationDeg: 0 });
assert.equal(style.objectFit, "cover");
assert.equal(style.objectPosition, "25% 80%");
/* zoom excess 0.1: panX = (0.5-0.25)*0.1 = +2.5%, panY = (0.5-0.8)*0.1 = -3% */
assert.equal(style.transform, "translate(2.5%, -3%) scale(1.1)");
assert.equal(JSON.stringify(style).includes("px"), false, "style must be resolution-independent");
assert.equal(frameStyle(defaultFrame()).transform, undefined);
assert.equal(presentationStyleFor(defaultPresentation(), "x.jpg").objectPosition, "50% 50%");
ok("one aspect-independent style governs both crops — no px, no breakpoint");

/* ── 11 · THE DEFECT: why horizontal drag looked broken ─────────────
   object-position can only move an image on an axis that OVERFLOWS. A 3:4
   photo in a 4:3 frame overflows vertically only — so left/right did
   nothing, and it was never the drag handler's fault. */
const portraitInLandscape = movableAxes(0.75, 4 / 3, 1);
assert.equal(portraitInLandscape.vertical, true);
assert.equal(portraitInLandscape.horizontal, false, "this is the reported bug, explained");
// Zoom creates overflow on both axes, which is why zooming makes it work.
assert.deepEqual(movableAxes(0.75, 4 / 3, 1.1), { horizontal: true, vertical: true });
// A landscape photo in the portrait browse card moves the other way.
assert.equal(movableAxes(1.5, 0.8, 1).horizontal, true);
assert.equal(movableAxes(1.5, 0.8, 1).vertical, false);
ok("axis availability is derived, explaining the 'horizontal drag does nothing' report");

/* ── 12 · Hero resolution and fallback ──────────────────────────────── */
const paths = ["a.jpg", "b.jpg", "c.jpg"];
assert.equal(resolveHeroIndex(paths, withHero(defaultPresentation(), "c.jpg"), 0), 2);
assert.equal(resolveHeroIndex(paths, defaultPresentation(), 1), 1);
assert.equal(
  resolveHeroIndex(paths, withHero(defaultPresentation(), "gone.jpg"), 1),
  1,
  "a hero whose photo vanished falls back rather than blanking the listing"
);
assert.equal(resolveHeroIndex([], withHero(defaultPresentation(), "a.jpg"), 0), 0);
ok("hero resolution selects an index only, and survives a missing photo");

/* ── 13 · THE DEFECT: role order, not upload order ─────────────────── */
const uploaded = [
  { photo: { pathname: "5.jpg" }, category: "Clasp/Pin Buckle" },
  { photo: { pathname: "1.jpg" }, category: "Papers/Warranty" },
  { photo: { pathname: "2.jpg" }, category: "Dial" },
  { photo: { pathname: "3.jpg" }, category: "Caseback" },
  { photo: { pathname: "4.jpg" }, category: "Nonsense Role" },
];
const ordered = sortByPhotoRole(uploaded, (p) => p.category);
assert.deepEqual(
  ordered.map((x) => x.category),
  ["Dial", "Caseback", "Clasp/Pin Buckle", "Papers/Warranty", "Nonsense Role"]
);
assert.equal(ordered[0].photo.pathname, "2.jpg", "the dial leads regardless of upload time");
assert.equal(automaticHeroIndex(ordered, (x) => x.category), 0);
// The caller's array is evidence and must not be mutated.
assert.equal(uploaded[0].category, "Clasp/Pin Buckle");
ok("photo role determines order, not upload time — and the source array is untouched");

/* ── 14 · Duplicate roles keep a stable relative order ───────────────
   Without this the gallery could reshuffle between renders. */
const dupes = [
  { photo: { pathname: "d1.jpg" }, category: "Dial" },
  { photo: { pathname: "x.jpg" }, category: "Caseback" },
  { photo: { pathname: "d2.jpg" }, category: "Dial" },
  { photo: { pathname: "d3.jpg" }, category: "Dial" },
];
assert.deepEqual(
  sortByPhotoRole(dupes, (x) => x.category).map((x) => x.photo.pathname),
  ["d1.jpg", "d2.jpg", "d3.jpg", "x.jpg"]
);
ok("photographs sharing a role keep their original relative order — deterministic");

/* ── 15 · Unknown roles append, never disappear ─────────────────────── */
assert.equal(photoRoleRank("Dial"), 0);
assert.ok(photoRoleRank("Something New") >= CANONICAL_PHOTO_ROLES.length);
assert.equal(photoRoleRank(null), CANONICAL_PHOTO_ROLES.length);
assert.equal(automaticHeroIndex([], () => "Dial"), 0);
ok("unrecognised or missing roles sort last but are never dropped");

/* ── 16 · The contract carries presentation only ────────────────────── */
/* storyPathname joins heroPathname as a seller CHOICE about which
   photograph appears where. That is the same class of fact this
   contract already carried; what the guard still forbids is a key
   that ALTERS a photograph - crop, delete, blur, order. */
assert.deepEqual(Object.keys(defaultPresentation()).sort(), [
  "frames",
  "heroPathname",
  "storyPathname",
]);
assert.deepEqual(Object.keys(defaultFrame()).sort(), ["focalX", "focalY", "rotationDeg", "zoom"]);
assert.equal(isDefaultFrame(defaultFrame()), true);
ok("no crop, delete, blur, or order key exists in the contract");

/* ── 17 · ROTATION is strictly quarter-turns ─────────────────────────
   A 45 would tilt evidence; a "90" string is a type error. Both refuse to
   upright, mirroring the production CHECK constraint exactly. */
for (const bad of [45, -90, 360, 89.9, "90", null, undefined, NaN]) {
  assert.equal(sanitizeRotation(bad), 0, `rotation ${JSON.stringify(bad)} must refuse to 0`);
}
for (const good of [0, 90, 180, 270]) assert.equal(sanitizeRotation(good), good);
assert.equal(sanitizeFrame({ rotationDeg: 90 }).rotationDeg, 90);
assert.equal(sanitizeFrame({ rotationDeg: 45 }).rotationDeg, 0);
ok("rotation accepts exactly 0/90/180/270 - anything else reads as upright");

/* ── 18 · Rotation is presentation state like any other ─────────────── */
let rp = withFrame(defaultPresentation(), "side.jpg", {
  focalX: 0.5, focalY: 0.5, zoom: 1, rotationDeg: 90,
});
assert.equal(isDefaultFrame(frameFor(rp, "side.jpg")), false, "a rotated frame is not default");
const rpReload = sanitizePhotoPresentation(JSON.parse(JSON.stringify(rp)));
assert.equal(frameFor(rpReload, "side.jpg").rotationDeg, 90, "rotation survives save/reload");
assert.equal(rp.heroPathname, null, "rotating must not touch hero");
rp = withFrame(rp, "side.jpg", defaultFrame());
assert.equal(rp.frames["side.jpg"], undefined, "reset restores upright and drops the frame");
const v39frame = sanitizePhotoPresentation({
  heroPathname: "a.jpg", frames: { "a.jpg": { focalX: 0.4, focalY: 0.4, zoom: 1.1 } },
});
assert.equal(frameFor(v39frame, "a.jpg").rotationDeg, 0, "rotation-less v3.9 rows read as upright");
ok("rotation persists, resets with the photo, never moves hero, and old rows read upright");

/* ── 19 · Rotated style is the SWAPPED BOX — and never a silent zoom ──
   Production finding: the old cover-scale magnified a rotated photo by a
   third while the control still read 1.00x. The fix sizes the element as
   the container with its dimensions swapped (pure percentages of the
   container aspect), centres it, and rotates — so 1.00x is the true fitted
   baseline for the current orientation and nothing is pre-cropped away. */
const rot = frameStyle({ focalX: 0.5, focalY: 0.5, zoom: 1, rotationDeg: 90 }, 4 / 3);
assert.equal(rot.position, "absolute");
assert.equal(rot.width, "75%", "width = container height (100 / aspect)");
assert.equal(rot.height, "133.333%", "height = container width (100 * aspect)");
assert.ok(String(rot.transform).includes("rotate(90deg)"));
assert.equal(
  String(rot.transform).includes("scale"),
  false,
  "1.00x rotated must carry NO scale — the silent magnification defect"
);
const rotZoomOut = frameStyle({ focalX: 0.5, focalY: 0.5, zoom: 0.9, rotationDeg: 90 }, 4 / 3);
assert.ok(String(rotZoomOut.transform).includes("scale(0.9)"), "governed zoom-out reaches the style");
const rot180 = frameStyle({ focalX: 0.5, focalY: 0.5, zoom: 1, rotationDeg: 180 }, 4 / 3);
assert.equal(rot180.transform, "rotate(180deg)", "a half-turn swaps nothing - no box change");
assert.equal(rot180.position, undefined);
const rotSquare = frameStyle({ focalX: 0.5, focalY: 0.5, zoom: 1, rotationDeg: 90 }, 1);
assert.equal(rotSquare.width, "100%", "square container: the swapped box is itself");
ok("rotation renders in a swapped box - 1.00x is the fitted baseline, never magnified");

/* ── 20 · Drag follows the pointer ON SCREEN under any rotation ─────── */
assert.deepEqual(screenToImageDelta(0, 5, 3), { dx: 5, dy: 3 });
assert.deepEqual(screenToImageDelta(90, 5, 3), { dx: 3, dy: -5 });
assert.deepEqual(screenToImageDelta(180, 5, 3), { dx: -5, dy: -3 });
assert.deepEqual(screenToImageDelta(270, 5, 3), { dx: -3, dy: 5 });
assert.deepEqual(screenToImageDelta(45, 5, 3), { dx: 5, dy: 3 }, "junk rotation maps as upright");
ok("screen deltas invert through the rotation - the photo always follows the pointer");

/* ── 21 · Axes under rotation tell the fitted-baseline truth ─────────
   A 3:4 portrait rotated a quarter-turn becomes 4:3 — it FITS the 4:3 stage
   exactly, so at 1.00x nothing overflows and nothing moves; zoom unlocks
   both axes. Zoomed OUT onto the matte, nothing overflows either. */
assert.deepEqual(movableAxes(0.75, 4 / 3, 1, 0), { horizontal: false, vertical: true });
assert.deepEqual(movableAxes(0.75, 4 / 3, 1, 90), { horizontal: false, vertical: false });
assert.deepEqual(movableAxes(0.75, 4 / 3, 1.1, 90), { horizontal: true, vertical: true });
assert.deepEqual(movableAxes(0.75, 4 / 3, 0.9, 90), { horizontal: false, vertical: false });
assert.deepEqual(movableAxes(0.75, 4 / 3, 1, 180), { horizontal: false, vertical: true });
ok("a rotated portrait FITS the 4:3 stage at 1.00x - movement comes from zoom, honestly");

/* ── 22 · The zoom floor follows orientation ─────────────────────────
   Rotated frames may rest on the matte down to 0.85; upright frames keep
   the 1.00 floor. Returning upright re-clamps — the DB CHECK agrees. */
assert.equal(zoomMinFor(0), 1);
assert.equal(zoomMinFor(180), 1);
assert.equal(zoomMinFor(90), ZOOM_OUT_MIN_ROTATED);
assert.equal(zoomMinFor(270), ZOOM_OUT_MIN_ROTATED);
assert.equal(ZOOM_OUT_MIN_ROTATED, 0.85, "floor must match the production constraint");
assert.equal(sanitizeFrame({ zoom: 0.9, rotationDeg: 90 }).zoom, 0.9, "rotated zoom-out survives");
assert.equal(sanitizeFrame({ zoom: 0.8, rotationDeg: 90 }).zoom, 0.85, "below the floor clamps up");
assert.equal(sanitizeFrame({ zoom: 0.9, rotationDeg: 0 }).zoom, 1, "upright keeps the 1.00 floor");
assert.equal(sanitizeFrame({ zoom: 0.9, rotationDeg: 180 }).zoom, 1, "half-turn is upright-floored");
ok("zoom-out is a rotated-frame privilege - 0.85 floor, upright stays at 1.00");

/* ── 23 · THE ZOOM PAN — focal movement is real on the zoomed axis ───
   object-position only spans layout overflow; scale() adds none. The pan
   translate spans the zoom excess exactly, so a rotated photo that fits
   its box perfectly can still be repositioned once zoomed — the production
   "rotation kills all movement" finding. */
const centred = frameStyle({ focalX: 0.5, focalY: 0.5, zoom: 1.1, rotationDeg: 0 });
assert.equal(centred.transform, "scale(1.1)", "centred focal needs no pan");
const panned = frameStyle({ focalX: 0, focalY: 1, zoom: 1.14, rotationDeg: 0 });
assert.equal(
  panned.transform,
  "translate(7%, -7%) scale(1.14)",
  "full-corner focal pans exactly half the zoom excess each way"
);
const rotPan = frameStyle({ focalX: 0.25, focalY: 0.5, zoom: 1.1, rotationDeg: 90 }, 4 / 3);
assert.ok(
  String(rotPan.transform).includes("rotate(90deg) translate(2.5%, 0%) scale(1.1)"),
  `pan sits between rotate and scale, in image-space axes (got ${rotPan.transform})`
);
const noPanOut = frameStyle({ focalX: 0.2, focalY: 0.2, zoom: 0.9, rotationDeg: 90 }, 4 / 3);
assert.equal(String(noPanOut.transform).includes("translate(") && String(noPanOut.transform).split("translate").length > 2, false,
  "zoomed OUT there is no excess - no pan, only the centering translate");
ok("zoom pan spans the scale overflow - movement is real on every zoomed axis");

console.log(`\n  ${n}/${n} passed — presentation may improve, evidence may not be subtracted.\n`);
