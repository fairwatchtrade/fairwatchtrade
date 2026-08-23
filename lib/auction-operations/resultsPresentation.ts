/* ════════════════════════════════════════════════════════════════════════
   AUCTION RESULTS — PRESENTATION TRUTH — lib/auction-operations/resultsPresentation.ts

   Pure derivations shared by the server read model and the client room.
   No I/O, no service imports — safe in client components.

   IDENTITY STATE, derived from exact current-resolution truth:
     No lots     — the sale has no lot rows (a truthful empty state, never
                   dressed up as Resolved).
     No cases    — lots exist, no identity case exists for any of them.
     Resolved    — every lot carries a CURRENT exact decision whose stored
                   fingerprint still matches the canonical claim fingerprint.
     Partial     — some but not all lots are fresh-exact.
     Unresolved  — cases or decisions exist but no lot is fresh-exact.

   A STALE EXACT DECISION IS NOT RESOLVED. Freshness comes from the one
   canonical fingerprint function inside Postgres; this module only labels
   what that computation already established.
   ════════════════════════════════════════════════════════════════════════ */

export type ResultsSaleRow = {
  sale_id: string;
  sale_name: string;
  sale_date: string | null;
  location: string | null;
  source_url: string | null;
  house_name: string;
  artifact_count: number;
  permission_statuses: string[];
  publication_statuses: string[];
  public_use_scopes: string[];
  retention_scopes: string[];
  lot_count: number;
  current_result_count: number;
  sold_count: number;
  passed_count: number;
  withdrawn_count: number;
  unsold_count: number;
  priced_result_count: number;
  case_count: number;
  fresh_exact_count: number;
  fresh_nonexact_count: number;
  stale_decision_count: number;
  no_case_count: number;
};

export type IdentityState = "no_lots" | "no_cases" | "resolved" | "partial" | "unresolved";

export function identityStateOf(row: ResultsSaleRow): IdentityState {
  if (row.lot_count === 0) return "no_lots";
  if (row.case_count === 0 && row.stale_decision_count === 0) return "no_cases";
  if (row.fresh_exact_count === row.lot_count) return "resolved";
  if (row.fresh_exact_count > 0) return "partial";
  return "unresolved";
}

export const IDENTITY_LABELS: Record<IdentityState, string> = {
  no_lots: "No lots",
  no_cases: "No cases",
  resolved: "Resolved",
  partial: "Partial",
  unresolved: "Unresolved",
};

/** Operational severity rank for the identity sort: the most unfinished
    work first. */
export const IDENTITY_RANK: Record<IdentityState, number> = {
  unresolved: 0,
  partial: 1,
  no_cases: 2,
  no_lots: 3,
  resolved: 4,
};

/* Evidence column: artifact count plus the literal stored states — never a
   vague "Source held". Retention truth is metadata_only unless the rows
   really say otherwise. */
export function evidenceSummaryOf(row: ResultsSaleRow): string {
  if (row.artifact_count === 0) return "No source artifacts";
  const states = [...new Set([...row.publication_statuses, ...row.retention_scopes])].sort();
  return `${row.artifact_count} artifact${row.artifact_count === 1 ? "" : "s"} · ${states.join(" · ")}`;
}

export type ResultsSort =
  | "date_desc"
  | "date_asc"
  | "house_asc"
  | "sale_asc"
  | "lots_desc"
  | "identity";

export const RESULTS_SORTS: { key: ResultsSort; label: string }[] = [
  { key: "date_desc", label: "Newest sale first" },
  { key: "date_asc", label: "Oldest sale first" },
  { key: "house_asc", label: "Auction house A–Z" },
  { key: "sale_asc", label: "Sale title A–Z" },
  { key: "lots_desc", label: "Most lots first" },
  { key: "identity", label: "Identity work first" },
];

/* Every comparator ends on sale_id so ordering is total and stable —
   identical rows can never swap between renders. */
export function sortResultsRows(rows: ResultsSaleRow[], sort: ResultsSort): ResultsSaleRow[] {
  const byId = (a: ResultsSaleRow, b: ResultsSaleRow) => a.sale_id.localeCompare(b.sale_id);
  const date = (r: ResultsSaleRow) => (r.sale_date ? Date.parse(r.sale_date) : null);
  const copy = [...rows];
  switch (sort) {
    case "date_asc":
      return copy.sort((a, b) => {
        const da = date(a), db = date(b);
        if (da === null && db === null) return byId(a, b);
        if (da === null) return 1; // nulls last in both directions
        if (db === null) return -1;
        return da - db || byId(a, b);
      });
    case "house_asc":
      return copy.sort(
        (a, b) =>
          a.house_name.localeCompare(b.house_name, undefined, { sensitivity: "base" }) ||
          (date(b) ?? 0) - (date(a) ?? 0) ||
          byId(a, b)
      );
    case "sale_asc":
      return copy.sort(
        (a, b) =>
          a.sale_name.localeCompare(b.sale_name, undefined, { sensitivity: "base" }) ||
          (date(b) ?? 0) - (date(a) ?? 0) ||
          byId(a, b)
      );
    case "lots_desc":
      return copy.sort((a, b) => b.lot_count - a.lot_count || byId(a, b));
    case "identity":
      return copy.sort(
        (a, b) =>
          IDENTITY_RANK[identityStateOf(a)] - IDENTITY_RANK[identityStateOf(b)] ||
          b.stale_decision_count + (b.lot_count - b.fresh_exact_count) -
            (a.stale_decision_count + (a.lot_count - a.fresh_exact_count)) ||
          (date(b) ?? 0) - (date(a) ?? 0) ||
          byId(a, b)
      );
    default:
      return copy.sort((a, b) => {
        const da = date(a), db = date(b);
        if (da === null && db === null) return byId(a, b);
        if (da === null) return 1;
        if (db === null) return -1;
        return db - da || byId(a, b);
      });
  }
}

/* ── Upcoming Auctions sorting (same stable-tie law) ────────────────────── */

export type UpcomingRow = {
  id: string;
  auction_house: string;
  auction_title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  source_url: string | null;
  preview_url: string | null;
  catalog_url: string | null;
  online_only: boolean | null;
  updated_at: string;
};

export type UpcomingSort = "start_asc" | "house_asc" | "house_desc" | "location_asc" | "status";

export const UPCOMING_SORTS: { key: UpcomingSort; label: string }[] = [
  { key: "start_asc", label: "Soonest start first" },
  { key: "house_asc", label: "Auction house A–Z" },
  { key: "house_desc", label: "Auction house Z–A" },
  { key: "location_asc", label: "Location A–Z" },
  { key: "status", label: "Live · Upcoming · Past" },
];

export type UpcomingStatus = "live" | "upcoming" | "past";

/** Shared time-derived status — mirrors lib/auctions statusOf() semantics:
    visibility is computed from the dates, never stored. */
export function upcomingStatusOf(row: UpcomingRow, now: number): UpcomingStatus {
  const start = Date.parse(row.starts_at);
  const end = row.ends_at ? Date.parse(row.ends_at) : start + 24 * 60 * 60 * 1000;
  if (now >= start && now <= end) return "live";
  return now < start ? "upcoming" : "past";
}

const STATUS_RANK: Record<UpcomingStatus, number> = { live: 0, upcoming: 1, past: 2 };

export function sortUpcomingRows(rows: UpcomingRow[], sort: UpcomingSort, now: number): UpcomingRow[] {
  const copy = [...rows];
  const start = (r: UpcomingRow) => Date.parse(r.starts_at);
  const byStartThenId = (a: UpcomingRow, b: UpcomingRow) =>
    start(a) - start(b) || a.id.localeCompare(b.id);
  switch (sort) {
    case "house_asc":
      return copy.sort(
        (a, b) =>
          a.auction_house.localeCompare(b.auction_house, undefined, { sensitivity: "base" }) ||
          byStartThenId(a, b)
      );
    case "house_desc":
      return copy.sort(
        (a, b) =>
          b.auction_house.localeCompare(a.auction_house, undefined, { sensitivity: "base" }) ||
          byStartThenId(a, b)
      );
    case "location_asc":
      return copy.sort((a, b) => {
        const la = (a.location ?? "").trim();
        const lb = (b.location ?? "").trim();
        if (!la && !lb) return byStartThenId(a, b);
        if (!la) return 1; // blank locations last
        if (!lb) return -1;
        return la.localeCompare(lb, undefined, { sensitivity: "base" }) || byStartThenId(a, b);
      });
    case "status":
      return copy.sort(
        (a, b) =>
          STATUS_RANK[upcomingStatusOf(a, now)] - STATUS_RANK[upcomingStatusOf(b, now)] ||
          byStartThenId(a, b)
      );
    default:
      return copy.sort(byStartThenId);
  }
}
