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
const gStart = src.indexOf('if (viewMode === "gallery")');
const gEnd = src.indexOf("Collector View research row");
assert.ok(gStart > 0 && gEnd > gStart, "Gallery and Collector branches must both exist");
const gallery = src.slice(gStart, gEnd);

/* ── 1 · The media frame is a responsive 4:3 frame, mobile-first ─────── */
const frameDivStart = gallery.indexOf("aspect-[4/3]");
assert.ok(frameDivStart > 0, "gallery media well must declare aspect-[4/3]");
const frameDiv = gallery.slice(gallery.lastIndexOf("<div", frameDivStart), gallery.indexOf(">", frameDivStart) + 1);
for (const cls of ["relative", "aspect-[4/3]", "w-full", "overflow-hidden", "md:aspect-auto", "md:h-[140px]"]) {
  assert.ok(frameDiv.includes(cls), `media frame must carry ${cls}`);
}
ok("mobile media well is a short 4:3 frame at full card width; desktop keeps h-[140px]");

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
const badgeIdx = gallery.indexOf("docBadge &&");
assert.ok(shieldIdx > frameIdx, "🛡️ shield must live inside the media frame, not on the card");
assert.ok(badgeIdx > frameIdx, "FULL SET badge must live inside the media frame");
assert.ok(gallery.includes("left-1.5 top-1.5"), "shield anchors to the frame's top-left");
assert.ok(gallery.includes("right-1.5 top-1.5"), "doc badge anchors to the frame's top-right");
assert.ok(frameDiv.includes("relative"), "the frame is the badges' positioning context");
ok("🛡️ and FULL SET anchor to the actual media frame — opposite corners, no collision");

/* ── 5 · Card navigation intact ──────────────────────────────────────── */
assert.ok(gallery.includes("href={listingHref(row.id)}"), "gallery card must still link to the listing");
ok("gallery card remains a Link to the listing detail (returnTo preserved via listingHref)");

/* ── 6 · Desktop Browse unchanged above md ───────────────────────────── */
assert.ok(gallery.includes("md:p-7"), "desktop card padding stays p-7");
assert.ok(gallery.includes("hidden h-full w-full object-contain md:block"), "desktop always renders the contain image");
assert.ok(gallery.includes("md:hidden"), "the authored cover-crop image is mobile-only");
ok("desktop ≥md: p-7 card, h-[140px] well, object-contain — visually stable");

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

/* ── 9 · Source-fixture matrix: old shaft vs new frame ────────────────
   Real XCover numbers: ~412px CSS viewport, 3-column grid → 137.33px card.
   Old: p-7 (56px) → 81.33w × 140h well. New: p-3 (24px) → 113.33w × 85h.
   object-contain displayed size for every source shape in the order. */
const contain = (fw, fh, aspect) =>
  aspect > fw / fh ? { w: fw, h: fw / aspect } : { w: fh * aspect, h: fh };
const OLD = { w: 137.33 - 56, h: 140 };
const NEW = { w: 137.33 - 24, h: (137.33 - 24) * (3 / 4) };
assert.ok(NEW.h < OLD.h * 0.62, "the towering shaft is gone — frame height drops from 140px to ~85px");
assert.ok(NEW.w > OLD.w * 1.35, "the frame takes the full available card width");

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
  const after = contain(NEW.w, NEW.h, aspect);
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
assert.ok(OLD.h - worstOld.h > 90, "old: >90px of dead shaft above+below a landscape photo");
assert.ok(NEW.h - worstNew.h < 25, "new: <25px of letterbox for the same photo");
ok("fixture matrix: every source shape — landscape, portrait, square, long-bracelet — loses its dead shaft; landscape watches render decisively larger");

/* ── 10 · One consistent treatment across dark/light sources ─────────── */
assert.ok(frameDiv.includes("bg-[var(--ink-deep)]"), "one restrained matte behind every photograph — dark and light sources get the identical frame treatment");
ok("restrained matching background: the site's own --ink-deep matte, for every card");

console.log(`\n  browse-gallery-media: ${n} sections, all assertions passed`);
