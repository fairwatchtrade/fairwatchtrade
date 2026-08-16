"use client";

/* ────────────────────────────────────────────────────────────────────────
   DEALER ACCELERATOR — dashboard entry card  (Design Gate v2, hash-pinned)

   The discoverable doorway the feature never had: an assisted-preparation
   promise on the dealer's Overview, not a buried workspace nav label. An
   assisted doorway, not a software integration widget.

   TRUTH RULES (order §boundaries):
   · No fabricated counts, progress, timing, or feed/sync status — the only
     state input is the REAL returning-dealer predicate (listing_media rows
     with capture_source='dealer_import', the same unforgeable marker the
     workspace queries), used strictly as a boolean.
   · Primary action = the EXISTING dealer contact path (the site's one
     contact channel) with Dealer Accelerator intent preserved in the
     subject. No new intake system behind it.
   · Secondary action (desktop/narrow only) = module switch into the
     existing Imported Drafts workspace. On mobile the workspace does not
     exist (v2.21 desktop-governing-scope, reaffirmed v2.68), so the
     returning state renders TEXT ONLY there — Jason's 2026-07-27 ruling:
     no button shape, no tap handler, no handoff mechanism.
   · hasImportedDrafts === null (predicate still loading) renders the card
     with NO state line at all — never a flash of the wrong claim.
   ──────────────────────────────────────────────────────────────────────── */

/* ── WHY THERE IS NO PRIMARY ACTION HERE ────────────────────────────────
   There was one: "Ask FairWatchTrade to prepare your inventory", which
   opened the visitor's mail client. It was honest scaffolding from the
   period when dealer intake was deferred, and it has been removed.

   > Until genuine Dealer Accelerator intake exists, FairWatchTrade should
   > not pretend that an email launch is intake.

   Deliberately NOT replaced with a contact form, a disabled button, a
   "Coming soon" action, or any other shape that implies a door. A card that
   explains a real service and offers nothing to press is truthful. A button
   that launches Outlook is a promise the product cannot keep.

   The card keeps its explanation, and returning dealers keep the one action
   that is real: the Imported Drafts workspace. For a first-time dealer the
   action column has nothing legitimate to hold, so it does not render at
   all rather than sitting there empty. External dealer self-initiation is a
   separate product problem and is not solved by scaffolding.
   ──────────────────────────────────────────────────────────────────────── */

export default function DealerAcceleratorEntry({
  hasImportedDrafts,
  onOpenImportedDrafts,
}: {
  /** true = returning dealer (real imported drafts exist) · false = first-time · null = not yet known */
  hasImportedDrafts: boolean | null;
  /** Desktop/narrow secondary destination: the existing Imported Drafts module. */
  onOpenImportedDrafts: () => void;
}) {
  const returning = hasImportedDrafts === true;
  const firstTime = hasImportedDrafts === false;

  return (
    <section
      aria-label="Dealer Accelerator"
      /* Two columns only when the second one has something in it. Left as a
         fixed 1.4fr/0.6fr grid, a first-time dealer's card would reserve a
         third of its width for an action that no longer exists — the blank
         placeholder the order rules out. */
      className={`border border-[var(--border-mid)] bg-[linear-gradient(180deg,light-dark(#FBF8F1,#101620),light-dark(#EFEAE0,#0d121a))] p-6 ${
        returning ? "md:grid md:grid-cols-[1.4fr_0.6fr] md:items-center md:gap-6" : ""
      }`}
    >
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--gold)]">
          Dealer Accelerator
        </div>
        <h2 className="mb-2.5 mt-2 font-display text-[24px] font-light leading-[1.15] text-[var(--platinum)] sm:text-[27px]">
          Bring your existing inventory to FairWatchTrade without rebuilding
          every listing from scratch.
        </h2>
        <p className="text-[13px] leading-[1.65] text-[var(--muted)]">
          FairWatchTrade can prepare private drafts from your existing
          inventory. You review the details, add current photographs, and
          submit each watch when it is ready.
        </p>
        <p className="mt-3.5 text-[12px] leading-[1.6] text-[var(--platinum-dim)]">
          Nothing is published automatically. Every watch stays private until
          you review and submit it.
        </p>

        {/* State line — real predicate only; unknown renders nothing. */}
        {firstTime && (
          <p className="mt-3.5 text-[11px] leading-[1.6] text-[var(--muted)]">
            Prepared inventory will appear here after FairWatchTrade assists
            you.
          </p>
        )}
        {returning && (
          <div className="mt-3.5 border-t border-[var(--border-subtle)] pt-3.5">
            <p className="text-[11px] uppercase tracking-[1.5px] text-[var(--gold-subtle)]">
              Review prepared inventory drafts.
            </p>
            <p className="mt-1.5 text-[13px] text-[var(--platinum)]">
              Prepared drafts are available in your workspace.
            </p>
            <p className="mt-1 text-[12px] leading-[1.6] text-[var(--muted)]">
              Review each watch, confirm the current facts, and submit only
              when it is ready.
            </p>
          </div>
        )}
      </div>

      {/* The action column exists only when there is a real action. With the
          mailto gone, a first-time dealer's column would be an empty cell
          holding open a two-column grid for nothing. */}
      {returning && (
        <div className="mt-5 flex flex-col gap-2.5 md:mt-0">
          {/* Desktop/narrow: the real workspace exists — a real button. */}
          <button
            type="button"
            onClick={onOpenImportedDrafts}
            className="hidden min-h-[46px] cursor-pointer items-center justify-center border border-[var(--gold)] bg-[var(--cta-fill)] px-4 py-3 text-center text-[12px] font-semibold text-[var(--on-cta)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] md:flex"
          >
            Review prepared drafts
          </button>
          {/* Mobile: the workspace is desktop-only — TEXT, never a control
              (Jason's ruling). No handler, no button shape, no handoff. */}
          <div className="text-center md:hidden">
            <p className="text-[13px] text-[var(--platinum-dim)]">
              Prepared drafts are ready to review on desktop.
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Open your Dealer Workspace on desktop to continue.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
