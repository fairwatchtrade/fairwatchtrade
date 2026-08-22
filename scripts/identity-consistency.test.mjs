/* Identity Consistency — classification-core behavior pins.

   Run: node --experimental-strip-types scripts/identity-consistency.test.mjs

   Pins the V1 detection boundary of classifyIdentityConsistency() — the
   pure half of the provider, everything after Vision has answered. The
   provider's whole character lives in what it REFUSES to flag, so most of
   these pins are quiet cases:

     · foreign wordmark, claim absent  → review_suggested + 5-part grammar
     · claimed brand's own wordmark    → passed (exempt, never a finding)
     · both brandings visible          → passed (ambiguity is quiet by law)
     · no branding at all              → passed
     · short brand names (<5 chars)    → never match as single words
     · substring hits inside longer    → never match (whole-word law)
     · diacritics                      → normalized (Genève ↔ GENEVE)
     · logo below threshold            → ignored
     · grammar wording                 → CLAIM/OBSERVATION/CONTRADICTION/
                                         OTHER WAY/DECISION all present,
                                         and no oracle model claims        */

import assert from "node:assert/strict";
import { classifyIdentityConsistency, normalizeBrandText } from "../lib/identityConsistency.ts";

let n = 0;
const ok = (name) => {
  n += 1;
  console.log(`  ✓ ${name}`);
};

const base = { claimedBrand: "Parmigiani Fleurier", category: "Dial", logos: [] };

// 1 · The founder's own proof case: claimed Parmigiani, ROLEX visible.
{
  const r = classifyIdentityConsistency({ ...base, ocrText: "ROLEX\nOYSTER PERPETUAL DATEJUST" });
  assert.equal(r.execution_status, "completed");
  assert.equal(r.classification, "review_suggested");
  for (const part of [
    "CLAIM: Parmigiani Fleurier.",
    "VISIBLE OBSERVATION:",
    "Rolex",
    "CONTRADICTION:",
    "WHAT POINTS THE OTHER WAY / UNCERTAINTY:",
    "DECISION: None — human review required.",
  ]) {
    assert.ok(r.reason.includes(part), `grammar missing: ${part}`);
  }
  // No oracle behavior: the reason must never name a model or reference.
  assert.ok(!/datejust|116234|oyster/i.test(r.reason), "oracle leak in reason");
  ok("cross-brand contradiction → review_suggested with full grammar");
}

// 2 · Correct claimed watch stays quiet (Test B semantics).
{
  const r = classifyIdentityConsistency({ ...base, ocrText: "PARMIGIANI FLEURIER\nTONDA" });
  assert.equal(r.classification, "passed");
  ok("claimed brand's own wordmark → passed");
}

// 3 · Both brandings visible → quiet (ambiguity law, Test C semantics).
{
  const r = classifyIdentityConsistency({
    ...base,
    ocrText: "PARMIGIANI FLEURIER\nROLEX",
  });
  assert.equal(r.classification, "passed");
  assert.equal(r.detail.note, "both_claimed_and_other_branding_visible");
  ok("mixed-branding scene → passed with honest detail note");
}

// 4 · No branding at all → quiet.
{
  const r = classifyIdentityConsistency({ ...base, ocrText: "AUTOMATIC\nSWISS MADE\n100M" });
  assert.equal(r.classification, "passed");
  ok("no branding → passed");
}

// 5 · Whole-word law: ROLEX inside a longer token never matches.
{
  const r = classifyIdentityConsistency({ ...base, ocrText: "PYROLEXAN COATING" });
  assert.equal(r.classification, "passed");
  ok("substring inside a longer token → quiet");
}

// 6 · Diacritics normalize both directions.
{
  assert.equal(normalizeBrandText("Universal Genève"), "UNIVERSAL GENEVE");
  const r = classifyIdentityConsistency({
    claimedBrand: "Universal Genève",
    category: "Dial",
    logos: [],
    ocrText: "UNIVERSAL GENEVE",
  });
  assert.equal(r.classification, "passed");
  ok("diacritic claim matches its plain OCR form → exempt");
}

// 7 · Logo below the internal threshold is ignored.
{
  const r = classifyIdentityConsistency({
    ...base,
    ocrText: "",
    logos: [{ description: "Rolex", score: 0.3 }],
  });
  assert.equal(r.classification, "passed");
  ok("weak logo detection → quiet");
}

// 8 · Logo at threshold fires, and names its detection channel.
{
  const r = classifyIdentityConsistency({
    ...base,
    ocrText: "",
    logos: [{ description: "Rolex", score: 0.9 }],
  });
  assert.equal(r.classification, "review_suggested");
  assert.ok(r.reason.includes("logo insignia"));
  ok("strong logo detection → finding via logo channel");
}

// 9 · Token-overlap exemption can only make V1 quieter: a brand sharing a
//     token with the claim is never treated as foreign.
{
  const r = classifyIdentityConsistency({
    claimedBrand: "Rolex",
    category: "Dial",
    logos: [],
    ocrText: "ROLEX",
  });
  assert.equal(r.classification, "passed");
  ok("claim seeing itself → passed");
}

// 10 · Operational rows come from the executor, not this core — but the
//      core must never emit anything except completed rows.
{
  const r = classifyIdentityConsistency({ ...base, ocrText: "OMEGA SPEEDMASTER" });
  assert.equal(r.execution_status, "completed");
  assert.equal(r.classification, "review_suggested");
  assert.ok(!/speedmaster/i.test(r.reason), "oracle leak: model name in reason");
  ok("second foreign brand fires; model name stays out of the grammar");
}

console.log(`\nidentity-consistency: ${n} pins hold.`);
