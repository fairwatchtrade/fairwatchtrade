/* ════════════════════════════════════════════════════════════════════════
   INTEGRITY COVERAGE — lib/integrityCoverage.ts

   The one truthful way to answer "what did a provider actually do on this
   listing right now?" — shared by every Founder Review coverage summary.

   Raw provider-result rows cannot be counted directly: real production
   history holds old inactive system_upload attempts beside newer active
   admin_recheck attempts for the same photograph, plus unavailable attempts
   that are never deactivated. Counting rows produces nonsense like
   "22 results" for 11 photographs. Current truth is per PHOTOGRAPH, and
   one row speaks for each photograph:

     · the active completed attempt when one exists (is_active = true is
       the hard rule — history informs audit, never the current summary);
     · otherwise the latest attempt of any kind, which can only ever read
       as pending/unavailable — a deactivated or failed attempt is NOT a
       current check and must never be dressed as one.

   Three execution truths stay distinct, by ruling:
     1 checked (clean or finding)   — a current active completed attempt;
     2 eligible but unavailable     — attempted, did not complete;
     3 not eligible                 — intentionally not examined (wrong
       category for the provider, dealer-import launch exclusion).
   A provider that did not run is not clean. A photograph that was not
   eligible is not unavailable.

   Pure functions only — no I/O, no imports. Pinned by
   scripts/integrity-coverage.test.mjs.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/** The columns the speaking-row rule needs; callers pass their fuller row
    types and get the same object back. */
export type SpeakingRowInput = {
  execution_status: string;
  classification: string | null;
  is_active: boolean;
  attempt_number: number | null;
};

/** The row that speaks for one photograph: the active completed attempt if
    one exists, else the latest attempt of any kind. `rows` must already be
    scoped to a single photograph's rows (any order). */
export function pickSpeakingRow<T extends SpeakingRowInput>(rows: T[]): T | null {
  const sorted = [...rows].sort(
    (a, b) => (b.attempt_number ?? 0) - (a.attempt_number ?? 0)
  );
  return (
    sorted.find((r) => r.execution_status === "completed" && r.is_active === true) ??
    sorted[0] ??
    null
  );
}

export type CoverageState =
  | "finding"
  | "clean"
  | "unavailable"
  | "pending"
  | "not_eligible";

/** Map one speaking row to its coverage state. Only an ACTIVE completed
    attempt counts as checked; an inactive completed row (deactivated and
    never replaced) reads unavailable, because the current pass it belonged
    to no longer stands. */
export function speakingCoverageState(
  row: SpeakingRowInput | null
): Exclude<CoverageState, "not_eligible"> {
  if (!row) return "pending";
  if (row.execution_status === "completed" && row.is_active === true) {
    return row.classification === "passed" ? "clean" : "finding";
  }
  return row.execution_status === "pending" ? "pending" : "unavailable";
}

export type ProviderCoverage = {
  /** Photographs this provider is meant to examine. */
  eligible: number;
  /** Eligible photographs with a current active completed attempt. */
  checked: number;
  findings: number;
  clean: number;
  unavailable: number;
  /** Eligible photographs with no attempt at all (or one still pending). */
  pending: number;
  notEligible: number;
};

/** One state per photograph in, honest counts out. */
export function composeProviderCoverage(states: CoverageState[]): ProviderCoverage {
  const c: ProviderCoverage = {
    eligible: 0,
    checked: 0,
    findings: 0,
    clean: 0,
    unavailable: 0,
    pending: 0,
    notEligible: 0,
  };
  for (const s of states) {
    if (s === "not_eligible") {
      c.notEligible += 1;
      continue;
    }
    c.eligible += 1;
    if (s === "finding") {
      c.findings += 1;
      c.checked += 1;
    } else if (s === "clean") {
      c.clean += 1;
      c.checked += 1;
    } else if (s === "unavailable") {
      c.unavailable += 1;
    } else {
      c.pending += 1;
    }
  }
  return c;
}

/** True when the summary alone is the whole current story: everything
    eligible was checked and nothing raised its hand. */
export function isFullyClean(c: ProviderCoverage): boolean {
  return (
    c.eligible > 0 &&
    c.checked === c.eligible &&
    c.findings === 0 &&
    c.unavailable === 0 &&
    c.pending === 0
  );
}

/** The founder-facing coverage sentence:
    "11 of 11 eligible photos checked · 0 findings · 0 unavailable"
    Finding noun is per-provider ("contradiction" for identity consistency).
    Pending appears only when it exists — silence about a truth that is
    zero, honesty about one that is not. */
export function coverageLine(
  c: ProviderCoverage,
  findingNoun: [singular: string, plural: string] = ["finding", "findings"]
): string {
  const photoNoun = c.eligible === 1 ? "photo" : "photos";
  const noun = c.findings === 1 ? findingNoun[0] : findingNoun[1];
  const parts = [
    `${c.checked} of ${c.eligible} eligible ${photoNoun} checked`,
    `${c.findings} ${noun}`,
    `${c.unavailable} unavailable`,
  ];
  if (c.pending > 0) parts.push(`${c.pending} pending`);
  return parts.join(" · ");
}
