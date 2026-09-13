"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import HelpBubble from "@/components/HelpBubble";
import {
  curationDisplay,
  REVIEW_SCOPE_EXPLANATION,
  type CurationSummary,
} from "@/lib/curationReview";

/* ════════════════════════════════════════════════════════════════════════
   CURATION REVIEW — the invited trust window

   ── THE MISCONCEPTION THIS HEADER EXISTS TO KILL ───────────────────────
   "Curation is a card in the rail." It is not, any more. It is a COMPACT
   DOORWAY whose full contents live in the governed Help Bubble, and it sits
   LAST in the rail on purpose.

   Founder ruling 2026-09-12. The desktop rail must read as one commercial
   sentence — seller identity → price/action → conversation — and Curation
   used to sit in the middle of it, between Dealer Information and Purchase
   Request, holding a full review report open permanently. Important
   supporting evidence was interrupting the thing it supports. The rail order
   is now:

     Seller Information → Purchase Request → Ask the Seller → Curation Review

   and that order is composed by app/listings/[id]/page.tsx, NOT here: this
   component is rendered after `#rail-ask-slot` so that when the Ask-the-
   Seller composer grows with a real conversation, Curation moves down with
   it in normal flow. It must never be absolutely positioned to hold a
   vertical coordinate.

   ── THREE STATES, AND ONE OF THEM IS PRIVATE ───────────────────────────
   · no completed review, and this viewer has not asked → the invitation;
   · this viewer has a request underway → "Review requested", REQUESTER-ONLY
     by founder ruling. Nobody else may learn a listing is being checked, so
     a request can never be used to shade a competitor's watch;
   · a completed review exists → the public Curation Review, shown to
     everyone, with no repeat CTA inside it.

   Presentation moved. TRUTH DID NOT. The completed review is still derived
   at read time from the stored verdicts through `curationDisplay`, the scope
   explanation is still the locked `REVIEW_SCOPE_EXPLANATION`, pending is
   still requester-only, and there is still exactly ONE request function.

   ── WHAT THE RESTING SURFACE MAY SAY ───────────────────────────────────
   The completed state shows the DERIVED LEAD, not a new short vocabulary of
   its own. A "Review available" summary would have been friendlier and would
   have collapsed concern, unresolved and mixed verdicts into something
   reassuring — the exact lie GRS-010 was written to stop. If the review has
   a reservation, the resting line carries it.

   The `none` state stays silent. The absence of a review is not evidence
   about a watch, so it gets a doorway and no sentence.
   ════════════════════════════════════════════════════════════════════════ */

const KICKER = "text-[11px] uppercase tracking-[1.4px] text-[var(--gold-dim)]";
const CARD =
  "relative border border-[var(--border-gold)] px-[18px] pb-[18px] pt-[18px]";

/* The bubble opens LEFTWARD, into the page. Anchored to the card's right
   edge it extends back across the watch room — which this flight explicitly
   permits it to overlay — instead of reaching for the viewport edge beyond
   the rail, where HelpBubble's clamp would have to drag it back. The caret
   tracks the trigger because the card is far wider than the ? within it. */
const BUBBLE =
  "right-0 top-[calc(100%+10px)] w-[min(390px,calc(100vw-24px))] rounded-2xl";
/* The trigger carries a 44/36px touch target that would otherwise set the
   height of a deliberately compact card. The negative margins pull the card
   back to the text's own height WITHOUT shrinking the interaction
   territory — the invisible area around a visually delicate ? is required
   by the Help Bubble Law, so it is preserved and only the layout box is
   reclaimed. */
const TRIGGER = "-my-3 -mr-2";

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
       their own request the moment they make it, not after a round trip.
       Because this one owner drives both the resting line and the bubble,
       a request made while the bubble is OPEN transitions both together and
       the collector keeps their place. */
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

  /* ── COMPLETED — public review ──────────────────────────────────────── */
  if (state === "completed" && summary) {
    /* Robots Readiness GRS-010 (2026-09-09). The summary sentence is DERIVED
       from the stored verdicts at read time through the shared mapper — the
       stored `comments` string is no longer printed. A sentence frozen at
       request time could open "Nothing inconsistent was found" above a row
       that said a category could not be resolved; the verdicts were right
       and the sentence contradicted them. The lead sits ABOVE the findings so
       "See the findings below" is literally true, and an unreadable record
       draws no conclusion at all. */
    const display = curationDisplay(summary);
    return (
      <section className={CARD} aria-label="Curation Review">
        <div className="flex items-start justify-between gap-2">
          <div className={KICKER}>Curation Review</div>
          <HelpBubble
            label="Curation Review"
            historyKey="curation-review"
            title="Curation Review"
            bubbleClassName={BUBBLE}
            triggerClassName={TRIGGER}
            caretTracksTrigger
          >
            <div className="text-[13px] leading-[1.5] text-[var(--muted)]">
              <p className="text-[var(--slate)]">{display.lead}</p>
              {display.findings.length > 0 && (
                <dl className="mt-3 space-y-1.5 border-t border-[var(--border-faint)] pt-3">
                  {display.findings.map((c) => (
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
              )}
              {/* Locked scope explanation (GRS-004). Its last sentence is
                  true only because the limits and unresolved findings render
                  above it. */}
              <p className="mt-3 border-t border-[var(--border-faint)] pt-3 text-[12px] leading-relaxed text-[var(--muted)]">
                {REVIEW_SCOPE_EXPLANATION}
              </p>
              <p className="fw-transaction-fact mt-2 uppercase text-[var(--muted)]">
                Updated{" "}
                {new Date(summary.updated).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </HelpBubble>
        </div>
        {/* The derived lead is the resting truth. It is the only sentence
            that carries a reservation, so it stays on the page rather than
            hiding behind the ?. */}
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--slate)]">{display.lead}</p>
      </section>
    );
  }

  /* ── PENDING — this viewer's own request, never anyone else's ───────── */
  if (state === "pending") {
    return (
      <section className={CARD} aria-label="Curation review requested">
        <div className="flex items-start justify-between gap-2">
          <div className={KICKER}>Curation Review</div>
          <HelpBubble
            label="Curation Review"
            historyKey="curation-review"
            title="Curation Review"
            bubbleClassName={BUBBLE}
            triggerClassName={TRIGGER}
            caretTracksTrigger
          >
            <p className="text-[13px] leading-[1.5] text-[var(--muted)]">
              We&rsquo;ll post the result here when the review is complete.
            </p>
          </HelpBubble>
        </div>
        <p className="mt-2 text-[13px] text-[var(--platinum-dim)]">Review requested</p>
      </section>
    );
  }

  /* ── NONE — the invitation, and nothing that reads as a verdict ─────── */
  return (
    <section className={CARD} aria-label="Request a curation review">
      <div className="flex items-start justify-between gap-2">
        <div className={KICKER}>Curation Review</div>
        <HelpBubble
          label="Curation Review"
          historyKey="curation-review"
          title="Curation Review"
          bubbleClassName={BUBBLE}
          triggerClassName={TRIGGER}
          caretTracksTrigger
        >
          <div className="text-[13px] leading-[1.5] text-[var(--muted)]">
            <p>
              Ask FairWatchTrade to re-check this listing&rsquo;s details,
              photographs and reference.
            </p>
            <button
              type="button"
              onClick={request}
              disabled={busy}
              className="mt-3 block w-full border border-[var(--border-mid)] px-3 py-2 text-center text-[11px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] transition hover:border-[var(--border-gold)] hover:text-[var(--gold)] disabled:opacity-40"
            >
              {busy ? "Requesting…" : "Double-check this listing"}
            </button>
            {error && <p className="mt-2 text-[12px] text-[var(--danger)]">{error}</p>}
          </div>
        </HelpBubble>
      </div>
    </section>
  );
}
