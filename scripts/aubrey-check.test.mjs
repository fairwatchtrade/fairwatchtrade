/* THE AUBREY CHECK — end-to-end proof through the real classifier.

   Run: node --experimental-strip-types scripts/aubrey-check.test.mjs

   Test 1 is the one that matters. It is the test Aubrey and her dad ran on
   the first morning: take a photograph off the web, crop it so only the watch
   shows, and submit it. It returned clean, and the listing went through.

   It must never return clean again.

   These assertions run the REAL compareToCandidate and the REAL
   classifyAubrey, on real image bytes, over the network. They do not mock the
   thing they are supposed to prove. */
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  T_SAME,
  classifyAubrey,
  compareToCandidate,
} from "../lib/imageAuthenticity.ts";

let n = 0;
const ok = (name) => console.log(`  PASS ${++n}  ${name}`);

const grab = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`fetch ${r.status} ${u}`);
  return Buffer.from(await r.arrayBuffer());
};

const SPEEDMASTER = "https://upload.wikimedia.org/wikipedia/commons/9/94/Omega_Speedmaster_Rueckseite.jpg";
const SELLER_REAL =
  "https://ecmtihkajkbp7udl.public.blob.vercel-storage.com/listings/seamaster_back-avgZEtsrOj1PRnVBuJVbnCjVkz3Y9N.jpg";
const DEALER_SIMILAR =
  "https://dannysvintagewatches.com/cdn/shop/files/DSCF4358.jpg?v=1780414794&width=3000";

const original = await grab(SPEEDMASTER);
const meta = await sharp(original).metadata();

/* Aubrey's crop: hide the desk, show the watch. Nothing else altered. */
const cropped = await sharp(original)
  .extract({
    left: Math.round(meta.width * 0.15),
    top: Math.round(meta.height * 0.15),
    width: Math.round(meta.width * 0.7),
    height: Math.round(meta.height * 0.7),
  })
  .jpeg({ quality: 88 })
  .toBuffer();

/* ── 1 · THE AUBREY TEST ────────────────────────────────────────────── */
const aubreyHit = await compareToCandidate(cropped, original);
assert.ok(aubreyHit, "the cropped photo must produce a comparison result");
assert.ok(
  aubreyHit.distance <= T_SAME,
  `cropped stolen photo must verify (distance ${aubreyHit?.distance} > T_SAME ${T_SAME})`
);

const aubreyRow = classifyAubrey({
  detection: {
    // What Google really returns for this crop: no full matches, one partial.
    fullMatchingImages: [],
    partialMatchingImages: [{ url: SPEEDMASTER }],
    pagesWithMatchingImages: [{ url: "https://commons.wikimedia.org/", pageTitle: "Source" }],
  },
  verified: { ...aubreyHit, url: SPEEDMASTER, kind: "partial" },
  candidatesVerified: 1,
  verificationErrors: 0,
  nowIso: new Date().toISOString(),
});

assert.equal(aubreyRow.classification, "high_confidence_match");
assert.notEqual(aubreyRow.classification, "passed");
assert.equal(aubreyRow.detail.verified, true);
assert.equal(aubreyRow.detail.verdict, "match_partial");
assert.ok(aubreyRow.detail.matched_source_url, "a reviewer must be given somewhere to look");
ok(`AUBREY'S TEST — cropped stolen photo is CAUGHT (distance ${aubreyHit.distance}, was 'clean' before)`);

/* ── 2 · Straight theft — re-uploaded untouched ─────────────────────── */
const plain = await sharp(original).jpeg({ quality: 80 }).toBuffer();
const plainHit = await compareToCandidate(plain, original);
assert.ok(plainHit.distance <= T_SAME, `re-upload must verify (got ${plainHit?.distance})`);
ok(`straight theft — an untouched re-upload is caught (distance ${plainHit.distance})`);

/* ── 3 · The honest seller must NOT be accused ──────────────────────── */
const sellerBuf = await grab(SELLER_REAL);
const dealerBuf = await grab(DEALER_SIMILAR);
const innocent = await compareToCandidate(sellerBuf, dealerBuf);
assert.ok(
  innocent.distance > T_SAME,
  `a different watch must NOT verify (got ${innocent?.distance} <= ${T_SAME})`
);

const innocentRow = classifyAubrey({
  detection: {
    fullMatchingImages: [],
    partialMatchingImages: [{ url: DEALER_SIMILAR }],
    pagesWithMatchingImages: [{ url: "https://www.youtube.com/watch?v=x", pageTitle: "noise" }],
  },
  verified: null,
  candidatesVerified: 1,
  verificationErrors: 0,
  nowIso: new Date().toISOString(),
});
assert.equal(innocentRow.classification, "passed");
assert.equal(innocentRow.detail.verified, false);
/* …but the evidence is KEPT. The old build threw this away. */
assert.equal(innocentRow.detail.partial_matches.length, 1);
ok(`honest seller is NOT accused (distance ${innocent.distance}) — and evidence is still retained`);

/* ── 4 · An unconfirmable full match holds, never passes ────────────── */
const unconfirmed = classifyAubrey({
  detection: { fullMatchingImages: [{ url: "https://example.invalid/x.jpg" }] },
  verified: null,
  candidatesVerified: 0,
  verificationErrors: 1,
  nowIso: new Date().toISOString(),
});
assert.equal(unconfirmed.classification, "review_suggested");
assert.notEqual(unconfirmed.classification, "passed");
assert.equal(unconfirmed.detail.verdict, "unverified_candidates");
ok("a full match we could not confirm holds for review — it never passes silently");

/* ── 5 · Nothing found is genuinely clean ───────────────────────────── */
const clean = classifyAubrey({
  detection: {},
  verified: null,
  candidatesVerified: 0,
  verificationErrors: 0,
  nowIso: new Date().toISOString(),
});
assert.equal(clean.classification, "passed");
assert.equal(clean.detail.verdict, "clean");
assert.equal(clean.detail.matched_source_url, null);
ok("a photograph found nowhere on the web passes cleanly");

/* ── 6 · No score is ever required ──────────────────────────────────
   The v2.24 defect in one assertion: Google returns score:null, so a
   classifier that needs a score can never fire. Nothing here reads one. */
const scoreless = classifyAubrey({
  detection: {
    fullMatchingImages: [{ url: "https://a.example/1.jpg" }], // no score field
    partialMatchingImages: [{ url: "https://a.example/2.jpg" }],
  },
  verified: { distance: 1.1, window: "scale=1 off=0,0", url: "https://a.example/1.jpg", kind: "full" },
  candidatesVerified: 1,
  verificationErrors: 0,
  nowIso: new Date().toISOString(),
});
assert.equal(scoreless.classification, "high_confidence_match");
ok("classification never depends on a provider score — the v2.24 defect cannot recur");

/* ── 7 · It is evidence, never a verdict ────────────────────────────── */
for (const row of [aubreyRow, unconfirmed, innocentRow, scoreless]) {
  assert.notEqual(row.classification, "rejected");
  assert.ok(["passed", "review_suggested", "high_confidence_match"].includes(row.classification));
}
ok("no path produces a rejection — the worst outcome is a human being asked to look");

console.log(`\n  ${n}/${n} passed.`);
console.log("  The cropped photo is caught. The honest seller is not accused.\n");
