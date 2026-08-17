"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  blockerSentence,
  type DeleteEligibility,
} from "@/lib/listingDeleteEligibility";

/* ════════════════════════════════════════════════════════════════════════
   DELETE LISTING — Stage 8. One confirmation, and it deletes.

   The flow is deliberately short, because the seller arrived knowing what
   they wanted:

     Delete Listing → silent eligibility check
                    → blocked:  explain, change nothing
                    → clear:    one final confirmation → gone

   There is no "ready but unavailable" state, no Check again, and no second
   ceremony. The earlier construction version asked "Delete this listing
   permanently?" and then offered Close — a question it could not answer.
   This one can.

   ⚠ THE DESTRUCTIVE CONTROL DOES NOT EXIST UNTIL THE SERVER SAYS CLEAR, and
   the seller has picked a reason. It is never rendered next to a blocker.

   Pause is not a prerequisite and is never mentioned as one. A seller who
   sold and shipped a watch comes straight here from a published listing.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/* Delete is where the governed exit vocabulary belongs — "why did this watch
   leave for good" is worth asking at the irreversible moment, and was never
   a sensible question about a temporary Pause. */
const REASONS: Array<{ code: string; label: string }> = [
  { code: "sold_in_store", label: "Sold in my store / privately" },
  { code: "sold_elsewhere", label: "Sold on another website" },
  { code: "listing_mistake", label: "Listing mistake / duplicate" },
  { code: "no_longer_for_sale", label: "No longer for sale" },
  { code: "other", label: "Other" },
];

const SOLD_CODES = new Set(["sold_in_store", "sold_elsewhere"]);

export type DeletedSummary = {
  public_code?: string | null;
  brand?: string | null;
  model?: string | null;
  requests_closed?: number;
};

export default function DeleteListingDialog({
  listingId,
  title,
  reference,
  publicCode,
  onClose,
  onDeleted,
}: {
  listingId: string;
  title: string;
  reference?: string | null;
  publicCode?: string | null;
  onClose: () => void;
  onDeleted: (summary: DeletedSummary) => void;
}) {
  const [state, setState] = useState<
    | { phase: "checking" }
    | { phase: "error"; detail: string }
    | { phase: "blocked"; result: DeleteEligibility }
    | { phase: "confirm"; result: DeleteEligibility }
  >({ phase: "checking" });
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const safeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    safeRef.current?.focus();
  }, [state.phase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("listing_delete_eligibility", {
          p_listing_id: listingId,
        });
        if (cancelled) return;
        if (error) {
          setState({
            phase: "error",
            detail: error.message.includes("not_found")
              ? "This listing isn't yours, or no longer exists."
              : "Could not check this listing right now. Please try again.",
          });
          return;
        }
        const result = data as DeleteEligibility;
        setState(
          result.eligible_for_permanent_delete
            ? { phase: "confirm", result }
            : { phase: "blocked", result }
        );
      } catch {
        if (!cancelled) {
          setState({
            phase: "error",
            detail: "Could not check this listing right now. Please try again.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  async function confirmDelete() {
    if (deleting || !reasonCode) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reasonCode,
          reasonNote: reasonNote.trim() === "" ? null : reasonNote.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        /* 409 means the destructive seam re-checked and refused — something
           changed after the seller opened this. Show the real blockers
           rather than a generic failure; nothing was deleted. */
        if (res.status === 409 && data?.eligibility) {
          setState({ phase: "blocked", result: data.eligibility as DeleteEligibility });
          setDeleteError(null);
          return;
        }
        setDeleteError(data?.detail ?? "Could not delete this listing. Please try again.");
        return;
      }
      onDeleted(data as DeletedSummary);
    } catch {
      setDeleteError("Could not delete this listing. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  const pending =
    state.phase === "confirm" ? (state.result.pending_requests_to_close ?? 0) : 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(7,8,12,0.72)] px-6 py-8"
      onClick={() => !deleting && onClose()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !deleting) {
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
          {state.phase === "checking"
            ? "Checking this listing…"
            : state.phase === "blocked"
              ? "This listing can't be permanently deleted yet."
              : "Delete this listing permanently?"}
        </h2>

        {/* Identity, in full. Three Datejusts on one reference is why the
            listing code is here and not merely the brand and model. */}
        <p className="mt-1 truncate font-display text-[13px] italic text-[var(--platinum-dim)]">
          {title}
        </p>
        {reference && (
          <p className="mt-0.5 truncate text-[11px] tracking-[0.3px] text-[var(--muted)]">
            Ref. {reference}
          </p>
        )}
        {publicCode && (
          <p className="mt-0.5 truncate font-mono text-[11px] tracking-[1.1px] text-[var(--gold-dim)]">
            {publicCode}
          </p>
        )}

        {state.phase === "checking" && (
          <p className="mt-5 font-display text-[13px] italic text-[var(--muted)]">
            Checking what&apos;s still unresolved…
          </p>
        )}

        {state.phase === "error" && (
          <p role="alert" className="mt-5 text-[12px] leading-[1.6] text-[var(--danger)]">
            {state.detail}
          </p>
        )}

        {state.phase === "blocked" && (
          <>
            <ul className="mt-5 space-y-2">
              {state.result.blockers.map((b, i) => (
                <li
                  key={`${b.code}-${i}`}
                  className="border-l-2 border-[var(--lc-rejected-line)] pl-3 text-[12px] leading-[1.6] text-[var(--platinum-dim)]"
                >
                  {blockerSentence(b)}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] leading-[1.6] text-[var(--muted)]">
              Nothing has changed. This listing is exactly where it was.
            </p>
          </>
        )}

        {state.phase === "confirm" && (
          <>
            <div className="mt-5 space-y-1.5 text-[12px] leading-[1.6] text-[var(--muted)]">
              <p className="text-[var(--danger)]">This cannot be undone.</p>
              <p>
                <span className="text-[var(--platinum-dim)]">The listing disappears</span>{" "}
                — from your workspace and from the marketplace.
              </p>
              <p>
                <span className="text-[var(--platinum-dim)]">Its photographs go with it</span>{" "}
                — anything belonging only to this listing is deleted.
              </p>
              {pending > 0 && (
                <p className="text-[var(--platinum-dim)]">
                  {pending === 1
                    ? "One purchase request still waiting for your answer will be closed permanently, and that buyer will be told."
                    : `${pending} purchase requests still waiting for your answer will be closed permanently, and those buyers will be told.`}
                </p>
              )}
              <p>
                <span className="text-[var(--platinum-dim)]">
                  Records that stand on their own survive
                </span>{" "}
                — completed sales and adjudication history keep their own copy
                of which watch they concerned.
              </p>
            </div>

            <fieldset className="mt-5">
              <legend className="text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                Why are you deleting it?
              </legend>
              <div className="mt-2 grid gap-1">
                {REASONS.map((r) => (
                  <label
                    key={r.code}
                    className="flex min-h-[36px] cursor-pointer items-center gap-2.5 px-1 py-1 text-[13px] text-[var(--platinum-dim)] transition-colors hover:text-[var(--platinum)]"
                  >
                    <input
                      type="radio"
                      name="delete-reason"
                      value={r.code}
                      checked={reasonCode === r.code}
                      disabled={deleting}
                      onChange={() => setReasonCode(r.code)}
                      className="h-[14px] w-[14px] shrink-0 accent-[var(--gold)]"
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {SOLD_CODES.has(reasonCode) && (
              <p className="mt-2 border border-[var(--border-faint)] px-3 py-2 text-[11px] leading-[1.55] text-[var(--muted)]">
                This records why the watch left. It does not record a
                FairWatchTrade sale, and it doesn&apos;t affect your sales
                figures.
              </p>
            )}

            {reasonCode === "other" && (
              <label className="mt-3 block">
                <span className="text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                  Anything to add?{" "}
                  <span className="normal-case tracking-[0.3px]">(optional)</span>
                </span>
                <textarea
                  value={reasonNote}
                  disabled={deleting}
                  maxLength={320}
                  rows={2}
                  onChange={(e) => setReasonNote(e.target.value)}
                  className="mt-1.5 w-full resize-y border border-[var(--border-subtle)] bg-transparent px-2.5 py-2 text-[13px] leading-[1.5] text-[var(--platinum)] outline-none transition-colors focus:border-[var(--border-gold)]"
                />
              </label>
            )}
          </>
        )}

        {deleteError && (
          <p role="alert" className="mt-3 text-[11px] text-[var(--danger)]">
            {deleteError}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={safeRef}
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="min-h-[44px] border border-[var(--border-subtle)] px-4 py-2.5 text-[11px] uppercase tracking-[1.6px] text-[var(--platinum-dim)] transition-colors hover:text-[var(--platinum)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-60"
          >
            {state.phase === "confirm" ? "Keep listing" : "Close"}
          </button>

          {/* ⚠ Exists only on the confirm phase, and only once a reason is
              chosen. Never rendered beside a blocker. */}
          {state.phase === "confirm" && (
            <button
              type="button"
              disabled={deleting || !reasonCode}
              onClick={confirmDelete}
              className="min-h-[44px] border border-[var(--lc-rejected-line)] px-4 py-2.5 text-[11px] uppercase tracking-[1.6px] text-[var(--lc-rejected-badge)] transition-colors hover:bg-[rgba(190,86,80,0.08)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Delete listing permanently"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
