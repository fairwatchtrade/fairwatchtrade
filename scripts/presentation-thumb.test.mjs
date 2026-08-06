/* Derived presentation thumbnails — v3.31 XCover watch-scale correction.

   Run: node --experimental-strip-types scripts/presentation-thumb.test.mjs

   The defect (2026-08-06, XCover row #15): the v3.30 contain fallback
   letterboxes the RAW photograph, so empty margins baked into the source
   bytes (a screenshot's black bands) still shrink the watch inside the
   4:3 frame. The correction derives a read-time thumbnail that trims only
   near-uniform border margins — trust-gated, whole watch preserved, safe
   margin retained, original bytes untouched.

   Offline suite: pure geometry + synthetic sharp fixtures + static
   assertions over the route and the Gallery markup. The companion
   presentation-thumb-live-proof.mjs runs the same derivation against the
   three real production photographs. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
import {
  MIN_CONTENT_FRACTION,
  MIN_CONTENT_PX,
  SAFE_MARGIN_FRACTION,
  THUMB_WIDTH,
  deriveThumb,
  isMeaningfulGain,
  isTrustworthyContentBox,
  padContentBox,
} from "../lib/media/presentationThumb.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

let n = 0;
const ok = (name) => console.log(`  PASS ${++n}  ${name}`);

/* ── 1 · Pure geometry: the safe margin ──────────────────────────────── */
{
  const padded = padContentBox({ left: 200, top: 300, width: 400, height: 600 }, 1000, 1400);
  // Margin follows the SMALLER side: a tall trimmed box must not re-inflate
  // the very letterbox band the trim removed.
  const pad = Math.round(400 * SAFE_MARGIN_FRACTION);
  assert.deepEqual(padded, { left: 200 - pad, top: 300 - pad, width: 400 + 2 * pad, height: 600 + 2 * pad });
  // Clamped at the source edge — content is given air, never shifted.
  const clamped = padContentBox({ left: 5, top: 5, width: 400, height: 600 }, 1000, 1400);
  assert.equal(clamped.left, 0);
  assert.equal(clamped.top, 0);
  const inside = padContentBox({ left: 900, top: 100, width: 200, height: 200 }, 1000, 1400);
  assert.ok(inside.left + inside.width <= 1000);
  // The margin has a pixel floor — tiny boxes still get real air.
  const small = padContentBox({ left: 500, top: 500, width: 100, height: 100 }, 1000, 1400);
  assert.ok(small.left <= 500 - 8 && small.width >= 100 + 16);
  // A tall screenshot-shaped trim keeps its vertical gain: the pad must be
  // far smaller than the removed band.
  const tall = padContentBox({ left: 0, top: 126, width: 1076, height: 2148 }, 1076, 2400);
  assert.ok(126 - tall.top <= Math.round(1076 * SAFE_MARGIN_FRACTION), "vertical pad follows the smaller (horizontal) side");
}
ok("safe margin: air follows the smaller side with a pixel floor, clamped, never re-inflating trimmed bands");

/* ── 2 · Pure geometry: trust gates ──────────────────────────────────── */
{
  // A healthy detected box is trusted.
  assert.equal(isTrustworthyContentBox({ left: 100, top: 400, width: 800, height: 900 }, 1000, 2000), true);
  // Too small a side → suspicious.
  assert.equal(isTrustworthyContentBox({ left: 0, top: 0, width: MIN_CONTENT_PX - 1, height: 500 }, 1000, 2000), false);
  // Keeping less than the area floor → suspicious.
  const tiny = { left: 0, top: 0, width: 200, height: 200 };
  assert.ok((200 * 200) / (1000 * 2000) < MIN_CONTENT_FRACTION);
  assert.equal(isTrustworthyContentBox(tiny, 1000, 2000), false);
  // Out of bounds → refused.
  assert.equal(isTrustworthyContentBox({ left: 900, top: 0, width: 200, height: 500 }, 1000, 2000), false);
  // No-op trims are not gains.
  assert.equal(isMeaningfulGain({ left: 0, top: 0, width: 1000, height: 2000 }, 1000, 2000), false);
  assert.equal(isMeaningfulGain({ left: 0, top: 300, width: 1000, height: 1400 }, 1000, 2000), true);
}
ok("trust gates: minimum size, minimum retained area, in-bounds, meaningful gain");

/* ── 3 · Synthetic screenshot: black bands trim away, watch survives ──
   The real Omega defect shape: photo content with pure-black letterbox
   bands above and below, watch strap running the full content height. */
{
  const watch = await sharp({
    create: { width: 300, height: 1000, channels: 3, background: { r: 92, g: 61, b: 42 } },
  }).png().toBuffer();
  const photo = await sharp({
    create: { width: 1000, height: 1000, channels: 3, background: { r: 176, g: 138, b: 96 } },
  })
    .composite([{ input: watch, left: 350, top: 0 }])
    .png().toBuffer();
  const screenshot = await sharp({
    create: { width: 1000, height: 2200, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: photo, left: 0, top: 600 }])
    .jpeg().toBuffer();

  const t = await deriveThumb(screenshot);
  assert.equal(t.trimmed, true, "the black bands must trim");
  assert.equal(t.contentType, "image/webp");
  /* The WATCH survives whole, with margin. (This synthetic's photo
     background is perfectly uniform, so the second pass legitimately
     treats it as empty margin too and tightens to the strap column —
     real photographic backgrounds are textured and stop the trim; the
     live-proof script demonstrates that on the actual production bytes.) */
  assert.ok(t.box.left <= 350 && t.box.left + t.box.width >= 650, "the full strap width survives with margin");
  assert.ok(t.box.top <= 600, "trim never bites below the content top");
  assert.ok(t.box.top + t.box.height >= 1600, "the strap's full height survives");
  const meta = await sharp(t.buffer).metadata();
  assert.ok(meta.width <= THUMB_WIDTH);
}
ok("screenshot shape: black bands trimmed, the watch preserved whole with its margin");

/* ── 4 · Studio shot: uniform backdrop trims to the watch + margin ───── */
{
  const head = await sharp({
    create: { width: 640, height: 760, channels: 3, background: { r: 30, g: 40, b: 80 } },
  }).png().toBuffer();
  const studio = await sharp({
    create: { width: 1600, height: 1600, channels: 3, background: { r: 245, g: 244, b: 240 } },
  })
    .composite([{ input: head, left: 480, top: 420 }])
    .jpeg().toBuffer();
  const t = await deriveThumb(studio);
  assert.equal(t.trimmed, true);
  assert.ok(t.box.left <= 480 && t.box.left + t.box.width >= 1120, "the watch is inside the box");
  assert.ok(t.box.left >= 480 - 80, "only backdrop is removed, content plus modest margin kept");
  // A watch below the 12% trust floor must NOT be cropped to — conservative
  // fallback beats an aggressive crop the seller never approved.
  const small = await sharp({
    create: { width: 1600, height: 1600, channels: 3, background: { r: 245, g: 244, b: 240 } },
  })
    .composite([{ input: await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 30, g: 40, b: 80 } } }).png().toBuffer(), left: 650, top: 650 }])
    .jpeg().toBuffer();
  assert.equal((await deriveThumb(small)).trimmed, false, "tiny content refuses the trim — trust floor holds");
}
ok("studio shape: uniform backdrop trimmed to the watch with the safe margin");

/* ── 5 · Busy background: nothing trustworthy to trim → untrimmed ────── */
{
  const noise = Buffer.alloc(900 * 900 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 251;
  const busy = await sharp(noise, { raw: { width: 900, height: 900, channels: 3 } })
    .jpeg().toBuffer();
  const t = await deriveThumb(busy);
  assert.equal(t.trimmed, false, "textured content never matches a uniform border — no crop");
  const meta = await sharp(t.buffer).metadata();
  assert.ok(meta.width <= THUMB_WIDTH, "still served right-sized");
}
ok("busy background: no trustworthy trim → the untrimmed photograph, resized only");

/* ── 6 · Fully-uniform image: derivation degrades, never throws ──────── */
{
  const blank = await sharp({
    create: { width: 800, height: 800, channels: 3, background: { r: 10, g: 10, b: 10 } },
  }).jpeg().toBuffer();
  const t = await deriveThumb(blank);
  assert.equal(t.trimmed, false);
}
ok("fully-uniform image: trust gate refuses the empty trim, fallback serves the photo");

/* ── 7 · EXIF orientation is honored before any geometry ─────────────── */
{
  const tall = await sharp({
    create: { width: 400, height: 900, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 180, b: 150 } } }).png().toBuffer(), left: 0, top: 300 }])
    .jpeg().toBuffer();
  const rotated = await sharp(tall).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const t = await deriveThumb(rotated);
  // Orientation 6 = 90° CW: the browser shows 900×400; the box must live
  // in that displayed space, not the stored one.
  assert.equal(t.sourceWidth, 900);
  assert.equal(t.sourceHeight, 400);
}
ok("EXIF-rotated sources are oriented first — the crop happens in displayed pixel space");

/* ── 8 · Route: allowlist, fallback, caching — static truth ──────────── */
{
  const route = read("../app/api/presentation-thumb/route.ts");
  assert.ok(route.includes('".public.blob.vercel-storage.com"'), "host allowlist pinned to our blob store");
  assert.ok(route.includes('"/listings/"'), "path allowlist pinned to listing photos");
  assert.ok(route.includes('url.protocol === "https:"'), "https only");
  assert.ok(route.includes("hostname.length > ALLOWED_HOST_SUFFIX.length"), "bare-suffix host refused");
  assert.ok(route.includes('redirect: "error"'), "upstream redirects refused — no SSRF hop");
  assert.ok(route.includes("NextResponse.redirect(src, 302)"), "every failure path falls back to the untouched original");
  assert.ok(route.includes("s-maxage=31536000, immutable"), "CDN-cached; safe because pathnames are unique per upload");
  assert.ok(!route.includes("BLOB_READ_WRITE_TOKEN"), "read-only route — the forbidden token never appears");
  assert.ok(route.includes('export const runtime = "nodejs"'), "sharp requires the node runtime");
}
ok("route: strict own-photos allowlist, redirect-to-original fallback, immutable CDN caching");

/* ── 9 · Gallery wiring: thumbnails for unframed mobile only ─────────── */
{
  const src = read("../components/BrowseClient.tsx");
  const gStart = src.indexOf('if (viewMode === "gallery")');
  const gEnd = src.indexOf("Collector View research row");
  const gallery = src.slice(gStart, gEnd);
  assert.ok(gallery.includes("presentationThumbSrc(hero)"), "unframed mobile img loads the derived thumbnail");
  assert.ok(gallery.includes('<source media="(min-width: 768px)" srcSet={hero} />'), "desktop downloads the untouched original");
  assert.ok(gallery.includes('<picture className="contents">'), "picture is layout-transparent inside the 4:3 frame");
  // The seller-approved crop still wins: the authored branch renders the
  // original with the approved frame style, never the derived thumbnail.
  const authored = gallery.slice(gallery.indexOf("galleryFrameStyle ? ("), gallery.indexOf("<picture"));
  assert.ok(authored.includes("style={galleryFrameStyle}"));
  assert.ok(!authored.includes("presentationThumbSrc"), "authored frames bypass derivation entirely");
  assert.ok(src.includes('url.includes(".public.blob.vercel-storage.com/listings/")'), "client routes only our own photos through the thumb");
  // Collector View untouched.
  assert.ok(!src.slice(gEnd).includes("presentationThumbSrc"), "Collector View does not consume derivation");
}
ok("gallery wiring: derived thumb only for unframed photos below md; authored crops and Collector View untouched");

console.log(`\n  presentation-thumb: ${n} sections, all assertions passed`);
