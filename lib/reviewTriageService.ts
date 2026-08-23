/* ════════════════════════════════════════════════════════════════════════
   FOUNDER REVIEW TRIAGE — THE DISPOSITION SEAM — lib/reviewTriageService.ts

   SERVER ONLY. The narrow bridge between "a policy reached a conclusion" and
   "a listing actually moved".

   ── WHY THIS IS NOT AN ENDPOINT WITH A STATUS PARAMETER ────────────────
   The obvious shortcut — a service-role route that accepts {id, status} —
   would be a general-purpose listing-state weapon reachable by whatever
   acquires the key. This seam takes NO status from any caller. It reads the
   listing's own facts, runs the policy, and derives the transition from the
   OUTCOME. There are exactly two transitions it can perform:

       pass →  pending_review → published   (through the publication law)
       fail →  pending_review → draft       (returned to the seller)

   Every other transition in the product remains founder-only. There is no
   argument, body field, or environment value that widens this.

   ── WHY IT DOES NOT CALL THE FOUNDER ROUTE ─────────────────────────────
   Because that route authorizes a PERSON, and triage is not a person.
   Calling it would mean forging a session or forging Jason's UUID. Instead
   both callers enforce the SAME law from lib/listingPublicationGate, and the
   approval this seam records is explicitly a machine approval:
   listing_decision_events.actor_kind = 'triage', actor_uid NULL. The
   database refuses to let those two disagree.

   ── THE CONDITIONAL WRITE IS LOAD-BEARING ──────────────────────────────
   Every status update is scoped .eq("status", "pending_review"). If a
   founder adjudicates between the read and the write, triage affects zero
   rows and reports that it moved nothing. The founder always wins a race
   with the machine.

   ── FAILURE POSTURE ────────────────────────────────────────────────────
   Triage is called from submission paths. It must never unwind a
   submission: every caller invokes it non-fatally, and an internal error
   returns a result rather than throwing. A listing that could not be
   triaged simply stays pending_review — which is where Founder Review
   already looks.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { aggregateIntegrityForListing } from "@/lib/integrity";
import { aubreyEnforcementEnabled } from "@/lib/imageAuthenticity";
import { availabilityOf, publicationRefusal } from "@/lib/listingPublicationGate";
import {
  TRIAGE_POLICY_VERSION,
  evaluateTriage,
  triageSellerMessage,
  type TriageDecision,
  type TriageFacts,
} from "@/lib/reviewTriage";
import { sendListingLiveEmail } from "@/lib/listingLiveEmail";
import { sendReturnedToDraftEmail } from "@/lib/listingDecisionEmail";
import { formatMoney } from "@/lib/formatMoney";
import { ensureCollectorDossierForListing } from "@/lib/dossier/collectorDossierService";

/** The two classifications that make an evidence row founder work. Same pair
    computeAttention() and findingRequiresReview() already use. */
const FLAGGED_CLASSIFICATIONS = ["review_suggested", "high_confidence_match"];

export type TriageRunResult =
  | { ran: false; skipped: string }
  | {
      ran: true;
      outcome: TriageDecision["outcome"];
      reason: TriageDecision["reason"];
      detail: string;
      /** The status the listing holds after triage. */
      status: string;
      /** True when triage moved the listing itself. */
      disposed: boolean;
      triageId: string | null;
    };

type ListingRow = {
  id: string;
  status: string;
  details: unknown;
  photos: unknown;
  private_buyer_id: string | null;
  custom_brand_flag: boolean | null;
  integrity_hold_reason: string | null;
  seller_id: string | null;
  brand: string | null;
  model: string | null;
  reference: string | null;
  public_code: string | null;
  asking_price: number | null;
  asking_currency: string | null;
};

/* ── Fact gathering ─────────────────────────────────────────────────────
   Reuses the existing integrity machinery verbatim. No provider is executed
   here and no evidence row is written: triage READS a finished evidence set,
   it does not produce one. */
async function gatherFacts(
  service: SupabaseClient,
  listing: ListingRow
): Promise<{ facts: TriageFacts; summary: Record<string, unknown> } | { error: string }> {
  const { data: media, error: mediaErr } = await service
    .from("listing_media")
    .select("id, storage_path, capture_session_id, capture_source")
    .eq("listing_id", listing.id);
  if (mediaErr) return { error: `media_read_failed: ${mediaErr.message}` };

  /* Same launch exclusion the founder recheck applies: original dealer-import
     source images get no authenticity execution, so requiring coverage of
     them would hold every imported listing forever. */
  const targets = (media ?? []).filter((m) => m.capture_source !== "dealer_import");
  const coverageRequired = aubreyEnforcementEnabled();

  let holdReason: string | null = null;
  let distinctCauseCount = 0;
  if (targets.length > 0) {
    const gate = await aggregateIntegrityForListing({
      service,
      mediaMeta: targets.map((m) => ({
        capture_session_id: m.capture_session_id,
        storage_path: m.storage_path ?? "",
      })),
      media: targets.map((m) => ({ id: m.id, storage_path: m.storage_path })),
      requireAuthenticityCoverage: coverageRequired,
    });
    holdReason = gate.holdReason;
    distinctCauseCount = gate.distinctCauseCount;
  } else {
    /* Nothing correlatable — the gate itself returns "no objection" for this
       case, and the stored hold reason (if any) stays authoritative. */
    holdReason = listing.integrity_hold_reason;
  }

  const { data: flagged, error: evidenceErr } = await service
    .from("listing_integrity_evidence")
    .select("id")
    .eq("listing_id", listing.id)
    .in("classification", FLAGGED_CLASSIFICATIONS);
  if (evidenceErr) return { error: `evidence_read_failed: ${evidenceErr.message}` };

  const flaggedEvidenceCount = (flagged ?? []).length;

  return {
    facts: {
      holdReason,
      flaggedEvidenceCount,
      hasPrivateBuyer: listing.private_buyer_id != null,
      customBrandFlag: listing.custom_brand_flag === true,
      availability: availabilityOf(listing.details),
    },
    summary: {
      hold_reason: holdReason,
      flagged_evidence: flaggedEvidenceCount,
      distinct_cause_count: distinctCauseCount,
      authenticity_coverage_required: coverageRequired,
      media_evaluated: targets.length,
    },
  };
}

/* ── Persistence ────────────────────────────────────────────────────────
   Supersede-then-insert, so the partial unique index (one row per listing
   where superseded_at is null) is what enforces "one authoritative current
   result" rather than a convention somebody has to remember. */
async function persistTriage(
  service: SupabaseClient,
  listingId: string,
  decision: TriageDecision,
  summary: Record<string, unknown>
): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const { error: supersedeErr } = await service
    .from("listing_review_triage")
    .update({ superseded_at: nowIso })
    .eq("listing_id", listingId)
    .is("superseded_at", null);
  if (supersedeErr) {
    console.error("[triage] supersede failed:", supersedeErr.message);
    return null;
  }
  const { data, error } = await service
    .from("listing_review_triage")
    .insert({
      listing_id: listingId,
      outcome: decision.outcome,
      reason_code: decision.reason,
      reason_detail: decision.detail,
      policy_version: TRIAGE_POLICY_VERSION,
      evidence_summary: summary,
      completed_at: nowIso,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[triage] insert failed:", error.message);
    return null;
  }
  return (data?.id as string) ?? null;
}

/** The machine decision record. actor_uid is NULL by database constraint
    when actor_kind is 'triage' — a forged founder is not representable. */
async function recordDecisionEvent(
  service: SupabaseClient,
  listingId: string,
  decision: "approved" | "returned_to_draft",
  resultingStatus: string,
  sellerMessage: string | null
): Promise<number | null> {
  const { data, error } = await service
    .from("listing_decision_events")
    .insert({
      listing_id: listingId,
      decision,
      prior_status: "pending_review",
      resulting_status: resultingStatus,
      seller_message: sellerMessage,
      actor_uid: null,
      actor_kind: "triage",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[triage] decision event insert failed:", error.message);
    return null;
  }
  return (data?.id as number) ?? null;
}

async function linkDisposition(
  service: SupabaseClient,
  triageId: string | null,
  resultingStatus: string,
  eventId: number | null
) {
  if (!triageId) return;
  await service
    .from("listing_review_triage")
    .update({ resulting_status: resultingStatus, decision_event_id: eventId })
    .eq("id", triageId);
}

/* ════════════════════════════════════════════════════════════════════════
   THE ENTRY POINT

   Called after a listing lands in review and its evidence work is finished.
   Safe to call more than once: a listing that is no longer pending_review is
   skipped, so a resubmission triages the new cycle and an already-disposed
   listing is left alone.
   ════════════════════════════════════════════════════════════════════════ */
export async function runReviewTriageForListing(
  listingId: string
): Promise<TriageRunResult> {
  if (!listingId) return { ran: false, skipped: "missing_listing_id" };

  let service: SupabaseClient;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[triage] trusted client unavailable:", e);
    return { ran: false, skipped: "service_unavailable" };
  }

  const { data: listing, error: readErr } = await service
    .from("listings")
    .select(
      "id, status, details, photos, private_buyer_id, custom_brand_flag, integrity_hold_reason, seller_id, brand, model, reference, public_code, asking_price, asking_currency"
    )
    .eq("id", listingId)
    .maybeSingle();
  if (readErr) {
    console.error("[triage] listing read failed:", readErr.message);
    return { ran: false, skipped: "listing_read_failed" };
  }
  if (!listing) return { ran: false, skipped: "not_found" };

  const row = listing as ListingRow;

  /* Triage adjudicates the review queue and nothing else. A draft, a
     published listing, a paused one, a private_active one: none of them are
     in review, so none of them are triage's business. */
  if (row.status !== "pending_review") {
    return { ran: false, skipped: `not_in_review:${row.status}` };
  }

  const gathered = await gatherFacts(service, row);
  if ("error" in gathered) {
    console.error("[triage] fact gathering failed:", gathered.error);
    return { ran: false, skipped: "facts_unavailable" };
  }

  let decision = evaluateTriage(gathered.facts);

  /* ── The publication law has the last word ──────────────────────────
     A PASS is a proposal; the law in lib/listingPublicationGate decides
     whether publication is permitted at all. If the two ever disagree, the
     law wins and the case becomes founder work — which is the only safe
     direction for that disagreement to resolve. */
  if (decision.outcome === "pass") {
    const refusal = publicationRefusal({
      priorStatus: row.status,
      approvalRecorded: true,
      availability: availabilityOf(row.details),
    });
    if (refusal) {
      decision = {
        outcome: "escalate",
        reason: "policy_unmapped",
        detail: `Triage cleared this listing but the publication law refused it (${refusal.error}).`,
      };
    }
  }

  /* A FAIL with no seller-facing message is a policy bug, not a disposition.
     The database would refuse the decision event anyway; refusing here means
     the listing is never moved on a message we could not write. */
  const sellerMessage = triageSellerMessage(decision);
  if (decision.outcome === "fail" && !sellerMessage) {
    decision = {
      outcome: "escalate",
      reason: "policy_unmapped",
      detail: `Triage reached an adverse outcome (${decision.reason}) with no seller message defined for it.`,
    };
  }

  const triageId = await persistTriage(
    service,
    row.id,
    decision,
    gathered.summary
  );

  /* ── ESCALATE — the listing does not move ──────────────────────────── */
  if (decision.outcome === "escalate") {
    return {
      ran: true,
      outcome: decision.outcome,
      reason: decision.reason,
      detail: decision.detail,
      status: "pending_review",
      disposed: false,
      triageId,
    };
  }

  const target = decision.outcome === "pass" ? "published" : "draft";

  const { data: moved, error: moveErr } = await service
    .from("listings")
    .update({
      status: target,
      integrity_hold_reason: null,
      /* FAIL is a return, not a rejection: rejection_reason stays
         rejection-only and the clarification note stays clarification-only.
         The seller's words for a return live on the decision event, exactly
         as they do when the founder returns a listing to draft. */
      rejection_reason: null,
      seller_clarification_note: null,
    })
    .eq("id", row.id)
    .eq("status", "pending_review")
    .select("id, status")
    .maybeSingle();

  if (moveErr) {
    console.error("[triage] status write failed:", moveErr.message);
    return { ran: false, skipped: "status_write_failed" };
  }
  if (!moved) {
    /* Zero rows: a founder adjudicated between the read and the write. The
       person's decision stands; triage records nothing further. */
    await linkDisposition(service, triageId, "superseded_by_founder", null);
    return { ran: false, skipped: "raced_by_founder" };
  }

  const eventId = await recordDecisionEvent(
    service,
    row.id,
    decision.outcome === "pass" ? "approved" : "returned_to_draft",
    moved.status as string,
    sellerMessage
  );
  await linkDisposition(service, triageId, moved.status as string, eventId);

  /* ── Seller notice — the same senders the founder path uses ──────────
     Non-fatal by construction inside each sender: a mail outage must never
     undo a completed disposition. */
  if (row.seller_id) {
    const { data: sellerUser } = await service.auth.admin.getUserById(row.seller_id);
    const to = sellerUser?.user?.email;
    if (decision.outcome === "pass") {
      await sendListingLiveEmail({
        to,
        brand: row.brand ?? "",
        model: row.model,
        reference: row.reference ?? "",
        priceText: formatMoney(row.asking_price, row.asking_currency),
        listingId: row.id,
      });
    } else {
      await sendReturnedToDraftEmail({
        to,
        brand: row.brand,
        model: row.model,
        reference: row.reference,
        publicCode: row.public_code,
        sellerMessage: sellerMessage ?? "",
      });
    }
  }

  /* Collector Dossier — post-publication work, identical to the founder
     approval path. Idempotent; any failure is persisted on the Dossier and
     must never unwind publication. */
  if (moved.status === "published") {
    try {
      await ensureCollectorDossierForListing(row.id);
    } catch (error) {
      console.error("[triage] collector dossier worker failed:", error);
    }
  }

  return {
    ran: true,
    outcome: decision.outcome,
    reason: decision.reason,
    detail: decision.detail,
    status: moved.status as string,
    disposed: true,
    triageId,
  };
}
