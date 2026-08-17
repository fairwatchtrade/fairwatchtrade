"use client";

import { useEffect, useRef, useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   REMOVE LISTING — the seller takes a watch off the market.

   Shaped after the Withdraw Offer confirmation in CatalogueClient: bounded
   width, square perimeter, Escape and backdrop both close, focus lands on
   the safe action and returns to the trigger. Colours are tokens rather than
   the literal hex that dialog still carries, so this reads correctly in
   Daylight as well as dark.

   THE COPY IS THE FEATURE HERE.

   "Remove" is the word a seller will read as "delete", and it is not one.
   Every consequence sentence below is a statement of what the RPC actually
   does, in the order a seller worries about it:

     · the listing and its photographs are kept — it stays in the workspace
     · it stops being publicly visible
     · pending purchase requests close, and those buyers are told why
     · an ACCEPTED request is untouched

   The last one matters most and is the easiest to get wrong. A seller who
   believes Remove cancels an agreed deal will use it to walk away from one.
   It does not, so the dialog says so before the button is pressed rather
   than after.

   And no reason code creates a sale. Choosing "Sold elsewhere" records why
   the watch left the market; it writes nothing to transactions, so Tax Time,
   sales figures and Collector Impression eligibility are all unaffected. A
   seller reading "Sold" in a marketplace UI will reasonably assume the
   opposite, so that is said out loud too.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type RemoveResult = {
  requests_cancelled?: number;
  accepted_requests_remaining?: number;
};

/* ⚠ THE REASON PICKER IS GONE, AND ITS ABSENCE IS THE FEATURE.

   Every reason in the governed set described a watch leaving for GOOD — sold
   in my store, sold on another website, listing mistake / duplicate. They
   were written when Remove was the only exit, so the reason field was
   carrying the "why did this watch leave the market" question.

   Pause does not ask it. The reason IS the action: the seller cannot find
   the watch in the safe right now. Every category on offer would have been a
   lie about a watch that is coming back.

   The vocabulary is not lost — Delete inherits it when Stage 8 builds the
   final confirmation, which is where "why did this leave for good" is a
   question worth asking. Do not reintroduce it here. */

export default function RemoveListingDialog({
  listingId,
  title,
  publicCode,
  onClose,
  onRemoved,
}: {
  listingId: string;
  /** Watch identity, already composed by the caller. */
  title: string;
  /** The FWT listing code. Without it this dialog cannot distinguish two
      identical watches — and a seller with three Datejusts on one reference
      at the same price was one keystroke from removing the wrong one. */
  publicCode?: string | null;
  /** Restores focus to the trigger — the caller owns that element. */
  onClose: () => void;
  onRemoved: (result: RemoveResult) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keepRef = useRef<HTMLButtonElement | null>(null);

  // Focus lands on the action that changes nothing.
  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  async function confirm() {
    if (submitting) return; // double-submit prevention
    setSubmitting(true);
    setError(null);
    try {
      /* No body. Pause asks nothing, so there is nothing to send — the
         server takes an optional reason and this action supplies none. */
      const res = await fetch(`/api/listings/${listingId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => null)) as
        | (RemoveResult & { detail?: string })
        | null;
      if (!res.ok) {
        /* The route already writes these in the seller's language — prefer
           its sentence over a generic one, because it knows which refusal
           actually happened (already removed, wrong state, not yours). */
        setError(data?.detail ?? "Could not pause this listing. Please try again.");
        return;
      }
      onRemoved(data ?? {});
    } catch {
      setError("Could not pause this listing. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(7,8,12,0.72)] px-6 py-8"
      onClick={() => !submitting && onClose()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !submitting) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-listing-title"
        aria-describedby="remove-listing-body"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-[440px] overflow-y-auto border border-[var(--border-mid)] bg-[var(--surface)] px-6 py-6"
      >
        <h2
          id="remove-listing-title"
          className="font-display text-[18px] font-light text-[var(--platinum)]"
        >
          Pause this listing?
        </h2>
        <p className="mt-1 truncate font-display text-[13px] italic text-[var(--platinum-dim)]">
          {title}
        </p>
        {publicCode && (
          <p className="mt-0.5 truncate font-mono text-[11px] tracking-[1.1px] text-[var(--gold-dim)]">
            {publicCode}
          </p>
        )}

        <div
          id="remove-listing-body"
          className="mt-4 space-y-1.5 text-[12px] leading-[1.6] text-[var(--muted)]"
        >
          <p>
            Your listing and its photographs are kept. It stays here in your
            workspace — nothing is deleted.
          </p>
          <p>
            It stops appearing on Browse, in search, and on your public profile.
          </p>
          <p>
            You can put it back on the market later.
          </p>
          <p>
            Any purchase requests still waiting for your answer will be closed,
            and those buyers will be told the listing is no longer available.
            They stay closed even if you list it again — an offer made weeks ago
            shouldn&apos;t be acted on as though it were current.
          </p>
          {/* States the product fact and stops. The first cut said removing a
              listing "doesn't undo a deal you've agreed to" — true of the
              software, but it characterises the arrangement between two
              people as binding, which is not FairWatchTrade's to assert. What
              the platform actually knows is narrower and enough: the request
              is still open. */}
          <p className="text-[var(--platinum-dim)]">
            A purchase request you&apos;ve already accepted stays open. Removing
            this listing doesn&apos;t close it.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-[11px] text-[var(--danger)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={keepRef}
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="min-h-[44px] border border-[var(--border-subtle)] px-4 py-2.5 text-[11px] uppercase tracking-[1.6px] text-[var(--platinum-dim)] transition-colors hover:text-[var(--platinum)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-60"
          >
            Keep it listed
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={confirm}
            className="min-h-[44px] border border-[var(--border-mid)] px-4 py-2.5 text-[11px] uppercase tracking-[1.6px] text-[var(--platinum-dim)] transition-colors hover:text-[var(--danger)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-60"
          >
            {submitting ? "Pausing…" : "Pause listing"}
          </button>
        </div>
      </div>
    </div>
  );
}
