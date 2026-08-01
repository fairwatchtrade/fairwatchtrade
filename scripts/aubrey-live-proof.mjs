/* THE AUBREY LIVE PROOF
   ─────────────────────────────────────────────────────────────────────────
   The proof that was blocked since v2.24. It answers the only question that
   matters for classification:

     Do GENUINE seller photographs come back with zero public-web matches,
     and do STOLEN photographs — including ones cropped to hide the room —
     come back with matches?

   If genuine uploads are clean and stolen ones are not, then MATCH PRESENCE
   is the signal and no score threshold is needed. (Google returns score:null
   on both fullMatchingImages and partialMatchingImages, so a score-based
   classifier can never fire — that is the defect this proof retires.)

   Read-only: calls Google directly, writes no database row, publishes
   nothing, activates nothing.

   Run: node scripts/aubrey-live-proof.mjs
*/
import fs from "node:fs";
import sharp from "sharp";

const env = Object.fromEntries(
  fs
    .readFileSync("C:/Dev/fairwatchtrade/.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const KEY = env.GOOGLE_CLOUD_VISION_API_KEY;
if (!KEY) throw new Error("GOOGLE_CLOUD_VISION_API_KEY missing");

/* Real FairWatch seller uploads — the honest-seller control group. */
const GENUINE = [
  "Screenshot_20260618_222210_Gallery-hPVgOVYUIskNsDfiuusxqDEmvxGKrb.jpg",
  "processed-Qc2kouMunDC6E8HdIspDaiRkwr67lA.jpg",
  "dial-0b4HsILzzjHRD4Jy9w8LePcbnDZ6vZ.jpg",
  "full-watch-strap-bracelet-extended-kl5XiRbBD3I8EZ1lR7IUwfMpiZvHOz.jpg",
  "seamaster_back-avgZEtsrOj1PRnVBuJVbnCjVkz3Y9N.jpg",
  "20260618_222255-NXfV1TpsOkRQPbcHUbkEn7Cnu0xOlQ.jpg",
  "20260616_110716-UxGjrzQneqCt8tlTMiwMoMrLChWjlP.jpg",
  "clasp-pin-buckle-axUZZyDNFf6qsJQCmERXAj2MpkPlAU.jpg",
  "6554-J8KMNnIQpSiYSbMz9x1myO0DuHxDFS.jpg",
  "processed-FQVUjAtBwS98SuRGfotrZEI0eV4Yev.jpg",
].map((n) => `https://ecmtihkajkbp7udl.public.blob.vercel-storage.com/listings/${n}`);

/* Known-borrowed public watch photographs — the scammer control group. */
const BORROWED = [
  "https://upload.wikimedia.org/wikipedia/commons/9/94/Omega_Speedmaster_Rueckseite.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/2/23/Omega_Speedmaster_compilation_pp01.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/c/cd/Vintage_Omega_Speedmaster_%22Pre-moon%22.jpg",
];

async function detect(buf) {
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        { image: { content: buf.toString("base64") }, features: [{ type: "WEB_DETECTION", maxResults: 10 }] },
      ],
    }),
  });
  const body = await res.json();
  if (!res.ok || body?.responses?.[0]?.error) {
    return { error: body?.error?.message ?? body?.responses?.[0]?.error?.message ?? `HTTP ${res.status}` };
  }
  const w = body.responses[0].webDetection ?? {};
  return {
    full: (w.fullMatchingImages ?? []).length,
    partial: (w.partialMatchingImages ?? []).length,
    pages: (w.pagesWithMatchingImages ?? []).length,
    anyScore: [...(w.fullMatchingImages ?? []), ...(w.partialMatchingImages ?? [])].some(
      (i) => typeof i.score === "number"
    ),
  };
}

async function bytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/* Crop to the centre, the way a scammer hides the room around the watch —
   Aubrey's exact test. */
async function cropToWatch(buf) {
  const m = await sharp(buf).metadata();
  return sharp(buf)
    .extract({
      left: Math.round(m.width * 0.15),
      top: Math.round(m.height * 0.15),
      width: Math.round(m.width * 0.7),
      height: Math.round(m.height * 0.7),
    })
    .jpeg({ quality: 88 })
    .toBuffer();
}

const rows = [];
let anyScoreAnywhere = false;

console.log("\n=== GROUP A — genuine FairWatch seller uploads (must be CLEAN) ===");
for (const url of GENUINE) {
  try {
    const r = await detect(await bytes(url));
    if (r.error) { console.log(`  ERR  ${r.error.slice(0, 60)}`); continue; }
    anyScoreAnywhere ||= r.anyScore;
    rows.push({ group: "genuine", ...r });
    console.log(`  full=${r.full}  partial=${r.partial}  pages=${r.pages}   ${url.split("/").pop().slice(0, 42)}`);
  } catch (e) {
    console.log(`  SKIP ${String(e).slice(0, 50)}`);
  }
}

console.log("\n=== GROUP B — borrowed public photos, AS-IS (must MATCH) ===");
for (const url of BORROWED) {
  try {
    const r = await detect(await bytes(url));
    if (r.error) { console.log(`  ERR  ${r.error.slice(0, 60)}`); continue; }
    anyScoreAnywhere ||= r.anyScore;
    rows.push({ group: "borrowed", ...r });
    console.log(`  full=${r.full}  partial=${r.partial}  pages=${r.pages}   ${url.split("/").pop().slice(0, 42)}`);
  } catch (e) {
    console.log(`  SKIP ${String(e).slice(0, 50)}`);
  }
}

console.log("\n=== GROUP C — borrowed, CROPPED to the watch (Aubrey's test) ===");
for (const url of BORROWED) {
  try {
    const r = await detect(await cropToWatch(await bytes(url)));
    if (r.error) { console.log(`  ERR  ${r.error.slice(0, 60)}`); continue; }
    anyScoreAnywhere ||= r.anyScore;
    rows.push({ group: "cropped", ...r });
    console.log(`  full=${r.full}  partial=${r.partial}  pages=${r.pages}   ${url.split("/").pop().slice(0, 42)}`);
  } catch (e) {
    console.log(`  SKIP ${String(e).slice(0, 50)}`);
  }
}

const g = (name) => rows.filter((r) => r.group === name);
const matched = (r) => r.full > 0 || r.partial > 0;

console.log("\n────────────────────── RULING ──────────────────────");
const genuineMatched = g("genuine").filter(matched).length;
const borrowedMatched = g("borrowed").filter(matched).length;
const croppedMatched = g("cropped").filter(matched).length;

console.log(`  genuine  : ${genuineMatched}/${g("genuine").length} matched  (false positives — must be 0)`);
console.log(`  borrowed : ${borrowedMatched}/${g("borrowed").length} matched  (must be all)`);
console.log(`  cropped  : ${croppedMatched}/${g("cropped").length} matched  (Aubrey's case — must be all)`);
console.log(`  any usable score returned by Google, anywhere: ${anyScoreAnywhere}`);

const clean =
  genuineMatched === 0 &&
  borrowedMatched === g("borrowed").length &&
  croppedMatched === g("cropped").length;

console.log(
  clean
    ? "\n  PROVEN: match PRESENCE separates stolen from genuine, with no score.\n" +
        "  Classify on presence. Full match = high confidence. Partial = review.\n"
    : "\n  NOT PROVEN — do not activate on this data.\n"
);
