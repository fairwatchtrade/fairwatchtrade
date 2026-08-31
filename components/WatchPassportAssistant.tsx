"use client";

import { useState } from "react";
import FounderAssistant from "@/components/FounderAssistant";

/* ────────────────────────────────────────────────────────────────────────
   WATCH PASSPORT — Assistant bridge

   The Passport page is a server component that composes its projection at
   render time, so this bridge passes down WHICH record is on screen and what
   the page is showing about it. The Assistant then recomposes the projection
   itself from the governed bead — the same composition the page used, with
   no client argument, so page and Assistant cannot drift onto two different
   readers of the same evidence.

   WHAT IS DELIBERATELY NOT PASSED: the composed content. Sending the page's
   rendered timeline down as context would make the Assistant's answer a
   reading of a snapshot rather than of current governed truth, and this room
   above all others must never confuse the two.

   Counts ARE passed, because they are what the founder can see and they let
   the Assistant notice when its own recomposition disagrees with the screen.
   ──────────────────────────────────────────────────────────────────────── */

export default function WatchPassportAssistant({
  beadId,
  timelineCount,
  evidenceCount,
  conflicted,
  identityState,
}: {
  beadId: string;
  timelineCount: number;
  evidenceCount: number;
  conflicted: boolean;
  identityState: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 18 }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            border: "1px solid #2A2F3A",
            background: "transparent",
            color: "#C9A84C",
            padding: "8px 14px",
            fontSize: 11,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Ask about this watch
        </button>
      ) : (
        <div style={{ border: "1px solid #2A2F3A" }}>
          <FounderAssistant
            room="watch_passport"
            listingId={beadId}
            onClose={() => setOpen(false)}
            getRoomContext={() => ({
              /* The subject here is a physical-watch bead, not a listing.
                 The route branches on the room's declared subject so this id
                 is never sent to the listings table. */
              visibleIds: [beadId],
              selectedId: beadId,
              view: identityState,
              subview: conflicted ? "identity_under_review" : "passport",
              filters: {},
              search: null,
              sort: null,
              page: null,
              pageSize: null,
              counts: {
                timeline_chapters_on_screen: timelineCount,
                identifier_evidence_groups_on_screen: evidenceCount,
              },
              attention: conflicted
                ? {
                    [beadId]: [
                      "identity continuity is under review — history from other records is deliberately not combined",
                    ],
                  }
                : {},
              exactMatch: null,
            })}
          />
        </div>
      )}
    </div>
  );
}
