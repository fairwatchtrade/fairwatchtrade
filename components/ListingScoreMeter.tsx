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
        <ListingScoreHelp score={score.combined} />
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
      <div className="mt-1 text-[10px] text-[var(--ghost)]">
        {score.completeness} / {COMPLETENESS_MAX} effort points
      </div>

      {/* Checklist */}
      <ul className="mt-3 space-y-1.5">
        {score.completenessDetail.items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 text-[12px]">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                item.done
                  ? "bg-emerald-500 text-black"
                  : "border border-white/20 text-transparent"
              }`}
            >
              ✓
            </span>
            <span className="min-w-0">
              <span
                className={item.done ? "text-[var(--platinum)]" : "text-[var(--muted)]"}
              >
                {item.label}
              </span>
              {!item.done && (
                <span className="text-[var(--ghost)]"> — {item.hint}</span>
              )}
              <span className="ml-1 text-[11px] text-[var(--ghost)] tabular-nums">
                ({item.earned}/{item.max})
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* Destination line — always present, even at score 0. Not a reward. */}
      <div className="mt-5 border-t border-[var(--border-faint)] pt-4 text-center">
        <p className="font-display text-[13px] font-light italic text-[var(--muted)]">
          Your watch is ready for its next collector.
        </p>
      </div>
    </div>
  );
}
