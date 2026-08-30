/* ════════════════════════════════════════════════════════════════════════
   ORDINARY DOCUMENTATION IS A CLAIM, NOT EVIDENCE                  (v7.55)

   The defect this exists to prevent: a seller typing "all paperwork and
   boxes, warranty card and owners book" earned roughly fourteen Collector
   Significance points for a sentence. Reproduced on production drafts —
   the same watch, same year, same price, same reference scored 82 with that
   sentence and 63 without it, entirely through era_and_provenance (22 vs 8).

   The founder ruling: ordinary seller-declared box/papers/full-set status
   must not create Collector Significance uplift. The claim is preserved and
   credited on the deterministic completeness side, where Box and
   Papers/Warranty photographs are mechanically observable proof.

   These are static assertions over the prompt text — no API call, no cost,
   so they run anywhere. They cannot prove what the model returns; they
   prove the instruction it is given still says what the founder ruled.

   Run:  node scripts/evaluator-documentation-claim.test.mjs
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert";
import { readFileSync } from "node:fs";

let n = 0;
const ok = (label, cond) => { n += 1; assert.ok(cond, label); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const prompt = read("lib/evaluationPrompt.ts");
const scoring = read("lib/scoring.ts");

/* ── The uplift band the defect travelled through is gone ──────────────── */
ok(
  "the claim-reachable 'modern piece with full set' uplift band no longer exists",
  !/Modern piece from approved brand with full set/i.test(prompt)
);
ok(
  "a modern piece scores one band regardless of declared completeness",
  /Modern piece from an approved brand: 5-10 points/.test(prompt)
);

/* ── The law is stated where the dimension is scored ───────────────────── */
ok(
  "the dimension states that ordinary documentation is a claim, not evidence",
  /ORDINARY COMPLETENESS DOCUMENTATION IS A CLAIM, NOT EVIDENCE/.test(prompt)
);
for (const phrase of ["box and papers", "full set", "warranty card", "owners book"]) {
  ok(
    `the exact wording the founder named is enumerated: "${phrase}"`,
    prompt.includes(`"${phrase}"`)
  );
}
ok(
  "the rule binds for vintage as well as modern, so the hole is not half-closed",
  /for a modern piece and a vintage one alike/.test(prompt)
);

/* ── The claim is redirected, never discarded ──────────────────────────── */
ok(
  "the claim is explicitly preserved rather than disbelieved",
  /neither discarded nor disbelieved/.test(prompt)
);
ok(
  "and it is pointed at the completeness side where proof is observable",
  /completeness side[\s\S]{0,160}Papers\/Warranty photographs/.test(prompt)
);

/* ── Truly exceptional provenance is out of scope and must still score ─── */
ok(
  "independently documented vintage provenance keeps the top band",
  /archive extract, factory records, established[\s\S]{0,40}ownership history\): 20-25 points/.test(prompt)
);

/* ── The deterministic side still separates claim from proof ───────────── */
ok(
  "completeness still scores the documentation CLAIM",
  /fullDocumentation: 5, \/\/ scaled by DOC_POINTS below — the CLAIM/.test(scoring)
);
ok(
  "completeness still scores the photographic PROOF separately",
  /documentationPhotos: 2, \/\/ \+1 Box photo, \+1 Papers photo — visual PROOF of the claim/.test(scoring)
);

/* ── Significance stays fixed at curation — no re-evaluation was added ──── */
ok(
  "no post-photo significance re-evaluation was introduced",
  !/reevaluate|re-evaluate|recomputeSignificance/i.test(read("components/SellFlow.tsx"))
);

console.log(`evaluator-documentation-claim: ${n} assertions passed`);
