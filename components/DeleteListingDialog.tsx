"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  blockerSentence,
  type DeleteEligibility,
} from "@/lib/listingDeleteEligibility";

/* ════════════════════════════════════════════════════════════════════════
   DELETE LISTING — Stage 7. Asks the server whether this listing may be
   permanently deleted yet, and shows the answer.

   ⚠ IT DELETES NOTHING. There is no purge in this flight and therefore no
   button here that performs one. The useful work is the determination and
   the consequences review; a control that claimed to delete would be a lie
   about the most irreversible action the product will ever have.

   The answer is computed entirely by listing_delete_eligibility(). This
   component renders it. It does not evaluate a single blocker itself, which
   is why a seller and the founder cannot be shown different verdicts.

   Asked on open and re-askable by hand, because the answer is a snapshot.
   The function is STABLE — the database refuses writes inside it — so
   pressing Check again costs a read and changes nothing.

   Shaped after RemoveListingDialog: bounded width, square perimeter, Escape
   and backdrop close, focus lands on the safe action and returns to the
   trigger.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export default function DeleteListingDialog({
  listingId,
  title,
  publicCode,
  onClose,
}: {
  listingId: string;
  title: string;
  publicCode?: string | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { phase: "checking" }
    | { phase: "error"; detail: string }
    | { phase: "answered"; result: DeleteEligibility }
  >({ phase: "checking" });
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  /* Declared here rather than inline so the retry control and the initial
     ask are provably the same call. */
  async function check() {
    setState({ phase: "checking" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("listing_delete_eligibility", {
        p_listing_id: listingId,
      });
      if (error) {
        setState({
          phase: "error",
          detail:
            error.message.includes("not_found")
              ? "This listing isn't yours, or no longer exists."
              : "Could not check this listing right now. Please try again.",
        });
        return;
      }
      setState({ phase: "answered", result: data as DeleteEligibility });
    } catch {
      setState({
        phase: "error",
        detail: "Could not check this listing right now. Please try again.",
      });
    }
  }

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const result = state.phase === "answered" ? state.result : null;
  const eligible = result?.eligible_for_permanent_delete === true;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(7,8,12,0.72)] px-6 py-8"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-listing-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-[460px] overflow-y-auto border border-[var(--border-mid)] bg-[var(--surface)] px-6 py-6"
      >
        <h2
          id="delete-listing-title"
          className="font-display text-[18px] font-light text-[var(--platinum)]"
        >
          {/* ⚠ A STATEMENT, NEVER A QUESTION.

              This first shipped as "Delete this listing permanently?" above
              Close and Check again — posing the most irreversible decision in
              the product and then offering no way to take it. The seller
              reasonably read it as being asked to delete something a second
              time, having already Removed it once.

              Stage 7 asks nothing. It reports whether anything is in the way.
              The question belongs to the stage that can actually answer it. */}
          {state.phase === "checking"
            ? "Checking this listing…"
            : eligible
              ? "Ready for permanent deletion"
              : "This listing can't be permanently deleted yet."}
        </h2>
        <p className="mt-1 truncate font-display text-[13px] italic text-[var(--platinum-dim)]">
          {title}
        </p>
        {publicCode && (
          <p className="mt-0.5 truncate font-mono text-[11px] tracking-[1.1px] text-[var(--gold-dim)]">
            {publicCode}
          </p>
        )}

        {state.phase === "checking" && (
          <p className="mt-5 font-display text-[13px] italic text-[var(--muted)]">
            Asking the server what's still unresolved…
          </p>
        )}

        {state.phase === "error" && (
          <p role="alert" className="mt-5 text-[12px] leading-[1.6] text-[var(--danger)]">
            {state.detail}
          </p>
        )}

        {/* ── BLOCKED ─────────────────────────────────────────────────────
            Only the blockers actually found are listed. No hypothetical
            categories, no "everything looks fine except…" — the seller sees
            exactly what is unresolved and nothing they cannot act on. */}
        {result && !eligible && (
          <>
            <ul className="mt-5 space-y-2">
              {result.blockers.map((b, i) => (
                <li
                  key={`${b.code}-${i}`}
                  className="border-l-2 border-[var(--lc-rejected-line)] pl-3 text-[12px] leading-[1.6] text-[var(--platinum-dim)]"
                >
                  {blockerSentence(b)}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] leading-[1.6] text-[var(--muted)]">
              Nothing has been deleted. Your listing and its photographs are
              still here. You can check again once these are resolved.
            </p>
          </>
        )}

        {/* ── ELIGIBLE ────────────────────────────────────────────────────
            The consequences review. It describes what permanent deletion is
            designed to do, and states plainly that it has not happened and
            cannot be triggered from here yet — because it cannot. */}
        {result && eligible && (
          <>
            <p className="mt-5 text-[12px] leading-[1.6] text-[var(--lc-published-badge)]">
              Currently eligible for permanent deletion.
            </p>
            {/* State-neutral on purpose. Delete no longer assumes the listing
                was paused first — a seller who sold and shipped a watch comes
                straight here from a published listing, and telling them what
                they "already did" would be wrong for the commonest case. */}
            <p className="mt-2 text-[12px] leading-[1.6] text-[var(--platinum-dim)]">
              Nothing is standing in the way. This is the separate, final step
              that erases the listing itself — you don&apos;t need to pause it
              first.
            </p>
            <div className="mt-4 space-y-1.5 text-[12px] leading-[1.6] text-[var(--muted)]">
              <p>When that step runs, it will be irreversible:</p>
              <p>
                <span className="text-[var(--platinum-dim)]">
                  The listing itself disappears
                </span>{" "}
                — from your workspace as well as from the marketplace.
              </p>
              <p>
                <span className="text-[var(--platinum-dim)]">
                  Its photographs go with it
                </span>{" "}
                — anything belonging only to this listing dies with it.
              </p>
              <p>
                <span className="text-[var(--platinum-dim)]">
                  Records that stand on their own survive
                </span>{" "}
                — completed sales, adjudication history and the purchase
                requests people made keep their own copy of which watch they
                concerned, and remain readable without it.
              </p>
            </div>
            {/* ⚠ Deliberately not a button. There is no purge to trigger, and
                a control here would either do nothing or imply it had. */}
            <p className="mt-4 border border-[var(--border-faint)] px-3 py-2.5 text-[11px] leading-[1.6] text-[var(--muted)]">
              <span className="text-[var(--platinum-dim)]">
                Nothing has been deleted.
              </span>{" "}
              Permanent deletion isn&apos;t available yet — this check confirms
              the listing is ready for it, and the step itself is still being
              built.
            </p>
          </>
        )}

        {result && (
          <p className="mt-4 text-[11px] leading-[1.5] text-[var(--muted)]">
            Checked just now. This answer reflects the listing as it is at this
            moment and is re-checked each time.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-[44px] border border-[var(--border-subtle)] px-4 py-2.5 text-[11px] uppercase tracking-[1.6px] text-[var(--platinum-dim)] transition-colors hover:text-[var(--platinum)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
          >
            Close
          </button>
          <button
            type="button"
            disabled={state.phase === "checking"}
            onClick={check}
            className="min-h-[44px] border border-[var(--border-mid)] px-4 py-2.5 text-[11px] uppercase tracking-[1.6px] text-[var(--platinum-dim)] transition-colors hover:text-[var(--platinum)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-60"
          >
            {state.phase === "checking" ? "Checking…" : "Check again"}
          </button>
        </div>
      </div>
    </div>
  );
}
