"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Canonical 16-value cluster vocabulary (Vault-lock v3.1, §4 & §20).
   Single gravitational home per brand — never an array. */
const CLUSTERS = [
  "Japanese",
  "German",
  "British",
  "American",
  "Heritage Swiss",
  "Contemporary Independent",
  "High Complication",
  "Dress / Classic",
  "Tool / Sports",
  "Military / Pilot",
  "Dive",
  "Microbrand",
  "Jewelry Maison",
  "Experimental / Conceptual",
  "Historic / Defunct",
  "Other",
] as const;

const REGIONS = [
  "Europe",
  "Asia",
  "North America",
  "South America",
  "Oceania",
  "Africa",
  "Unknown",
] as const;

export type ReviewBrand = {
  id: string;
  name: string;
  slug: string | null;
  country_of_origin: string | null;
  independent_status: string | null;
  search_aliases: string[] | null;
  // canonical (promoted)
  cluster: string | null;
  region: string | null;
  cluster_rationale: string | null;
  // staging (Gemini proposals)
  cluster_staging: string | null;
  region_staging: string | null;
  cluster_rationale_staging: string | null;
  cluster_reviewed: boolean | null;
};

type Filter = "unreviewed" | "all" | "reviewed";

export default function VaultClusterReview({
  brands,
}: {
  brands: ReviewBrand[];
}) {
  const supabase = createClient();

  const [rows, setRows] = useState<ReviewBrand[]>(brands);

  // Per-row cluster pick (defaults to staging proposal, then canonical).
  const [clusterPick, setClusterPick] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const b of brands) init[b.id] = b.cluster_staging || b.cluster || "";
    return init;
  });
  // Per-row region pick (region is also a judgment call promoted on approve).
  const [regionPick, setRegionPick] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const b of brands) init[b.id] = b.region_staging || b.region || "";
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
    const cluster = clusterPick[id];
    const region = regionPick[id];
    if (!cluster) {
      setErrorId({ id, msg: "Pick a cluster first." });
      return;
    }
    setBusyId(id);
    setErrorId(null);

    // Promote all three staging judgments -> canonical in one write.
    const rationale =
      rows.find((r) => r.id === id)?.cluster_rationale_staging ?? null;

    const { error } = await supabase
      .from("vault_brands")
      .update({
        cluster,
        region: region || null,
        cluster_rationale: rationale,
        cluster_reviewed: true,
      })
      .eq("id", id);

    setBusyId(null);
    if (error) {
      setErrorId({ id, msg: error.message });
      return;
    }
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? {
              ...r,
              cluster,
              region: region || null,
              cluster_rationale: rationale,
              cluster_reviewed: true,
            }
          : r
      )
    );
  }

  // Re-open a reviewed row. Local-only flip so controls reappear; next Approve overwrites.
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
            const rationale =
              b.cluster_rationale_staging || b.cluster_rationale || "";
            const aliases = b.search_aliases ?? [];

            return (
              <div
                key={b.id}
                className={`py-5 ${isReviewed ? "opacity-55" : ""}`}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.5fr_1fr_1.6fr_auto] sm:items-start">
                  {/* Brand + country + status */}
                  <div>
                    <div className="font-display text-[16px] font-light text-[var(--platinum)]">
                      {b.name}
                    </div>
                    <div className="mt-0.5 text-[12px] text-[var(--slate)]">
                      {b.country_of_origin || (
                        <span className="italic text-[var(--ghost)]">
                          unknown
                        </span>
                      )}
                      {b.independent_status && (
                        <span className="text-[var(--ghost)]">
                          {" \u00b7 "}
                          {b.independent_status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Region: dropdown when editing, static when reviewed */}
                  {isReviewed ? (
                    <div className="text-[13px] text-[var(--platinum-dim)]">
                      {b.region || (
                        <span className="italic text-[var(--ghost)]">&mdash;</span>
                      )}
                    </div>
                  ) : (
                    <select
                      value={regionPick[b.id] ?? ""}
                      onChange={(e) =>
                        setRegionPick((p) => ({ ...p, [b.id]: e.target.value }))
                      }
                      className="w-full border border-[var(--border-mid)] bg-[var(--surface)] px-3 py-2 font-[Inter] text-[12px] text-[var(--platinum)] focus:border-[var(--border-gold)] focus:outline-none"
                    >
                      <option value="">Region&hellip;</option>
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Cluster: dropdown when editing, static when reviewed */}
                  {isReviewed ? (
                    <div className="text-[13px] text-[var(--platinum-dim)]">
                      {b.cluster || (
                        <span className="italic text-[var(--ghost)]">none</span>
                      )}
                    </div>
                  ) : (
                    <select
                      value={clusterPick[b.id] ?? ""}
                      onChange={(e) =>
                        setClusterPick((p) => ({
                          ...p,
                          [b.id]: e.target.value,
                        }))
                      }
                      className="w-full border border-[var(--border-mid)] bg-[var(--surface)] px-3 py-2 font-[Inter] text-[13px] text-[var(--platinum)] focus:border-[var(--border-gold)] focus:outline-none"
                    >
                      <option value="">Select cluster&hellip;</option>
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
                        {isBusy ? "Saving\u2026" : "Approve"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Rationale (the nod-or-smirk context) + aliases — full width below */}
                {(rationale || aliases.length > 0) && (
                  <div className="mt-2 pl-0 sm:pl-1">
                    {rationale && (
                      <p className="font-display text-[13px] font-light italic text-[var(--muted)]">
                        {rationale}
                      </p>
                    )}
                    {aliases.length > 0 && (
                      <p className="mt-1 text-[11px] text-[var(--ghost)]">
                        aliases: {aliases.join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {rowErr && (
                  <div className="mt-2 text-[12px] text-[var(--danger)]">
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
