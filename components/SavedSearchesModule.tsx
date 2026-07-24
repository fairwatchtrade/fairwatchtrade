"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { bumpAndHref } from "@/lib/savedSearches";
import {
  contextLine,
  interpretedMeaning,
  matchCountLabel,
  matchCounts,
  originalSearchText,
  presentMatch,
  statusLabel,
  type MatchPresentation,
  type SavedMatchRow,
  type SavedSearchFullRow,
} from "@/lib/savedSearchPresentation";

/* ────────────────────────────────────────────────────────────────────────
   SAVED SEARCHES — Account module  (DD1, hash-pinned)

   The ledger of what FairWatchTrade is quietly watching for. Real
   authenticated data only (RLS own-row throughout); every state shown is
   derived live from the stored contract — nothing is invented, nothing is
   promotional, and no implementation vocabulary reaches the collector.

   DD1 composition: restrained entries under a hairline list; original
   search language leads in display type; interpreted meaning beneath in
   plain words; Watching/Paused + truthful match counts; one gold primary
   (See matches) and quiet secondary management. Matches reveal IN PLACE
   ("What FairWatchTrade found") without losing position; deletion demands
   the restrained inline confirmation and states, truthfully, that saved
   match history is removed and cannot be undone (the row cascade is real).

   Transient-state law (desktop Escape + Android Back): the topmost open
   state — delete confirmation first, then match panel — closes first, and
   Back never confirms a deletion.

   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

type Entry = {
  row: SavedSearchFullRow;
  matches: SavedMatchRow[];
  presentations: MatchPresentation[] | null; // loaded on first inspection
};

export default function SavedSearchesModule() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [openMatchesId, setOpenMatchesId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const pushedHistory = useRef(false);
  const seeButtons = useRef<Map<string, HTMLButtonElement>>(new Map());
  const deleteButtons = useRef<Map<string, HTMLButtonElement>>(new Map());
  const closeButtons = useRef<Map<string, HTMLButtonElement>>(new Map());
  /* Focus moves AFTER the state change commits — calling .focus() beside
     setState runs before React re-renders and the browser drops it to body
     (caught in evidence: Escape closed the panel but focus never returned).
     The pending target is a ref, not state, so restoring focus never
     schedules a second render. */
  const pendingFocus = useRef<{ kind: "see" | "delete" | "close"; id: string } | null>(null);
  const setFocusTarget = (t: { kind: "see" | "delete" | "close"; id: string }) => {
    pendingFocus.current = t;
  };

  // ── load: own saved searches + own accrued matches (two RLS reads) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setEntries([]);
        return;
      }
      const { data: rows } = await supabase
        .from("saved_searches")
        .select("id,name,query_string,search_state,paused,open_count,last_opened_at,created_at")
        .order("open_count", { ascending: false })
        .order("last_opened_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      const { data: matches } = await supabase
        .from("saved_search_matches")
        .select("id,saved_search_id,listing_id,created_at")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const byteSearch = new Map<string, SavedMatchRow[]>();
      for (const m of (matches ?? []) as SavedMatchRow[]) {
        const list = byteSearch.get(m.saved_search_id) ?? [];
        list.push(m);
        byteSearch.set(m.saved_search_id, list);
      }
      setEntries(
        ((rows ?? []) as SavedSearchFullRow[]).map((row) => ({
          row,
          matches: byteSearch.get(row.id) ?? [],
          presentations: null,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Runs after every open/close commit; consumes the pending target once.
  useEffect(() => {
    const t = pendingFocus.current;
    if (!t) return;
    pendingFocus.current = null;
    const map =
      t.kind === "see" ? seeButtons : t.kind === "delete" ? deleteButtons : closeButtons;
    map.current.get(t.id)?.focus();
  }, [openMatchesId, confirmingId, entries]);

  // ── topmost transient state: confirmation, then match panel ──
  const closeTopmost = useCallback((): boolean => {
    if (confirmingId) {
      const id = confirmingId;
      setConfirmingId(null);
      setFocusTarget({ kind: "delete", id });
      return true;
    }
    if (openMatchesId) {
      const id = openMatchesId;
      setOpenMatchesId(null);
      setFocusTarget({ kind: "see", id });
      return true;
    }
    return false;
  }, [confirmingId, openMatchesId]);

  useEffect(() => {
    const anyOpen = Boolean(confirmingId || openMatchesId);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeTopmost()) e.preventDefault();
    };
    const onPop = () => {
      pushedHistory.current = false;
      // Back closes the topmost transient state and never confirms anything.
      if (closeTopmost() && typeof window !== "undefined") {
        window.history.pushState({ fwtSavedSearches: true }, "");
        pushedHistory.current = true;
      }
    };
    if (anyOpen) {
      document.addEventListener("keydown", onKey);
      window.addEventListener("popstate", onPop);
      if (!pushedHistory.current) {
        window.history.pushState({ fwtSavedSearches: true }, "");
        pushedHistory.current = true;
      }
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [confirmingId, openMatchesId, closeTopmost]);

  // ── match inspection: reveal beneath the entry, in place ──
  const seeMatches = async (entry: Entry) => {
    const id = entry.row.id;
    if (openMatchesId === id) return;
    setOpenMatchesId(id);
    setConfirmingId(null);
    // DD1: focus enters the revealed panel at its Close control.
    setFocusTarget({ kind: "close", id });
    if (entry.presentations) return;
    const supabase = createClient();
    const ids = entry.matches.map((m) => m.listing_id);
    const { data: listings } = ids.length
      ? await supabase
          .from("listings")
          .select("id,brand,model,reference,asking_price,condition,status,photos")
          .in("id", ids)
      : { data: [] };
    const byId = new Map((listings ?? []).map((l) => [l.id, l]));
    setEntries((prev) =>
      (prev ?? []).map((e) =>
        e.row.id === id
          ? {
              ...e,
              presentations: e.matches.map((m) =>
                presentMatch(m, (byId.get(m.listing_id) as never) ?? null)
              ),
            }
          : e
      )
    );
  };

  const closeMatches = (id: string) => {
    setOpenMatchesId((cur) => (cur === id ? null : cur));
    setFocusTarget({ kind: "see", id });
  };

  // ── open results: the existing reopen contract (bump + navigate) ──
  const openResults = async (entry: Entry) => {
    router.push(
      await bumpAndHref({
        id: entry.row.id,
        name: entry.row.name,
        query_string: entry.row.query_string,
      })
    );
  };

  // ── pause / resume: real backend contract, only the affected entry ──
  const togglePause = async (entry: Entry) => {
    const id = entry.row.id;
    const next = !entry.row.paused;
    setBusyId(id);
    setErrorById((p) => ({ ...p, [id]: "" }));
    const supabase = createClient();
    const { error } = await supabase
      .from("saved_searches")
      .update({ paused: next })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      setErrorById((p) => ({ ...p, [id]: "That didn’t save. Please try again." }));
      return;
    }
    setEntries((prev) =>
      (prev ?? []).map((e) => (e.row.id === id ? { ...e, row: { ...e.row, paused: next } } : e))
    );
  };

  // ── delete: restrained inline confirmation; cascade removes history ──
  const confirmDelete = async (entry: Entry) => {
    const id = entry.row.id;
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.from("saved_searches").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      setErrorById((p) => ({ ...p, [id]: "That didn’t delete. Please try again." }));
      return;
    }
    setConfirmingId(null);
    setOpenMatchesId((cur) => (cur === id ? null : cur));
    setEntries((prev) => (prev ?? []).filter((e) => e.row.id !== id));
  };

  // ── render ──
  if (entries === null) {
    return (
      <div className="px-6 py-10 font-display text-[14px] font-light italic text-[var(--muted)]">
        Opening your saved searches…
      </div>
    );
  }

  return (
    <section aria-label="Saved Searches" className="px-6 pb-16 pt-6">
      <div className="mb-6">
        <h3 className="font-display text-[26px] font-light text-[var(--platinum)]">
          Saved Searches
        </h3>
        <p className="mt-2 text-[12px] leading-[1.5] text-[var(--muted)]">
          FairWatchTrade watches quietly for the searches you choose to save.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="border border-[var(--border-subtle)] bg-[var(--surface)] px-5 py-16 text-center">
          <h4 className="font-display text-[22px] font-light text-[var(--platinum)]">
            No saved searches yet.
          </h4>
          <p className="mx-auto mt-3 max-w-[460px] text-[12px] leading-[1.55] text-[var(--muted)]">
            Save a Search from Browse and FairWatchTrade will watch for matching watches.
          </p>
          <button
            type="button"
            onClick={() => router.push("/browse")}
            className="mt-5 min-h-[44px] border border-[var(--border-gold)] bg-[rgba(201,168,76,0.06)] px-5 py-2 text-[10px] uppercase tracking-[2px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.12)]"
          >
            Browse watches
          </button>
        </div>
      ) : (
        <div className="border-t border-[var(--border-subtle)]">
          {entries.map((entry) => {
            const counts = matchCounts(entry.row, entry.matches);
            const status = statusLabel(entry.row);
            const meaning = interpretedMeaning(entry.row);
            const matchesOpen = openMatchesId === entry.row.id;
            const confirming = confirmingId === entry.row.id;
            const newest = entry.matches[0]?.created_at ?? null;
            return (
              <article
                key={entry.row.id}
                className="border-b border-[var(--border-subtle)] py-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="break-words font-display text-[19px] font-light leading-[1.35] text-[var(--platinum)] sm:text-[21px]">
                      {originalSearchText(entry.row)}
                    </div>
                    {meaning && (
                      <div className="mt-[6px] text-[12px] leading-[1.5] text-[var(--muted)]">
                        {meaning}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`border px-[7px] py-[4px] text-[9px] uppercase tracking-[1.5px] ${
                          status === "Watching"
                            ? "border-[rgba(112,192,144,0.32)] text-[var(--success)]"
                            : "border-[var(--border-subtle)] text-[var(--muted)]"
                        }`}
                      >
                        {status}
                      </span>
                      <span
                        className={`text-[12px] ${
                          counts.fresh > 0 ? "text-[var(--gold)]" : "text-[var(--muted)]"
                        }`}
                      >
                        {matchCountLabel(counts)}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-[var(--ghost)]">
                      {contextLine(entry.row, counts, newest)}
                    </div>
                    {errorById[entry.row.id] && (
                      <div className="mt-2 text-[11px] text-[var(--danger)]">
                        {errorById[entry.row.id]}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {counts.total > 0 && (
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) seeButtons.current.set(entry.row.id, el);
                        }}
                        onClick={() => seeMatches(entry)}
                        aria-expanded={matchesOpen}
                        aria-controls={`saved-search-matches-${entry.row.id}`}
                        className="min-h-[44px] border border-[var(--border-gold)] bg-[rgba(201,168,76,0.06)] px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.12)] sm:min-h-[40px]"
                      >
                        {counts.total === 1 ? "See match" : "See matches"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openResults(entry)}
                      className="min-h-[44px] border border-[var(--border-subtle)] px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)] transition hover:text-[var(--platinum-dim)] sm:min-h-[40px]"
                    >
                      Open results
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePause(entry)}
                      disabled={busyId === entry.row.id}
                      className="min-h-[44px] border border-[var(--border-subtle)] px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)] transition hover:text-[var(--platinum-dim)] disabled:opacity-50 sm:min-h-[40px]"
                    >
                      {entry.row.paused ? "Resume" : "Pause"}
                    </button>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) deleteButtons.current.set(entry.row.id, el);
                      }}
                      onClick={() => {
                        setConfirmingId(entry.row.id);
                      }}
                      className="min-h-[44px] px-2 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--ghost)] transition hover:text-[var(--danger)] sm:min-h-[40px]"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* ── accrued matches — revealed in place ── */}
                {matchesOpen && (
                  <div
                    id={`saved-search-matches-${entry.row.id}`}
                    className="mt-4 border border-[var(--border-subtle)] bg-[var(--surface)]"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
                      <h4 className="text-[10px] uppercase tracking-[2px] text-[var(--platinum-dim)]">
                        What FairWatchTrade found
                      </h4>
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) closeButtons.current.set(entry.row.id, el);
                        }}
                        onClick={() => closeMatches(entry.row.id)}
                        className="min-h-[44px] px-2 text-[11px] text-[var(--muted)] transition hover:text-[var(--platinum-dim)] sm:min-h-0"
                      >
                        Close
                      </button>
                    </div>
                    {entry.presentations === null ? (
                      <div className="px-4 py-5 font-display text-[13px] font-light italic text-[var(--muted)]">
                        Gathering what we found…
                      </div>
                    ) : (
                      entry.presentations.map((m) => (
                        <div
                          key={m.matchId}
                          className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-b border-[var(--border-subtle)] px-4 py-3 last:border-b-0 sm:grid-cols-[72px_minmax(0,1fr)_auto]"
                        >
                          <div className="h-[56px] w-[64px] border border-[var(--border-subtle)] bg-[var(--surface-2)] sm:h-[64px] sm:w-[72px]">
                            {m.thumbUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={m.thumbUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="break-words font-display text-[15px] font-light text-[var(--platinum)]">
                              {m.title}
                            </div>
                            <div className="mt-1 text-[11px] leading-[1.4] text-[var(--muted)]">
                              {[m.reference ? `Reference ${m.reference}` : null, m.priceText, m.condition]
                                .filter(Boolean)
                                .join(" · ")}
                              {m.reference || m.priceText || m.condition ? " · " : ""}
                              {m.foundText}
                            </div>
                            <div
                              className={`mt-1 text-[9px] uppercase tracking-[1.5px] ${
                                m.available ? "text-[var(--success)]" : "text-[var(--ghost)]"
                              }`}
                            >
                              {m.availabilityLabel}
                            </div>
                          </div>
                          {m.href && (
                            <a
                              href={m.href}
                              className="col-span-2 mt-1 inline-flex min-h-[44px] items-center justify-center border border-[var(--border-subtle)] px-3 text-[10px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] transition hover:border-[var(--border-gold)] hover:text-[var(--gold)] sm:col-span-1 sm:mt-0 sm:min-h-[40px] sm:self-center"
                            >
                              Open listing
                            </a>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── restrained inline delete confirmation ── */}
                {confirming && (
                  <div className="mt-4 border border-[rgba(224,112,112,0.35)] bg-[rgba(224,112,112,0.04)] px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <p className="text-[12px] leading-[1.5] text-[var(--muted)]">
                      Delete this saved search and its saved match history? This cannot be
                      undone.
                    </p>
                    <div className="mt-3 flex gap-2 sm:mt-0">
                      <button
                        type="button"
                        autoFocus
                        onClick={() => {
                          setConfirmingId(null);
                          setFocusTarget({ kind: "delete", id: entry.row.id });
                        }}
                        className="min-h-[44px] border border-[var(--border-subtle)] px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)] transition hover:text-[var(--platinum-dim)] sm:min-h-[40px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDelete(entry)}
                        disabled={busyId === entry.row.id}
                        className="min-h-[44px] border border-[rgba(224,112,112,0.55)] bg-[rgba(224,112,112,0.08)] px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--danger)] disabled:opacity-50 sm:min-h-[40px]"
                      >
                        Delete saved search
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
