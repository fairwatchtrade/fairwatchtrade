/* ════════════════════════════════════════════════════════════════════════
   THE PUBLICATION LAW — lib/listingPublicationGate.ts

   Publication has one door (v6.34). This module is the door's lock, stated
   once so it cannot be stated twice and drift.

   WHY IT MOVED HERE. The law was written inline in the founder status route,
   which was correct while that route was the only writer. Founder Review
   Triage adds a second AUTHORIZED caller — an automatic disposition that
   records its own governed approval — and a load-bearing predicate copied
   into a second file is exactly the shape of the defect v6.34 closed: two
   publication writers, only one of them governed. One function, two callers,
   no second expression of the rule.

   THE LAW, unchanged in substance:
     1. Only a listing CURRENTLY IN REVIEW may be published. A dropdown set
        to 'published' from draft or from rejected reached Browse with no
        recorded approval anywhere.
     2. Publication requires an explicit RECORDED APPROVAL. Clearing the
        system's objection is not the same act as approving a listing.
     3. A listing whose availability is 'Not Currently Available' cannot be
        published (v2.21 dealer gate) — it waits for In Stock.

   WHAT THIS MODULE IS NOT. It does not authorize anybody. Callers pass their
   own already-established facts and enforce their own authorization first;
   this only answers "does the law refuse this publication, and why".

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type PublicationRefusal = {
  /** Stable machine code. Callers map it to their own transport. */
  error: "not_in_review" | "approval_required" | "not_available";
  /** The sentence a founder reads. */
  detail: string;
};

export type PublicationRequest = {
  /** The listing's status BEFORE this transition. */
  priorStatus: string | null;
  /** True only when an explicit approval action accompanies the write. */
  approvalRecorded: boolean;
  /** listings.details.availability, whatever shape it arrived in. */
  availability: unknown;
};

export const AVAILABILITY_NOT_IN_STOCK = "Not Currently Available";

/** Null means the law permits this publication. Non-null is the refusal. */
export function publicationRefusal(req: PublicationRequest): PublicationRefusal | null {
  if (req.priorStatus !== "pending_review") {
    return {
      error: "not_in_review",
      detail:
        "Only a listing currently in review can be published. This listing is " +
        `"${req.priorStatus ?? "unknown"}" — it must enter review first.`,
    };
  }
  if (!req.approvalRecorded) {
    return {
      error: "approval_required",
      detail:
        "Publication requires the governed approve action, so the decision is recorded. Use Approve in Founder Review.",
    };
  }
  if (req.availability === AVAILABILITY_NOT_IN_STOCK) {
    return {
      error: "not_available",
      detail:
        "This listing's availability is 'Not Currently Available'. It cannot be published until the dealer marks it In Stock.",
    };
  }
  return null;
}

/** Reads listings.details.availability without assuming the column's shape. */
export function availabilityOf(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const v = (details as Record<string, unknown>).availability;
  return typeof v === "string" ? v : null;
}
