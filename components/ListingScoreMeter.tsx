"use client";

import { useMemo } from "react";
import {
  scoreListing,
  COMPLETENESS_MAX,
  type ListingState,
} from "@/lib/scoring";
import ListingScoreHelp from "./ListingScoreHelp";

/* The seller's PRIVATE build-meter. Significance is locked at curation and
   shown as the base; completeness is the part that climbs as they add effort.
   The combined number is the headline. Per the product doc, the public
   homepage shows the listing, never this number.

   v1.57: Studio design-system token pass. No logic changes. */

function barColor(ratio: number): string {
  if (ratio >= 0.85) return "#1D9E75"; // green
  if (ratio >= 0.5) return "#C9A84C"; // gold
  return "#8A8F9E"; // slate — early
}

export default function ListingScoreMeter({
  listing,
}: {
  listing: ListingState;
}) {
  const score = useMemo(() => scoreListing(listing), [listing]);
  const ratio = score.completeness / COMPLETENESS_MAX;

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-[2px] text-[var(--slate)]">
          Listing strength
        </div>
        <div className="text-[11px] text-[var(--muted)]">{score.tier}</div>
      </div>

      {/* Headline combined number */}
      <div className="mt-1 flex items-center gap-2">
        <div className="text-[28px] font-light leading-none text-[var(--platinum)] tabular-nums">
          {score.combined}
        </div>
        <ListingScoreHelp
          score={score.combined}
          /* Presentation truth for the guide (SEE-it correction): which
             criteria the CURRENT listing already satisfies, so the guide
             never recommends work that is already done. Read from the same
             score detail and photo tags the meter already renders — nothing
             recomputed, nothing touched in scoring. */
          satisfied={{
            mandatory: score.completenessDetail.items.find((i) => i.key === "mandatory")?.done ?? false,
            wrist: score.completenessDetail.items.find((i) => i.key === "wrist")?.done ?? false,
            movement: score.completenessDetail.items.find((i) => i.key === "movement")?.done ?? false,
            documentation: score.completenessDetail.items.find((i) => i.key === "documentation")?.done ?? false,
            docPhotos: score.completenessDetail.items.find((i) => i.key === "docPhotos")?.done ?? false,
            description: score.completenessDetail.items.find((i) => i.key === "description")?.done ?? false,
            caseback: listing.photoCategories.includes("Caseback"),
          }}
        />
        <div className="text-[11px] text-[var(--muted)]">
          {score.significance} significance
          <span className="text-[var(--gold)]">
            {" "}
            + {score.completeness} effort
          </span>
        </div>
      </div>

      {/* Completeness meter — the part that climbs */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.round(ratio * 100)}%`,
            background: barColor(ratio),
          }}
        />
      </div>
      <div className="mt-1 text-[10px] text-[var(--muted)]">
        {score.completeness} / {COMPLETENESS_MAX} effort points
      </div>

      {/* Checklist */}
      <ul className="mt-3 space-y-1.5">
        {score.completenessDetail.items.map((item) => {
          /* Reconstructable arithmetic (2026-08-22 order): the founder
             added the visible weights and got 20 against a /22 meter,
             and saw a green check over a (1/2). Two display truths fix
             both, using only the item data already here:

               · the CHECK means EARNED === MAX, nothing less. A bucket
                 that awards partial credit (Documentation at Papers
                 Only, Box & papers at 1 of 2) shows a gold half-marker
                 instead — honest progress, never false completion.
               · every row's points have a visible home: full or empty
                 rows show the bucket weight (+N); partially-earned rows
                 show "+earned of max"; Box & papers keeps its real
                 fraction AND now carries its weight beside it, which is
                 the +2 that made the old visible sum 20 instead of 22.

             Scoring is untouched — this is the same data, finally adding
             up in public. */
          const full = item.earned === item.max;
          const partial = item.earned > 0 && !full;
          const isBoxPapers = /box\s*&\s*papers/i.test(item.label);
          return (
            <li key={item.key} className="flex items-start gap-2 text-[12px]">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  full
                    ? "bg-emerald-500 text-black"
                    : partial
                      ? "border border-[var(--gold)] text-[var(--gold)]"
                      : "border border-white/20 text-transparent"
                }`}
              >
                {full ? "✓" : partial ? "·" : "✓"}
              </span>
              <span className="min-w-0">
                <span
                  className={full || partial ? "text-[var(--platinum)]" : "text-[var(--muted)]"}
                >
                  {item.label}
                </span>
                {!full && (
                  <span className="text-[var(--muted)]"> — {item.hint}</span>
                )}
                <span className="ml-1 text-[11px] text-[var(--muted)] tabular-nums">
                  {isBoxPapers
                    ? `(${item.earned}/${item.max}) · +${item.max}`
                    : partial
                      ? `+${item.earned} of ${item.max}`
                      : `+${item.max}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* Destination line — always present, even at score 0. Not a reward.

          It is an INSTRUCTION, not a status claim, and that is the whole point:
          "prepare" is truthful at every state this meter can show, so it needs
          no progress-awareness and no conditional wording. The previous line
          asserted readiness the seller had not earned — it sat directly under
          0/22 effort points, granting the destination for free while the score
          beside it withheld the same thing to encourage wrist shots and extra
          angles. The two contradicted each other in one panel.

          "Almost ready" was considered and rejected: it is still a status
          claim, only hedged, so it keeps a truth condition that can drift.

          The meter can NEVER mean ready. Its 22 points are photographs,
          documentation and description only — Step III's details are a
          separate requirement it does not score — so a seller at 22/22 still
          has work left. Do not later "fix" this to read ready at full score.

          THE CLOSING LINE IS NOT THIS LINE. "Your watch is ready for its next
          collector." is the founder-locked arrival, and it stays exactly where
          the Soul places it, on the review/publish moment in ReviewStep. This
          is the build tool asking for the work; that is the acknowledgement
          once the work is done. Same destination phrase, imperative here and
          declarative there — the seller completes the sentence by doing it. */}
      <div className="mt-5 border-t border-[var(--border-faint)] pt-4 text-center">
        <p className="font-display text-[13px] font-light italic text-[var(--muted)]">
          Prepare your watch for its next collector.
        </p>
      </div>
    </div>
  );
}
