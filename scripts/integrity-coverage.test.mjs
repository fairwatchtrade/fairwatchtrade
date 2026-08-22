/* Integrity Coverage — current-truth summary behavior pins.

   Run: node --experimental-strip-types scripts/integrity-coverage.test.mjs

   Pins the per-provider coverage composition Founder Review renders:

     · one row speaks per photograph — raw row counts never leak (the real
       production shape: old inactive system_upload attempts beside newer
       active admin_recheck attempts must read as 11 of 11, never 22);
     · is_active = true is the hard rule for "checked" — an inactive
       completed row without an active replacement is NOT a current check;
     · checked-clean, eligible-but-unavailable, and not-eligible remain
       three distinct truths (a provider that did not run is not clean);
     · per-provider denominators (identity's Dial-only eligible set never
       borrows image authenticity's denominator);
     · the founder-facing line wording, singular and plural.              */

import assert from "node:assert/strict";
import {
  pickSpeakingRow,
  speakingCoverageState,
  composeProviderCoverage,
  coverageLine,
  isFullyClean,
} from "../lib/integrityCoverage.ts";

let n = 0;
const ok = (name) => {
  n += 1;
  console.log(`  ✓ ${name}`);
};

const row = (attempt, status, cls, active) => ({
  attempt_number: attempt,
  execution_status: status,
  classification: cls,
  is_active: active,
});

// 1 · Active completed attempt speaks, even when an older attempt exists.
{
  const r = pickSpeakingRow([
    row(1, "completed", "passed", false),
    row(2, "completed", "passed", true),
  ]);
  assert.equal(r.attempt_number, 2);
  assert.equal(speakingCoverageState(r), "clean");
  ok("active completed attempt speaks over deactivated history");
}

// 2 · The real production shape: 11 photos × (inactive upload attempt +
//     active recheck attempt) reads 11 of 11 — never 22.
{
  const states = Array.from({ length: 11 }, () =>
    speakingCoverageState(
      pickSpeakingRow([
        row(1, "completed", "passed", false),
        row(2, "completed", "passed", true),
      ])
    )
  );
  const c = composeProviderCoverage(states);
  assert.equal(c.eligible, 11);
  assert.equal(c.checked, 11);
  assert.equal(coverageLine(c), "11 of 11 eligible photos checked · 0 findings · 0 unavailable");
  assert.equal(isFullyClean(c), true);
  ok("two attempts per photo never double count (11 of 11, not 22)");
}

// 3 · is_active hard rule: a deactivated completed row with no active
//     replacement is not a current check.
{
  const r = pickSpeakingRow([row(1, "completed", "passed", false)]);
  assert.equal(speakingCoverageState(r), "unavailable");
  ok("inactive completed row alone is not a current check");
}

// 4 · An unavailable active attempt beside an active completed one: the
//     completed row speaks regardless of attempt order.
{
  const r = pickSpeakingRow([
    row(2, "unavailable", null, true),
    row(1, "completed", "review_suggested", true),
  ]);
  assert.equal(speakingCoverageState(r), "finding");
  ok("completed active attempt outranks a later unavailable attempt");
}

// 5 · Three truths stay distinct — unavailable is not clean, not-eligible
//     is not unavailable, no rows at all is pending.
{
  const c = composeProviderCoverage(["clean", "unavailable", "not_eligible", "pending"]);
  assert.equal(c.eligible, 3);
  assert.equal(c.checked, 1);
  assert.equal(c.clean, 1);
  assert.equal(c.unavailable, 1);
  assert.equal(c.pending, 1);
  assert.equal(c.notEligible, 1);
  assert.equal(isFullyClean(c), false);
  assert.equal(speakingCoverageState(null), "pending");
  ok("checked-clean / unavailable / not-eligible / pending stay distinct");
}

// 6 · Per-provider denominators: identity's Dial-only set beside image
//     authenticity's full set, from the same 11-photo listing.
{
  const authenticity = composeProviderCoverage(Array(11).fill("clean"));
  const identity = composeProviderCoverage([
    "finding",
    ...Array(10).fill("not_eligible"),
  ]);
  assert.equal(authenticity.eligible, 11);
  assert.equal(identity.eligible, 1);
  assert.equal(
    coverageLine(identity, ["contradiction", "contradictions"]),
    "1 of 1 eligible photo checked · 1 contradiction · 0 unavailable"
  );
  ok("providers keep their own denominators");
}

// 7 · Incomplete coverage surfaces and is never fully clean.
{
  const c = composeProviderCoverage([...Array(9).fill("clean"), "unavailable", "unavailable"]);
  assert.equal(
    coverageLine(c),
    "9 of 11 eligible photos checked · 0 findings · 2 unavailable"
  );
  assert.equal(isFullyClean(c), false);
  ok("partial coverage reads 9 of 11 with unavailable surfaced");
}

// 8 · Pending appears in the line only when it exists.
{
  const some = composeProviderCoverage(["clean", "pending"]);
  assert.match(coverageLine(some), /· 1 pending$/);
  const none = composeProviderCoverage(["clean"]);
  assert.doesNotMatch(coverageLine(none), /pending/);
  ok("pending is named only when real");
}

// 9 · Singular wording for a one-photo eligible set, plural findings noun.
{
  const c = composeProviderCoverage(["clean", "not_eligible"]);
  assert.equal(
    coverageLine(c, ["contradiction", "contradictions"]),
    "1 of 1 eligible photo checked · 0 contradictions · 0 unavailable"
  );
  ok("singular photo, plural zero-findings noun");
}

// 10 · Empty eligible set is never fully clean (absence is not a pass).
{
  const c = composeProviderCoverage(["not_eligible", "not_eligible"]);
  assert.equal(c.eligible, 0);
  assert.equal(isFullyClean(c), false);
  ok("no eligible photos is never presented as clean");
}

console.log(`\nintegrity-coverage: ${n} pins hold.`);
