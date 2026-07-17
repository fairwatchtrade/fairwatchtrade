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

/** triggered_by values for non-first-pass attempts (live CHECK vocabulary). */
export const TRIGGERED_BY_RETRY = "retry";
export const TRIGGERED_BY_ADMIN_RECHECK = "admin_recheck";

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
};

type GateMediaMetaEntry = { capture_session_id: string | null; storage_path: string };

type GateProviderRow = {
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
    return { status: "published", holdReason: null }; // nothing correlatable
  }

  const rows: GateProviderRow[] = [];
  const wanted = new Set(pairs.map((m) => `${m.capture_session_id}|${m.storage_path}`));

  if (pairs.length > 0) {
    const sessionIds = Array.from(new Set(pairs.map((m) => m.capture_session_id as string)));
    const { data, error } = await service
      .from("listing_integrity_provider_results")
      .select(
        "provider, capture_session_id, storage_path, media_id, execution_status, classification, is_active, detail"
      )
      .in("capture_session_id", sessionIds)
      .is("media_id", null);
    if (error) {
      console.error("[integrity] gate read (pre-publish) failed — holding:", error.message);
      return { status: "pending_review", holdReason: HOLD_RESULTS_PENDING };
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
        "provider, capture_session_id, storage_path, media_id, execution_status, classification, is_active, detail"
      )
      .in("media_id", mediaIds);
    if (error) {
      console.error("[integrity] gate read (post-publish) failed — holding:", error.message);
      return { status: "pending_review", holdReason: HOLD_RESULTS_PENDING };
    }
    rows.push(...((data ?? []) as GateProviderRow[]));
  }

  // 1 · any accepted, review-worthy finding — either provider — holds.
  for (const row of rows) {
    if (isPromotableFinding(row) && findingRequiresReview(row.classification)) {
      return { status: "pending_review", holdReason: HOLD_FINDING_REVIEW };
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
        };
      }
    }
  }

  return { status: "published", holdReason: null };
}
