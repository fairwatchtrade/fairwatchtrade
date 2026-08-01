/* PHOTO SET COHERENCE — proof against the real listing that beat us.

   Run: node --experimental-strip-types scripts/photo-set-coherence.test.mjs

   Test 1 replays listing 5ff6c2dc-598d-4b24-a08c-c32ce57977d4 with the exact
   dimensions measured in production on 2026-08-01. Five handheld 3:4 photos
   and one 1600x1600 studio image lifted from a marketplace CDN. Google found
   nothing for any of them. This layer must find the odd one out with no web
   access whatsoever.

   The remaining tests exist to keep it from becoming an accusation machine:
   an honest seller must be able to photograph their watch and be left alone. */
import assert from "node:assert/strict";
import { analyzePhotoSet } from "../lib/photoSetCoherence.ts";

let n = 0;
const ok = (name) => console.log(`  PASS ${++n}  ${name}`);

const cap = (w, h, extra = {}) => ({
  hasExif: true,
  make: "samsung",
  model: "SM-G736U",
  lens: null,
  software: null,
  capturedAt: "2026:07:31 14:02:11",
  originalWidth: w,
  originalHeight: h,
  originalBytes: 3_100_000,
  originalType: "image/jpeg",
  ...extra,
});

/* ── 1 · THE REAL CASE ──────────────────────────────────────────────── */
const realSet = [
  { pathname: "6552.jpg", category: "Crown Side", capture: cap(1800, 2400) },
  { pathname: "6553.jpg", category: "Non-Crown Side", capture: cap(1800, 2400) },
  { pathname: "6554.jpg", category: "Caseback", capture: cap(1800, 2400) },
  { pathname: "clasp.jpg", category: "Clasp/Pin Buckle", capture: cap(1800, 2400) },
  { pathname: "6550.jpg", category: "Full watch", capture: cap(1800, 2400) },
  {
    // The Bezel photo: square, no camera metadata, a PNG off a CDN.
    pathname: "my Parmigiani.jpg",
    category: "Dial",
    capture: cap(1600, 1600, {
      hasExif: false,
      make: null,
      model: null,
      capturedAt: null,
      originalBytes: 93_000,
      originalType: "image/png",
    }),
  },
];

const real = analyzePhotoSet(realSet);
const flagged = real.findings.filter((f) => f.pathname === "my Parmigiani.jpg");
assert.ok(flagged.length > 0, "the borrowed photo must be flagged");
assert.ok(
  flagged.some((f) => f.code === "aspect_outlier"),
  "its square shape among 3:4 siblings must be noticed"
);
assert.ok(
  flagged.some((f) => f.code === "missing_exif_among_camera_photos"),
  "its missing camera metadata must be noticed"
);
/* And nothing else may be blamed. */
const others = real.findings.filter((f) => f.pathname !== "my Parmigiani.jpg");
assert.equal(others.length, 0, `innocent photos flagged: ${JSON.stringify(others)}`);
ok(
  `THE REAL CASE — the borrowed photo is the ONLY one flagged (${flagged.length} findings, score ${real.score}), with no web search at all`
);

/* ── 2 · An honest set is left completely alone ─────────────────────── */
const honest = analyzePhotoSet(
  ["a", "b", "c", "d", "e", "f"].map((p) => ({
    pathname: `${p}.jpg`,
    category: p,
    capture: cap(1800, 2400),
  }))
);
assert.equal(honest.findings.length, 0);
assert.equal(honest.score, 0);
ok("an honest six-photo set produces zero findings — no seller is bothered");

/* ── 3 · A seller with NO metadata at all is not suspicious ──────────
   Older phones, privacy tools, and screenshots all strip EXIF. If nobody in
   the set has it, absence carries no information and must stay silent. */
const noExif = analyzePhotoSet(
  ["a", "b", "c", "d"].map((p) => ({
    pathname: `${p}.jpg`,
    capture: cap(1800, 2400, { hasExif: false, make: null, model: null, capturedAt: null }),
  }))
);
assert.equal(
  noExif.findings.filter((f) => f.code === "missing_exif_among_camera_photos").length,
  0,
  "a uniformly metadata-free set must not be flagged"
);
ok("a seller whose photos all lack metadata is NOT flagged — absence alone proves nothing");

/* ── 4 · Live captures are exempt ───────────────────────────────────
   A wizard photo cannot be stolen; it did not exist before the shutter. */
const liveMixed = analyzePhotoSet([
  ...["a", "b", "c"].map((p) => ({
    pathname: `${p}.jpg`,
    captureSource: "live_camera",
    capture: cap(1080, 1080, { hasExif: false }),
  })),
]);
assert.equal(liveMixed.analyzed, 0);
assert.equal(liveMixed.skippedLiveCapture, 3);
assert.equal(liveMixed.findings.length, 0);
ok("live wizard captures are exempt — provenance is established, not inferred");

/* ── 5 · Two photos are not a pattern ───────────────────────────────── */
const tiny = analyzePhotoSet([
  { pathname: "a.jpg", capture: cap(1800, 2400) },
  { pathname: "b.jpg", capture: cap(1600, 1600, { hasExif: false }) },
]);
assert.equal(
  tiny.findings.filter((f) => f.code === "aspect_outlier").length,
  0,
  "with two photos there is no majority to deviate from"
);
ok("a two-photo set yields no outlier findings — there is no 'normal' yet");

/* ── 6 · A different camera in the set is noticed ───────────────────── */
const twoCams = analyzePhotoSet([
  { pathname: "a.jpg", capture: cap(1800, 2400) },
  { pathname: "b.jpg", capture: cap(1800, 2400) },
  { pathname: "c.jpg", capture: cap(1800, 2400) },
  { pathname: "d.jpg", capture: cap(1800, 2400, { model: "Canon EOS 5D" }) },
]);
assert.ok(twoCams.findings.some((f) => f.code === "foreign_camera" && f.pathname === "d.jpg"));
ok("a photo from a different camera than its siblings is noticed");

/* ── 7 · Editing software is reported, not condemned ─────────────────── */
const edited = analyzePhotoSet([
  { pathname: "a.jpg", capture: cap(1800, 2400, { software: "Adobe Photoshop 26.0" }) },
]);
const soft = edited.findings.find((f) => f.code === "editor_software");
assert.ok(soft);
assert.equal(soft.weight, 1, "editing is a note, not an indictment");
ok("editing software is surfaced at the lowest weight — a note for a human, not a verdict");

/* ── 8 · Every finding is phrased as an observation ──────────────────
   This layer detects INCONSISTENCY, never theft. If the copy ever starts
   asserting guilt, this fails. */
for (const f of [...real.findings, ...twoCams.findings, ...edited.findings]) {
  assert.ok(f.detail.length > 20, "a finding must explain itself to a reviewer");
  assert.ok(
    !/stolen|fraud|fake|theft|scam/i.test(f.detail),
    `accusatory language in a finding: ${f.detail}`
  );
  assert.ok([1, 2, 3].includes(f.weight));
}
ok("no finding accuses — every one is an observation a human can overrule");

console.log(`\n  ${n}/${n} passed.`);
console.log("  The photo that beat every search engine tonight is caught by arithmetic.\n");
