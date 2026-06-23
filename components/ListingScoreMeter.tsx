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
   homepage shows the listing, never this number. */

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
    <div className="rounded-lg border border-white/10 bg-[#13151C] p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] font-medium text-[#E8E4DC]">
          Listing strength
        </div>
        <div className="text-[12px] text-[#8A8F9E]">{score.tier}</div>
      </div>

      {/* Headline combined number */}
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-[28px] font-semibold leading-none text-[#E8E4DC] tabular-nums">
          {score.combined}
        </div>
        <ListingScoreHelp score={score.combined} />
        <div className="text-[12px] text-[#8A8F9E]">
          {score.significance} significance
          <span className="text-[#C9A84C]">
            {" "}
            + {score.completeness} effort
          </span>
        </div>
      </div>

      {/* Completeness meter — the part that climbs */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.round(ratio * 100)}%`,
            background: barColor(ratio),
          }}
        />
      </div>
      <div className="mt-1 text-[11px] text-[#8A8F9E]">
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
                className={item.done ? "text-[#E8E4DC]" : "text-[#8A8F9E]"}
              >
                {item.label}
              </span>
              {!item.done && (
                <span className="text-[#8A8F9E]"> — {item.hint}</span>
              )}
              <span className="ml-1 text-[11px] text-[#8A8F9E] tabular-nums">
                ({item.earned}/{item.max})
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
