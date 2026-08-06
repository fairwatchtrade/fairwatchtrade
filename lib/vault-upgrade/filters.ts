/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — work-queue filters and status derivation

   Pure functions shared by the room UI and the direct-node tests, so the
   filter counts and select-all-filtered behavior proven in tests are the
   exact code the room runs.
   ──────────────────────────────────────────────────────────────────────── */

import type { AnalysisStatus, WorkItem } from "./types.ts";

export type RowStatus = AnalysisStatus | "UPLOADED";

export type FilterKey =
  | "all"
  | "nochange"
  | "ready"
  | "research"
  | "decision"
  | "invalid"
  | "unsupported"
  | "blocked"
  | "duplicate"
  | "staged";

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "nochange", label: "No change" },
  { key: "ready", label: "Ready" },
  { key: "research", label: "Research required" },
  { key: "decision", label: "Decision required" },
  { key: "invalid", label: "Invalid" },
  { key: "unsupported", label: "Unsupported" },
  { key: "blocked", label: "Blocked" },
  { key: "duplicate", label: "Duplicate" },
  { key: "staged", label: "Staged" },
];

export function rowStatus(item: WorkItem): RowStatus {
  return item.analysis ? item.analysis.status : "UPLOADED";
}

export function matchesFilter(item: WorkItem, filter: FilterKey): boolean {
  const status = rowStatus(item);
  switch (filter) {
    case "all":
      return true;
    case "nochange":
      return status === "CURRENT_SPEC_NO_CHANGE";
    case "ready":
      return status === "STRUCTURAL_UPGRADE_READY";
    case "research":
      return status === "RESEARCH_REQUIRED";
    case "decision":
      return status === "DECISION_REQUIRED";
    case "invalid":
      return status === "INVALID_JSON";
    case "unsupported":
      return (
        status === "UNSUPPORTED_SOURCE_FORMAT" ||
        status === "AMBIGUOUS_SOURCE_FORMAT"
      );
    case "blocked":
      return status === "BLOCKED" || status === "ACTIVE_CONTRACT_MISMATCH";
    case "duplicate":
      return item.duplicateUploads.length > 0;
    case "staged":
      return item.staging !== null;
  }
}

/** Filter by status family plus filename/Brand search. */
export function filterWorkItems(
  items: WorkItem[],
  filter: FilterKey,
  search: string
): WorkItem[] {
  const query = search.trim().toLowerCase();
  return items.filter((item) => {
    if (!matchesFilter(item, filter)) return false;
    if (!query) return true;
    return (
      item.sourceFilename.toLowerCase().includes(query) ||
      (item.analysis?.brandName ?? "").toLowerCase().includes(query)
    );
  });
}

export function filterCounts(items: WorkItem[]): Map<FilterKey, number> {
  const counts = new Map<FilterKey, number>();
  for (const f of FILTERS) {
    counts.set(f.key, items.filter((i) => matchesFilter(i, f.key)).length);
  }
  return counts;
}

export const UNRESOLVED_STATUSES: RowStatus[] = [
  "RESEARCH_REQUIRED",
  "DECISION_REQUIRED",
];

export const BLOCKED_STATUSES: RowStatus[] = [
  "BLOCKED",
  "INVALID_JSON",
  "UNSUPPORTED_SOURCE_FORMAT",
  "AMBIGUOUS_SOURCE_FORMAT",
  "ACTIVE_CONTRACT_MISMATCH",
];
