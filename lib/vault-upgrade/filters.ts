/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — work-queue filters and status derivation

   Pure functions shared by the room UI and the direct-node tests, so the
   filter counts and select-all-filtered behavior proven in tests are the
   exact code the room runs.
   ──────────────────────────────────────────────────────────────────────── */

import type { AnalysisStatus, CompletionRecord, WorkItem } from "./types.ts";

/**
 * What a queue row shows. A completed file reports its completion outcome;
 * an analyzed-but-not-completed file reports its deterministic status.
 */
export type RowStatus =
  | AnalysisStatus
  | "UPLOADED"
  | "CANDIDATE_READY"
  | "READY_WITH_HUMAN_DECISIONS"
  | "HUMAN_DECISION_REQUIRED"
  | "BLOCKED_PROVIDER_AUTHORIZATION"
  | "FAILED_RETRYABLE";

export type FilterKey =
  | "all"
  | "nochange"
  | "complete"
  | "decisions"
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
  { key: "complete", label: "Candidate ready" },
  { key: "decisions", label: "Needs a decision" },
  { key: "nochange", label: "No change" },
  { key: "ready", label: "Structural only" },
  { key: "research", label: "Research required" },
  { key: "decision", label: "Decision required" },
  { key: "invalid", label: "Invalid" },
  { key: "unsupported", label: "Unsupported" },
  { key: "blocked", label: "Blocked" },
  { key: "duplicate", label: "Duplicate" },
  { key: "staged", label: "Staged" },
];

/**
 * Whether saving this result would throw away work a previous run finished.
 *
 * A retry that fails has not undone the earlier success — the file is still
 * exactly as complete as it was. Writing the failure over it discards the
 * candidate or held work product and then reports the file as failed, which
 * is both a loss and a lie. The failure is still reported to the operator;
 * it simply no longer destroys what it failed to improve on.
 */
export function wouldDiscardCompletedWork(
  existing: CompletionRecord | null,
  incoming: CompletionRecord
): boolean {
  const priorArtifact =
    existing?.candidate ?? existing?.provisionalCandidate ?? null;
  if (!priorArtifact) return false;
  if (incoming.candidate !== null || incoming.provisionalCandidate !== null) {
    return false;
  }
  return (
    incoming.status === "FAILED_RETRYABLE" ||
    incoming.status === "BLOCKED" ||
    incoming.status === "BLOCKED_PROVIDER_AUTHORIZATION"
  );
}

export function rowStatus(item: WorkItem): RowStatus {
  if (item.completion) {
    const status = item.completion.status;
    /* The completion pass and the analyzer name the unchanged case
       differently; the room shows one label for it. */
    return status === "CURRENT_V3_2_NO_CHANGE"
      ? "CURRENT_SPEC_NO_CHANGE"
      : status;
  }
  return item.analysis ? item.analysis.status : "UPLOADED";
}

export function matchesFilter(item: WorkItem, filter: FilterKey): boolean {
  const status = rowStatus(item);
  switch (filter) {
    case "all":
      return true;
    case "nochange":
      return status === "CURRENT_SPEC_NO_CHANGE";
    case "complete":
      return (
        status === "CANDIDATE_READY" ||
        status === "READY_WITH_HUMAN_DECISIONS"
      );
    case "decisions":
      return (
        status === "HUMAN_DECISION_REQUIRED" ||
        status === "READY_WITH_HUMAN_DECISIONS"
      );
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
      return (
        status === "BLOCKED" ||
        status === "ACTIVE_CONTRACT_MISMATCH" ||
        status === "BLOCKED_PROVIDER_AUTHORIZATION" ||
        status === "FAILED_RETRYABLE"
      );
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
  "HUMAN_DECISION_REQUIRED",
  "READY_WITH_HUMAN_DECISIONS",
];

export const BLOCKED_STATUSES: RowStatus[] = [
  "BLOCKED",
  "INVALID_JSON",
  "UNSUPPORTED_SOURCE_FORMAT",
  "AMBIGUOUS_SOURCE_FORMAT",
  "ACTIVE_CONTRACT_MISMATCH",
  "BLOCKED_PROVIDER_AUTHORIZATION",
  "FAILED_RETRYABLE",
];

/** Statuses whose files still have supportable work the room can perform. */
export const COMPLETABLE_STATUSES: RowStatus[] = [
  "RESEARCH_REQUIRED",
  "STRUCTURAL_UPGRADE_READY",
  "DECISION_REQUIRED",
  "BLOCKED",
  "FAILED_RETRYABLE",
  "BLOCKED_PROVIDER_AUTHORIZATION",
];
