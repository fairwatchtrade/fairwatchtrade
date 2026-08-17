/* ════════════════════════════════════════════════════════════════════════
   lib/listingRemovalEmail.ts — the seller's receipt for taking a watch off
   the market.

   WHY THIS IS NOT IN listingDecisionEmail.ts

   That module's subject is adjudication: what a reviewer decided about a
   listing's merit, and every adverse mail in it requires the persisted
   seller-visible reason from a decision event. A removal is the opposite
   kind of fact — the seller acted on their own listing, nobody judged
   anything, and there is no decision event to quote. Filing it there would
   have taught a vocabulary of verdicts to describe a self-service action,
   which is the same overloading mistake this codebase has now unpicked
   twice. Same infrastructure, different subject, different file.

   THIS IS ALSO A SECURITY NOTIFICATION

   Removal ends public availability and closes other people's pending
   purchase requests. If an account is ever compromised, this mail is how
   the real owner finds out — so it always sends, it names exactly what
   happened, and it says plainly what to do if it was not them.

   NO REPLY CHANNEL. fairwatchtrade.com publishes no MX records, so the
   domain sends but cannot receive. Never write "reply to this email" here:
   a seller who did NOT authorise a removal is precisely the person who must
   not be pointed at a bounce. The destination is Your Listings, which the
   product already owns.

   DERIVED FROM COMMITTED TRUTH, NEVER FROM THE BUTTON. The caller sends
   this only after remove_listing() has returned, using what actually
   committed — the reason stored on the listing and the counts the function
   reported. Nothing here is sent optimistically, and no mail work happens
   inside the database function.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import {
  sendSellerEmail,
  sellerEmailShell,
  escapeHtml,
  type SellerEmailResult,
} from "@/lib/sellerEmail";
import type { ListingFacts } from "@/lib/listingDecisionEmail";

const ACCOUNT_URL = "https://fairwatchtrade.com/account";

/** The seller's own words for why, in the same vocabulary the dialog offered
    them. Kept beside the mail that prints it so the two cannot drift. */
const REASON_LABEL: Record<string, string> = {
  sold_in_store: "Sold in my store / privately",
  sold_elsewhere: "Sold on another website",
  no_longer_for_sale: "No longer for sale",
  listing_mistake: "Listing mistake / duplicate",
  other: "Other",
};

export type RemovalFacts = ListingFacts & {
  reasonCode: string | null;
  /** The seller's optional private note. Included because it is their own
      record of the decision; it was never shown to any buyer. */
  reasonNote?: string | null;
  /** Pending purchase requests this removal closed. */
  requestsClosed: number;
  /** Accepted requests that survived it — a live obligation, not a leftover. */
  acceptedRemaining: number;
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

/** What this removal did to other people, stated in numbers rather than
    reassurance. A seller who closed someone's pending request should be told
    so, and a seller whose accepted request survived should be told that too —
    silence there would read as though it had been cancelled. */
function consequenceLine(f: RemovalFacts): string {
  const parts: string[] = [
    "It no longer appears on Browse, in search, or on your public profile. Nothing has been deleted — the listing and its photographs are still in your workspace.",
  ];

  if (f.requestsClosed === 1) {
    parts.push(
      "One purchase request that was waiting for your answer has been closed, and that buyer has been told you removed the listing."
    );
  } else if (f.requestsClosed > 1) {
    parts.push(
      `${f.requestsClosed} purchase requests that were waiting for your answer have been closed, and those buyers have been told you removed the listing.`
    );
  }

  if (f.acceptedRemaining === 1) {
    parts.push("A purchase request you had already accepted stays open.");
  } else if (f.acceptedRemaining > 1) {
    parts.push(
      `${f.acceptedRemaining} purchase requests you had already accepted stay open.`
    );
  }

  return parts.join(" ");
}

export async function sendListingRemovedEmail(
  facts: RemovalFacts
): Promise<SellerEmailResult> {
  const reason = facts.reasonCode
    ? (REASON_LABEL[facts.reasonCode] ?? facts.reasonCode)
    : null;
  const note = facts.reasonNote?.trim();

  return sendSellerEmail({
    to: facts.to,
    kind: "listing:removed",
    subject: "You removed a listing from FairWatchTrade",
    html: sellerEmailShell({
      lead: "This watch has been taken off the market at your request.",
      listingLine: listingLine(facts),
      referenceLine: referenceLine(facts),
      ...(reason
        ? {
            reason: escapeHtml(note ? `${reason} — ${note}` : reason),
            reasonLabel: "Reason you gave",
          }
        : {}),
      nextAction:
        consequenceLine(facts) +
        " If you did not remove this listing, open Your Listings and change your password straight away.",
      ctaHref: ACCOUNT_URL,
      ctaLabel: "View Your Listings",
    }),
  });
}
