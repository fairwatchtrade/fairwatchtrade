import { createServiceClient } from "@/lib/supabase/service";
import { sendListingLiveEmail } from "@/lib/listingLiveEmail";
import {
  sendListingRejectedEmail,
  sendClarificationRequestedEmail,
  sendReturnedToDraftEmail,
} from "@/lib/listingDecisionEmail";
import { formatMoney } from "@/lib/formatMoney";
import { ensureCollectorDossierForListing } from "@/lib/dossier/collectorDossierService";
import {
  availabilityOf,
  photoCountOf,
  publicationRefusal,
} from "@/lib/listingPublicationGate";

/* ════════════════════════════════════════════════════════════════════════
   LISTING STATUS TRANSITION — lib/listingStatusTransition.ts   (v6.84)

   The ONE founder adjudication machinery, extracted verbatim from
   app/api/admin/listings/[id]/status/route.ts so a second authorized caller
   could exist without a second copy of the law — the same reason the
   publication gate moved to lib/listingPublicationGate at v6.34.

   TWO CALLERS, AND EXACTLY TWO:
     · the HTTP status route — calls with executedVia 'direct', hardcoded;
     · the Founder Assistant's server code — calls with executedVia
       'assistant', hardcoded, once per listing. N listings means N calls,
       each independently validated and recorded. No batch form exists.

   WHY executedVia IS A FUNCTION ARGUMENT AND NOT A REQUEST PARAMETER:
     A body field, header, query parameter, or cookie can be forged by
     anything holding the founder's session — which is precisely the
     principal the executed_via column exists to describe. A hardcoded
     argument at the call site cannot be reproduced by a client: the browser
     reaches this function only through the HTTP route, and the route always
     passes 'direct'. Anyone who later "simplifies" this into the request
     body has reopened the forgery hole this shape exists to close.

   Validation, gates, writes, emails, and the Dossier worker are the moved
   route body — behavior unchanged. The callers keep their own independent
   founder gates; this function trusts actorUid only because every caller
   authenticated it first.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const ALLOWED_STATUSES = ["draft", "published", "rejected", "pending_review"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

/* ── v2.24 · panel actions and the status each must accompany ── */
const REVIEW_ACTIONS = ["approve", "reject", "clarify", "return_to_draft"] as const;
type ReviewAction = (typeof REVIEW_ACTIONS)[number];
const ACTION_STATUS: Record<ReviewAction, AllowedStatus> = {
  approve: "published",
  reject: "rejected",
  clarify: "draft",
  return_to_draft: "draft",
};

const NOTE_MAX = 320; // mirrors listings_seller_clarification_note_len + the panel bound

/* Seller-visible text may never leak the machinery or accuse. The founder
   authors it, but the boundary is enforced here, not by convention. */
const FORBIDDEN_SELLER_NOTE = /\b(google|vision|stolen|scraped|fraud|fraudulent|suspicious|suspicion|high_confidence_match|review_suggested)\b|https?:\/\/|\bscore\b/i;

export type ExecutedVia = "direct" | "assistant";

/* The exact code seam that performed the write. Derived HERE, from the
   hardcoded executedVia argument — never a free string a caller could
   invent, for the same reason executedVia is not a request parameter. */
const MACHINERY: Record<ExecutedVia, string> = {
  direct: "status_route",
  assistant: "assistant_approve_listings",
};

export type StatusTransitionOutcome = {
  httpStatus: number;
  body: Record<string, unknown>;
};

export async function executeListingStatusTransition({
  listingId,
  actorUid,
  executedVia,
  input,
}: {
  listingId: string;
  /** Authenticated founder uid — every caller gates BEFORE calling. */
  actorUid: string;
  /** Hardcoded at each call site. Never read from a request. */
  executedVia: ExecutedVia;
  /** The parsed request-shaped input; validated here, identically for both callers. */
  input: Record<string, unknown>;
}): Promise<StatusTransitionOutcome> {
  const body = input as {
    status?: unknown;
    rejection_reason?: unknown;
    review_action?: unknown;
    reviewer_note?: unknown;
    seller_clarification_note?: unknown;
    /** Canonical seller-facing reason for an adverse decision. */
    seller_message?: unknown;
  };

  const status = typeof body.status === "string" ? body.status : "";
  if (!(ALLOWED_STATUSES as readonly string[]).includes(status)) {
    return {
      httpStatus: 400,
      body: { error: "invalid_status", detail: `status must be one of: ${ALLOWED_STATUSES.join(", ")}.` },
    };
  }
  if (!listingId) {
    return { httpStatus: 400, body: { error: "bad_request", detail: "Missing listing id." } };
  }

  // v2.21 · rejection_reason is honored only on 'rejected'; every other
  // transition clears it so only the current actionable reason exists.
  const rawReason = typeof body.rejection_reason === "string" ? body.rejection_reason.trim() : "";
  if (status === "rejected" && rawReason.length > 1000) {
    return {
      httpStatus: 400,
      body: { error: "reason_too_long", detail: "rejection_reason is limited to 1000 characters." },
    };
  }
  /* NOTE: the mirror is finalised AFTER sellerMessage is resolved below —
     see `mirrorRejectionReason`. Deriving it from body.rejection_reason alone
     left the column NULL whenever the evidence panel was the caller, because
     that surface posts seller_message instead (caught in production, first
     real rejection). The current-actionable mirror must not depend on which
     button the founder happened to press. */
  const rawRejectionReason = status === "rejected" && rawReason ? rawReason : null;

  // v2.24 · optional review-action context (the evidence panel's four
  // actions). Action and status must agree — the panel and the dropdown can
  // never race each other into an incoherent record.
  const reviewAction =
    typeof body.review_action === "string" &&
    (REVIEW_ACTIONS as readonly string[]).includes(body.review_action)
      ? (body.review_action as ReviewAction)
      : null;
  if (typeof body.review_action === "string" && !reviewAction) {
    return {
      httpStatus: 400,
      body: {
        error: "invalid_review_action",
        detail: `review_action must be one of: ${REVIEW_ACTIONS.join(", ")}.`,
      },
    };
  }
  if (reviewAction && ACTION_STATUS[reviewAction] !== status) {
    return {
      httpStatus: 400,
      body: {
        error: "action_status_mismatch",
        detail: `review_action "${reviewAction}" requires status "${ACTION_STATUS[reviewAction]}".`,
      },
    };
  }

  const reviewerNote =
    typeof body.reviewer_note === "string" ? body.reviewer_note.trim().slice(0, NOTE_MAX) : "";

  // v2.24 · seller_clarification_note — honored ONLY on clarify; bounded;
  // never allowed to leak the machinery or accuse (D2 boundary, enforced).
  const rawSellerNote =
    typeof body.seller_clarification_note === "string"
      ? body.seller_clarification_note.trim()
      : "";
  if (reviewAction === "clarify" && rawSellerNote.length > NOTE_MAX) {
    return {
      httpStatus: 400,
      body: {
        error: "note_too_long",
        detail: `seller_clarification_note is limited to ${NOTE_MAX} characters.`,
      },
    };
  }
  if (reviewAction === "clarify" && rawSellerNote && FORBIDDEN_SELLER_NOTE.test(rawSellerNote)) {
    return {
      httpStatus: 400,
      body: {
        error: "note_forbidden_content",
        detail:
          "The seller-visible note may not mention the provider, scores, source URLs, match classifications, or suspicion language. Describe what you need from the seller instead.",
      },
    };
  }
  const rawClarificationNote =
    reviewAction === "clarify" && rawSellerNote ? rawSellerNote : null;

  /* ── The seller-facing reason, required at the TRANSITION boundary ───────
     Standing product law: no adverse listing decision without a
     seller-visible reason. Enforcing it in a React component would only bind
     whichever component happened to ask — this function is the single door
     BOTH admin surfaces post through (the evidence panel and the generic
     status controls), so the rule lives here and neither can be the bypass.

     `seller_message` is the canonical field. The two older shapes still work:
     the panel's clarify note and the dropdown's rejection reason are accepted
     as the message when the canonical one is absent, so existing callers keep
     functioning while everything converges on one input. */
  const ADVERSE_STATUSES = ["rejected", "draft"] as const;
  const isAdverse = (ADVERSE_STATUSES as readonly string[]).includes(status);

  const canonicalMessage =
    typeof body.seller_message === "string" ? body.seller_message.trim() : "";
  const sellerMessage =
    canonicalMessage ||
    (status === "rejected" ? rawReason : "") ||
    (reviewAction === "clarify" ? rawSellerNote : "");

  if (isAdverse) {
    // Rejection copy keeps its historical 1000-char room; everything else
    // shares the clarification bound the seller-note column already enforces.
    const maxLen = status === "rejected" ? 1000 : NOTE_MAX;
    if (!sellerMessage) {
      return {
        httpStatus: 400,
        body: {
          error: "seller_message_required",
          detail:
            "A message to the seller is required. Say what happened and what they should do next — they see this, and it is the only explanation they get.",
        },
      };
    }
    if (sellerMessage.length > maxLen) {
      return {
        httpStatus: 400,
        body: {
          error: "seller_message_too_long",
          detail: `The message to the seller is limited to ${maxLen} characters.`,
        },
      };
    }
    // §E — the seller-copy safety boundary now covers EVERY seller-visible
    // adjudication message, not just clarification.
    if (FORBIDDEN_SELLER_NOTE.test(sellerMessage)) {
      return {
        httpStatus: 400,
        body: {
          error: "seller_message_forbidden_content",
          detail:
            "The message to the seller may not mention the provider, scores, source URLs, match classifications, or suspicion language. Describe what you need from the seller instead.",
        },
      };
    }
  }

  /* The current-actionable mirrors, derived from the ONE resolved message so
     they cannot depend on which admin surface posted. Each column keeps its
     own meaning: rejection_reason stays rejection-only, and the clarification
     note stays clarification-only — a return-to-draft writes neither, which
     is exactly why its reason lives in the decision event. */
  const rejectionReason =
    status === "rejected" ? sellerMessage || rawRejectionReason : null;
  const sellerClarificationNote =
    reviewAction === "clarify" ? sellerMessage || rawClarificationNote : null;

  // 3 · perform the update with the trusted client (bypasses RLS; reached only
  //     after the caller's admin gate).
  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[admin] status update — trusted client unavailable:", e);
    return {
      httpStatus: 500,
      body: { error: "server_misconfigured", detail: "Admin write channel unavailable." },
    };
  }

  /* v2.21 · availability gate — 'Not Currently Available' cannot publish.
     The same read also captures the PRIOR status and the seller-email facts:
     since v3.53 this machinery is the only door to publication, so it is also
     the only place that can truthfully say "your listing is live". Reading it
     here costs nothing extra — the query already had to run for the gate. */
  /* The pre-read now runs for EVERY transition, not just publication. The
     prior status is what makes a decision a decision: an event is only
     recorded, and an email only sent, when the listing genuinely moves. A
     re-save of the same state is not a decision and leaves no trace. */
  const { data: current, error: readErr } = await service
    .from("listings")
    .select(
      "details, photos, status, seller_id, brand, model, reference, asking_price, asking_currency, public_code, private_buyer_id"
    )
    .eq("id", listingId)
    .maybeSingle();
  if (readErr) {
    return { httpStatus: 500, body: { error: "read_failed", detail: readErr.message } };
  }
  if (!current) {
    return {
      httpStatus: 404,
      body: { error: "not_found", detail: `No listing with id ${listingId}.` },
    };
  }

  const priorStatus: string | null =
    typeof current.status === "string" ? current.status : null;
  const listingFacts = {
    seller_id: (current.seller_id as string | null) ?? null,
    brand: (current.brand as string | null) ?? null,
    model: (current.model as string | null) ?? null,
    reference: (current.reference as string | null) ?? null,
    asking_price: (current.asking_price as number | null) ?? null,
    asking_currency: (current.asking_currency as string | null) ?? null,
    public_code: (current.public_code as string | null) ?? null,
  };

  /* ── PUBLICATION IS A DECISION, NOT A STATUS WRITE ───────────────────
        Reaching 'published' requires BOTH that the listing is currently in
        review AND that the founder took the explicit approve action.

        THE LAW ITSELF LIVES IN lib/listingPublicationGate — including the
        v2.21 availability gate, which is the same refusal. Two callers, one
        expression of the rule. The conditions are unchanged and so are the
        error codes below — `priorStatus !== "pending_review"` is
        not_in_review, a missing approve action is approval_required, and
        'Not Currently Available' is not_available.

        The private-listing branch below rides the same decision — approval
        releases a private row to its one authorized buyer instead of
        Browse — so it is governed by this same gate rather than sneaking
        past it. ── */
  if (status === "published") {
    const refusal = publicationRefusal({
      priorStatus,
      approvalRecorded: reviewAction === "approve",
      availability: availabilityOf(current.details),
      photoCount: photoCountOf(current.photos),
    });
    if (refusal) {
      return { httpStatus: 409, body: { error: refusal.error, detail: refusal.detail } };
    }
  }

  /* Private Listing V1 (v5.98) — a private-intended row (private_buyer_id
     set) that the founder APPROVES becomes 'private_active', never
     'published': approval releases it to its one authorized buyer, not to
     Browse. Every other decision (reject / clarify / return to draft) keeps
     its ordinary meaning. The publication email below keys on
     data.status === 'published', so a private approval sends no "your
     listing is live" mail — the buyer's doorbell fires from the database
     trigger on this same transition. */
  const effectiveStatus =
    status === "published" && current.private_buyer_id
      ? "private_active"
      : status;

  const { data, error } = await service
    .from("listings")
    .update({
      status: effectiveStatus as AllowedStatus,
      rejection_reason: rejectionReason,
      // v2.24 · a human decision leaves no system hold behind, and the
      // clarification note exists only during an active clarification round.
      integrity_hold_reason: null,
      seller_clarification_note: sellerClarificationNote,
    })
    .eq("id", listingId)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return { httpStatus: 500, body: { error: "update_failed", detail: error.message } };
  }
  if (!data) {
    return {
      httpStatus: 404,
      body: { error: "not_found", detail: `No listing with id ${listingId}.` },
    };
  }

  // v2.24 · Ruling 11 — a panel action always lands in the review record
  // (upsert: listing_integrity_reviews is unique per listing). approve /
  // reject / clarify are resolutions; return_to_draft stays unresolved.
  // Attribution follows this conditional write: when no review row is
  // written, listing_decision_events alone carries it — no placeholder row
  // is ever created just to hold attribution.
  if (reviewAction) {
    const resolved = reviewAction !== "return_to_draft";
    const { error: reviewErr } = await service.from("listing_integrity_reviews").upsert(
      {
        listing_id: listingId,
        status:
          reviewAction === "approve"
            ? "approved"
            : reviewAction === "reject"
              ? "rejected"
              : reviewAction === "clarify"
                ? "clarification_requested"
                : "pending_review",
        resolved_at: resolved ? new Date().toISOString() : null,
        resolved_by: resolved ? actorUid : null,
        admin_notes: reviewerNote || null,
        /* Authority vs execution — who decided, and whose hand moved it. */
        authorized_by: actorUid,
        executed_via: executedVia,
        machinery: MACHINERY[executedVia],
      },
      { onConflict: "listing_id" }
    );
    if (reviewErr) {
      // The status write already landed — say so honestly, and loudly flag
      // that the review record did not, so the founder repeats the action.
      console.error("[aubrey] review record upsert failed:", reviewErr.message);
      return {
        httpStatus: 500,
        body: {
          error: "review_record_failed",
          detail:
            "The status change was applied, but the review record could not be written. Repeat the action.",
          status: data.status,
        },
      };
    }
  }

  /* ── The decision event — the durable history, written once per movement ──
     Only a real transition is a decision, which is also what makes the email
     idempotent per event rather than per listing: re-saving the same state
     records nothing and therefore sends nothing. The database refuses an
     adverse event with a blank seller_message, so history can never contain
     a decision the seller was owed an explanation for and never got.

     Append-only by construction — a later decision inserts a later row and
     cannot rewrite an earlier one. The listing columns updated above remain
     the current-actionable mirror; this table is the historical authority. */
  const DECISION_FOR_STATUS: Record<string, string> = {
    published: "approved",
    rejected: "rejected",
    draft: reviewAction === "clarify" ? "clarification_requested" : "returned_to_draft",
  };
  const decision = DECISION_FOR_STATUS[status];
  const realTransition = priorStatus !== null && priorStatus !== data.status;

  if (decision && realTransition) {
    const { error: eventErr } = await service.from("listing_decision_events").insert({
      listing_id: listingId,
      decision,
      prior_status: priorStatus,
      resulting_status: data.status,
      seller_message: sellerMessage || null,
      actor_uid: actorUid,
      /* A person decided this. Triage writes the same table with
         actor_kind 'triage' and a NULL actor, and the database refuses to
         let those two disagree. */
      actor_kind: "founder",
      /* Authority vs execution: the decision is the founder's either way;
         executed_via records whether his own hand or his Assistant moved it.
         Hardcoded at the call sites — never read from a request. */
      authorized_by: actorUid,
      executed_via: executedVia,
      machinery: MACHINERY[executedVia],
    });
    if (eventErr) {
      // The status write already landed. Say so plainly rather than pretend
      // the decision was recorded — this mirrors the review-record handling
      // directly above and keeps the founder informed instead of guessing.
      console.error("[decision-event] insert failed:", eventErr.message);
      return {
        httpStatus: 500,
        body: {
          error: "decision_event_failed",
          detail:
            "The status change was applied, but the decision record could not be written. Repeat the action.",
          status: data.status,
        },
      };
    }

    /* The adverse emails read the message that was just persisted with the
       event — never a second copy rebuilt from request state, so the words in
       the seller's inbox and the words in their Account cannot drift. */
    if (decision !== "approved" && listingFacts.seller_id) {
      const { data: sellerUser } = await service.auth.admin.getUserById(
        listingFacts.seller_id
      );
      const facts = {
        to: sellerUser?.user?.email,
        brand: listingFacts.brand,
        model: listingFacts.model,
        reference: listingFacts.reference,
        publicCode: listingFacts.public_code,
      };
      const message = sellerMessage;
      if (decision === "rejected") {
        await sendListingRejectedEmail({ ...facts, sellerMessage: message });
      } else if (decision === "clarification_requested") {
        await sendClarificationRequestedEmail({ ...facts, sellerMessage: message });
      } else {
        await sendReturnedToDraftEmail({ ...facts, sellerMessage: message });
      }
    }
  }

  /* ── The publication moment — the one place that can truthfully say live ──
     Sent only on a REAL transition into 'published'. The prior status is the
     idempotency boundary and needs no new machinery: re-running an approval,
     refreshing the admin page, or re-saving an already-public listing all
     read priorStatus === 'published' and send nothing. A reject, a
     clarification, or a return-to-draft never reaches here because the read
     that populates these facts only runs when the target is 'published'.

     Deliberately AFTER the status write and the review record: the email
     claims the listing is live, so it must follow the write that made it so.
     Failure is non-fatal by construction inside the sender — a mail outage
     must never undo a completed approval. In-app notifications and
     saved-search alerts are untouched: those fire from database triggers on
     the same transition and are not duplicated here. */
  if (
    data.status === "published" &&
    priorStatus !== "published" &&
    listingFacts.seller_id
  ) {
    const { data: sellerUser } = await service.auth.admin.getUserById(
      listingFacts.seller_id
    );
    await sendListingLiveEmail({
      to: sellerUser?.user?.email,
      brand: listingFacts.brand ?? "",
      model: listingFacts.model,
      reference: listingFacts.reference ?? "",
      priceText: formatMoney(
        listingFacts.asking_price,
        listingFacts.asking_currency
      ),
      listingId,
    });
  }

  /* Collector Dossier — independent post-publication work. The listing is
     already live before this begins. Exact-reference qualification, durable
     attachment, reuse and generation are idempotent; any failure is persisted
     on the Dossier and must never unwind publication. Running this on every
     published save also gives the founder a bounded retry for a failed job. */
  let collectorDossier: string | null = null;
  if (data.status === "published") {
    try {
      collectorDossier = (await ensureCollectorDossierForListing(listingId)).state;
    } catch (error) {
      console.error("[collector-dossier] publish worker failed:", error);
      collectorDossier = "failed";
    }
  }

  return {
    httpStatus: 200,
    body: { ok: true, id: data.id, status: data.status, collector_dossier: collectorDossier },
  };
}
