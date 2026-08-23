/* ════════════════════════════════════════════════════════════════════════
   CURATION REVIEW V1 — behavior pins

   Run: node --experimental-strip-types scripts/curation-review.test.mjs

   Two halves:
   · the composer's verdicts and its closed vocabulary (pure, unit-tested);
   · source assertions over the route and the shared seam, for the
     guarantees that are structural rather than computable — no publication
     write, no admin-gate weakening, no raw provider data reaching a
     collector.
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  composeCurationSummary,
  curationCompleteMessage,
  CURATION_VERDICTS,
} from "../lib/curationReview.ts";

let n = 0;
const ok = (name) => { n += 1; console.log(`  ✓ ${name}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const row = (provider, classification, extra = {}) => ({
  provider,
  classification,
  execution_status: "completed",
  is_active: true,
  category: null,
  ...extra,
});
const UPDATED = "2026-08-23T00:00:00.000Z";
const compose = (outcomes) => composeCurationSummary({ outcomes, updated: UPDATED });
const verdictOf = (s, label) => s.categories.find((c) => c.label === label).verdict;

/* ── 1 · a clean pass is short and says so ─────────────────────────────── */
{
  const s = compose([
    row("aubrey_exact_hash", "passed"),
    row("image_authenticity", "passed"),
    row("identity_consistency", "passed"),
  ]);
  assert.equal(s.categories.length, 3);
  assert.ok(s.categories.every((c) => c.verdict === "Consistent"));
  assert.match(s.comments, /Nothing inconsistent was found/);
  assert.equal(s.updated, UPDATED);
  ok("all-clean pass reads Consistent across all three categories");
}

/* ── 2 · an adverse provider surfaces as clarification, never accusation ── */
{
  const s = compose([
    row("aubrey_exact_hash", "passed"),
    row("image_authenticity", "passed"),
    row("identity_consistency", "review_suggested"),
  ]);
  assert.equal(verdictOf(s, "Reference / identity"), "Needs clarification");
  assert.equal(verdictOf(s, "Photographs"), "Consistent");
  assert.match(s.comments, /not a finding against the seller/i);
  ok("an adverse result reads Needs clarification and refuses to accuse");
}

/* ── 3 · silence is reported as silence, never as clean ────────────────── */
{
  const s = compose([]);
  assert.ok(s.categories.every((c) => c.verdict === "Could not be independently resolved"));
  assert.match(s.comments, /could not independently resolve/i);
  assert.match(s.comments, /Nothing adverse was found/);
  ok("no completed attempts never reads Consistent");
}

/* ── 4 · only CURRENT active attempts count ────────────────────────────── */
{
  const stale = compose([row("image_authenticity", "passed", { is_active: false })]);
  assert.equal(verdictOf(stale, "Photographs"), "Could not be independently resolved");
  const unavailable = compose([
    row("image_authenticity", null, { execution_status: "unavailable" }),
  ]);
  assert.equal(verdictOf(unavailable, "Photographs"), "Could not be independently resolved");
  ok("deactivated and unavailable attempts are not current answers");
}

/* ── 5 · the vocabulary is closed ──────────────────────────────────────── */
{
  const cases = [
    compose([]),
    compose([row("image_authenticity", "passed")]),
    compose([row("image_authenticity", "review_suggested")]),
    compose([row("aubrey_exact_hash", "high_confidence_match")]),
  ];
  for (const s of cases) {
    for (const c of s.categories) {
      assert.ok(CURATION_VERDICTS.includes(c.verdict), `unexpected verdict ${c.verdict}`);
    }
  }
  ok("every verdict comes from the closed founder-ruled vocabulary");
}

/* ── 6 · no forbidden language, ever ───────────────────────────────────── */
{
  const forbidden = /fraud|suspicio|caught|guarantee|certif|confidence|score|authentic(?!ity provider)/i;
  const all = [
    compose([]),
    compose([row("image_authenticity", "passed"), row("aubrey_exact_hash", "passed"), row("identity_consistency", "passed")]),
    compose([row("identity_consistency", "review_suggested")]),
  ];
  for (const s of all) {
    assert.doesNotMatch(s.comments, forbidden, `forbidden language: ${s.comments}`);
    for (const c of s.categories) assert.doesNotMatch(c.verdict, forbidden);
  }
  ok("no fraud/score/guarantee/certification language in any output");
}

/* ── 7 · the summary carries NOTHING internal ──────────────────────────── */
{
  const s = compose([
    { provider: "image_authenticity", classification: "review_suggested", execution_status: "completed",
      is_active: true, category: "Dial",
      detail: { matched_source_url: "https://leak.example/x", best_score: 0.97 },
      reason: "FOUNDER ONLY internal reasoning" },
  ]);
  const json = JSON.stringify(s);
  /* Values, not crude substrings — the legitimate label "Listing details"
     contains "detail", and the exact key assertion below proves the shape. */
  for (const leak of ["matched_source_url", "leak.example", "best_score", "0.97", "FOUNDER ONLY", "image_authenticity", "review_suggested"]) {
    assert.ok(!json.includes(leak), `summary leaked ${leak}`);
  }
  assert.deepEqual(Object.keys(s).sort(), ["categories", "comments", "updated", "version"]);
  ok("public summary exposes only version/categories/comments/updated");
}

/* ── 8 · notification copy names the real listing code ─────────────────── */
{
  assert.equal(curationCompleteMessage("x83038"), "Your review of X83038 is complete. View the listing.");
  assert.match(curationCompleteMessage(null), /^Your review of .+ is complete\./);
  ok("notification copy uses the real listing code");
}

/* ── 9 · route guarantees that are structural, not computable ──────────── */
{
  const route = read("app/api/listings/[id]/curation-request/route.ts");
  const seam = read("lib/integrity/providerPass.ts");
  const admin = read("app/api/admin/listings/[id]/recheck/route.ts");

  assert.ok(!/status:\s*"published"/.test(route) && !/status:\s*"published"/.test(seam),
    "curation path must never write published");
  assert.ok(!/\.from\("listings"\)[\s\S]{0,200}\.update\(/.test(route),
    "curation route must never update the listings row");
  ok("neither the collector route nor the shared seam writes listing status");

  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /not_authenticated/);
  ok("the route requires a real authenticated requester");

  assert.match(route, /triggeredBy: "collector_requested"/);
  ok("the provider pass is recorded as collector_requested");

  assert.match(route, /\.eq\("status", "pending"\)/);
  assert.match(route, /23505/);
  ok("duplicate pending requests are refused, index race included");

  assert.match(route, /VIEWABLE/);
  assert.match(route, /private_buyer_id !== user\.id/);
  ok("only a viewable listing is reviewable, private ones by their one buyer");

  assert.ok(/catch[\s\S]{0,160}notification failed/.test(route),
    "notification must be fail-open");
  ok("a notification failure cannot fail a completed review");

  assert.match(admin, /ADMIN_USER_ID/);
  assert.match(admin, /user\.id !== ADMIN_USER_ID/);
  ok("the founder recheck route keeps its own hardcoded admin gate");

  assert.match(route, /runIntegrityProviderPass/);
  assert.match(admin, /runIntegrityProviderPass/);
  ok("both doors call the one shared review seam");
}

console.log(`\ncuration-review: ${n} pins hold.`);
