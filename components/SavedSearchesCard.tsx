"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  bumpAndHref,
  fetchRankedSavedSearches,
  type SavedSearchRow,
} from "@/lib/savedSearches";

/* ────────────────────────────────────────────────────────────────────────
   SAVED SEARCHES CARD — components/SavedSearchesCard.tsx  (v2.25a)

   The buyer dashboard's Saved Searches management home — its own top-level
   card in the right rail, FIRST position (approved placement ruling).

   THE SEPARATION LAW (chain ruling, load-bearing): Saved Watches and Saved
   Searches are completely different product functions that only sound
   alike. Saved Watches stays byte-untouched in the left watch-imagery
   column; THIS card is an independent, text-based criteria surface —
   no imagery, no availability, no listing actions, nothing borrowed from
   watch-card presentation, never merged/stacked/nested/grouped with the
   watch collection.

   Contents, exactly and only (ruling): its own heading · every user-named
   saved search · reopen · quiet Remove · an honest empty state. Reopen and
   the usage bump come from lib/savedSearches.ts, shared with the Drawer's
   quick links so the two surfaces cannot drift. Removal is the ONLY
   management verb (no edit/rename — not ruled in anywhere yet), styled
   quiet: the destructive verb never competes with the search names.

   ARRIVAL: the Drawer footer links /catalogue?savedSearches=true — that
   param resolves directly to this card (scroll-into-view + brief gold
   ring), never to a second destination.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

export default function SavedSearchesCard() {
  const [rows, setRows] = useState<SavedSearchRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await fetchRankedSavedSearches();
      if (!cancelled) {
        setRows(all);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Footer arrival — ?savedSearches=true resolves directly to this card.
  useEffect(() => {
    if (searchParams.get("savedSearches") === "true" && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      setArrived(true);
      const t = setTimeout(() => setArrived(false), 2600);
      return () => clearTimeout(t);
    }
  }, [searchParams, loaded]);

  async function reopen(search: SavedSearchRow) {
    router.push(await bumpAndHref(search));
  }

  async function remove(search: SavedSearchRow) {
    if (removingId) return;
    setRemovingId(search.id);
    setError(null);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("saved_searches")
      .delete()
      .eq("id", search.id);
    if (delErr) {
      console.error("[FairWatchTrade] Remove saved search failed:", delErr);
      setError("That didn't work. Please try again.");
      setRemovingId(null);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== search.id));
    setRemovingId(null);
  }

  return (
    <div
      ref={cardRef}
      id="saved-searches"
      className={`border px-4 py-5 transition-shadow duration-500 ${
        arrived
          ? "border-[var(--border-gold)] shadow-[0_0_0_1px_rgba(201,168,76,0.25)]"
          : "border-[var(--border-subtle)]"
      }`}
    >
      <div className="mb-3 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
        Saved Searches
      </div>

      {!loaded || rows.length === 0 ? (
        <div className="font-display text-[12px] italic leading-[1.6] text-[var(--ghost)]">
          Save a search on Browse and it will live here.
        </div>
      ) : (
        <div>
          {rows.map((s) => (
            <div
              key={s.id}
              className="group flex min-w-0 items-center justify-between gap-2 border-b border-[rgba(232,226,214,0.06)] py-2 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => reopen(s)}
                className="min-w-0 flex-1 text-left font-display text-[12.5px] font-light leading-[1.35] text-[var(--platinum-dim)] transition hover:text-[var(--gold)] [overflow-wrap:anywhere]"
              >
                {s.name}
              </button>
              <button
                type="button"
                onClick={() => remove(s)}
                disabled={removingId === s.id}
                className="shrink-0 text-[8px] uppercase tracking-[1.5px] text-[var(--ghost)] opacity-60 transition hover:text-[var(--danger)] hover:opacity-100 disabled:cursor-wait"
              >
                {removingId === s.id ? "…" : "Remove"}
              </button>
            </div>
          ))}
          {error && (
            <div className="mt-2 text-[10px] text-[var(--danger)]">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
