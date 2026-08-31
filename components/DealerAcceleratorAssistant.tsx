"use client";

import { useState } from "react";
import FounderAssistant from "@/components/FounderAssistant";

/* ────────────────────────────────────────────────────────────────────────
   DEALER ACCELERATOR — Assistant bridge

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The review page is a server component, so the Assistant will have to
      look the queue up itself."

   That is exactly the substitution the source-of-"here" contract forbids. A
   server component cannot hand a function to a client one, so the ROWS THE
   PAGE RENDERED are passed down as data and this bridge closes over them.
   The Assistant therefore sees the same queue the founder is reading —
   including its ordering, which is oldest-first because the thing that has
   waited longest is the thing that needs attention most — rather than a
   second query that would drift the moment the page changed.

   This component adds no capability of its own. It mounts the shared
   Assistant, and Dealer Accelerator is Tier A: SEE, EXPLAIN, CONTINUE, and
   no governed action. The room decides nothing, which is why the affordance
   sits beside the queue rather than beside any row's Open Review control.
   ──────────────────────────────────────────────────────────────────────── */

export type DealerQueueRow = {
  id: string;
  code: string | null;
  dealer: string;
  watch: string;
  reference: string | null;
  waitingSince: string | null;
  confirmations: number | null;
};

export default function DealerAcceleratorAssistant({ rows }: { rows: DealerQueueRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-8">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-[var(--border-gold)] px-4 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)]"
        >
          Ask about this intake
        </button>
      ) : (
        <div className="border border-[var(--border-mid)]">
          <FounderAssistant
            room="dealer_accelerator"
            /* No single record is "selected" in a queue. The room is the
               queue itself, so listingId carries the first waiting row purely
               as an anchor candidate and the context below is the real
               statement of what is on screen. */
            listingId={rows[0]?.id ?? ""}
            onClose={() => setOpen(false)}
            getRoomContext={() => ({
              /* Exactly what the list above rendered, in the order it
                 rendered them — oldest first. */
              visibleIds: rows.map((r) => r.id),
              selectedId: null,
              view: "pending_review",
              subview: "dealer_import",
              filters: { provenance: "dealer_import", status: "pending_review" },
              search: null,
              sort: "waiting_longest_first",
              page: 1,
              pageSize: rows.length,
              counts: {
                waiting: rows.length,
                without_recorded_confirmations: rows.filter((r) => r.confirmations === null).length,
              },
              /* The room's own reason a row wants attention. A submission
                 with no recorded confirmations predates server-enforced
                 attestation and is worth noticing — the page already says
                 so, so the Assistant is told rather than left to infer it. */
              attention: Object.fromEntries(
                rows
                  .filter((r) => r.confirmations === null)
                  .map((r) => [r.id, ["no recorded dealer confirmations on this submission"]])
              ),
              exactMatch: null,
            })}
          />
        </div>
      )}
    </div>
  );
}
