/* ────────────────────────────────────────────────────────────────────────
   SELL FLOW — the seller's place in the wizard

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Progress is two numbers, so persist two numbers."

   They are not independent. `reached` is the furthest step the seller
   legitimately earned and is what makes earlier steps clickable; `at` is
   only a cursor WITHIN that, wherever they happened to be working. Storing
   them as two loose values invites a restore where the cursor sits beyond
   the progress that justifies it. One object with an enforced invariant
   cannot express that state at all.

   WHY IT LIVES BESIDE THE DRAFT AND NOT INSIDE IT: a listing's content and
   a wizard's position are different facts. ListingDraft is the shape that
   becomes a published listing, and it must not acquire a scroll position.
   The saved envelope is `{ draft, progress }` — siblings, not nested.

   WHY A STORED POSITION IS NEVER TRUSTED: content changes after it is
   written. A seller who reached Details and later removed the photographs
   that got them there has not kept that progress, and restoring them past a
   gate the draft no longer satisfies would be the flow manufacturing
   advancement on their behalf. The caller supplies what the CURRENT draft
   supports — computed from the flow's own gates, never a second opinion —
   and everything clamps to it.
   ──────────────────────────────────────────────────────────────────────── */

/** Curation · Photos · Details · Description · Review. */
export const LAST_STEP = 4;

export type DraftProgress = {
  /** Furthest step legitimately reached. Drives which steps are reachable. */
  reached: number;
  /** Where the seller was working. Always within [0, reached]. */
  at: number;
};

export const FRESH_PROGRESS: DraftProgress = { reached: 0, at: 0 };

function whole(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 0;
}

/**
 * Read a stored position back, clamped so it can never claim more than the
 * draft currently justifies.
 *
 * @param raw       whatever was persisted alongside the draft — untrusted
 * @param supported the furthest step THIS draft's content can support now
 */
export function readProgress(raw: unknown, supported: number): DraftProgress {
  const ceiling = Math.max(0, Math.min(whole(supported), LAST_STEP));
  const o = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const reached = Math.max(0, Math.min(whole(o.reached), ceiling));
  /* The cursor cannot outrun the progress that justifies it, whatever was
     stored — including a hand-edited or half-written envelope. */
  const at = Math.max(0, Math.min(whole(o.at), reached));
  return { reached, at };
}
