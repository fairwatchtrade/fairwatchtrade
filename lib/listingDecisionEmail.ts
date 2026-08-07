/* ════════════════════════════════════════════════════════════════════════
   lib/listingDecisionEmail.ts — what the seller is told, and when

   Standing product law: no adverse listing decision without a seller-visible
   reason. Every adverse mail here REQUIRES the persisted seller message from
   its decision event — the same text the Account surface shows, never a
   second copy reconstructed from mutable state, and never the founder-only
   reviewer note.

   Voice: state what happened, why, and what to do next. Never accuse, never
   name the review machinery, never imply a verdict about the seller.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import {
  sendSellerEmail,
  sellerEmailShell,
  escapeHtml,
  type SellerEmailResult,
} from "@/lib/sellerEmail";

const ACCOUNT_URL = "https://fairwatchtrade.com/account";

export type ListingFacts = {
  to: string | null | undefined;
  brand?: string | null;
  model?: string | null;
  reference?: string | null;
  /** The permanent listing code, when the listing has one. */
  publicCode?: string | null;
};

function listingLine(f: ListingFacts): string {
  const name = [f.brand, f.model].filter(Boolean).join(" ").trim();
  return escapeHtml(name || f.reference || "Your listing");
}

function referenceLine(f: ListingFacts): string {
  const parts: string[] = [];
  if (f.reference) parts.push(`Ref. ${f.reference}`);
  if (f.publicCode) parts.push(`Listing ${f.publicCode}`);
  return escapeHtml(parts.join(" · ")) || "&nbsp;";
}

/* ── Submission received — the listing is in, and is NOT public ─────────── */
export async function sendSubmissionReceivedEmail(
  facts: ListingFacts
): Promise<SellerEmailResult> {
  return sendSellerEmail({
    to: facts.to,
    kind: "decision:submitted",
    subject: "We've received your listing for review",
    html: sellerEmailShell({
      lead: "Your listing has been submitted for review. It is not public yet.",
      listingLine: listingLine(facts),
      referenceLine: referenceLine(facts),
      nextAction:
        "Nothing is needed from you right now. We'll let you know when it's approved, or if anything needs your attention. You can follow its status any time in Account → Listings.",
      ctaHref: ACCOUNT_URL,
      ctaLabel: "View Your Listings",
    }),
  });
}

/* ── Rejected ──────────────────────────────────────────────────────────── */
export async function sendListingRejectedEmail(
  facts: ListingFacts & { sellerMessage: string }
): Promise<SellerEmailResult> {
  return sendSellerEmail({
    to: facts.to,
    kind: "decision:rejected",
    subject: "About your FairWatchTrade listing",
    html: sellerEmailShell({
      lead: "We've completed our review, and this listing won't be going live on FairWatchTrade.",
      listingLine: listingLine(facts),
      referenceLine: referenceLine(facts),
      reason: escapeHtml(facts.sellerMessage),
      reasonLabel: "Why",
      nextAction:
        "Your listing and everything in it are saved — nothing has been deleted. If you'd like to discuss this or think something was missed, reply to this email.",
      ctaHref: ACCOUNT_URL,
      ctaLabel: "View Your Listings",
    }),
  });
}

/* ── Clarification requested ───────────────────────────────────────────── */
export async function sendClarificationRequestedEmail(
  facts: ListingFacts & { sellerMessage: string }
): Promise<SellerEmailResult> {
  return sendSellerEmail({
    to: facts.to,
    kind: "decision:clarification",
    subject: "One thing needed on your FairWatchTrade listing",
    html: sellerEmailShell({
      lead: "We've looked at your listing and need one thing from you before it can go live.",
      listingLine: listingLine(facts),
      referenceLine: referenceLine(facts),
      reason: escapeHtml(facts.sellerMessage),
      reasonLabel: "What we need",
      nextAction:
        "Your listing is saved exactly as you left it. Update it in Account → Listings and submit it for review again — it goes straight back to us.",
      ctaHref: ACCOUNT_URL,
      ctaLabel: "Update Your Listing",
    }),
  });
}

/* ── Returned to draft ─────────────────────────────────────────────────── */
export async function sendReturnedToDraftEmail(
  facts: ListingFacts & { sellerMessage: string }
): Promise<SellerEmailResult> {
  return sendSellerEmail({
    to: facts.to,
    kind: "decision:returned_to_draft",
    subject: "Your FairWatchTrade listing has been returned to draft",
    html: sellerEmailShell({
      lead: "We've returned this listing to your drafts so you can make a change before it goes live.",
      listingLine: listingLine(facts),
      referenceLine: referenceLine(facts),
      reason: escapeHtml(facts.sellerMessage),
      reasonLabel: "Why",
      nextAction:
        "Everything you entered is still there. Make the change in Account → Listings and submit it for review again whenever you're ready.",
      ctaHref: ACCOUNT_URL,
      ctaLabel: "Open Your Draft",
    }),
  });
}
