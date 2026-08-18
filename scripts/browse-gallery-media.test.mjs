/* Mobile Gallery media frame — v3.30 XCover correction.

   Run: node --experimental-strip-types scripts/browse-gallery-media.test.mjs

   The defect (2026-08-06, real XCover pass): Browse Gallery keeps its 3/4
   column grid on a phone, so each card shrinks to ~137px while the image
   well stays a fixed 140px tall — an ~81px-wide portrait shaft. A landscape
   photograph contained in that shaft renders ~46px tall with ~94px of dead
   matte above and below: the "vertical 4:3 television" look, the watch far
   too small, badges floating over empty card padding.

   The correction: below md the well is a responsive 4:3 frame at full card
   width. A seller-authored presentation frame (authored on the editor's own
   4:3 stage) renders as the approved cover-crop; every other photograph is
   object-contain inside the same frame — the whole watch, always. Image
   badges anchor to the frame itself. Desktop ≥md is unchanged. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  frameStyle,
  isDefaultFrame,
  sanitizeFrame,
  ZOOM_MAX,
} from "../lib/photoPresentation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../components/BrowseClient.tsx"), "utf8");

let n = 0;
const ok = (name) => console.log(`  PASS ${++n}  ${name}`);

/* ── The Gallery render branch, isolated ─────────────────────────────── */
/* Scan view joined Gallery in one branch when it landed; the marker moved
   with it. Collector remains the separate branch this test contrasts. */
const gStart = src.indexOf('if (viewMode === "gallery" || viewMode === "scan")');
const gEnd = src.indexOf("Collector View research row");
assert.ok(gStart > 0 && gEnd > gStart, "Gallery and Collector branches must both exist");
const gallery = src.slice(gStart, gEnd);

/* ── 1 · The media frame is a responsive 4:3 frame, mobile-first ─────── */
const frameDivStart = gallery.indexOf("aspect-[4/3]");
assert.ok(frameDivStart > 0, "gallery media well must declare aspect-[4/3]");
const frameDiv = gallery.slice(gallery.lastIndexOf("<div", frameDivStart), gallery.indexOf(">", frameDivStart) + 1);
/* v4.91 made the watch the subject of its own card: the desktop well became a
   square rather than auto-height at a fixed 140px. Mobile-first 4:3 with a
   deliberate desktop override is the invariant; these are its current classes. */
for (const cls of ["relative", "aspect-[4/3]", "w-full", "overflow-hidden", "md:aspect-square"]) {
  assert.ok(frameDiv.includes(cls), `media frame must carry ${cls}`);
}
ok("mobile media well is a short 4:3 frame at full card width; desktop is a square well");

/* ── 1b · The phone grid is two columns; 3/4-wide is a desktop density ── */
const wrapperStart = src.indexOf('"flex flex-col space-y-6 md:space-y-8"');
assert.ok(wrapperStart > 0, "the results wrapper must still choose between Collector stack and Gallery grid");
const gridWrapper = src.slice(wrapperStart, src.indexOf("{paginated.map"));
assert.ok(gridWrapper.includes("grid-cols-2"), "below md the Gallery grid must be two columns");
assert.ok(
  gridWrapper.includes('gridCols === 3') &&
    gridWrapper.includes('"grid-cols-2 md:grid-cols-3"') &&
    gridWrapper.includes('"grid-cols-2 md:grid-cols-4"'),
  "the 3/4 density choice must apply at md and above, over a two-column phone floor",
);
assert.ok(
  !/(^|[^:])\bgrid-cols-[34]\b/.test(gridWrapper.replace(/md:grid-cols-[34]/g, "")),
  "no unprefixed 3- or 4-column class may reach a phone"
);
const densityControl = src.slice(
  src.indexOf("{viewMode === \"gallery\" && ("),
  src.indexOf("{n}-wide")
);
assert.ok(
  densityControl.includes("hidden items-center gap-1 md:flex"),
  "the 3-WIDE / 4-WIDE control must be desktop-only — a phone is not offered that choice"
);
ok("phone Gallery is two columns; the 3/4-wide density control is desktop-only");

/* ── 2 · Whole-watch preservation: contain fallback, never blind cover ─ */
assert.ok(gallery.includes("object-contain"), "contain fallback must exist");
assert.ok(!gallery.includes("object-cover"), "no blind object-cover class in the Gallery branch — cover may only arrive via a seller-authored inline frame style");
assert.ok(
  src.includes("isDefaultFrame(frame) ? null : frameStyle(frame, 4 / 3)"),
  "cover-crop must be gated on a seller-authored (non-default) frame at the 4:3 editor-stage aspect"
);
ok("cover-crop only with seller-authored framing; unframed photographs stay object-contain");

/* ── 3 · Original untouched: presentation is CSS-only ────────────────── */
assert.ok(!src.includes("canvas") && !src.includes("toBlob"), "no client-side re-encode of listing photographs");
ok("no canvas / re-encode path — the stored photograph is untouched");

/* ── 4 · Badges anchor to the media frame, opposite corners ──────────── */
const frameIdx = gallery.indexOf("aspect-[4/3]");
const shieldIdx = gallery.indexOf("row.in_hand_verified");
const docInlineIdx = gallery.indexOf("docInline");
assert.ok(shieldIdx > frameIdx, "🛡️ shield must live inside the media frame, not on the card");
/* Completeness deliberately LEFT the photo plane: it is a fact about the
   watch, not a sticker on its photograph, and it now joins the scanning
   line beside condition and year. The shield stays anchored to the frame
   because in-hand verification is a fact about the IMAGE. */
assert.ok(docInlineIdx > frameIdx, "completeness must render on the scanning line, below the media frame");
assert.ok(gallery.indexOf("docBadge &&") === -1, "the old photo-plane completeness overlay must not return");
assert.ok(gallery.includes("left-1.5 top-1.5"), "shield anchors to the frame's top-left");
/* The retired photo-plane badge took its top-right anchor and its 8px/10px
   sizing assertions with it. Those could not have survived the legibility
   floor the Dealer Room now asserts elsewhere, which is part of why the
   completeness fact moved to the scanning line in the first place. */
assert.ok(frameDiv.includes("relative"), "the frame is the badges' positioning context");
ok("🛡️ and FULL SET anchor to the actual media frame — opposite corners, no collision, badge readable on a phone");

/* ── 5 · Card navigation intact ──────────────────────────────────────── */
assert.ok(gallery.includes("href={listingHref(row.id)}"), "gallery card must still link to the listing");
ok("gallery card remains a Link to the listing detail (returnTo preserved via listingHref)");

/* ── 6 · Desktop Browse unchanged above md ───────────────────────────── */
assert.ok(gallery.includes("md:p-7"), "desktop card padding stays p-7");
assert.ok(gallery.includes("hidden h-full w-full object-contain md:block"), "desktop always renders the contain image");
assert.ok(gallery.includes("md:hidden"), "the authored cover-crop image is mobile-only");
ok("desktop >=md: p-7 card, square well, object-contain — visually stable");

/* ── 7 · Gallery/Collector truth parity ──────────────────────────────── */
assert.equal(src.split("paginated.map").length - 1, 1, "one paginated.map feeds BOTH views — same listings, same order, no forked truth");
const collector = src.slice(gEnd);
assert.ok(collector.includes("style={heroStyle}"), "Collector photo framing untouched");
ok("both views render the same paginated truth; Collector View untouched");

/* ── 8 · Real geometry through the real presentation lib ─────────────── */
assert.equal(isDefaultFrame(sanitizeFrame({})), true);
const authored = sanitizeFrame({ focalX: 0.42, focalY: 0.61, zoom: 1.08 });
assert.equal(isDefaultFrame(authored), false);
const s = frameStyle(authored, 4 / 3);
assert.equal(s.objectFit, "cover", "authored framing covers");
assert.equal(s.objectPosition, "42% 61%", "the seller's focal point governs the crop");
assert.equal(sanitizeFrame({ zoom: 9 }).zoom, ZOOM_MAX, "zoom stays inside the governed band — a frame can never crop away material evidence");
const rot = frameStyle(sanitizeFrame({ rotationDeg: 90, focalX: 0.4 }), 4 / 3);
assert.equal(rot.position, "absolute");
assert.equal(rot.width, "75%", "swapped box: width = container height at 4:3");
assert.equal(rot.height, "133.333%", "swapped box: height = container width at 4:3");
ok("authored frames render exactly as approved on the 4:3 stage — focal, zoom band, rotation geometry");

/* ── 9 · Source-fixture matrix: old shaft vs 4:3 frame vs two-up ──────
   Real XCover geometry: 412px CSS viewport, px-6 page padding (48), p-3 card
   padding (24), 1px grid gutters. Three stages are compared:
     OLD    pre-v3.30 — 3 columns, p-7, fixed 140px well → 81.33w × 140h shaft
     THREE  v3.30     — 3 columns, responsive 4:3 frame
     TWO    now       — 2 columns, the same 4:3 frame
   The 4:3 frame removed the dead shaft; the column count is what decides
   whether the watch is substantial. Both must hold at once. */
const contain = (fw, fh, aspect) =>
  aspect > fw / fh ? { w: fw, h: fw / aspect } : { w: fh * aspect, h: fh };
const frameFor4x3 = (cols) => {
  const w = (412 - 48 - (cols - 1)) / cols - 24;
  return { w, h: w * (3 / 4) };
};
const OLD = { w: 137.33 - 56, h: 140 };
const THREE = frameFor4x3(3);
const NEW = frameFor4x3(2);
assert.ok(THREE.h < OLD.h * 0.62, "the towering shaft is gone — frame height drops from 140px to ~72px");
assert.ok(THREE.w > OLD.w * 1.15, "the 4:3 frame takes the full available card width");
assert.ok(NEW.w > THREE.w * 1.55, "two-up: the frame itself is decisively wider than the three-up frame");
assert.ok(
  (NEW.w * NEW.h) / (THREE.w * THREE.h) > 2.4,
  "two-up: the media frame gains well over twice the area on a phone"
);

const fixtures = [
  ["wide landscape photography (16:9)", 16 / 9],
  ["landscape watch photography (3:2)", 3 / 2],
  ["watch head filling the source frame (square)", 1],
  ["FULL SET spread, landscape (4:3)", 4 / 3],
  ["portrait-oriented photography (3:4)", 3 / 4],
  ["long strap / bracelet, tall portrait (9:16)", 9 / 16],
];
for (const [label, aspect] of fixtures) {
  const before = contain(OLD.w, OLD.h, aspect);
  const three = contain(THREE.w, THREE.h, aspect);
  const after = contain(NEW.w, NEW.h, aspect);
  // Whatever the source shape, the watch is decisively larger two-up than it
  // was three-up — this is the seam the real XCover pass reported as "the
  // watch is visually too small" even after the shaft was gone.
  assert.ok(
    after.w > three.w * 1.55 && after.h > three.h * 1.55,
    `${label}: the watch must render decisively larger two-up (was ${three.w.toFixed(1)}x${three.h.toFixed(1)}, now ${after.w.toFixed(1)}x${after.h.toFixed(1)})`
  );
  assert.ok(
    (after.w * after.h) / (NEW.w * NEW.h) >= (three.w * three.h) / (THREE.w * THREE.h) - 0.001,
    `${label}: the share of the thumbnail the watch occupies must not fall`
  );
  const deadBefore = OLD.h - before.h; // vertical dead matte, the reported shaft
  const deadAfter = NEW.h - after.h;
  assert.ok(after.w <= NEW.w + 0.01 && after.h <= NEW.h + 0.01, `${label}: whole image stays inside the frame`);
  // Strictly shrinking wherever a dead shaft existed; a tall-portrait source
  // had none on the vertical axis (it was height-limited in both frames) and
  // must simply never gain one.
  if (deadBefore > 1) {
    assert.ok(deadAfter < deadBefore, `${label}: vertical dead matte must shrink (was ${deadBefore.toFixed(1)}px, now ${deadAfter.toFixed(1)}px)`);
  } else {
    assert.ok(deadAfter <= deadBefore + 0.01, `${label}: no new vertical dead matte`);
  }
  if (aspect >= 1) {
    assert.ok(after.w > before.w, `${label}: the watch renders wider than in the old shaft`);
  }
}
// The worst reported case, stated exactly: a 16:9 landscape photo.
const worstOld = contain(OLD.w, OLD.h, 16 / 9);
const worstNew = contain(NEW.w, NEW.h, 16 / 9);
// Stated as a PROPORTION of the frame: a bigger frame may hold more absolute
// letterbox pixels while wasting far less of itself, which is the whole point.
assert.ok(OLD.h - worstOld.h > 90, "old: >90px of dead shaft above+below a landscape photo");
assert.ok((OLD.h - worstOld.h) / OLD.h > 0.6, "old: the shaft wasted most of the well's height");
assert.ok(
  (NEW.h - worstNew.h) / NEW.h <= 0.2501,
  "new: the same photo letterboxes only the 25% a 16:9 source must inside a 4:3 frame"
);
assert.ok(worstNew.w > worstOld.w * 1.9, "new: that landscape watch renders nearly twice as wide as the old shaft allowed");
ok("fixture matrix: every source shape — landscape, portrait, square, long-bracelet — loses its dead shaft; landscape watches render decisively larger");

/* ── 9b · The controls beside the grid are readable in a hand ────────── */
const controls = src.slice(src.indexOf("Layout controls bar"), wrapperStart);
assert.ok(controls.length > 200, "the layout controls bar must still exist above the results");
// The 3/4-wide density group never renders below md, so its desktop-only
// typography is not phone-facing text; everything else in the bar is.
const densityStart = controls.indexOf('{viewMode === "gallery" && (');
const densityEnd = controls.indexOf("</div>", controls.indexOf("{n}-wide"));
assert.ok(densityStart > 0 && densityEnd > densityStart, "the density group must still be findable");
const phoneControls = controls.slice(0, densityStart) + controls.slice(densityEnd);
assert.ok(
  !/(?<!md:)text-\[9px\]/.test(phoneControls),
  "no 9px functional control text may reach a phone — GALLERY/COLLECTOR, SORT and the page-size controls read at 11px below md"
);
assert.ok(
  !["text-[9px]", "text-[10px]", "md:text-[9px]", "md:text-[10px]"].some((c) => controls.includes(c)),
  "the control bar reads 11px at every breakpoint — the desktop 9px was raised by the legibility floor and must not come back"
);
ok("Browse controls read at 11px on every breakpoint");

/* ── 10 · One consistent treatment across dark/light sources ─────────── */
assert.ok(frameDiv.includes("bg-[var(--image-well)]"), "one restrained matte behind every photograph — dark and light sources get the identical frame treatment; Daylight gave the well its own token");
ok("restrained matching background: the site's own --ink-deep matte, for every card");

console.log(`\n  browse-gallery-media: ${n} sections, all assertions passed`);
