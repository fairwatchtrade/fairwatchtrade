"use client";

/* ────────────────────────────────────────────────────────────────────────
   DEALER ACCELERATOR — Seller Overview doorway

   The discoverable entrance to the Dealer Accelerator room. A dealer who
   has never heard of this capability should be able to understand it and
   enter it from here, without being told where to look.

   ── This card used to offer nothing to press, and that was correct ─────
   For a long period there was no dealer-facing way to start a preparation:
   the engine ran only when invoked by hand. During that period this card
   deliberately had NO primary action, because a button that cannot keep its
   promise is worse than no button. An earlier version launched the
   visitor's mail client, which was honest scaffolding and was removed once
   it started to look like intake.

   That reasoning has expired. The room exists, the dealer can start a real
   preparation themselves, and so the primary action is real. If you are
   reading this because the card looks bare again, the question to ask is
   whether the room still works — not whether the button should come back.

   ── Truth rules that did NOT expire ───────────────────────────────────
   · No fabricated counts, progress, timing, or sync status. The only state
     input is the real returning-dealer predicate (listing_media rows with
     capture_source='dealer_import'), used strictly as a boolean.
   · hasImportedDrafts === null (predicate still loading) renders the card
     with NO state line — never a flash of the wrong claim.
   ──────────────────────────────────────────────────────────────────────── */

export default function DealerAcceleratorEntry({
  hasImportedDrafts,
  onOpenAccelerator,
  onOpenImportedDrafts,
}: {
  /** true = returning dealer (real imported drafts exist) · false = first-time · null = not yet known */
  hasImportedDrafts: boolean | null;
  /** Opens the Dealer Accelerator room at its Start destination. */
  onOpenAccelerator: () => void;
  /** Opens the same room at its Imported Drafts destination. */
  onOpenImportedDrafts: () => void;
}) {
  const returning = hasImportedDrafts === true;
  const firstTime = hasImportedDrafts === false;

  return (
    <section
      aria-label="Dealer Accelerator"
      className="border border-[var(--border-mid)] bg-[linear-gradient(180deg,light-dark(#FBF8F1,#101620),light-dark(#EFEAE0,#0d121a))] p-6 md:grid md:grid-cols-[1.4fr_0.6fr] md:items-center md:gap-6"
    >
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--gold)]">
          Dealer Accelerator
        </div>
        <h2 className="mb-2.5 mt-2 font-display text-[24px] font-light leading-[1.15] text-[var(--platinum)] sm:text-[27px]">
          Already have your inventory online? Don’t build it again.
        </h2>
        <p className="text-[13px] leading-[1.65] text-[var(--muted)]">
          Give FairWatchTrade your existing dealer inventory source. We prepare
          private draft listings from the work you have already done. You
          confirm the commercial truth. Nothing is published until you submit
          and FairWatchTrade reviews it.
        </p>

        {/* State line — real predicate only; unknown renders nothing. */}
        {firstTime && (
          <p className="mt-3.5 text-[12px] leading-[1.6] text-[var(--muted)]">
            Connect your inventory source to prepare your first drafts.
          </p>
        )}
        {returning && (
          <p className="mt-3.5 text-[12px] leading-[1.6] text-[var(--platinum-dim)]">
            Your prepared drafts are waiting for confirmation.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2.5 md:mt-0">
        <button
          type="button"
          onClick={onOpenAccelerator}
          className="flex min-h-[46px] cursor-pointer items-center justify-center border border-[var(--gold)] bg-[var(--cta-fill)] px-4 py-3 text-center text-[12px] font-semibold text-[var(--on-cta)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
        >
          Open Dealer Accelerator
        </button>
        {returning && (
          <button
            type="button"
            onClick={onOpenImportedDrafts}
            className="flex min-h-[46px] cursor-pointer items-center justify-center border border-[var(--border-mid)] bg-transparent px-4 py-3 text-center text-[12px] font-semibold text-[var(--platinum)] transition-colors hover:border-[var(--gold-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
          >
            Review Imported Drafts
          </button>
        )}
      </div>
    </section>
  );
}
