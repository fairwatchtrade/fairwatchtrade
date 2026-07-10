/* ════════════════════════════════════════════════════════════════════════
   INTEGRITY ENGINE — SHARED CONSTANTS & MAPPING — lib/integrity.ts

   One home for the vocabulary the Integrity Engine's persistence wiring
   shares across routes, so no literal is duplicated and no two pieces of
   logic can drift. Imported by:
     · app/api/wizard-photo-review/route.ts  (writes provider results)
     · app/api/listings/route.ts             (aggregates, backfills, promotes)
     · app/api/blur-serial/route.ts          (re-points a provider row's path)

   listing_integrity_provider_results is the sole authoritative source. The
   strings below are the EXACT values the live schema's CHECK constraints and
   partial unique indexes depend on — changing one fragments an index. They
   were verified against the live schema before this file was written.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

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
