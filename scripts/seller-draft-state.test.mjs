/* ════════════════════════════════════════════════════════════════════════
   SELLER DRAFT STATE — identity invalidation + the escape hatch    (v7.56)

   Two defects found during the PFC274 investigation, neither of which caused
   the 82 but both of which were real:

   1. A Collector Significance score survived a material change of watch. The
      Sell Flow already stated the law — "stale identity-bound state silently
      filed under a different watch is worse than no state at all" — and
      already enforced it for admission affirmations. The score was simply
      never included.

   2. A draft could only leave the resume pool by being PUBLISHED, so the
      newest active draft owned the Sell page permanently. Found when a
      family member signed into the same account on another machine, started
      a listing, and that listing opened on the founder's computer.

   These are real behavioural assertions against the pure seam, not source
   greps: resetIdentityBoundState is total and dependency-free precisely so
   the ruling can be executed rather than described.

   Run:  node scripts/seller-draft-state.test.mjs
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resetIdentityBoundState } from "../lib/sellDraftReset.ts";

let n = 0;
const ok = (label, cond) => { n += 1; assert.ok(cond, label); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/* Prose is not behaviour: these files DESCRIBE the no-re-evaluation rule in
   their comments, so assertions about code must read stripped source. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* Fixtures are built inline rather than from emptyDraft(): lib/listing.ts
   reaches other modules through the "@/" build alias, which plain node cannot
   resolve, and the seam under test reads only the fields below. Keeping the
   test dependency-free is what lets it run anywhere, free, forever. */
const curated = () => ({
  brand: "Parmigiani Fleurier",
  reference: "PFC274-0000600-B33002",
  year: "2018",
  condition: "Excellent",
  askingPrice: "7950",
  significanceScore: 63,
  curationDecision: "pass",
  curationReasoning: "A considered piece.",
  details: { documentation: "Watch Only", admission: { affirmed: true } },
});
const patched = (d, p) => resetIdentityBoundState(d, { ...d, ...p });

/* ── 1 · the score SURVIVES ordinary non-identity editing ──────────────── */
{
  for (const [label, p] of [
    ["asking price", { askingPrice: "8250" }],
    ["condition", { condition: "Very Good" }],
    ["year", { year: "2019" }],
    ["provenance note", { provenanceNote: "Worn sparingly." }],
    ["description", { description: "A long and genuine description." }],
    ["documentation dropdown", { details: { documentation: "Full Set" } }],
  ]) {
    const out = patched(curated(), p);
    ok(`editing ${label} keeps the score`, out.significanceScore === 63);
    ok(`editing ${label} keeps the decision`, out.curationDecision === "pass");
  }
  /* A no-op reselect of the same identity must not clear either — this is
     what stops per-keystroke churn from wiping a legitimate score. */
  const same = patched(curated(), { brand: "  parmigiani fleurier  " });
  ok("a trim/case-only brand reselect is not a change", same.significanceScore === 63);
  ok("and it keeps the admission affirmations", same.details.admission !== undefined);
}

/* ── 2 · the score is INVALIDATED when the watch materially changes ────── */
{
  const brandChanged = patched(curated(), { brand: "Rolex" });
  ok("changing brand clears the score", brandChanged.significanceScore === null);
  ok("changing brand clears the decision", brandChanged.curationDecision === "pending");
  ok("changing brand clears the reasoning", brandChanged.curationReasoning === "");
  ok("changing brand clears admission too", brandChanged.details.admission === undefined);
  ok(
    "and every non-identity field the seller entered survives",
    brandChanged.year === "2018" && brandChanged.askingPrice === "7950" &&
      brandChanged.details.documentation === "Watch Only"
  );

  const refChanged = patched(curated(), { reference: "PFC901-0001234-C55003" });
  ok("changing reference clears the score", refChanged.significanceScore === null);
  ok("changing reference clears the decision", refChanged.curationDecision === "pending");
}

/* ── 3 · cleared, never recomputed ─────────────────────────────────────── */
{
  const out = patched(curated(), { brand: "Rolex" });
  ok(
    "the cleared score is null, never a substituted or carried-over number",
    out.significanceScore === null && typeof out.significanceScore !== "number"
  );
  ok(
    "no automatic re-evaluation was wired into the Sell Flow",
    !/re-?evaluate|recomputeSignificance/i.test(strip(read("components/SellFlow.tsx")))
  );
}

/* ── 4 · nothing is allocated when there is nothing to clear ───────────── */
{
  const fresh = { brand: "Rolex", reference: "126610LN", significanceScore: null,
                  curationDecision: "pending", curationReasoning: "", details: {} };
  ok(
    "an unchanged identity returns the same object identity",
    resetIdentityBoundState(fresh, fresh) === fresh
  );
}

/* ── 5 · the escape hatch preserves rather than deletes ────────────────── */
{
  const sql = read("supabase/migrations/20260830080000_listing_draft_set_aside.sql");
  ok("set-aside is a status change, never a delete", !/delete\s+from/i.test(sql));
  ok("it is owner-scoped", /r\.seller_id <> v_uid/.test(sql));
  ok("it refuses to un-publish a published draft", /ALREADY_PUBLISHED/.test(sql));
  ok("it is idempotent", /ALREADY_SET_ASIDE/.test(sql));
  ok("it kills any live handoff token", /handoff_token = null/.test(sql));
  /* The status CHECK has always allowed active | published | abandoned, and
     DraftLifecycle already declared all three. Writing the existing third
     value needs no schema change; inventing a synonym would have required
     widening a constraint for nothing — and would have failed on the live
     CHECK, which is exactly how this was caught. */
  ok("it writes the EXISTING abandoned status, not a new value",
     /status = 'abandoned'/.test(sql) && !/set_aside'/.test(sql.replace(/ALREADY_SET_ASIDE/g, "")));
  ok("the lifecycle type already covers that status",
     /"active" \| "published" \| "abandoned"/.test(read("lib/listingDraftShared.ts")));
  ok("execute is granted to authenticated only", /grant execute[\s\S]{0,80}to authenticated/i.test(sql));

  const flow = read("components/SellFlow.tsx");
  ok("the Sell Flow offers the seller the escape", /startNewListing/.test(flow));
  ok(
    "starting fresh resets BOTH step counters, so no step is inherited",
    /setStepRaw\(0\);[\s\S]{0,40}setMaxStep\(0\);/.test(flow)
  );
  ok(
    "and it creates no row until the seller actually types",
    /setServerDraftId\(null\);[\s\S]{0,120}userTouchedRef\.current = false;/.test(flow)
  );
  ok(
    "the resume query still only ever adopts an ACTIVE draft",
    /\.eq\("status", "active"\)/.test(read("lib/listingDraft.ts"))
  );
}

console.log(`seller-draft-state: ${n} assertions passed`);
