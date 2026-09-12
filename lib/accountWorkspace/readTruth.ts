/* ════════════════════════════════════════════════════════════════════════
   READ TRUTH — the four states a client read can honestly be in
   (Account Workspace / LS-4 bounded failure truth, 2026-09-12)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "An empty array is an answer."

   It is not. `[]` is what a room shows when it has ASKED and been told
   there is nothing. A failed fetch that returns `[]` tells the collector
   their requests disappeared, and it tells the seller nobody wants
   anything. Both are lies produced by a catch block.

   This is NOT a new sitewide taxonomy. It is the smallest shared shape
   that lets the Wanted and Trades rooms — the only consumers — express
   the LS-4 categories that already exist:

     loading      · not yet established
     ready        · established truth, fresh
     stale        · established truth, last refresh failed
     unavailable  · never established

   `stale` is the load-bearing one. Once a room has real rows on screen, a
   failed refresh must not erase them: the rows were true when they were
   read, and "we could not check again" is a different statement from
   "they are gone". `applyRead` is the whole rule, in one pure function, so
   every room obeys it identically and no component re-invents it in a
   catch block.
   ════════════════════════════════════════════════════════════════════════ */

/** What one attempt to read something returned. */
export type ReadResult<T> = { ok: true; data: T } | { ok: false };

/** What a room may honestly say about what it holds. */
export type LoadState<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "stale"; data: T }
  | { phase: "unavailable" };

export const LOADING: LoadState<never> = { phase: "loading" };

/** The established data, if any has ever been established. */
export function established<T>(s: LoadState<T>): T | null {
  return s.phase === "ready" || s.phase === "stale" ? s.data : null;
}

/** True only when the room genuinely knows there is nothing. */
export function provenEmpty<T>(s: LoadState<T[]>): boolean {
  return s.phase === "ready" && s.data.length === 0;
}

/**
 * Fold one read result into the room's state.
 *
 * Success always wins and refreshes the data. Failure keeps whatever was
 * already established and marks it stale; with nothing established it is
 * unavailable. Failure NEVER produces an empty success.
 */
export function applyRead<T>(prev: LoadState<T>, result: ReadResult<T>): LoadState<T> {
  if (result.ok) return { phase: "ready", data: result.data };
  const kept = established(prev);
  return kept === null ? { phase: "unavailable" } : { phase: "stale", data: kept };
}

/**
 * Fold a CONFIRMED mutation result into established data, without touching
 * provenance.
 *
 * The server has already answered; that answer is proof. If the refresh
 * that follows then fails, the room must keep showing what it was told,
 * not silently roll back to the row it held before the collector acted.
 * Failed reconciliation may not visually undo a confirmed action.
 */
export function applyConfirmed<T>(prev: LoadState<T>, patch: (data: T) => T): LoadState<T> {
  if (prev.phase === "ready") return { phase: "ready", data: patch(prev.data) };
  if (prev.phase === "stale") return { phase: "stale", data: patch(prev.data) };
  return prev;
}

/** Fetch JSON and report provenance rather than swallowing failure. */
export async function readJson<T>(url: string, pick: (body: unknown) => T | null): Promise<ReadResult<T>> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { ok: false };
    const data = pick(await res.json());
    return data === null ? { ok: false } : { ok: true, data };
  } catch {
    return { ok: false };
  }
}

/* The room copy. Concise, existing FWT failure language: say what could not
   be done, say nothing was lost, offer the retry. */
export const UNAVAILABLE_NOTE = "This could not be loaded just now. Nothing has changed.";
export const STALE_NOTE = "Showing what was last loaded. The latest could not be fetched just now.";
