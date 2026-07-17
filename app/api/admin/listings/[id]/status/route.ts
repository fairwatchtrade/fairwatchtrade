import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/listings/[id]/status — founder status change

   Sets a listing's status. Used by /admin/listings/[id] (status controls +
   Take Down). Curl-testable: an unauthenticated or non-founder request is
   rejected here, independent of the page — verify with a bare request, no UI.

   TWO INDEPENDENT GATES (defense-in-depth):
     · The page runs its own founder check before rendering the controls.
     · This route runs its OWN founder check, with the UID as a HARDCODED
       LITERAL in this file — not imported from a shared constant. Neither
       surface trusts the other; both must independently pass.

   WHY THE TRUSTED CLIENT FOR THE WRITE:
     RLS (listings_update_own) scopes the session client's UPDATE to
     auth.uid() = seller_id. A founder editing another seller's listing would
     silently affect ZERO rows — no error, no change. The service client
     bypasses RLS and is reached ONLY after the admin gate below. There is no
     CHECK constraint on listings.status, so this route also validates the
     value against the four allowed statuses — it is the guard.

   No schema changes. No new tables. Status change only — never destroys a row.

   ── v2.21 · Dealer Accelerator Flight 2B (bounded, this route stays the
      ONE adjudication path — no parallel route) ──────────────────────────
     · rejection_reason: optional body field, honored ONLY when the new
       status is 'rejected' (bounded ≤ 1000 chars). On EVERY other
       transition the column is set NULL — only the current actionable
       reason ever exists. Written here via the trusted client only; the
       v2.21 column grants leave dealers with no write access to it.
     · availability gate: a listing whose details.availability is
       'Not Currently Available' cannot be set 'published'. It stays out
       of buyer view until the dealer returns it to In Stock.

   ── v2.24 · The Aubrey Check — founder adjudication context (still the
      ONE adjudication path; the evidence panel posts here) ──────────────
     · review_action (optional): approve | reject | clarify |
       return_to_draft — the four panel actions. Each must agree with the
       requested status (approve→published, reject→rejected, clarify→draft,
       return_to_draft→draft) or the request 400s. When present, the action
       is recorded in listing_integrity_reviews (upsert — unique per
       listing): approve/reject/clarify resolve (resolved_by/at + bounded
       admin note); return_to_draft stays an unresolved pending_review.
     · reviewer_note (optional, ≤ 320): founder-only internal note →
       listing_integrity_reviews.admin_notes. Never seller-visible.
     · seller_clarification_note (optional, ≤ 320): honored ONLY on
       clarify. Seller-visible next to the locked neutral introduction, so
       provider names, scores, source URLs, match vocabulary, and suspicion
       language are rejected server-side. Cleared on every other
       transition (rejection_reason keeps rejection-only meaning — no
       overloading, per D2).
     · every founder transition clears integrity_hold_reason — after a
       human decision there is no system hold left to release.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1 · authenticate + authorize with the session client (independent gate).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "not_authenticated", detail: "Sign in required." },
      { status: 401 }
    );
  }
  if (user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: "forbidden", detail: "Admin only." }, { status: 403 });
  }

  // 2 · parse + validate the requested status (+ optional bounded reason,
  //     and the optional v2.24 review-action context).
  let body: {
    status?: unknown;
    rejection_reason?: unknown;
    review_action?: unknown;
    reviewer_note?: unknown;
    seller_clarification_note?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not parse request body." },
      { status: 400 }
    );
  }

  const status = typeof body.status === "string" ? body.status : "";
  if (!(ALLOWED_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: "invalid_status", detail: `status must be one of: ${ALLOWED_STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }
  if (!id) {
    return NextResponse.json(
      { error: "bad_request", detail: "Missing listing id." },
      { status: 400 }
    );
  }

  // v2.21 · rejection_reason is honored only on 'rejected'; every other
  // transition clears it so only the current actionable reason exists.
  const rawReason = typeof body.rejection_reason === "string" ? body.rejection_reason.trim() : "";
  if (status === "rejected" && rawReason.length > 1000) {
    return NextResponse.json(
      { error: "reason_too_long", detail: "rejection_reason is limited to 1000 characters." },
      { status: 400 }
    );
  }
  const rejectionReason = status === "rejected" && rawReason ? rawReason : null;

  // v2.24 · optional review-action context (the evidence panel's four
  // actions). Action and status must agree — the panel and the dropdown can
  // never race each other into an incoherent record.
  const reviewAction =
    typeof body.review_action === "string" &&
    (REVIEW_ACTIONS as readonly string[]).includes(body.review_action)
      ? (body.review_action as ReviewAction)
      : null;
  if (typeof body.review_action === "string" && !reviewAction) {
    return NextResponse.json(
      { error: "invalid_review_action", detail: `review_action must be one of: ${REVIEW_ACTIONS.join(", ")}.` },
      { status: 400 }
    );
  }
  if (reviewAction && ACTION_STATUS[reviewAction] !== status) {
    return NextResponse.json(
      {
        error: "action_status_mismatch",
        detail: `review_action "${reviewAction}" requires status "${ACTION_STATUS[reviewAction]}".`,
      },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: "note_too_long", detail: `seller_clarification_note is limited to ${NOTE_MAX} characters.` },
      { status: 400 }
    );
  }
  if (reviewAction === "clarify" && rawSellerNote && FORBIDDEN_SELLER_NOTE.test(rawSellerNote)) {
    return NextResponse.json(
      {
        error: "note_forbidden_content",
        detail:
          "The seller-visible note may not mention the provider, scores, source URLs, match classifications, or suspicion language. Describe what you need from the seller instead.",
      },
      { status: 400 }
    );
  }
  const sellerClarificationNote =
    reviewAction === "clarify" && rawSellerNote ? rawSellerNote : null;

  // 3 · perform the update with the trusted client (bypasses RLS; reached only
  //     after the admin gate above).
  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[admin] status update — trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Admin write channel unavailable." },
      { status: 500 }
    );
  }

  // v2.21 · availability gate — 'Not Currently Available' cannot publish.
  if (status === "published") {
    const { data: current, error: readErr } = await service
      .from("listings")
      .select("details")
      .eq("id", id)
      .maybeSingle();
    if (readErr) {
      return NextResponse.json({ error: "read_failed", detail: readErr.message }, { status: 500 });
    }
    if (!current) {
      return NextResponse.json(
        { error: "not_found", detail: `No listing with id ${id}.` },
        { status: 404 }
      );
    }
    const availability =
      current.details && typeof current.details === "object"
        ? (current.details as Record<string, unknown>).availability
        : undefined;
    if (availability === "Not Currently Available") {
      return NextResponse.json(
        {
          error: "not_available",
          detail:
            "This listing's availability is 'Not Currently Available'. It cannot be published until the dealer marks it In Stock.",
        },
        { status: 409 }
      );
    }
  }

  const { data, error } = await service
    .from("listings")
    .update({
      status: status as AllowedStatus,
      rejection_reason: rejectionReason,
      // v2.24 · a human decision leaves no system hold behind, and the
      // clarification note exists only during an active clarification round.
      integrity_hold_reason: null,
      seller_clarification_note: sellerClarificationNote,
    })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "not_found", detail: `No listing with id ${id}.` },
      { status: 404 }
    );
  }

  // v2.24 · Ruling 11 — a panel action always lands in the review record
  // (upsert: listing_integrity_reviews is unique per listing). approve /
  // reject / clarify are resolutions; return_to_draft stays unresolved.
  if (reviewAction) {
    const resolved = reviewAction !== "return_to_draft";
    const { error: reviewErr } = await service.from("listing_integrity_reviews").upsert(
      {
        listing_id: id,
        status:
          reviewAction === "approve"
            ? "approved"
            : reviewAction === "reject"
              ? "rejected"
              : reviewAction === "clarify"
                ? "clarification_requested"
                : "pending_review",
        resolved_at: resolved ? new Date().toISOString() : null,
        resolved_by: resolved ? user.id : null,
        admin_notes: reviewerNote || null,
      },
      { onConflict: "listing_id" }
    );
    if (reviewErr) {
      // The status write already landed — say so honestly, and loudly flag
      // that the review record did not, so the founder repeats the action.
      console.error("[aubrey] review record upsert failed:", reviewErr.message);
      return NextResponse.json(
        {
          error: "review_record_failed",
          detail:
            "The status change was applied, but the review record could not be written. Repeat the action.",
          status: data.status,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, id: data.id, status: data.status }, { status: 200 });
}
