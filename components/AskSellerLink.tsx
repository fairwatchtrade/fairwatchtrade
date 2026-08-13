"use client";

/* ────────────────────────────────────────────────────────────────────────
   ASK SELLER LINK — the visible door to a question.

   Founder finding (2026-08-12): a collector with a QUESTION was offered
   nothing near the price except "Start Purchase Request" — so the offer
   form's optional note became the de-facto question box. The messaging
   machinery already existed on the page (ListingCorrespondence and its
   openHome()); what was missing was an affordance beside the price that
   names the act.

   This dispatches one window event; ListingCorrespondence listens and runs
   its existing openHome() — scroll to the conversation home, focus the
   composer. No new routes, threads, or message logic. If no listener is
   mounted (owner view, signed-out), the click is a no-op — callers gate
   rendering so that state is never reachable in practice.
   ──────────────────────────────────────────────────────────────────────── */

export const ASK_SELLER_EVENT = "fwt:ask-seller";

export default function AskSellerLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(ASK_SELLER_EVENT))}
      className={
        className ??
        "block text-left text-[11px] text-[var(--slate)] underline decoration-[var(--border-mid)] underline-offset-4 transition hover:text-[var(--gold)] hover:decoration-[var(--gold-dim)]"
      }
    >
      Have a question? Ask the seller →
    </button>
  );
}
