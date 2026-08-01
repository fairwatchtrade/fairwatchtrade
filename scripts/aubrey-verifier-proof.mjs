/* AUBREY VERIFIER PROOF
   ─────────────────────────────────────────────────────────────────────────
   Google's WEB_DETECTION is a SEARCH, not a verdict. Its partialMatchingImages
   list mixes genuine provenance hits with "similar-looking watch" noise, and it
   returns no usable score. Acting on it directly either accuses honest sellers
   (proven: a real seller photo matched an unrelated dealer's photo) or misses
   crops (proven: Aubrey's cropped test returned zero full matches).

   So FairWatch verifies the candidate itself: fetch the matched image and ask
   one narrow question — IS THIS THE SAME PHOTOGRAPH, possibly cropped?

   Method: greyscale, normalized, compared at 32x32. A crop is searched for by
   comparing the seller's image against sub-windows of the candidate across
   several scales and offsets — because a scammer's crop is a sub-region of the
   original photograph, not a different picture.

   This proves the verifier separates:
     · Aubrey's case  — a cropped stolen photo         → MUST verify
     · the false positive — a different watch entirely → MUST NOT verify

   Read-only. No database, no listing, no activation.
   Run: node scripts/aubrey-verifier-proof.mjs
*/
import sharp from "sharp";

const N = 32; // comparison grid

async function grab(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/* Normalized greyscale signature. normalize() is what makes this survive the
   recompression and brightness drift of a re-uploaded photograph. */
async function sig(buf, region) {
  let img = sharp(buf);
  if (region) img = img.extract(region);
  return img.greyscale().normalize().resize(N, N, { fit: "fill" }).raw().toBuffer();
}

function mad(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

/* Best match of `seller` against any sub-window of `candidate`.
   Scale 1.0 with no offset is the plain "same image" test; the smaller scales
   are the crop search. */
async function bestMatch(sellerBuf, candidateBuf) {
  const s = await sig(sellerBuf);
  const meta = await sharp(candidateBuf).metadata();
  let best = Infinity;
  let bestAt = null;

  for (const scale of [1, 0.9, 0.8, 0.7, 0.6, 0.5]) {
    const w = Math.round(meta.width * scale);
    const h = Math.round(meta.height * scale);
    const offsets =
      scale === 1
        ? [[0, 0]]
        : [
            [(meta.width - w) / 2, (meta.height - h) / 2], // centre — the usual crop
            [0, 0],
            [meta.width - w, 0],
            [0, meta.height - h],
            [meta.width - w, meta.height - h],
          ];
    for (const [left, top] of offsets) {
      try {
        const c = await sig(candidateBuf, {
          left: Math.max(0, Math.round(left)),
          top: Math.max(0, Math.round(top)),
          width: w,
          height: h,
        });
        const d = mad(s, c);
        if (d < best) {
          best = d;
          bestAt = `scale=${scale} off=${Math.round(left)},${Math.round(top)}`;
        }
      } catch {
        /* region out of bounds — skip */
      }
    }
  }
  return { best, bestAt };
}

const SPEED = "https://upload.wikimedia.org/wikipedia/commons/9/94/Omega_Speedmaster_Rueckseite.jpg";

console.log("Building Aubrey's test image — the borrowed photo, cropped to the watch…");
const original = await grab(SPEED);
const m = await sharp(original).metadata();
const aubreyCrop = await sharp(original)
  .extract({
    left: Math.round(m.width * 0.15),
    top: Math.round(m.height * 0.15),
    width: Math.round(m.width * 0.7),
    height: Math.round(m.height * 0.7),
  })
  .jpeg({ quality: 88 })
  .toBuffer();

const CASES = [
  {
    name: "AUBREY'S CASE — cropped stolen photo vs the original it came from",
    seller: aubreyCrop,
    candidate: original,
    mustVerify: true,
  },
  {
    name: "STRAIGHT THEFT — the borrowed photo re-uploaded untouched",
    seller: await sharp(original).jpeg({ quality: 80 }).toBuffer(),
    candidate: original,
    mustVerify: true,
  },
  {
    name: "FALSE POSITIVE — real seller photo vs the dealer photo Google matched",
    seller: await grab(
      "https://ecmtihkajkbp7udl.public.blob.vercel-storage.com/listings/seamaster_back-avgZEtsrOj1PRnVBuJVbnCjVkz3Y9N.jpg"
    ),
    candidate: await grab(
      "https://dannysvintagewatches.com/cdn/shop/files/DSCF4358.jpg?v=1780414794&width=3000"
    ),
    mustVerify: false,
  },
  {
    name: "CONTROL — two unrelated genuine seller photos",
    seller: await grab(
      "https://ecmtihkajkbp7udl.public.blob.vercel-storage.com/listings/dial-0b4HsILzzjHRD4Jy9w8LePcbnDZ6vZ.jpg"
    ),
    candidate: await grab(
      "https://ecmtihkajkbp7udl.public.blob.vercel-storage.com/listings/clasp-pin-buckle-axUZZyDNFf6qsJQCmERXAj2MpkPlAU.jpg"
    ),
    mustVerify: false,
  },
];

const results = [];
for (const c of CASES) {
  const { best, bestAt } = await bestMatch(c.seller, c.candidate);
  results.push({ ...c, best, bestAt });
  console.log(`\n--- ${c.name} ---`);
  console.log(`  best distance: ${best.toFixed(1)}   (${bestAt})   must verify: ${c.mustVerify}`);
}

const verifyMax = Math.max(...results.filter((r) => r.mustVerify).map((r) => r.best));
const rejectMin = Math.min(...results.filter((r) => !r.mustVerify).map((r) => r.best));

console.log("\n────────────────────── SEPARATION ──────────────────────");
console.log(`  worst true-theft distance : ${verifyMax.toFixed(1)}`);
console.log(`  best  innocent distance   : ${rejectMin.toFixed(1)}`);
console.log(`  gap                       : ${(rejectMin - verifyMax).toFixed(1)}`);

if (rejectMin > verifyMax) {
  const t = Math.round(verifyMax + (rejectMin - verifyMax) / 2);
  console.log(`\n  SEPARABLE. Proposed threshold T_SAME = ${t}`);
  console.log("  Theft verifies; honest sellers do not.\n");
} else {
  console.log("\n  NOT SEPARABLE on this method — do not activate.\n");
}
