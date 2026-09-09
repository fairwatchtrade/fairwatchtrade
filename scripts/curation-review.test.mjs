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
  curationDisplay,
  CURATION_VERDICTS,
  MIXED_SUMMARY_SENTENCE,
  CLEAN_SUMMARY_SENTENCE,
  ALL_UNRESOLVED_SENTENCE,
  UNREADABLE_REVIEW_SENTENCE,
  REVIEW_SCOPE_EXPLANATION,
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
  /* GRS-010: silence draws no favourable clause. The former trailing
     "Nothing adverse was found." was a conclusion from absence. */
  assert.doesNotMatch(s.comments, /Nothing adverse/);
  assert.doesNotMatch(s.comments, /Nothing inconsistent/);
  ok("no completed attempts never reads Consistent and draws nothing favourable");
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

/* ═══ 10 · PUBLIC DISPLAY MAPPING — Robots Readiness GRS-004 / GRS-010 ═══
   The panel derives its summary from the stored VERDICTS at read time
   through curationDisplay(); the stored sentence is never printed. These
   six cases are the order's required matrix, on in-memory fixtures. */
const V_OK = "Consistent";
const V_FLAG = "Needs clarification";
const V_UNRES = "Could not be independently resolved";
const stored = (verdicts, comments = "STALE STORED SENTENCE — must never render") => ({
  version: 1,
  categories: [
    { label: "Listing details", verdict: verdicts[0] },
    { label: "Photographs", verdict: verdicts[1] },
    { label: "Reference / identity", verdict: verdicts[2] },
  ],
  comments,
  updated: UPDATED,
});
const allClear = /Nothing inconsistent was found/;

/* Case 1 — completed clean: scoped clean allowed, no unresolved label. */
{
  const d = curationDisplay(stored([V_OK, V_OK, V_OK]));
  assert.equal(d.kind, "clean");
  assert.equal(d.allCompletedClean, true);
  assert.equal(d.lead, CLEAN_SUMMARY_SENTENCE);
  assert.match(d.lead, /details, its photographs and the reference/);
  assert.ok(!d.findings.some((f) => f.verdict === V_UNRES));
  assert.doesNotMatch(d.lead, /unresolved/i);
  ok("case 1 · all completed clean reads the scoped clean sentence and nothing else");
}
/* Case 2 — recorded concern: concern visible, no clean summary. */
{
  const d = curationDisplay(stored([V_OK, V_FLAG, V_OK]));
  assert.equal(d.kind, "concern");
  assert.equal(d.allCompletedClean, false);
  assert.match(d.lead, /worth a closer look under photographs/);
  assert.doesNotMatch(d.lead, allClear);
  assert.ok(d.findings.some((f) => f.verdict === V_FLAG));
  ok("case 2 · a recorded concern stays visible and no clean summary is drawn");
}
/* Case 3 — unresolved/unavailable everywhere: visible, no clean conclusion. */
{
  const d = curationDisplay(stored([V_UNRES, V_UNRES, V_UNRES]));
  assert.equal(d.kind, "unresolved");
  assert.equal(d.lead, ALL_UNRESOLVED_SENTENCE);
  assert.doesNotMatch(d.lead, allClear);
  assert.doesNotMatch(d.lead, /Nothing adverse/);
  assert.ok(d.findings.every((f) => f.verdict === V_UNRES));
  ok("case 3 · all unresolved says so and draws no favourable conclusion");
}
/* Case 4 — mixed (the M55915 shape): completed stays truthful, unresolved
   stays visible, the locked mixed sentence leads, no unconditional all-clear.
   The stored sentence is the exact contradiction that shipped; it must not
   render. */
{
  const s = stored(
    [V_UNRES, V_OK, V_OK],
    "Nothing inconsistent was found. FairWatchTrade could not independently resolve listing details from the material available."
  );
  const d = curationDisplay(s);
  assert.equal(d.kind, "mixed");
  assert.equal(d.lead, MIXED_SUMMARY_SENTENCE);
  assert.equal(d.lead, "Some checks completed, but parts of this review remain unresolved. See the findings below.");
  assert.doesNotMatch(d.lead, allClear);
  assert.equal(d.findings.find((f) => f.label === "Listing details").verdict, V_UNRES);
  assert.equal(d.findings.find((f) => f.label === "Photographs").verdict, V_OK);
  assert.equal(d.allCompletedClean, false);
  ok("case 4 · mixed leads with the locked sentence; the stored all-clear never renders");
}
/* Case 4b — concern AND unresolved: the concern leads and the unresolved
   part is still said, not absorbed. */
{
  const d = curationDisplay(stored([V_UNRES, V_FLAG, V_OK]));
  assert.equal(d.kind, "concern");
  assert.match(d.lead, /worth a closer look under photographs/);
  assert.match(d.lead, /also remain unresolved/);
  assert.doesNotMatch(d.lead, allClear);
  ok("case 4b · a concern beside an unresolved item names both");
}
/* Case 5 — not applicable: the V1 producer has no such state. A verdict
   outside the closed vocabulary must not be read as pass or fail. */
{
  const d = curationDisplay(stored([V_OK, "Not applicable", V_OK]));
  assert.equal(d.kind, "unreadable");
  assert.equal(d.allCompletedClean, false);
  assert.doesNotMatch(d.lead, allClear);
  assert.equal(d.findings.length, 0);
  ok("case 5 · a verdict outside the closed vocabulary is neither a pass nor a failure");
}
/* Case 6 — absent / legacy / unreadable review data: no favourable result. */
{
  for (const bad of [null, undefined, { version: 1, comments: "x", updated: UPDATED }, { version: 1, categories: [], comments: "x", updated: UPDATED }]) {
    const d = curationDisplay(bad);
    assert.equal(d.kind, "unreadable");
    assert.equal(d.lead, UNREADABLE_REVIEW_SENTENCE);
    assert.equal(d.allCompletedClean, false);
    assert.doesNotMatch(d.lead, allClear);
  }
  ok("case 6 · absent or unreadable review data generates no favourable result");
}
/* The composer and the mapper agree: a freshly composed record displays
   the same lead its own comments carry. */
{
  const fresh = compose([row("image_authenticity", "passed"), row("identity_consistency", "passed")]);
  assert.equal(curationDisplay(fresh).lead, fresh.comments);
  assert.equal(fresh.comments, MIXED_SUMMARY_SENTENCE);
  const clean = compose([row("aubrey_exact_hash", "passed"), row("image_authenticity", "passed"), row("identity_consistency", "passed")]);
  assert.equal(curationDisplay(clean).lead, clean.comments);
  ok("composer and display mapper produce one sentence, not two");
}
/* The locked explanation carries no guarantee language and the card renders
   the mapper, never the stored sentence. */
{
  const forbidden = /fraud|suspicio|caught|guarantee|confidence|score/i;
  assert.doesNotMatch(REVIEW_SCOPE_EXPLANATION, forbidden);
  assert.match(REVIEW_SCOPE_EXPLANATION, /not a physical inspection or authenticity certification/);
  const card = read("components/CurationReviewCard.tsx");
  assert.match(card, /curationDisplay\(summary\)/);
  assert.ok(!/\{summary\.comments\}/.test(card), "card must not print the stored sentence");
  assert.match(card, /REVIEW_SCOPE_EXPLANATION/);
  ok("the card renders the derived lead and the locked explanation, never summary.comments");
}

console.log(`\ncuration-review: ${n} pins hold.`);
