/* Saved listings — pure identity + recoverable-allowlist tests.

   These guard the two ways this surface could lie to a seller: by inventing
   identity a draft does not carry, and by offering a listing state the Sell
   Flow may not edit. The RPC states (RESUMED / DENIED / ALREADY_PUBLISHED)
   belong to the transactional data-layer harness, not here.

   Run: node scripts/saved-listing-drafts.test.mjs */
import assert from "node:assert/strict";
import {
  draftIdentity,
  UNTITLED_DRAFT_LABEL,
  RECOVERABLE_DRAFT_STATUSES,
} from "../lib/listingDraftShared.ts";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); pass++; };

const wrap = (draft) => ({ draft });

// ── Identity is reported, never inferred ─────────────────────────────────
{
  const id = draftIdentity(wrap({ brand: "Parmigiani", model: "Tonda", reference: "PFC274" }));
  ok("brand + model make the title", id.title === "Parmigiani Tonda");
  ok("title source is identity", id.titleSource === "identity");
  ok("reference is carried separately", id.reference === "PFC274");
}
{
  const id = draftIdentity(wrap({ brand: "", model: "", reference: "5967A" }));
  ok("reference alone is a truthful title", id.title === "5967A");
  ok("title source names the reference", id.titleSource === "reference");
}
{
  const id = draftIdentity(wrap({ brand: "Rolex" }));
  ok("brand alone titles the draft", id.title === "Rolex");
  ok("absent reference stays null", id.reference === null);
}
{
  const id = draftIdentity(wrap({}));
  ok("no identity falls back to the neutral label", id.title === UNTITLED_DRAFT_LABEL);
  ok("fallback is marked as having no source", id.titleSource === "none");
}
{
  // Whitespace is not identity. A draft whose brand is " " must not render a
  // blank title that looks like a name the seller entered.
  const id = draftIdentity(wrap({ brand: "   ", model: "\t", reference: "  " }));
  ok("whitespace-only fields count as missing", id.title === UNTITLED_DRAFT_LABEL);
  ok("whitespace reference is null, not empty string", id.reference === null);
}

// ── Photos: a count is a fact; progress is not ───────────────────────────
{
  const id = draftIdentity(wrap({
    photos: [
      { photo: { url: "https://example.test/a.jpg", pathname: "a.jpg" }, category: "" },
      { photo: { url: "https://example.test/b.jpg", pathname: "b.jpg" }, category: "Case" },
    ],
  }));
  ok("photo count is reported", id.photoCount === 2);
  ok("with no Dial shot the first usable photo is used", id.thumbnailUrl === "https://example.test/a.jpg");
}
{
  // The Dial shot identifies a watch at 56px; a clasp does not. Same
  // preference the account's own listing rows use.
  const id = draftIdentity(wrap({
    photos: [
      { photo: { url: "https://example.test/clasp.jpg" }, category: "Clasp" },
      { photo: { url: "https://example.test/dial.jpg" }, category: "Dial" },
    ],
  }));
  ok("the Dial photograph wins the thumbnail", id.thumbnailUrl === "https://example.test/dial.jpg");
}
{
  // A Dial entry with no usable url must not blank the thumbnail.
  const id = draftIdentity(wrap({
    photos: [
      { category: "Dial" },
      { photo: { url: "https://example.test/side.jpg" }, category: "Case" },
    ],
  }));
  ok("an unusable Dial entry falls back rather than blanking", id.thumbnailUrl === "https://example.test/side.jpg");
}
{
  const id = draftIdentity(wrap({
    photos: [
      { category: "dial" },                                   // no photo object
      { photo: {} },                                          // no url
      { photo: { url: "https://example.test/c.jpg" } },
    ],
  }));
  ok("photos without a usable url are skipped for the thumbnail", id.thumbnailUrl === "https://example.test/c.jpg");
  ok("count still reflects every stored entry", id.photoCount === 3);
}
{
  const id = draftIdentity(wrap({ photos: [] }));
  ok("no photos means no thumbnail", id.thumbnailUrl === null && id.photoCount === 0);
}

// ── Malformed content must degrade, never throw ──────────────────────────
for (const [label, value] of [
  ["null", null],
  ["undefined", undefined],
  ["a string", "not an object"],
  ["a number", 42],
  ["an object with no draft", { other: 1 }],
  ["a draft that is not an object", { draft: "nope" }],
  ["photos that are not an array", { draft: { photos: "many" } }],
]) {
  const id = draftIdentity(value);
  ok(`${label} yields the neutral label`, id.title === UNTITLED_DRAFT_LABEL);
  ok(`${label} yields a zero photo count`, id.photoCount === 0);
  ok(`${label} yields no thumbnail`, id.thumbnailUrl === null);
}

// ── The recoverable allowlist ────────────────────────────────────────────
ok("active drafts are recoverable", RECOVERABLE_DRAFT_STATUSES.includes("active"));
ok("set-aside drafts are recoverable", RECOVERABLE_DRAFT_STATUSES.includes("abandoned"));
ok("published drafts are NOT recoverable", !RECOVERABLE_DRAFT_STATUSES.includes("published"));
ok("the allowlist is exactly two states", RECOVERABLE_DRAFT_STATUSES.length === 2);

console.log(`saved-listing-drafts: ${pass} assertions PASS`);
