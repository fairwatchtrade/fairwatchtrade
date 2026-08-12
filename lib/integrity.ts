/* ════════════════════════════════════════════════════════════════════════
   INTEGRITY ENGINE — SHARED CONSTANTS & MAPPING — lib/integrity.ts

   One home for the vocabulary the Integrity Engine's persistence wiring
   shares across routes, so no literal is duplicated and no two pieces of
   logic can drift. Imported by:
     · app/api/wizard-photo-review/route.ts  (writes provider results)
     · app/api/listings/route.ts             (aggregates, backfills, promotes)
     · app/api/blur-serial/route.ts          (re-points a provider row's path)
     · app/api/admin/listings/[id]/recheck/route.ts  (re-runs + re-gates)
     · lib/imageAuthenticity.ts              (The Aubrey Check provider boundary)

   listing_integrity_provider_results is the sole authoritative source. The
   strings below are the EXACT values the live schema's CHECK constraints and
   partial unique indexes depend on — changing one fragments an index. They
   were verified against the live schema before this file was written.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Canonical provider key. LOCKED, permanent. The one-active-completed
    partial unique indexes key on (…, provider), so this literal must never
    change and must never be duplicated as a bare string in a route. */
export const PROVIDER_AI_PHOTO_QUALITY = "ai_photo_quality";

/** triggered_by — live CHECK: NULL | system_upload | admin_recheck | retry.
    Review-time persistence is always a first-pass upload. */
export const TRIGGERED_BY_UPLOAD = "system_upload";

/** execution_status — live CHECK: pending | completed | unavailable | invalid_response.
    This synchronous provider never writes 'pending' (that is reserved for a
    future async provider dispatched-but-not-returned). */
export type ExecutionStatus =
  | "pending"
  | "completed"
  | "unavailable"
  | "invalid_response";

/** classification — live CHECK: NULL | passed | review_suggested | high_confidence_match. */
export type Classification = "passed" | "review_suggested" | "high_confidence_match";

/** The AI photo-quality provider's three possible verdicts. */
export type PhotoVerdict = "passed" | "soft_fail" | "hard_fail";

/** The core columns persisted for one provider attempt, before the
    correlation columns (capture_session_id / storage_path / media_id) and the
    provider/attempt/trigger columns are attached by the caller. */
export type ProviderResultCore = {
  execution_status: ExecutionStatus;
  classification: Classification | null;
  is_active: boolean;
  completed_at: string | null;
  reason: string | null;
  detail: Record<string, unknown> | null;
};

/* ── The one mapping from a completed photo verdict to a schema-valid row ──

   Honors lipr_completion_consistency in one place:
     completed      ⇒ classification NOT NULL AND completed_at NOT NULL
     non-completed  ⇒ classification NULL     AND completed_at NULL

   Verdict rules (locked by chain ruling):
     passed    → completed / passed                              (promotable)
     soft_fail → completed / review_suggested                    (promotable)
     hard_fail → completed / review_suggested, is_active=false,
                 detail.verdict='hard_fail'                      (NEVER promotable)

   hard_fail and soft_fail deliberately SHARE 'review_suggested' at the schema
   level (there is no 'blocked' classification value). They are told apart by
   is_active + detail.verdict — NEVER by the classification string alone. */
export function completedVerdictToRow(
  verdict: PhotoVerdict,
  reason: string,
  nowIso: string
): ProviderResultCore {
  if (verdict === "passed") {
    return {
      execution_status: "completed",
      classification: "passed",
      is_active: true,
      completed_at: nowIso,
      reason: null,
      detail: { verdict: "passed" },
    };
  }
  if (verdict === "soft_fail") {
    return {
      execution_status: "completed",
      classification: "review_suggested",
      is_active: true,
      completed_at: nowIso,
      reason: reason || null,
      detail: { verdict: "soft_fail" },
    };
  }
  // hard_fail — a completed attempt, but inert operational history. Marked
  // is_active=false so it stays out of the one-active-completed index, out of
  // status aggregation, and out of evidence promotion. The truth lives in
  // detail.verdict.
  return {
    execution_status: "completed",
    classification: "review_suggested",
    is_active: false,
    completed_at: nowIso,
    reason: reason || null,
    detail: { verdict: "hard_fail", reason: reason || "" },
  };
}

/** A non-completed operational attempt (provider down or unparseable). Per
    lipr_completion_consistency these MUST carry null classification and null
    completed_at. Non-adverse: never promotes, never holds a listing. */
export function operationalRow(
  execution_status: Extract<ExecutionStatus, "unavailable" | "invalid_response">,
  note: string
): ProviderResultCore {
  return {
    execution_status,
    classification: null,
    is_active: true,
    completed_at: null,
    reason: null,
    detail: { note },
  };
}

type PromotableCandidate = {
  execution_status: string;
  classification: string | null;
  is_active: boolean;
  detail: Record<string, unknown> | null;
};

/** Promotion / status-gating predicate. A provider result is an ACCEPTED,
    review-worthy finding only when it is active, completed, classified, and
    not a masked hard_fail. Chain ruling: require BOTH is_active AND
    detail.verdict != 'hard_fail' — never the classification string alone,
    because hard_fail and soft_fail share 'review_suggested'. */
export function isPromotableFinding(row: PromotableCandidate): boolean {
  if (row.execution_status !== "completed") return false;
  if (row.is_active !== true) return false;
  if (!row.classification) return false;
  const verdict =
    row.detail && typeof row.detail === "object"
      ? (row.detail as Record<string, unknown>).verdict
      : null;
  if (verdict === "hard_fail") return false;
  return true;
}

/** Does an accepted finding warrant holding the listing for human review?
    passed → no; review_suggested / high_confidence_match → yes. */
export function findingRequiresReview(classification: string | null): boolean {
  return (
    classification === "review_suggested" ||
    classification === "high_confidence_match"
  );
}

/* ════════════════════════════════════════════════════════════════════════
   v2.24 · THE AUBREY CHECK — image-authenticity vocabulary + shared gate

   Second provider key, LOCKED like the first: the one-active-completed
   partial unique indexes key on (…, provider). The provider itself lives in
   lib/imageAuthenticity.ts and is INERT until AUBREY_ENFORCEMENT is 'on'
   AND the live-proof thresholds are set — this file only owns vocabulary
   and the aggregation the publish gate, retry re-gate, and founder recheck
   all share (one gate, three call sites, zero drift).
   ════════════════════════════════════════════════════════════════════════ */

export const PROVIDER_IMAGE_AUTHENTICITY = "image_authenticity";

/** Aubrey Flight 1 — exact retained-byte hash evidence. Third provider key,
    LOCKED like the others. Evidence-only and inert: this provider NEVER
    participates in coverage, holds, or status decisions — completed
    attempts are always classification 'passed' ("completed with no gate
    action authorized"), and the observation itself lives in detail.outcome.
    The provider implementation lives in lib/aubrey/listingPhotoExactHash.ts. */
export const PROVIDER_AUBREY_EXACT_HASH = "aubrey_exact_hash";

/** triggered_by values for non-first-pass attempts (live CHECK vocabulary). */
export const TRIGGERED_BY_RETRY = "retry";
export const TRIGGERED_BY_ADMIN_RECHECK = "admin_recheck";

/* ════════════════════════════════════════════════════════════════════════
   AUBREY CHECK — STEP 2 · CAUSE-GROUP IDENTITY

   Whole-image similarity, crop similarity, background similarity, OCR and
   watermark findings can all arise from ONE reused source photograph. When
   they support the same underlying proposition they must be retained
   separately for inspection but must NOT be counted as independent
   corroborating findings. This is the vocabulary and the counting primitive
   that makes that possible; assignment happens at evidence-write time.

   The exact layer already carries its own cause key: the retained-byte
   digest. Two observations of identical bytes are, by definition, one cause.
   Every other measurement defaults to its own row identity, so an unrelated
   finding always counts exactly once and can never be silently merged.

   NOTHING HERE GATES. countDistinctCauses() is a measurement, never a
   branch — the publish gate reports it and never reads it back. Exact-hash
   evidence remains memory, not judgment.
   ════════════════════════════════════════════════════════════════════════ */

export const CAUSE_KIND_EXACT_RETAINED_BYTES = "exact_retained_bytes";
export const CAUSE_KIND_PROVIDER_RESULT = "provider_result";

/** Named legitimate explanations. A neutral reason is recorded AS EVIDENCE
    and is never an adverse signal — a seller relisting their own watch
    produces byte-identical recurrence and is entirely legitimate. */
export const CAUSE_NEUTRAL_SAME_SELLER = "same_seller_recurrence";

export type CauseGroup = { key: string; kind: string };

/** The minimum a row must expose to be assigned a cause. */
export type CauseCandidate = {
  id: string;
  provider: string;
  detail: Record<string, unknown> | null;
};

/** Assign one cause identity. Exact-layer rows key on the retained-byte
    digest; everything else keys on its own row identity. A malformed or
    missing digest falls back to row identity rather than collapsing distinct
    causes together — under-merging stays inspectable, over-merging would
    hide evidence a human is meant to see. */
export function evidenceCauseGroup(row: CauseCandidate): CauseGroup {
  if (row.provider === PROVIDER_AUBREY_EXACT_HASH) {
    const digest =
      row.detail && typeof row.detail === "object"
        ? (row.detail as Record<string, unknown>).content_sha256
        : null;
    if (typeof digest === "string" && /^[0-9a-f]{64}$/.test(digest)) {
      return { key: `sha256:${digest}`, kind: CAUSE_KIND_EXACT_RETAINED_BYTES };
    }
  }
  return { key: `result:${row.id}`, kind: CAUSE_KIND_PROVIDER_RESULT };
}

/** How many distinct underlying causes these measurements represent. This is
    the number a future governed scoring model counts against its threshold —
    never the raw row count, which double-counts one shared photograph. */
export function countDistinctCauses(rows: CauseCandidate[]): number {
  const causes = new Set<string>();
  for (const row of rows) causes.add(evidenceCauseGroup(row).key);
  return causes.size;
}

/** True only when a recurrence exists AND every recurring copy is known to
    belong to the same seller as this listing. Unknown ownership is never
    treated as sameness: an unresolvable listing returns false, so the cause
    keeps its ordinary identity instead of being quietly excused. */
export function sameSellerRecurrenceOnly(
  detail: Record<string, unknown> | null,
  ownSellerId: string | null,
  sellerByListingId: Map<string, string>
): boolean {
  if (!ownSellerId) return false;
  if (!detail || typeof detail !== "object") return false;
  const matches = (detail as Record<string, unknown>).matches;
  if (!Array.isArray(matches) || matches.length === 0) return false;
  for (const match of matches) {
    if (typeof match !== "object" || match === null) return false;
    const listingId = (match as Record<string, unknown>).listing_id;
    if (typeof listingId !== "string") return false;
    const seller = sellerByListingId.get(listingId);
    if (!seller || seller !== ownSellerId) return false;
  }
  return true;
}

/** One provider-result row as the promotion path reads it. */
export type PromotionSourceRow = {
  id: string;
  provider: string;
  classification: string | null;
  execution_status: string;
  is_active: boolean;
  detail: Record<string, unknown> | null;
  reason: string | null;
};

/* ── THE ONE EVIDENCE-PROMOTION BUILDER ────────────────────────────────────

   Both write sites — publish orchestration and founder recheck — build their
   evidence rows here, so cause identity is assigned at EVERY evidence write
   and the two paths cannot drift. This mirrors the gate's own arrangement:
   one implementation, several call sites, zero divergence.

   Assignment happens before the write, never reconstructed afterwards.
   Same-seller ownership is the one fact the exact layer cannot know alone, so
   it is resolved here in a single read over the matched listings. A failed or
   partial read leaves the neutral reason null: the cause simply keeps its
   ordinary identity. Nothing is quietly excused, and nothing is accused —
   this evidence cannot hold a listing at all. ── */
export async function buildPromotedEvidenceRows(params: {
  service: SupabaseClient;
  listingId: string;
  results: PromotionSourceRow[];
}): Promise<Record<string, unknown>[]> {
  const { service, listingId, results } = params;
  const promotable = results.filter(isPromotableFinding);
  if (promotable.length === 0) return [];

  const sellerByListingId = new Map<string, string>();
  let ownSellerId: string | null = null;

  const exactRows = promotable.filter((r) => r.provider === PROVIDER_AUBREY_EXACT_HASH);
  if (exactRows.length > 0) {
    const listingIdsToResolve = new Set<string>([listingId]);
    for (const row of exactRows) {
      const matches = row.detail?.matches;
      if (!Array.isArray(matches)) continue;
      for (const match of matches) {
        const matchedId = (match as Record<string, unknown> | null)?.listing_id;
        if (typeof matchedId === "string") listingIdsToResolve.add(matchedId);
      }
    }
    const { data: sellerRows, error: sellerErr } = await service
      .from("listings")
      .select("id, seller_id")
      .in("id", Array.from(listingIdsToResolve));
    if (sellerErr) {
      console.error("[integrity] cause-group seller read failed:", sellerErr.message);
    } else {
      for (const row of sellerRows ?? []) {
        if (typeof row.seller_id === "string") {
          sellerByListingId.set(row.id, row.seller_id);
        }
      }
      ownSellerId = sellerByListingId.get(listingId) ?? null;
    }
  }

  return promotable.map((r) => {
    // v2.24 · the schema's purpose-built evidence columns, populated from
    // the Aubrey detail shape when present (null for other providers).
    const d = (r.detail ?? {}) as Record<string, unknown>;
    const cause = evidenceCauseGroup({
      id: r.id,
      provider: r.provider,
      detail: r.detail ?? null,
    });
    const neutral =
      r.provider === PROVIDER_AUBREY_EXACT_HASH &&
      sameSellerRecurrenceOnly(r.detail ?? null, ownSellerId, sellerByListingId);
    return {
      listing_id: listingId,
      provider_result_id: r.id,
      provider: r.provider,
      classification: r.classification,
      reason: r.reason ?? null,
      detail: r.detail ?? null,
      matched_source_url:
        typeof d.matched_source_url === "string" ? d.matched_source_url : null,
      confidence: typeof d.best_score === "number" ? d.best_score : null,
      cause_group_key: cause.key,
      cause_group_kind: cause.kind,
      cause_neutral_reason: neutral ? CAUSE_NEUTRAL_SAME_SELLER : null,
    };
  });
}

/* ── listings.integrity_hold_reason — WHY a listing sits in pending_review.

   results_pending / provider_unavailable — system-releasable: when a retried
   check completes clean, the gate may release to 'published' (D-ruling:
   "check succeeds on retry"). finding_review — founder-only exit. NULL —
   dealer/founder queue (submit_listing_for_review path): NEVER touched by
   the system. This discrimination is the whole reason the column exists. ── */
export type IntegrityHoldReason =
  | "results_pending"
  | "provider_unavailable"
  | "finding_review";

export const HOLD_RESULTS_PENDING: IntegrityHoldReason = "results_pending";
export const HOLD_PROVIDER_UNAVAILABLE: IntegrityHoldReason = "provider_unavailable";
export const HOLD_FINDING_REVIEW: IntegrityHoldReason = "finding_review";

export function isSystemReleasableHold(reason: string | null): boolean {
  return reason === HOLD_RESULTS_PENDING || reason === HOLD_PROVIDER_UNAVAILABLE;
}

export type IntegrityGateResult = {
  status: "published" | "pending_review";
  holdReason: IntegrityHoldReason | null;
  /** Step 2 · REPORTED, NEVER READ BACK. How many distinct underlying causes
      the promotable findings represent, so the number a future governed
      scoring model will use is real and observable today. The gate's own
      decision order below never consults it — status and holdReason are
      determined exactly as they were before Step 2 existed. 0 whenever the
      rows could not be read (an error path holds on its own terms). */
  distinctCauseCount: number;
};

type GateMediaMetaEntry = { capture_session_id: string | null; storage_path: string };

type GateProviderRow = {
  id: string;
  provider: string;
  capture_session_id: string | null;
  storage_path: string | null;
  media_id: string | null;
  execution_status: string;
  classification: string | null;
  is_active: boolean;
  detail: Record<string, unknown> | null;
};

/* ── The one integrity gate, shared by fresh publish, idempotent retry, and
      founder recheck. Reads BOTH correlation states — pre-publish rows keyed
      (capture_session_id + storage_path, media_id IS NULL) and post-backfill
      rows keyed by media_id — because a retry after a prior attempt's
      orchestration must not go blind the moment media_id is stamped.

   Decision order:
     1. any promotable finding requiring review          → hold finding_review
     2. (only when requireAuthenticityCoverage) any photo
        without an active completed image_authenticity
        result → hold: provider_unavailable if a non-completed
        attempt exists for that photo, else results_pending
     3. otherwise                                        → published

   Read errors hold (can't verify ⇒ never fabricate clean), preserving the
   v2.3 law. Coverage is required of the Aubrey provider ONLY — the photo-
   quality provider keeps its absence-is-not-adverse semantics. ── */
export async function aggregateIntegrityForListing(params: {
  service: SupabaseClient;
  mediaMeta: GateMediaMetaEntry[];
  /** listing_media rows when they already exist (retry / recheck paths). */
  media?: { id: string; storage_path: string | null }[];
  requireAuthenticityCoverage: boolean;
}): Promise<IntegrityGateResult> {
  const { service, mediaMeta, media, requireAuthenticityCoverage } = params;

  const pairs = mediaMeta.filter((m) => m.capture_session_id && m.storage_path);
  const mediaIds = (media ?? []).map((m) => m.id);
  if (pairs.length === 0 && mediaIds.length === 0) {
    // nothing correlatable
    return { status: "published", holdReason: null, distinctCauseCount: 0 };
  }

  const rows: GateProviderRow[] = [];
  const wanted = new Set(pairs.map((m) => `${m.capture_session_id}|${m.storage_path}`));

  if (pairs.length > 0) {
    const sessionIds = Array.from(new Set(pairs.map((m) => m.capture_session_id as string)));
    const { data, error } = await service
      .from("listing_integrity_provider_results")
      .select(
        "id, provider, capture_session_id, storage_path, media_id, execution_status, classification, is_active, detail"
      )
      .in("capture_session_id", sessionIds)
      .is("media_id", null);
    if (error) {
      console.error("[integrity] gate read (pre-publish) failed — holding:", error.message);
      return {
        status: "pending_review",
        holdReason: HOLD_RESULTS_PENDING,
        distinctCauseCount: 0,
      };
    }
    for (const row of data ?? []) {
      if (wanted.has(`${row.capture_session_id}|${row.storage_path}`)) {
        rows.push(row as GateProviderRow);
      }
    }
  }

  if (mediaIds.length > 0) {
    const { data, error } = await service
      .from("listing_integrity_provider_results")
      .select(
        "id, provider, capture_session_id, storage_path, media_id, execution_status, classification, is_active, detail"
      )
      .in("media_id", mediaIds);
    if (error) {
      console.error("[integrity] gate read (post-publish) failed — holding:", error.message);
      return {
        status: "pending_review",
        holdReason: HOLD_RESULTS_PENDING,
        distinctCauseCount: 0,
      };
    }
    rows.push(...((data ?? []) as GateProviderRow[]));
  }

  /* Step 2 · the cause count is MEASURED here and carried out unchanged. It
     appears in no condition below: the decision order is byte-identical to
     the pre-Step-2 gate, and correlated measurements from one shared
     photograph can therefore never manufacture a hold. */
  const distinctCauseCount = countDistinctCauses(rows.filter(isPromotableFinding));

  // 1 · any accepted, review-worthy finding — either provider — holds.
  for (const row of rows) {
    if (isPromotableFinding(row) && findingRequiresReview(row.classification)) {
      return {
        status: "pending_review",
        holdReason: HOLD_FINDING_REVIEW,
        distinctCauseCount,
      };
    }
  }

  // 2 · Aubrey coverage — every published photo needs an active completed
  //     image_authenticity result, on either correlation path.
  if (requireAuthenticityCoverage) {
    const mediaIdByPath = new Map<string, string>();
    for (const m of media ?? []) {
      if (m.storage_path) mediaIdByPath.set(m.storage_path, m.id);
    }
    for (const entry of mediaMeta) {
      if (!entry.storage_path) continue;
      const pairKey = `${entry.capture_session_id}|${entry.storage_path}`;
      const mid = mediaIdByPath.get(entry.storage_path) ?? null;
      const attempts = rows.filter(
        (r) =>
          r.provider === PROVIDER_IMAGE_AUTHENTICITY &&
          ((r.media_id === null &&
            `${r.capture_session_id}|${r.storage_path}` === pairKey) ||
            (mid !== null && r.media_id === mid))
      );
      const covered = attempts.some(
        (r) => r.execution_status === "completed" && r.is_active === true
      );
      if (!covered) {
        const attempted = attempts.some((r) => r.execution_status !== "completed");
        return {
          status: "pending_review",
          holdReason: attempted ? HOLD_PROVIDER_UNAVAILABLE : HOLD_RESULTS_PENDING,
          distinctCauseCount,
        };
      }
    }
  }

  return { status: "published", holdReason: null, distinctCauseCount };
}
