"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* The locked 12-value cluster vocabulary. Single gravitational home per brand. */
const CLUSTERS = [
  "Independent",
  "Heritage Swiss",
  "Japanese",
  "German",
  "British",
  "American",
  "Tool Watches",
  "Dress & Classic",
  "High Complication",
  "Contemporary Independent",
  "Military/Pilot",
  "Dive & Sports",
] as const;

export type ReviewBrand = {
  id: string;
  name: string;
  slug: string | null;
  country_of_origin: string | null;
  cluster_staging: string | null;
  cluster: string | null;
  independent_status: string | null;
  cluster_reviewed: boolean | null;
};

type Filter = "unreviewed" | "all" | "reviewed";

export default function VaultClusterReview({
  brands,
}: {
  brands: ReviewBrand[];
}) {
  const supabase = createClient();

  // Local working copy so the UI updates immediately on approve/edit.
  const [rows, setRows] = useState<ReviewBrand[]>(brands);
  // Per-row dropdown selection (defaults to staging, falls back to existing cluster).
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const b of brands) {
      init[b.id] = b.cluster_staging || b.cluster || "";
    }
    return init;
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<{ id: string; msg: string } | null>(
    null
  );
  const [filter, setFilter] = useState<Filter>("unreviewed");

  const reviewedCount = useMemo(
    () => rows.filter((r) => r.cluster_reviewed).length,
    [rows]
  );
  const totalCount = rows.length;

  // Unreviewed first, then alphabetical — within whatever the active filter shows.
  const visible = useMemo(() => {
    let list = rows;
    if (filter === "unreviewed") list = rows.filter((r) => !r.cluster_reviewed);
    else if (filter === "reviewed")
      list = rows.filter((r) => r.cluster_reviewed);
    return [...list].sort((a, b) => {
      if (!!a.cluster_reviewed !== !!b.cluster_reviewed) {
        return a.cluster_reviewed ? 1 : -1; // unreviewed first
      }
      return a.name.localeCompare(b.name);
    });
  }, [rows, filter]);

  async function approve(id: string) {
    const value = picks[id];
    if (!value) {
      setErrorId({ id, msg: "Pick a cluster first." });
      return;
    }
    setBusyId(id);
    setErrorId(null);
    const { error } = await supabase
      .from("vault_brands")
      .update({ cluster: value, cluster_reviewed: true })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      setErrorId({ id, msg: error.message });
      return;
    }
    setRows((rs) =>
      rs.map((r) =>
        r.id === id ? { ...r, cluster: value, cluster_reviewed: true } : r
      )
    );
  }

  // Re-open a reviewed row for changes. No DB write — just flips local state so
  // the editable controls reappear; the next Approve overwrites `cluster`.
  function edit(id: string) {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, cluster_reviewed: false } : r))
    );
  }

  return (
    <div>
      {/* Progress + filter tabs */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="text-[13px] text-[var(--platinum-dim)]">
          <span className="text-[var(--gold)]">{reviewedCount}</span>
          <span className="text-[var(--muted)]"> / {totalCount} reviewed</span>
        </div>
        <div className="flex gap-1">
          {(["unreviewed", "all", "reviewed"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 font-[Inter] text-[10px] uppercase tracking-[2px] transition ${
                filter === f
                  ? "bg-[var(--gold)] text-[var(--ink)]"
                  : "border border-[var(--border-mid)] text-[var(--slate)] hover:text-[var(--platinum)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="border border-dashed border-[var(--border-faint)] px-4 py-10 text-center text-[13px] text-[var(--muted)]">
          {filter === "unreviewed"
            ? "All brands reviewed. Nice work."
            : "Nothing here yet."}
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-faint)]">
          {visible.map((b) => {
            const isReviewed = !!b.cluster_reviewed;
            const isBusy = busyId === b.id;
            const rowErr = errorId?.id === b.id ? errorId.msg : null;

            return (
              <div
                key={b.id}
                className={`grid grid-cols-1 gap-3 py-4 sm:grid-cols-[1.4fr_1fr_1.6fr_auto] sm:items-center ${
                  isReviewed ? "opacity-55" : ""
                }`}
              >
                {/* Brand */}
                <div>
                  <div className="font-display text-[16px] font-light text-[var(--platinum)]">
                    {b.name}
                  </div>
                  {b.independent_status && (
                    <div className="text-[10px] uppercase tracking-[1.5px] text-[var(--ghost)]">
                      {b.independent_status}
                    </div>
                  )}
                </div>

                {/* Country */}
                <div className="text-[13px] text-[var(--slate)]">
                  {b.country_of_origin || (
                    <span className="text-[var(--ghost)] italic">unknown</span>
                  )}
                </div>

                {/* Cluster: dropdown when editing, static when reviewed */}
                {isReviewed ? (
                  <div className="text-[13px] text-[var(--platinum-dim)]">
                    {b.cluster || (
                      <span className="text-[var(--ghost)] italic">none</span>
                    )}
                  </div>
                ) : (
                  <select
                    value={picks[b.id] ?? ""}
                    onChange={(e) =>
                      setPicks((p) => ({ ...p, [b.id]: e.target.value }))
                    }
                    className="w-full border border-[var(--border-mid)] bg-[var(--surface)] px-3 py-2 font-[Inter] text-[13px] text-[var(--platinum)] focus:border-[var(--border-gold)] focus:outline-none"
                  >
                    <option value="">Select cluster…</option>
                    {CLUSTERS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}

                {/* Action */}
                <div className="flex items-center gap-2 sm:justify-end">
                  {isReviewed ? (
                    <button
                      onClick={() => edit(b.id)}
                      className="border border-[var(--border-mid)] px-4 py-2 font-[Inter] text-[10px] uppercase tracking-[2px] text-[var(--slate)] transition hover:border-[var(--border-subtle)] hover:text-[var(--platinum)]"
                    >
                      Edit
                    </button>
                  ) : (
                    <button
                      onClick={() => approve(b.id)}
                      disabled={isBusy}
                      className="bg-[var(--gold)] px-5 py-2 font-[Inter] text-[10px] uppercase tracking-[2px] text-[var(--ink)] transition hover:opacity-90 disabled:cursor-wait disabled:opacity-40"
                    >
                      {isBusy ? "Saving…" : "Approve"}
                    </button>
                  )}
                </div>

                {rowErr && (
                  <div className="text-[12px] text-[var(--danger)] sm:col-span-4">
                    {rowErr}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
