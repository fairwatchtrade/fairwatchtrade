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
assert.deepEqual(defaultFrame(), { focalX: 0.5, focalY: 0.5, zoom: 1 });
assert.deepEqual(defaultPresentation(), { heroPathname: null, frames: {} });
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
assert.deepEqual(frameFor(reloaded, "dial.jpg"), { focalX: 0.42, focalY: 0.68, zoom: 1.1 });
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
assert.deepEqual(frameFor(v1, "listings/dial.jpg"), { focalX: 0.25, focalY: 0.8, zoom: 1.14 });
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
assert.deepEqual(Object.keys(dirty.frames["a.jpg"]).sort(), ["focalX", "focalY", "zoom"]);
assert.equal(dirty.frames[""], undefined, "an empty pathname is not a photo");
ok("unknown frame keys (crop, blur) are stripped and empty pathnames rejected");

/* ── 10 · One aspect-independent style governs desktop AND mobile ──── */
const style = frameStyle({ focalX: 0.25, focalY: 0.8, zoom: 1.1 });
assert.equal(style.objectFit, "cover");
assert.equal(style.objectPosition, "25% 80%");
assert.equal(style.transform, "scale(1.1)");
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
assert.deepEqual(Object.keys(defaultPresentation()).sort(), ["frames", "heroPathname"]);
assert.deepEqual(Object.keys(defaultFrame()).sort(), ["focalX", "focalY", "zoom"]);
assert.equal(isDefaultFrame(defaultFrame()), true);
ok("no crop, delete, blur, or order key exists in the contract");

console.log(`\n  ${n}/${n} passed — presentation may improve, evidence may not be subtracted.\n`);
