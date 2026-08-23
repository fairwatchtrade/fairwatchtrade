"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CurationSummary } from "@/lib/curationReview";

/* ════════════════════════════════════════════════════════════════════════
   CURATION REVIEW CARD — "Double-check this listing"

   The third quiet card in the listing rail, between Dealer Information and
   Purchase Request: dealer identity → curation utility → transaction. It is
   trust-adjacent, not a warning and not a sales control, so it wears the
   rail's ordinary card language and nothing louder.

   ── THREE STATES, AND ONE OF THEM IS PRIVATE ───────────────────────────
   · no completed review, and this viewer has not asked → the invitation;
   · this viewer has a request underway → "Review requested", REQUESTER-ONLY
     by founder ruling. Nobody else may learn a listing is being checked, so
     a request can never be used to shade a competitor's watch;
   · a completed review exists → the public Curation Review, shown to
     everyone, with no repeat CTA inside it.

   ── WHAT IT MAY SAY ────────────────────────────────────────────────────
   Only the server-composed public summary. No provider names, no scores, no
   raw evidence, no accusation. A clean result is short. The absence of a
   review is not a mark against a listing, and the presence of a request is
   not evidence about the watch.
   ════════════════════════════════════════════════════════════════════════ */

const KICKER = "text-[11px] uppercase tracking-[1.4px] text-[var(--gold-dim)]";
const CARD = "border border-[var(--border-gold)] px-[18px] pb-[18px] pt-[18px]";

export default function CurationReviewCard({
  listingId,
  signedIn,
  initialState,
  summary,
}: {
  listingId: string;
  signedIn: boolean;
  /** "none" · "pending" (this viewer's own) · "completed" (public). */
  initialState: "none" | "pending" | "completed";
  summary: CurationSummary | null;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request() {
    if (busy) return;
    if (!signedIn) {
      /* The established callback style — sign in, come straight back to the
         watch you were looking at. No new auth behavior. */
      router.push(`/login?callbackUrl=${encodeURIComponent(`/listings/${listingId}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    /* Requester-only pending shows immediately: the collector should see
       their own request the moment they make it, not after a round trip. */
    setState("pending");
    try {
      const res = await fetch(`/api/listings/${listingId}/curation-request`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        state?: string;
        detail?: string;
        error?: string;
      };
      if (!res.ok) {
        setState(initialState);
        setError(data.detail || "That didn't go through. Please try again.");
      } else {
        setState(data.state === "completed" ? "completed" : "pending");
        router.refresh();
      }
    } catch {
      setState(initialState);
      setError("Network trouble — the review was not requested.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "completed" && summary) {
    return (
      <section className={CARD} aria-label="Curation Review">
        <div className={KICKER}>Curation Review</div>
        <dl className="mt-3 space-y-1.5">
          {summary.categories.map((c) => (
            <div key={c.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-[12px] text-[var(--muted)]">{c.label}</dt>
              <dd
                className={`text-right text-[12px] ${
                  c.verdict === "Consistent"
                    ? "text-[var(--platinum-dim)]"
                    : "text-[var(--gold)]"
                }`}
              >
                {c.verdict}
              </dd>
            </div>
          ))}
        </dl>
        {summary.comments && (
          <p className="mt-3 border-t border-[var(--border-faint)] pt-3 text-[12px] leading-relaxed text-[var(--muted)]">
            {summary.comments}
          </p>
        )}
        <p className="mt-2 text-[10px] uppercase tracking-[1.2px] text-[var(--ghost)]">
          Updated{" "}
          {new Date(summary.updated).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </section>
    );
  }

  if (state === "pending") {
    return (
      <section className={CARD} aria-label="Curation review requested">
        <div className={KICKER}>Curation Review</div>
        <p className="mt-3 text-[13px] text-[var(--platinum-dim)]">Review requested</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
          We&rsquo;ll post the result here when the review is complete.
        </p>
      </section>
    );
  }

  return (
    <section className={CARD} aria-label="Request a curation review">
      <div className={KICKER}>Curation Review</div>
      <button
        type="button"
        onClick={request}
        disabled={busy}
        className="mt-3 block w-full border border-[var(--border-mid)] px-3 py-2 text-center text-[11px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] transition hover:border-[var(--border-gold)] hover:text-[var(--gold)] disabled:opacity-40"
      >
        {busy ? "Requesting…" : "Double-check this listing"}
      </button>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
        Ask FairWatchTrade to re-check this listing&rsquo;s details, photographs and reference.
      </p>
      {error && <p className="mt-2 text-[12px] text-[var(--danger)]">{error}</p>}
    </section>
  );
}
