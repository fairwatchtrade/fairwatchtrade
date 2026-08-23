/* Founder Review Triage V1 — policy behavior + governance source pins.

   Run: node --experimental-strip-types scripts/review-triage.test.mjs

   Two halves, because two different things can break:

     · the POLICY is pure and gets real behavioral assertions — most
       importantly that ESCALATE is structurally the default and that no
       unrecognised fact pattern can fall through into a disposition;
     · the GOVERNANCE BOUNDARY is structural and gets source assertions,
       the same way scripts/sell-lifecycle.test.mjs guards the publication
       door. A seam that stops being narrow is not type-checkable.          */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TRIAGE_POLICY_VERSION,
  TRIAGE_REASONS,
  AVAILABILITY_BLOCKED,
  evaluateTriage,
  triageSellerMessage,
  triageAttentionReason,
} from "../lib/reviewTriage.ts";

let n = 0;
const ok = (label, cond) => {
  n += 1;
  assert.ok(cond, label);
};

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** A listing with nothing wrong with it. Each test spoils exactly one fact. */
const clean = {
  holdReason: null,
  flaggedEvidenceCount: 0,
  hasPrivateBuyer: false,
  customBrandFlag: false,
  availability: "In Stock",
};

/* ── 1 · ESCALATE is the default, not a branch ──────────────────────────── */
{
  ok(
    "an incomplete evidence set escalates, never disposes",
    evaluateTriage({ ...clean, holdReason: "results_pending" }).outcome === "escalate" &&
      evaluateTriage({ ...clean, holdReason: "results_pending" }).reason ===
        "evidence_incomplete"
  );
  ok(
    "an unavailable provider escalates for the same reason",
    evaluateTriage({ ...clean, holdReason: "provider_unavailable" }).reason ===
      "evidence_incomplete"
  );
  ok(
    "a finding_review hold is a founder-only exit triage may not take",
    evaluateTriage({ ...clean, holdReason: "finding_review" }).outcome === "escalate" &&
      evaluateTriage({ ...clean, holdReason: "finding_review" }).reason ===
        "finding_requires_founder"
  );
  ok(
    "an UNKNOWN hold value escalates rather than falling through to pass",
    evaluateTriage({ ...clean, holdReason: "some_future_hold" }).outcome === "escalate" &&
      evaluateTriage({ ...clean, holdReason: "some_future_hold" }).reason ===
        "policy_unmapped"
  );
  ok(
    "flagged authenticity evidence escalates",
    evaluateTriage({ ...clean, flaggedEvidenceCount: 1 }).reason ===
      "authenticity_evidence_flagged"
  );
  ok(
    "releasing a private listing to its one buyer stays a founder decision",
    evaluateTriage({ ...clean, hasPrivateBuyer: true }).reason ===
      "private_release_requires_founder"
  );
  ok(
    "an unrecognised maker is an admission judgment, not a machine call",
    evaluateTriage({ ...clean, customBrandFlag: true }).reason ===
      "unrecognized_maker_admission"
  );
  ok(
    "every escalation names a reason from the declared vocabulary",
    [
      { ...clean, holdReason: "results_pending" },
      { ...clean, holdReason: "finding_review" },
      { ...clean, holdReason: "nonsense" },
      { ...clean, flaggedEvidenceCount: 3 },
      { ...clean, hasPrivateBuyer: true },
      { ...clean, customBrandFlag: true },
    ].every((f) => TRIAGE_REASONS.includes(evaluateTriage(f).reason))
  );
}

/* ── 2 · Uncertainty outranks the adverse rule ──────────────────────────── */
{
  /* A listing that is BOTH unclear and blocked goes to Jason. Handing it
     back automatically would be a machine acting on a case it was told it
     does not understand. */
  ok(
    "a blocked listing that is also uncertain escalates instead of failing",
    evaluateTriage({
      ...clean,
      availability: AVAILABILITY_BLOCKED,
      holdReason: "finding_review",
    }).outcome === "escalate"
  );
  ok(
    "a blocked listing with flagged evidence escalates instead of failing",
    evaluateTriage({
      ...clean,
      availability: AVAILABILITY_BLOCKED,
      flaggedEvidenceCount: 2,
    }).outcome === "escalate"
  );
}

/* ── 3 · The one authorized adverse disposition ─────────────────────────── */
{
  const fail = evaluateTriage({ ...clean, availability: AVAILABILITY_BLOCKED });
  ok("an unavailable listing fails", fail.outcome === "fail");
  ok("and names the rule that failed it", fail.reason === "availability_not_in_stock");

  const msg = triageSellerMessage(fail);
  ok("a FAIL always carries a seller-facing message", typeof msg === "string" && msg.length > 0);
  ok(
    "the seller message names no machinery and accuses nobody",
    !/\b(google|vision|stolen|scraped|fraud|fraudulent|suspicious|suspicion|high_confidence_match|review_suggested)\b|https?:\/\/|\bscore\b/i.test(
      msg
    )
  );
  ok(
    "the seller message says what to do next",
    /In Stock/.test(msg) && /submit it again/i.test(msg)
  );
  ok(
    "a non-adverse outcome carries no seller message",
    triageSellerMessage(evaluateTriage(clean)) === null &&
      triageSellerMessage(evaluateTriage({ ...clean, holdReason: "finding_review" })) === null
  );
}

/* ── 4 · PASS requires everything to be clear at once ───────────────────── */
{
  const pass = evaluateTriage(clean);
  ok("a listing with nothing outstanding passes", pass.outcome === "pass");
  ok("and says why it passed", pass.reason === "no_open_objection");
  ok(
    "a missing availability value does not block a pass",
    evaluateTriage({ ...clean, availability: null }).outcome === "pass"
  );
  ok(
    "spoiling any single fact removes the pass",
    [
      { holdReason: "results_pending" },
      { flaggedEvidenceCount: 1 },
      { hasPrivateBuyer: true },
      { customBrandFlag: true },
      { availability: AVAILABILITY_BLOCKED },
    ].every((spoil) => evaluateTriage({ ...clean, ...spoil }).outcome !== "pass")
  );
  ok("the policy stamps a version on its rules", TRIAGE_POLICY_VERSION.length > 0);
}

/* ── 5 · The attention line the founder reads ───────────────────────────── */
{
  const escalation = evaluateTriage({ ...clean, holdReason: "finding_review" });
  const line = triageAttentionReason(escalation.reason, escalation.detail);
  ok("an escalation contributes a readable attention reason", /^Triage escalated/.test(line));
  ok("carrying the actual reason, not a code", /founder-only exit/.test(line));
  ok(
    "and it degrades to the code rather than to nothing",
    /policy_unmapped/.test(triageAttentionReason("policy_unmapped", null))
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   GOVERNANCE BOUNDARY — structural pins
   ══════════════════════════════════════════════════════════════════════════ */

const seam = read("lib/reviewTriageService.ts");
const gate = read("lib/listingPublicationGate.ts");
const admin = read("app/api/admin/listings/[id]/status/route.ts");
const triageRoute = read("app/api/admin/listings/[id]/triage/route.ts");
const mcData = read("lib/marketplaceControlData.ts");
const migration = read("supabase/migrations/20260823120000_listing_review_triage_v1.sql");

/* ── 6 · The seam is narrow, and stays narrow ───────────────────────────── */
{
  ok(
    "the seam takes a listing id and nothing else — no caller names a status",
    /export async function runReviewTriageForListing\(\s*listingId: string\s*\)/.test(seam)
  );
  ok(
    "the seam performs exactly two transitions, derived from the outcome",
    /const target = decision\.outcome === "pass" \? "published" : "draft";/.test(seam)
  );
  ok(
    "triage adjudicates the review queue only",
    /row\.status !== "pending_review"/.test(seam) && /not_in_review:/.test(seam)
  );
  ok(
    "every status write is scoped to pending_review, so a founder wins the race",
    /\.eq\("status", "pending_review"\)/.test(seam) && /raced_by_founder/.test(seam)
  );
  ok(
    "the seam never writes rejected, reserved, removed, or private_active",
    !/"rejected"|"reserved"|"removed"|"private_active"/.test(
      seam.replace(/\/\*[\s\S]*?\*\//g, "")
    )
  );
  ok(
    "the seam never posts to the founder status route",
    !/admin\/listings/.test(seam) && !/ADMIN_USER_ID/.test(seam)
  );
}

/* ── 7 · PASS cannot bypass the publication law ─────────────────────────── */
{
  ok(
    "one module states the publication law",
    /export function publicationRefusal/.test(gate) &&
      /priorStatus !== "pending_review"/.test(gate) &&
      /not_in_review/.test(gate) &&
      /approval_required/.test(gate) &&
      /not_available/.test(gate)
  );
  ok(
    "the founder route enforces the law from that one module",
    /publicationRefusal\(\{/.test(admin) &&
      /from "@\/lib\/listingPublicationGate"/.test(admin)
  );
  ok(
    "the founder route still requires the explicit approve action",
    /approvalRecorded: reviewAction === "approve"/.test(admin)
  );
  ok(
    "triage enforces the same law before it publishes anything",
    /publicationRefusal\(\{/.test(seam) && /from "@\/lib\/listingPublicationGate"/.test(seam)
  );
  ok(
    "and the law wins the disagreement — a refused pass becomes founder work",
    /if \(refusal\) \{[\s\S]{0,200}outcome: "escalate"/.test(seam)
  );
  ok(
    "the founder route remains founder-gated behind its hardcoded literal",
    /const ADMIN_USER_ID = "/.test(admin) && /user\.id !== ADMIN_USER_ID/.test(admin)
  );
}

/* ── 8 · A machine decision is never dressed as a founder ───────────────── */
{
  ok(
    "triage records itself as triage, with no actor",
    /actor_uid: null/.test(seam) && /actor_kind: "triage"/.test(seam)
  );
  ok(
    "the founder route labels its own decisions as founder",
    /actor_kind: "founder"/.test(admin)
  );
  ok(
    "the database refuses to let the two disagree",
    /lde_actor_identity_check/.test(migration) &&
      /actor_kind = 'founder' and actor_uid is not null/.test(migration) &&
      /actor_kind = 'triage' and actor_uid is null/.test(migration)
  );
  ok(
    "triage never writes the founder review record",
    !/listing_integrity_reviews/.test(seam)
  );
}

/* ── 9 · One authoritative current result per review cycle ──────────────── */
{
  ok(
    "the partial unique index is what enforces it, not a convention",
    /create unique index if not exists listing_review_triage_one_current[\s\S]{0,160}where \(superseded_at is null\)/.test(
      migration
    )
  );
  ok(
    "the seam supersedes before it inserts",
    /\.update\(\{ superseded_at: nowIso \}\)[\s\S]{0,200}\.is\("superseded_at", null\)/.test(seam)
  );
  ok(
    "an outcome always carries a reason code and a policy version",
    /reason_code    text not null/.test(migration) &&
      /policy_version text not null/.test(migration)
  );
  ok(
    "no score, band, or threshold column exists on the triage record",
    !/score|confidence|threshold/i.test(
      migration.split("create table")[1].split(");")[0]
    )
  );
}

/* ── 10 · Nothing but the server can reach it ───────────────────────────── */
{
  ok(
    "the triage table is unreachable from any browser session",
    /alter table public\.listing_review_triage enable row level security/.test(migration) &&
      /revoke all on public\.listing_review_triage from public, anon, authenticated, service_role/.test(
        migration
      ) &&
      /grant select, insert, update on public\.listing_review_triage to service_role/.test(
        migration
      )
  );
  ok(
    "no RLS policy grants a client any read of triage",
    !/create policy[\s\S]{0,120}listing_review_triage/.test(migration)
  );
  ok(
    "the founder triage route gates on its own hardcoded literal",
    /const ADMIN_USER_ID = "/.test(triageRoute) &&
      /user\.id !== ADMIN_USER_ID/.test(triageRoute) &&
      /forbidden/.test(triageRoute)
  );
  ok(
    "the founder triage route accepts no status, outcome, or override",
    !/body/.test(triageRoute.replace(/\/\*[\s\S]*?\*\//g, "")) &&
      /_request: NextRequest/.test(triageRoute)
  );
}

/* ── 11 · Evidence is read, never rewritten ─────────────────────────────── */
{
  const noComments = seam.replace(/\/\*[\s\S]*?\*\//g, "");
  ok(
    "triage never inserts or updates provider results or evidence",
    !/listing_integrity_provider_results/.test(noComments) &&
      !/from\("listing_integrity_evidence"\)[\s\S]{0,120}\.(insert|update|delete|upsert)/.test(
        noComments
      )
  );
  ok(
    "the only evidence touch is a read of the flagged rows",
    /from\("listing_integrity_evidence"\)\s*\.select\(/.test(seam)
  );
  ok(
    "triage reuses the existing integrity gate rather than a second one",
    /aggregateIntegrityForListing/.test(seam) && /from "@\/lib\/integrity"/.test(seam)
  );
  ok(
    "and honors the same authenticity-coverage contract as every other caller",
    /requireAuthenticityCoverage: coverageRequired/.test(seam) &&
      /aubreyEnforcementEnabled\(\)/.test(seam)
  );
}

/* ── 12 · Attention truth after a disposition ───────────────────────────── */
{
  ok(
    "escalations reach Founder Review through the existing attention function",
    /listing_review_triage/.test(mcData) && /triageAttentionReason/.test(mcData)
  );
  ok(
    "only the CURRENT triage row speaks — an old cycle is history",
    /\.eq\("outcome", "escalate"\)[\s\S]{0,120}\.is\("superseded_at", null\)/.test(mcData)
  );
  ok(
    "a disposed listing leaves no stale attention: the reason is scoped to pending",
    /if \(!pendingIds\.has\(id\)\) continue;/.test(mcData)
  );
  ok(
    "computeAttention still does not execute triage",
    !/runReviewTriageForListing/.test(mcData)
  );
}

/* ── 13 · Triage actually runs, without being asked ─────────────────────── */
{
  const submit = read("app/api/listings/[id]/submit-for-review/route.ts");
  const create = read("app/api/listings/route.ts");
  ok(
    "a fresh submission is triaged",
    /runReviewTriageForListing\(data\.id as string\)/.test(create)
  );
  ok(
    "a resubmission is triaged",
    /runReviewTriageForListing\(id\)/.test(submit)
  );
  ok(
    "and a triage failure never unwinds the seller's submission",
    /try \{[\s\S]{0,120}runReviewTriageForListing[\s\S]{0,160}catch/.test(create) &&
      /try \{[\s\S]{0,120}runReviewTriageForListing[\s\S]{0,160}catch/.test(submit)
  );
}

console.log(`review-triage: ${n} assertions passed`);
