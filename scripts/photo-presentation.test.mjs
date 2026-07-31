/* Photo presentation contract — proves that improving presentation can never
   subtract evidence, and that desktop and mobile cannot drift apart.

   Run: node --experimental-strip-types scripts/photo-presentation.test.mjs

   The defect class these guard is silent by nature: a bad focal value doesn't
   throw, it just frames the watch somewhere wrong, and a zoom that escapes its
   cap doesn't error, it quietly crops the bezel off a $40,000 photograph. Every
   assertion below is a boundary the UI has no way to report on its own. */
import assert from "node:assert/strict";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  defaultPresentation,
  isDefaultPresentation,
  presentationForPhoto,
  presentationStyle,
  resolveHeroIndex,
  sanitizePhotoPresentation,
} from "../lib/photoPresentation.ts";

let n = 0;
const ok = (name) => {
  n += 1;
  console.log(`  PASS ${n}  ${name}`);
};

/* ── 1 · The default IS automatic framing ─────────────────────────────── */
const d = defaultPresentation();
assert.deepEqual(d, { heroPathname: null, focalX: 0.5, focalY: 0.5, zoom: 1 });
assert.equal(isDefaultPresentation(d), true);
ok("default presentation is centred, unzoomed, role-chosen hero");

/* ── 2 · Every malformed input becomes automatic framing, never a throw ─
   These arrive from three directions: a resumed draft written by an older
   version, a JSON body over the network, and a DB row. None may crash a
   publish or a browse page. */
for (const bad of [
  null,
  undefined,
  "",
  0,
  [],
  "centred",
  { focalX: "0.7" },
  { focalX: NaN },
  { focalX: Infinity },
  { zoom: null },
]) {
  const s = sanitizePhotoPresentation(bad);
  assert.equal(isDefaultPresentation(s), true, `expected default for ${JSON.stringify(bad)}`);
}
ok("malformed, missing, and wrong-typed input all resolve to automatic framing");

/* ── 3 · Focal point is clamped to the photograph ──────────────────────
   Out-of-range focal values would place the frame outside the image and paint
   empty space where evidence should be. */
assert.equal(sanitizePhotoPresentation({ focalX: -3 }).focalX, 0);
assert.equal(sanitizePhotoPresentation({ focalX: 99 }).focalX, 1);
assert.equal(sanitizePhotoPresentation({ focalY: -0.0001 }).focalY, 0);
assert.equal(sanitizePhotoPresentation({ focalY: 1.5 }).focalY, 1);
ok("focal X/Y clamp to 0..1 in both directions");

/* ── 4 · Zoom is GOVERNED — the evidence-subtraction boundary ──────────
   Below 1.0 the image stops filling its frame and exposes empty borders.
   Above the cap the seller starts cropping real watch evidence out of the
   photograph. Both are refused by clamping, not by trusting the slider. */
assert.equal(sanitizePhotoPresentation({ zoom: 0.2 }).zoom, ZOOM_MIN);
assert.equal(sanitizePhotoPresentation({ zoom: 0.999 }).zoom, ZOOM_MIN);
assert.equal(sanitizePhotoPresentation({ zoom: 4 }).zoom, ZOOM_MAX);
assert.equal(sanitizePhotoPresentation({ zoom: 1.15 }).zoom, ZOOM_MAX);
assert.equal(sanitizePhotoPresentation({ zoom: 1.14 }).zoom, 1.14);
assert.equal(ZOOM_MAX, 1.14, "cap must match the approved Design Gate value");
ok("zoom clamps to the governed 1.00–1.14 band, cap matches the Design Gate");

/* ── 5 · Hero identity is a pathname, and it is bounded ────────────────── */
assert.equal(sanitizePhotoPresentation({ heroPathname: "  a/b.jpg  " }).heroPathname, "a/b.jpg");
assert.equal(sanitizePhotoPresentation({ heroPathname: "   " }).heroPathname, null);
assert.equal(sanitizePhotoPresentation({ heroPathname: 7 }).heroPathname, null);
assert.equal(sanitizePhotoPresentation({ heroPathname: "x".repeat(900) }).heroPathname.length, 512);
ok("hero pathname is trimmed, bounded, and non-strings become automatic");

/* ── 6 · ONE style function governs desktop AND mobile ─────────────────
   The order forbids duplicate desktop/mobile framing logic. This is the
   assertion that keeps it true: the style carries no pixel dimension of any
   kind, so it cannot encode a breakpoint. Same object, any container. */
const framed = sanitizePhotoPresentation({ focalX: 0.25, focalY: 0.8, zoom: 1.1 });
const style = presentationStyle(framed);
assert.equal(style.objectFit, "cover");
assert.equal(style.objectPosition, "25% 80%");
assert.equal(style.transform, "scale(1.1)");
assert.equal(JSON.stringify(style).includes("px"), false, "style must be resolution-independent");
ok("one aspect-independent style governs both crops — no px, no breakpoint");

/* Zoom of exactly 1 emits no transform at all, so an unframed listing renders
   byte-identically to how it rendered before this flight existed. */
assert.equal(presentationStyle(defaultPresentation()).transform, undefined);
ok("automatic framing emits no transform — untouched listings render unchanged");

/* ── 7 · Framing belongs to the hero ALONE ─────────────────────────────
   A focal point found on the dial shot would frame a clasp shot by accident.
   Non-hero photos always render automatically. */
const heroStyle = presentationForPhoto("dial.jpg", { ...framed, heroPathname: "dial.jpg" }, true);
assert.equal(heroStyle.objectPosition, "25% 80%");
const otherStyle = presentationForPhoto("clasp.jpg", { ...framed, heroPathname: "dial.jpg" }, true);
assert.equal(otherStyle.objectPosition, "50% 50%", "a non-hero photo must not inherit framing");
assert.equal(
  presentationForPhoto("dial.jpg", { ...framed, heroPathname: "dial.jpg" }, false).objectPosition,
  "50% 50%"
);
ok("only the stored hero carries framing; every other photo stays automatic");

/* ── 8 · Hero CHOICE never reorders the gallery ────────────────────────
   resolveHeroIndex returns an index into the caller's already-role-sorted
   list. It selects; it does not sort. Photo roles keep governing order. */
const paths = ["a.jpg", "b.jpg", "c.jpg"];
assert.equal(resolveHeroIndex(paths, { ...d, heroPathname: "c.jpg" }, 0), 2);
assert.equal(resolveHeroIndex(paths, d, 1), 1, "no choice → the automatic hero wins");
assert.equal(
  resolveHeroIndex(paths, { ...d, heroPathname: "gone.jpg" }, 1),
  1,
  "a hero whose photo no longer exists falls back, it does not blank the card"
);
assert.equal(resolveHeroIndex(paths, d, 99), 0, "an out-of-range automatic index is survivable");
assert.equal(resolveHeroIndex([], { ...d, heroPathname: "a.jpg" }, 0), 0);
ok("hero choice selects an index only — order stays role-governed, gaps are survivable");

/* ── 9 · Round-tripping is stable ──────────────────────────────────────
   A value saved, reloaded, and saved again must not drift. Without rounding,
   float noise would make every resume a "change" and churn the draft. */
const once = sanitizePhotoPresentation({ focalX: 0.123456789, focalY: 1 / 3, zoom: 1.0666666 });
const twice = sanitizePhotoPresentation(once);
assert.deepEqual(once, twice, "sanitize must be idempotent");
assert.equal(once.focalX, 0.123);
ok("sanitize is idempotent — a saved value survives reload without drift");

/* ── 10 · Evidence law, stated as an assertion ─────────────────────────
   The contract has exactly four keys. If a future change adds a destructive
   one — a crop rect, a deletion flag, a blur radius — this fails, loudly, and
   the reviewer has to justify it rather than discover it in production. */
assert.deepEqual(Object.keys(defaultPresentation()).sort(), [
  "focalX",
  "focalY",
  "heroPathname",
  "zoom",
]);
ok("the contract carries presentation only — no crop, delete, blur, or order key");

console.log(`\n  ${n}/${n} passed — presentation may improve, evidence may not be subtracted.`);
