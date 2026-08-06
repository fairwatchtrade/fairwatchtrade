/* Derived presentation thumbnails — LIVE PROOF against the three real
   production listing photographs (the exact cards from the XCover pass).

   Run: node --experimental-strip-types scripts/presentation-thumb-live-proof.mjs

   Downloads the current Gallery heroes from production, runs the real
   derivation, and measures how the photograph fills the real mobile frame
   (XCover: 412px viewport, 3-wide grid, p-3 card → 113.3×85 media frame,
   object-contain). Network access required; run on demand, not in CI. */
import assert from "node:assert/strict";
import sharp from "sharp";
import { deriveThumb } from "../lib/media/presentationThumb.ts";

const FRAME_W = 412 / 3 - 24;
const FRAME_H = FRAME_W * (3 / 4);
const containFill = (w, h) => {
  const scale = Math.min(FRAME_W / w, FRAME_H / h);
  return { w: w * scale, h: h * scale, fill: (w * scale * h * scale) / (FRAME_W * FRAME_H) };
};

const html = await (await fetch("https://www.fairwatchtrade.com/browse")).text();
const heroes = [...html.matchAll(/<img[^>]*src="(https:\/\/[^"]*blob\.vercel-storage\.com\/listings\/[^"]*)"/g)]
  .map((m) => m[1]);
const unique = [...new Set(heroes)].slice(0, 3);
assert.equal(unique.length, 3, "expected the three production Gallery heroes");

let trimmedCount = 0;
for (const url of unique) {
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").slice(0, 44);
  const source = Buffer.from(await (await fetch(url)).arrayBuffer());
  const t = await deriveThumb(source);
  const out = await sharp(t.buffer).metadata();
  const before = containFill(t.sourceWidth, t.sourceHeight);
  const after = containFill(out.width, out.height);
  const gain = after.fill / before.fill;
  assert.ok(gain >= 0.999, `${name}: derivation must never shrink the photograph's frame fill`);
  if (t.trimmed) {
    trimmedCount++;
    const removed = t.sourceWidth * t.sourceHeight - t.box.width * t.box.height;
    assert.ok(removed > 0, `${name}: a trim must actually remove margin`);
  }
  console.log(
    `  ${t.trimmed ? "TRIMMED " : "AS-IS   "} ${name}\n` +
      `           source ${t.sourceWidth}x${t.sourceHeight} → thumb ${out.width}x${out.height}` +
      (t.box ? ` (box ${t.box.width}x${t.box.height} @ ${t.box.left},${t.box.top})` : "") +
      `\n           frame fill ${(before.fill * 100).toFixed(1)}% → ${(after.fill * 100).toFixed(1)}%  (×${gain.toFixed(2)})`
  );
}

/* The screenshot-hero listing is the known letterbox case: its pure-black
   bands MUST come off. The other photographs carry real content to their
   edges — refusing to trim them is the trust gate doing its job. The fill
   numbers above are the measured truth for the human acceptance call:
   margin-trimming can only reclaim what is actually empty. */
assert.ok(trimmedCount >= 1, "the letterboxed screenshot hero must trim");
console.log(`\n  live proof: 3 production photographs derived; ${trimmedCount} trimmed; none regressed`);
