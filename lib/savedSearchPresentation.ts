// Relative import (not the @ alias) so the node test harness can execute this
// module directly with type stripping; identical resolution for Next.
import { parseSearch, type SearchState } from "./search/parse.ts";

/* ────────────────────────────────────────────────────────────────────────
   SAVED SEARCH PRESENTATION — lib/savedSearchPresentation.ts

   Pure derivations for the Account Saved Searches surface (DD1). No DOM,
   no Supabase, no side effects — every function here answers one truthful
   presentation question from the stored contract shapes, and every one is
   unit-tested in scripts/saved-searches-surface.test.mjs.

   Customer-facing language only: nothing in this file may emit implementation
   jargon (criterion, query object, watcher, parser, subscription, automation,
   database state). The DD1-approved vocabulary is the boundary.

   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

/** The saved_searches row shape this surface reads. */
export type SavedSearchFullRow = {
  id: string;
  name: string;
  query_string: string;
  search_state: SearchState | null;
  paused: boolean;
  open_count: number;
  last_opened_at: string | null;
  created_at: string;
};

export type SavedMatchRow = {
  id: string;
  saved_search_id: string;
  listing_id: string;
  created_at: string;
};

/** Filter params a Browse query string may carry beside q (v2.60 keys). */
const FILTER_LABELS: [string, string][] = [
  ["brand", "Brand"],
  ["condition", "Condition"],
  ["caseSize", "Case size"],
  ["movement", "Movement"],
  ["beatRate", "Beat rate"],
  ["powerReserve", "Power Reserve"],
  ["caseMaterial", "Case Material"],
  ["dialColor", "Dial Color"],
  ["docs", "Documentation"],
];

/** The collector's original search language — exactly what they typed. */
export function originalSearchText(row: Pick<SavedSearchFullRow, "name" | "query_string">): string {
  const params = new URLSearchParams(row.query_string.replace(/^\?/, ""));
  const q = params.get("q")?.trim();
  return q && q.length > 0 ? q : row.name;
}

/**
 * Interpreted meaning in plain collector language: the stored reviewed
 * meanings when present (the watcher's own vocabulary), else a fresh parse of
 * the query text, plus any manual Refine selections — joined with quiet dots.
 */
export function interpretedMeaning(
  row: Pick<SavedSearchFullRow, "query_string" | "search_state">
): string {
  const parts: string[] = [];
  const params = new URLSearchParams(row.query_string.replace(/^\?/, ""));

  const state: SearchState | null =
    row.search_state ?? (params.get("q") ? parseSearch(params.get("q") ?? "") : null);

  if (state?.code) parts.push("Exact FairWatchTrade listing code");
  else if (state?.reference) parts.push(`Reference: ${state.reference}`);
  else for (const m of state?.meanings ?? []) parts.push(m.label);

  for (const [key, label] of FILTER_LABELS) {
    for (const value of params.getAll(key)) parts.push(`${label}: ${value}`);
  }

  return parts.join(" · ");
}

/** Watching / Paused — the only two customer-facing states. */
export function statusLabel(row: Pick<SavedSearchFullRow, "paused">): "Watching" | "Paused" {
  return row.paused ? "Paused" : "Watching";
}

/**
 * New matches = found since the collector last OPENED this search (the
 * existing open contract: bumpAndHref stamps last_opened_at). Never opened →
 * every match is new. Inspecting matches does not clear this; opening
 * results does — because opening is the contract's own transition.
 */
export function matchCounts(
  row: Pick<SavedSearchFullRow, "last_opened_at">,
  matches: Pick<SavedMatchRow, "created_at">[]
): { total: number; fresh: number } {
  const opened = row.last_opened_at ? Date.parse(row.last_opened_at) : null;
  const fresh =
    opened === null
      ? matches.length
      : matches.filter((m) => Date.parse(m.created_at) > opened).length;
  return { total: matches.length, fresh };
}

/** The DD1 match-count line, truthful per state. */
export function matchCountLabel(counts: { total: number; fresh: number }): string {
  if (counts.total === 0) return "No matches yet";
  if (counts.fresh === 1) return "1 new match";
  if (counts.fresh > 1) return `${counts.fresh} new matches`;
  if (counts.total === 1) return "1 saved match";
  return `${counts.total} matches`;
}

/** The quiet context line beneath the status, per DD1 states. */
export function contextLine(
  row: Pick<SavedSearchFullRow, "paused">,
  counts: { total: number; fresh: number },
  newestMatchAt: string | null
): string {
  if (row.paused) return "Watching is paused. Existing match history remains available.";
  if (counts.total === 0) return "Nothing yet. We’re still watching for your watch.";
  if (counts.fresh > 0 && newestMatchAt) {
    return `Most recent match found ${relativeDay(newestMatchAt)}`;
  }
  return "No new matches since you last opened this search";
}

/** Collector-calm relative day. */
export function relativeDay(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "earlier";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Reopen href — the saved browse query IS the state (never a second engine). */
export function openResultsHref(row: Pick<SavedSearchFullRow, "query_string">): string {
  const qs = row.query_string.replace(/^\?/, "");
  return `/browse${qs ? `?${qs}` : ""}`;
}

/** A matched listing as this surface may truthfully render it. */
export type MatchPresentation = {
  matchId: string;
  listingId: string;
  available: boolean;
  title: string;
  reference: string | null;
  priceText: string | null;
  condition: string | null;
  foundText: string;
  availabilityLabel: "Available" | "No longer available";
  /** Only available listings open — never imply an unavailable one is buyable. */
  href: string | null;
  thumbUrl: string | null;
};

type MatchListing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string | null;
  asking_price: number | null;
  condition: string | null;
  status: string;
  photos?: { photo?: { url?: string }; category?: string }[] | null;
};

export function presentMatch(
  match: SavedMatchRow,
  listing: MatchListing | null
): MatchPresentation {
  const available = Boolean(listing && listing.status === "published");
  const dial = listing?.photos?.find((p) => p?.category === "Dial") ?? listing?.photos?.[0];
  return {
    matchId: match.id,
    listingId: match.listing_id,
    available,
    title: listing ? `${listing.brand}${listing.model ? ` ${listing.model}` : ""}` : "Previously matched watch",
    reference: listing?.reference ?? null,
    priceText:
      available && listing?.asking_price != null
        ? `$${Number(listing.asking_price).toLocaleString("en-US")}`
        : null,
    condition: available ? (listing?.condition ?? null) : null,
    foundText: `Found ${relativeDay(match.created_at)}`,
    availabilityLabel: available ? "Available" : "No longer available",
    href: available ? `/listings/${match.listing_id}` : null,
    thumbUrl: available ? (dial?.photo?.url ?? null) : null,
  };
}
