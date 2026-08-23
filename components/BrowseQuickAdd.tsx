"use client";

import { useEffect, useRef, useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   BROWSE QUICK ADD — the fast-addition surface above the listings

   The Refine rail can collapse and give its width back to the watches. That
   made the collapsed state good at SUBTRACTION — the Active Criteria chips
   above the grid already remove a criterion in one click — and bad at
   ADDITION: adding one common filter meant reopening the whole rail.

   This strip is the missing half. A compact row of high-value categories,
   each opening a small anchored picker of that category's real values.

   ── IT IS NOT A SECOND FILTER SYSTEM ───────────────────────────────────
   Every category here is handed the SAME `facets` array, the SAME `selected`
   Set, and the SAME `onToggle` handler the rail's own FacetGroup receives.
   There is no local filter state in this file — none to drift, none to
   reconcile. A value toggled here and the same value toggled in the rail are
   one act reaching one URL, which is why the rail, the chips and this strip
   cannot disagree about what is filtered.

   Active values are NOT re-listed inside the category button: the Active
   Criteria chips already own that job, and duplicating them turns the
   header into the second rail this design exists to avoid. The button says
   only how many, or which one when there is exactly one.

   The full rail remains the comprehensive system; every picker offers a
   route back into it, and "More" is that route for anything not pinned here.
   ════════════════════════════════════════════════════════════════════════ */

export type QuickAddCategory = {
  key: string;
  title: string;
  /** Already sorted by the caller — the identical array the rail renders. */
  facets: [string, number][];
  selected: Set<string>;
  onToggle: (value: string) => void;
};

/** Values shown inside one picker before the collector is sent to the full
    rail. Quick Add is the frequent path, not the complete one. */
const PICKER_LIMIT = 8;

export default function BrowseQuickAdd({
  categories,
  onOpenRefine,
  refineOpen,
}: {
  categories: QuickAddCategory[];
  onOpenRefine: () => void;
  refineOpen: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /* Escape closes the picker wherever focus sits. */
  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenKey(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openKey]);

  const live = categories.filter((c) => c.facets.length > 0);
  if (live.length === 0) return null;

  return (
    <div
      ref={wrapRef}
      className="relative mt-3 hidden flex-wrap items-center gap-2 md:flex"
    >
      {/* A transparent catcher so clicking away puts the picker down without
          also acting on whatever sits underneath it. */}
      {openKey && (
        <div
          className="fixed inset-0 z-20"
          aria-hidden="true"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpenKey(null);
          }}
        />
      )}

      <span className="text-[10px] uppercase tracking-[1.6px] text-[var(--muted)]">
        Quick add
      </span>

      {live.map((cat) => {
        const count = cat.selected.size;
        const soleValue = count === 1 ? [...cat.selected][0] : null;
        const label =
          count === 0
            ? cat.title
            : soleValue
              ? `${cat.title} · ${soleValue}`
              : `${cat.title} · ${count}`;
        const isOpen = openKey === cat.key;
        return (
          <div key={cat.key} className="relative">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenKey((k) => (k === cat.key ? null : cat.key))}
              className={`max-w-[220px] truncate border px-2.5 py-1 text-[11px] transition ${
                count > 0
                  ? "border-[var(--border-gold)] bg-[var(--gold-whisper)] text-[var(--gold)]"
                  : "border-[var(--border-subtle)] text-[var(--platinum-dim)] hover:border-[var(--border-mid)] hover:text-[var(--platinum)]"
              }`}
            >
              {label}
            </button>

            {isOpen && (
              <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[230px] border border-[var(--border-mid)] bg-[var(--surface-2)] py-1 shadow-lg">
                {cat.facets.slice(0, PICKER_LIMIT).map(([value, n]) => {
                  const on = cat.selected.has(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => cat.onToggle(value)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[12px] transition hover:bg-[var(--gold-whisper)] ${
                        on ? "text-[var(--gold)]" : "text-[var(--platinum-dim)]"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <span aria-hidden="true" className="mr-2">
                          {on ? "✓" : "  "}
                        </span>
                        {value}
                      </span>
                      <span className="shrink-0 text-[10px] text-[var(--muted)]">{n}</span>
                    </button>
                  );
                })}
                {cat.facets.length > PICKER_LIMIT && (
                  <div className="px-3 pb-1 pt-1.5 text-[10px] text-[var(--muted)]">
                    {cat.facets.length - PICKER_LIMIT} more in Refine
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpenKey(null);
                    if (!refineOpen) onOpenRefine();
                  }}
                  className="mt-1 block w-full border-t border-[var(--border-faint)] px-3 py-2 text-left text-[10px] uppercase tracking-[1.2px] text-[var(--gold-dim)] transition hover:text-[var(--gold)]"
                >
                  Open full Refine →
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Everything not pinned above lives in the rail; this is its door. */}
      {!refineOpen && (
        <button
          type="button"
          onClick={onOpenRefine}
          className="border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--platinum-dim)] transition hover:border-[var(--border-mid)] hover:text-[var(--platinum)]"
        >
          More…
        </button>
      )}
    </div>
  );
}
