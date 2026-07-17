"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bumpAndHref,
  fetchRankedSavedSearches,
  type SavedSearchRow,
} from "@/lib/savedSearches";

/* ────────────────────────────────────────────────────────────────────────
   SAVED SEARCH QUICK LINKS — components/SavedSearchQuickLinks.tsx  (v2.25)

   The Collector's Drawer's compact saved-search section, built SHARED by
   design: this flight mounts it only in the mobile Drawer (desktop quick
   links are intentionally parked for the next dedicated flight — mounting
   here later is one line, no rework, no orphan risk).

   LOCKED BEHAVIOR (chain ruling, verbatim):
     · up to three quick links, user-assigned names only;
     · ranked by most frequently reopened (open_count DESC);
     · most recent use as tie-breaker (last_opened_at DESC NULLS LAST);
     · newest saved searches only as fallback when usage history is absent
       (created_at DESC — with all counts zero the first two orderings are
       inert and creation order decides);
     · NO edit, rename, notification, pin, or delete controls here;
     · clicking immediately reopens the saved search — /browse?<query>,
       after bumping open_count + last_opened_at (the bump is best-effort:
       a failed bump never blocks the navigation the collector asked for);
     · empty copy: "Save a search to keep quick links here.";
     · footer (populated state only): "View all saved searches".

   A saved search IS a user-named browse query string — browse state lives
   entirely in the URL (recon-verified), so reopening is pure navigation.
   Signed-out and zero-row states both render the empty copy: the Drawer
   never nags about login. RLS (saved_searches_*_own) scopes everything to
   the session user; this component owns no styling opinions beyond the
   approved artifact's saved-section vocabulary, so the Drawer that mounts
   it controls the frame.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

export default function SavedSearchQuickLinks() {
  const [links, setLinks] = useState<SavedSearchRow[]>([]);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // v2.25a — the locked ranking + reopen behavior now live in
      // lib/savedSearches.ts, shared with the dashboard card so the two
      // surfaces cannot drift.
      const rows = await fetchRankedSavedSearches(3);
      if (!cancelled) setLinks(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reopen(search: SavedSearchRow) {
    router.push(await bumpAndHref(search));
  }

  if (links.length === 0) {
    return (
      <p className="py-3 font-display text-[13px] font-light italic leading-[1.5] text-[var(--muted)] max-[470px]:text-[11.5px]">
        Save a search to keep quick links here.
      </p>
    );
  }

  return (
    <div>
      <div className="grid">
        {links.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => reopen(s)}
            className="flex min-w-0 items-center justify-between gap-3 border-b border-[rgba(232,226,214,0.075)] py-2.5 text-left font-display text-[13px] font-light leading-[1.3] text-[var(--platinum-dim)] transition hover:text-[var(--gold)] max-[470px]:text-[11.5px] max-[767px]:py-2 max-[767px]:text-[12px]"
          >
            <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{s.name}</span>
            <span className="shrink-0 font-[Inter] text-[11px] text-[var(--gold)]">&rarr;</span>
          </button>
        ))}
      </div>
      <a
        href="/catalogue?savedSearches=true"
        className="mt-3 inline-block text-[10px] text-[var(--muted)] transition hover:text-[var(--platinum-dim)] max-[470px]:text-[9px]"
      >
        View all saved searches
      </a>
    </div>
  );
}
