"use client";

import { useState } from "react";
import Link from "next/link";
import ProposeTradeDialog from "@/components/ProposeTradeDialog";
import { TRADE_STATUS_LABELS, type TradeStatus } from "@/lib/trade";

/* ════════════════════════════════════════════════════════════════════════
   TRADE DOORWAY — components/TradeDoorway.tsx

   The "Propose a trade" entry on Listing Detail. It appears only when the
   seller has explicitly opted in, and it is deliberately quieter than the
   cash action beside it: trade is an ADDITIONAL governed way to acquire
   this watch, never a replacement for Purchase Request, and its presence
   must not suggest the seller would rather trade than sell.

   When this collector already has a live proposal on this watch, the
   doorway states that instead of offering a second one — the
   one-pending-per-proposer index would refuse it anyway, and a button that
   is going to 409 is a button that should not be drawn.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export default function TradeDoorway({
  listingId,
  listingIdentity,
  myOfferStatus,
  signedIn,
  variant = "rail",
}: {
  listingId: string;
  listingIdentity: string;
  myOfferStatus?: string | null;
  signedIn: boolean;
  variant?: "rail" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const live = myOfferStatus === "pending";
  const accepted = myOfferStatus === "accepted";

  if (accepted) {
    return (
      <div className="mt-3 border border-[var(--success,#78c88c)] px-3 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--success,#78c88c)]">
        Your trade was accepted
      </div>
    );
  }

  if (sent || live) {
    return (
      <div className="mt-3">
        <div className="border border-[var(--border-gold)] px-3 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--gold-dim)]">
          Trade proposal pending
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted)]">
          The seller has your proposal. You can follow it in{" "}
          <Link href="/account?module=trades" className="underline decoration-[var(--border-mid)] underline-offset-2 hover:text-[var(--platinum)]">
            your offers
          </Link>
          .
        </p>
      </div>
    );
  }

  if (open) {
    return (
      <div className="mt-3">
        <ProposeTradeDialog
          targetListingId={listingId}
          targetIdentity={listingIdentity}
          onClose={() => setOpen(false)}
          onProposed={() => {
            setOpen(false);
            setSent(true);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mt-3">
      {signedIn ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={[
            "border border-[var(--border-gold)] px-4 py-2 text-[11px] uppercase tracking-[1.6px]",
            "text-[var(--gold-dim)] transition-colors hover:text-[var(--gold)]",
            variant === "rail" ? "block w-full text-center" : "inline-block",
          ].join(" ")}
        >
          Propose a trade
        </button>
      ) : (
        <Link
          href={`/login?next=/listings/${listingId}`}
          className={[
            "border border-[var(--border-gold)] px-4 py-2 text-[11px] uppercase tracking-[1.6px]",
            "text-[var(--gold-dim)] transition-colors hover:text-[var(--gold)]",
            variant === "rail" ? "block text-center" : "inline-block",
          ].join(" ")}
        >
          Propose a trade
        </Link>
      )}
      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted)]">
        This seller will consider another FairWatchTrade watch, with or without a cash difference.
      </p>
      {myOfferStatus && !live && !accepted && (
        <p className="mt-1 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
          Your last proposal: {TRADE_STATUS_LABELS[myOfferStatus as TradeStatus] ?? myOfferStatus}
        </p>
      )}
    </div>
  );
}
