/* ════════════════════════════════════════════════════════════════════════
   AUBREY CHECK STEP 2 — cause-group identity contract tests (CG01–CG16)
   Run: node --experimental-strip-types scripts/aubrey-cause-group.test.mjs

   Pure unit coverage over the cause-group primitives, plus static source
   guards proving the count never gates and the exact layer still cannot
   hold a listing. No network, no database, no repository mutation.
   ════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  CAUSE_KIND_EXACT_RETAINED_BYTES,
  CAUSE_KIND_PROVIDER_RESULT,
  CAUSE_NEUTRAL_SAME_SELLER,
  PROVIDER_AUBREY_EXACT_HASH,
  PROVIDER_IMAGE_AUTHENTICITY,
  countDistinctCauses,
  evidenceCauseGroup,
  findingRequiresReview,
  isPromotableFinding,
  sameSellerRecurrenceOnly,
} = await import("../lib/integrity.ts");

let pass = 0;
const ok = (name, condition) => {
  assert.ok(condition, name);
  pass++;
};

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

const exactRow = (id, digest, matches = []) => ({
  id,
  provider: PROVIDER_AUBREY_EXACT_HASH,
  detail: {
    schema_version: "aubrey.exact_hash/v1",
    verdict: "observation_only",
    content_sha256: digest,
    matches,
    gate_effect: "none_flight_1",
  },
});

const otherRow = (id, detail = {}) => ({
  id,
  provider: PROVIDER_IMAGE_AUTHENTICITY,
  detail,
});

/* ── CG01 · identical retained bytes are ONE cause, however many rows ──── */
{
  const rows = [
    exactRow("r-1", DIGEST_A),
    exactRow("r-2", DIGEST_A),
    exactRow("r-3", DIGEST_A),
  ];
  ok("CG01 three measurements of one digest count once", countDistinctCauses(rows) === 1);
  ok(
    "CG01 all three share one cause key",
    new Set(rows.map((r) => evidenceCauseGroup(r).key)).size === 1
  );
}

/* ── CG02 · different retained bytes are different causes ──────────────── */
{
  const rows = [exactRow("r-1", DIGEST_A), exactRow("r-2", DIGEST_B)];
  ok("CG02 two distinct digests are two causes", countDistinctCauses(rows) === 2);
}

/* ── CG03 · an unrelated provider never merges into a byte cause ───────── */
{
  const rows = [exactRow("r-1", DIGEST_A), otherRow("r-2")];
  ok("CG03 a different provider is its own cause", countDistinctCauses(rows) === 2);
  ok(
    "CG03 non-exact rows key on row identity",
    evidenceCauseGroup(otherRow("r-2")).key === "result:r-2" &&
      evidenceCauseGroup(otherRow("r-2")).kind === CAUSE_KIND_PROVIDER_RESULT
  );
}

/* ── CG04 · the exact layer keys on the digest, and says so ────────────── */
{
  const g = evidenceCauseGroup(exactRow("r-1", DIGEST_A));
  ok("CG04 exact cause key is the digest", g.key === `sha256:${DIGEST_A}`);
  ok("CG04 exact cause kind is named", g.kind === CAUSE_KIND_EXACT_RETAINED_BYTES);
}

/* ── CG05 · malformed digests fall back to row identity, never collide ─── */
{
  const malformed = [
    "A".repeat(64), // uppercase
    "a".repeat(63), // short
    "a".repeat(65), // long
    "g".repeat(64), // non-hex
    "",
    null,
    12345,
  ];
  for (const bad of malformed) {
    const row = { id: "r-x", provider: PROVIDER_AUBREY_EXACT_HASH, detail: { content_sha256: bad } };
    const g = evidenceCauseGroup(row);
    ok(
      `CG05 malformed digest ${JSON.stringify(bad)} falls back to row identity`,
      g.key === "result:r-x" && g.kind === CAUSE_KIND_PROVIDER_RESULT
    );
  }
  const rows = malformed.map((bad, i) => ({
    id: `r-${i}`,
    provider: PROVIDER_AUBREY_EXACT_HASH,
    detail: { content_sha256: bad },
  }));
  ok(
    "CG05 malformed rows never over-merge into one cause",
    countDistinctCauses(rows) === rows.length
  );
}

/* ── CG06 · absent detail is safe ──────────────────────────────────────── */
{
  ok(
    "CG06 null detail keys on row identity",
    evidenceCauseGroup({ id: "r-9", provider: PROVIDER_AUBREY_EXACT_HASH, detail: null }).key ===
      "result:r-9"
  );
}

/* ── CG07 · only the exact layer keys on bytes ─────────────────────────── */
{
  const spoof = otherRow("r-7", { content_sha256: DIGEST_A });
  ok(
    "CG07 a foreign provider carrying a digest still keys on row identity",
    evidenceCauseGroup(spoof).key === "result:r-7"
  );
  ok(
    "CG07 it therefore cannot merge with the real exact cause",
    countDistinctCauses([exactRow("r-1", DIGEST_A), spoof]) === 2
  );
}

/* ── CG08 · same-seller recurrence is neutral ──────────────────────────── */
{
  const sellers = new Map([
    ["listing-own", "seller-1"],
    ["listing-other", "seller-1"],
  ]);
  const detail = { matches: [{ listing_id: "listing-other", media_id: "m", capture_source: "x" }] };
  ok(
    "CG08 every recurring copy owned by this seller is neutral",
    sameSellerRecurrenceOnly(detail, "seller-1", sellers) === true
  );
  ok("CG08 the neutral reason is the named vocabulary", CAUSE_NEUTRAL_SAME_SELLER === "same_seller_recurrence");
}

/* ── CG09 · a different seller is NOT neutral ──────────────────────────── */
{
  const sellers = new Map([
    ["listing-own", "seller-1"],
    ["listing-other", "seller-2"],
  ]);
  const detail = { matches: [{ listing_id: "listing-other" }] };
  ok(
    "CG09 recurrence across sellers is not excused",
    sameSellerRecurrenceOnly(detail, "seller-1", sellers) === false
  );
}

/* ── CG10 · one foreign copy among own copies is NOT neutral ───────────── */
{
  const sellers = new Map([
    ["a", "seller-1"],
    ["b", "seller-1"],
    ["c", "seller-2"],
  ]);
  const detail = { matches: [{ listing_id: "a" }, { listing_id: "b" }, { listing_id: "c" }] };
  ok(
    "CG10 a single foreign copy defeats neutrality",
    sameSellerRecurrenceOnly(detail, "seller-1", sellers) === false
  );
}

/* ── CG11 · unknown ownership is never treated as sameness ─────────────── */
{
  const detail = { matches: [{ listing_id: "unresolved" }] };
  ok(
    "CG11 an unresolvable listing is not neutral",
    sameSellerRecurrenceOnly(detail, "seller-1", new Map()) === false
  );
  ok(
    "CG11 an unknown own seller is not neutral",
    sameSellerRecurrenceOnly(detail, null, new Map([["unresolved", "seller-1"]])) === false
  );
}

/* ── CG12 · no recurrence means nothing to call neutral ────────────────── */
{
  const sellers = new Map([["listing-own", "seller-1"]]);
  ok(
    "CG12 empty matches is not neutral",
    sameSellerRecurrenceOnly({ matches: [] }, "seller-1", sellers) === false
  );
  ok(
    "CG12 absent matches is not neutral",
    sameSellerRecurrenceOnly({}, "seller-1", sellers) === false
  );
  ok(
    "CG12 null detail is not neutral",
    sameSellerRecurrenceOnly(null, "seller-1", sellers) === false
  );
  ok(
    "CG12 malformed match entries are not neutral",
    sameSellerRecurrenceOnly({ matches: [null, 5, "x"] }, "seller-1", sellers) === false
  );
}

/* ── CG13 · the correlated-evidence defect, stated as a number ─────────── */
{
  // Three measurements of one shared photograph plus one genuinely
  // independent finding. The raw row count says four; the truth is two.
  const rows = [
    exactRow("r-1", DIGEST_A),
    exactRow("r-2", DIGEST_A),
    exactRow("r-3", DIGEST_A),
    otherRow("r-4"),
  ];
  ok("CG13 raw row count would over-count", rows.length === 4);
  ok("CG13 cause count is the truth", countDistinctCauses(rows) === 2);
}

/* ── CG14 · exact-hash evidence still cannot hold a listing ────────────── */
{
  ok("CG14 'passed' never requires review", findingRequiresReview("passed") === false);
  const completedExact = {
    execution_status: "completed",
    is_active: true,
    classification: "passed",
    detail: { verdict: "observation_only" },
  };
  ok("CG14 a completed exact row is promotable", isPromotableFinding(completedExact) === true);
  ok(
    "CG14 but promotable + passed can never hold",
    isPromotableFinding(completedExact) && !findingRequiresReview(completedExact.classification)
  );
  const incompleteExact = {
    execution_status: "unavailable",
    is_active: true,
    classification: null,
    detail: { verdict: "incomplete" },
  };
  ok(
    "CG14 an incomplete exact row is not even promotable",
    isPromotableFinding(incompleteExact) === false
  );
}

/* ── CG15 · STATIC GUARD · the cause count is never a branch ───────────── */
{
  const src = readFileSync(new URL("../lib/integrity.ts", import.meta.url), "utf8");
  const lines = src.split(/\r?\n/);
  const offenders = [];
  lines.forEach((line, i) => {
    if (!line.includes("distinctCauseCount")) return;
    if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
    // A decision would need a comparison, a conditional, or a logical join.
    if (/\bif\s*\(|\?|&&|\|\||[<>]|===|!==|==|!=/.test(line)) offenders.push(`${i + 1}: ${line.trim()}`);
  });
  ok(
    `CG15 distinctCauseCount appears in no conditional (offenders: ${offenders.join(" | ")})`,
    offenders.length === 0
  );
  ok("CG15 and it is genuinely present", src.includes("distinctCauseCount"));
}

/* ── CG16 · STATIC GUARD · Step 2 adds no hold reason and no new gate ──── */
{
  const src = readFileSync(new URL("../lib/integrity.ts", import.meta.url), "utf8");
  const holdReasons = (src.match(/^export const HOLD_[A-Z_]+/gm) ?? []).length;
  ok("CG16 the hold vocabulary is still exactly three reasons", holdReasons === 3);
  const returnsPendingReview = (src.match(/status: "pending_review"/g) ?? []).length;
  ok("CG16 the gate still has exactly four hold exits", returnsPendingReview === 4);
  ok(
    "CG16 nothing branches on a cause value",
    !/\bif\s*\([^)]*cause_group_key/.test(src) && !/\bif\s*\([^)]*cause_neutral_reason/.test(src)
  );
}

/* ── CG17 · BOTH evidence writers share one builder — no drift ─────────── */
{
  const publishSrc = readFileSync(
    new URL("../app/api/listings/route.ts", import.meta.url),
    "utf8"
  );
  const recheckSrc = readFileSync(
    new URL("../app/api/admin/listings/[id]/recheck/route.ts", import.meta.url),
    "utf8"
  );
  for (const [name, src] of [
    ["publish", publishSrc],
    ["recheck", recheckSrc],
  ]) {
    ok(`CG17 the ${name} path uses the shared builder`, src.includes("buildPromotedEvidenceRows"));
    ok(
      `CG17 the ${name} path builds no evidence row of its own`,
      !/provider_result_id:\s*r\.id/.test(src)
    );
  }
}

/* ── CG18 · the builder stamps cause identity on every promoted row ────── */
{
  const { buildPromotedEvidenceRows } = await import("../lib/integrity.ts");
  const service = {
    from: () => ({
      select: () => ({
        in: async () => ({
          data: [
            { id: "listing-own", seller_id: "seller-1" },
            { id: "listing-mine-too", seller_id: "seller-1" },
            { id: "listing-theirs", seller_id: "seller-2" },
          ],
          error: null,
        }),
      }),
    }),
  };
  const base = { execution_status: "completed", is_active: true, classification: "passed", reason: null };
  const rows = await buildPromotedEvidenceRows({
    service,
    listingId: "listing-own",
    results: [
      // Two measurements of ONE shared photograph, recurring only on the
      // seller's own other listing — one cause, and a legitimate one.
      { ...base, id: "r-1", provider: PROVIDER_AUBREY_EXACT_HASH,
        detail: { content_sha256: DIGEST_A, matches: [{ listing_id: "listing-mine-too" }] } },
      { ...base, id: "r-2", provider: PROVIDER_AUBREY_EXACT_HASH,
        detail: { content_sha256: DIGEST_A, matches: [{ listing_id: "listing-mine-too" }] } },
      // An independent finding from another provider.
      { ...base, id: "r-3", provider: PROVIDER_IMAGE_AUTHENTICITY, detail: {} },
      // Not promotable — must never reach the evidence table.
      { ...base, id: "r-4", provider: PROVIDER_AUBREY_EXACT_HASH,
        execution_status: "unavailable", classification: null, detail: { verdict: "incomplete" } },
    ],
  });
  ok("CG18 only promotable rows are built", rows.length === 3);
  ok(
    "CG18 every built row carries a cause key and kind",
    rows.every((r) => typeof r.cause_group_key === "string" && typeof r.cause_group_kind === "string")
  );
  ok(
    "CG18 the two shared-photograph rows share one cause",
    rows[0].cause_group_key === rows[1].cause_group_key &&
      rows[0].cause_group_kind === CAUSE_KIND_EXACT_RETAINED_BYTES
  );
  ok(
    "CG18 the independent finding keeps its own cause",
    rows[2].cause_group_key === "result:r-3" &&
      rows[2].cause_group_kind === CAUSE_KIND_PROVIDER_RESULT
  );
  ok(
    "CG18 four measurements, two real causes",
    countDistinctCauses(
      rows.map((r) => ({ id: r.provider_result_id, provider: r.provider, detail: r.detail }))
    ) === 2
  );
  ok(
    "CG18 same-seller recurrence is recorded neutral",
    rows[0].cause_neutral_reason === CAUSE_NEUTRAL_SAME_SELLER &&
      rows[1].cause_neutral_reason === CAUSE_NEUTRAL_SAME_SELLER
  );
  ok("CG18 a non-exact row is never given a neutral reason", rows[2].cause_neutral_reason === null);
}

/* ── CG19 · cross-seller recurrence is NOT excused ─────────────────────── */
{
  const { buildPromotedEvidenceRows } = await import("../lib/integrity.ts");
  const service = {
    from: () => ({
      select: () => ({
        in: async () => ({
          data: [
            { id: "listing-own", seller_id: "seller-1" },
            { id: "listing-theirs", seller_id: "seller-2" },
          ],
          error: null,
        }),
      }),
    }),
  };
  const rows = await buildPromotedEvidenceRows({
    service,
    listingId: "listing-own",
    results: [
      { id: "r-1", provider: PROVIDER_AUBREY_EXACT_HASH, execution_status: "completed",
        is_active: true, classification: "passed", reason: null,
        detail: { content_sha256: DIGEST_A, matches: [{ listing_id: "listing-theirs" }] } },
    ],
  });
  ok("CG19 cross-seller recurrence carries no neutral reason", rows[0].cause_neutral_reason === null);
  ok("CG19 but it is still one cause, not an accusation", rows[0].cause_group_key === `sha256:${DIGEST_A}`);
  ok("CG19 and it is still classified passed", rows[0].classification === "passed");
}

/* ── CG20 · a failed seller read never fabricates neutrality ───────────── */
{
  const { buildPromotedEvidenceRows } = await import("../lib/integrity.ts");
  const service = {
    from: () => ({
      select: () => ({ in: async () => ({ data: null, error: { message: "read failed" } }) }),
    }),
  };
  const rows = await buildPromotedEvidenceRows({
    service,
    listingId: "listing-own",
    results: [
      { id: "r-1", provider: PROVIDER_AUBREY_EXACT_HASH, execution_status: "completed",
        is_active: true, classification: "passed", reason: null,
        detail: { content_sha256: DIGEST_A, matches: [{ listing_id: "listing-mine-too" }] } },
    ],
  });
  ok("CG20 a failed ownership read still produces the row", rows.length === 1);
  ok("CG20 with a cause identity intact", rows[0].cause_group_key === `sha256:${DIGEST_A}`);
  ok("CG20 and no fabricated neutrality", rows[0].cause_neutral_reason === null);
}

console.log(`\n${pass} passed, 0 failed`);
