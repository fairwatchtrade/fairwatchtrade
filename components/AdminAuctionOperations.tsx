"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AdminAuctionIngest, { type AuctionEventRow } from "@/components/AdminAuctionIngest";
import AdminAuctionResultsIngest from "@/components/AdminAuctionResultsIngest";
import {
  evidenceSummaryOf,
  identityStateOf,
  IDENTITY_LABELS,
  RESULTS_SORTS,
  sortResultsRows,
  sortUpcomingRows,
  upcomingStatusOf,
  UPCOMING_SORTS,
  type ResultsSaleRow,
  type ResultsSort,
  type UpcomingSort,
} from "@/lib/auction-operations/resultsPresentation";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION OPERATIONS — components/AdminAuctionOperations.tsx

   The single obvious auction room, per the approved Design Gate: one page,
   two unmistakable workspaces that never blur into one generic table.

     UPCOMING AUCTIONS    future event / calendar truth → auction_events →
                          /api/auctions → the public MarketBar
     AUCTION RESULTS      completed sale / historical evidence truth →
                          the Auction Evidence domain

   The proven paste → parse → review → explicit save engine is untouched
   underneath (AdminAuctionIngest); this room adds what the flat page never
   had: real sorting, direct Open/Edit of an existing event, and a founder
   doorway into registered results ingestion.

   TRUTHFUL COLUMNS ONLY. No Public-strip eligibility (visibility is
   time-derived — a stored eligibility would be a lie), no delete/cancel/
   publish controls, no completed-sale "Ingestion status" (no durable field
   exists, and lot=result counts prove nothing).

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type Workspace = "upcoming" | "results";
type UpcomingView = "list" | "intake";
type ResultsView = "list" | "ingest";

const tabCls = (active: boolean) =>
  `border px-4 py-2 text-[11px] uppercase tracking-[2px] transition-colors ${
    active
      ? "border-[var(--border-gold)] bg-[var(--surface)] text-[var(--platinum)]"
      : "border-[var(--border-mid)] text-[var(--slate)] hover:text-[var(--platinum)]"
  }`;

const thCls = "px-3 py-2 text-left text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]";
const tdCls = "px-3 py-2 text-[12px] text-[var(--platinum-dim)]";
const sortSelectCls =
  "border border-[var(--border-subtle)] bg-[rgba(7,8,12,0.4)] px-2 py-1.5 text-[12px] text-[var(--platinum)] outline-none focus:border-[var(--border-gold)]";

const STATUS_BADGE: Record<string, string> = {
  live: "text-[var(--gold)]",
  upcoming: "text-[var(--platinum-dim)]",
  past: "text-[var(--muted)]",
};

export default function AdminAuctionOperations({
  upcoming,
  results,
}: {
  upcoming: AuctionEventRow[];
  results: ResultsSaleRow[];
}) {
  const [workspace, setWorkspace] = useState<Workspace>("upcoming");

  // ── Upcoming state ──
  const [rows, setRows] = useState<AuctionEventRow[]>(upcoming);
  const [upSort, setUpSort] = useState<UpcomingSort>("start_asc");
  const [upView, setUpView] = useState<UpcomingView>("list");
  const [editing, setEditing] = useState<AuctionEventRow | null>(null);

  // ── Results state ──
  const [resSort, setResSort] = useState<ResultsSort>("date_desc");
  const [resView, setResView] = useState<ResultsView>("list");

  /* One clock reading per mount: status is time-derived, and a stable
     reading keeps render pure (react-hooks/purity) — the founder operates
     in minutes, not milliseconds. */
  const [now] = useState(() => Date.now());
  const sortedUpcoming = useMemo(() => sortUpcomingRows(rows, upSort, now), [rows, upSort, now]);
  const sortedResults = useMemo(() => sortResultsRows(results, resSort), [results, resSort]);

  const onRowSaved = (row: AuctionEventRow) => {
    setRows((r) => [...r.filter((x) => x.id !== row.id), row]);
  };

  return (
    <div>
      {/* ── the two jobs, named plainly ── */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button type="button" className={`cursor-pointer ${tabCls(workspace === "upcoming")}`} onClick={() => setWorkspace("upcoming")}>
          Upcoming Auctions
        </button>
        <button type="button" className={`cursor-pointer ${tabCls(workspace === "results")}`} onClick={() => setWorkspace("results")}>
          Auction Results
        </button>
      </div>

      {workspace === "upcoming" && (
        <section aria-label="Upcoming auctions">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-[20px] font-light text-[var(--platinum)]">
                Upcoming auctions
              </h2>
              <p className="mt-1 text-[12px] text-[var(--muted)]">
                Manage the sales shown across FairWatchTrade — these rows feed the public
                upcoming-auction strip.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {upView === "list" && (
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-[1.5px] text-[var(--muted)]">
                  Sort
                  <select
                    className={sortSelectCls}
                    value={upSort}
                    onChange={(e) => setUpSort(e.target.value as UpcomingSort)}
                  >
                    {UPCOMING_SORTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                className="fw-btn-primary"
                onClick={() => {
                  setEditing(null);
                  setUpView(upView === "list" ? "intake" : "list");
                }}
              >
                {upView === "list" ? "Add upcoming auction" : "Back to upcoming list"}
              </button>
            </div>
          </div>

          {upView === "intake" || editing ? (
            <div className="border border-[var(--border-subtle)] p-4">
              <AdminAuctionIngest
                key={editing ? editing.id : "intake"}
                events={rows}
                editing={editing}
                onRowSaved={onRowSaved}
                onDoneEditing={() => {
                  setEditing(null);
                  setUpView("list");
                }}
                showList={false}
              />
            </div>
          ) : sortedUpcoming.length === 0 ? (
            <p className="border border-[var(--border-subtle)] px-4 py-8 text-center text-[13px] italic text-[var(--muted)]">
              No upcoming auctions are currently in this workspace.
            </p>
          ) : (
            <div className="overflow-x-auto border border-[var(--border-subtle)]">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className={thCls}>Auction house</th>
                    <th className={thCls}>Sale</th>
                    <th className={thCls}>Location</th>
                    <th className={thCls}>Start</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-faint)]">
                  {sortedUpcoming.map((r) => {
                    const status = upcomingStatusOf(r, now);
                    return (
                      <tr key={r.id}>
                        <td className={`${tdCls} text-[var(--platinum)]`}>{r.auction_house}</td>
                        <td className={tdCls}>
                          {r.auction_title}
                          {r.online_only ? (
                            <span className="ml-2 text-[10px] uppercase tracking-[1px] text-[var(--muted)]">
                              online
                            </span>
                          ) : null}
                        </td>
                        <td className={tdCls}>{r.location ?? "—"}</td>
                        <td className={`${tdCls} tabular-nums`}>{r.starts_at.slice(0, 10)}</td>
                        <td className={`${tdCls} uppercase text-[10px] tracking-[1.5px] ${STATUS_BADGE[status]}`}>
                          {status}
                        </td>
                        <td className={`${tdCls} text-right`}>
                          <button
                            type="button"
                            className="cursor-pointer border border-[var(--border-mid)] px-3 py-1 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]"
                            onClick={() => {
                              setEditing(r);
                              setUpView("intake");
                            }}
                          >
                            Open / Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {workspace === "results" && (
        <section aria-label="Auction result evidence">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-[20px] font-light text-[var(--platinum)]">
                Auction result evidence
              </h2>
              <p className="mt-1 text-[12px] text-[var(--muted)]">
                Historical auction evidence for Market Intel — House → Sale → Source → Lots →
                Results.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {resView === "list" && (
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-[1.5px] text-[var(--muted)]">
                  Sort
                  <select
                    className={sortSelectCls}
                    value={resSort}
                    onChange={(e) => setResSort(e.target.value as ResultsSort)}
                  >
                    {RESULTS_SORTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                className="fw-btn-primary"
                onClick={() => setResView(resView === "list" ? "ingest" : "list")}
              >
                {resView === "list" ? "Ingest Auction Results" : "Back to result history"}
              </button>
            </div>
          </div>

          {resView === "ingest" ? (
            <AdminAuctionResultsIngest onApplied={() => setResView("list")} />
          ) : sortedResults.length === 0 ? (
            <p className="border border-[var(--border-subtle)] px-4 py-8 text-center text-[13px] italic text-[var(--muted)]">
              No completed auction evidence is shown here yet.
            </p>
          ) : (
            <div className="overflow-x-auto border border-[var(--border-subtle)]">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className={thCls}>Sale date</th>
                    <th className={thCls}>Auction house</th>
                    <th className={thCls}>Sale</th>
                    <th className={thCls}>Evidence</th>
                    <th className={thCls}>Lots / results</th>
                    <th className={thCls}>Identity</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-faint)]">
                  {sortedResults.map((r) => {
                    const identity = identityStateOf(r);
                    const unfinished = r.lot_count - r.fresh_exact_count;
                    return (
                      <tr key={r.sale_id}>
                        <td className={`${tdCls} tabular-nums`}>{r.sale_date ?? "—"}</td>
                        <td className={`${tdCls} text-[var(--platinum)]`}>{r.house_name}</td>
                        <td className={tdCls}>{r.sale_name}</td>
                        <td className={tdCls}>{evidenceSummaryOf(r)}</td>
                        <td className={`${tdCls} tabular-nums`}>
                          {r.lot_count} / {r.current_result_count}
                          {r.priced_result_count < r.sold_count ? (
                            <span
                              className="ml-2 text-[10px] uppercase tracking-[1px] text-[var(--gold-dim)]"
                              title="Sold lots whose realized price is deliberately withheld pending the price-semantics ruling"
                            >
                              {r.sold_count - r.priced_result_count} unpriced
                            </span>
                          ) : null}
                        </td>
                        <td className={tdCls}>
                          {IDENTITY_LABELS[identity]}
                          {identity !== "resolved" && identity !== "no_lots" && unfinished > 0 ? (
                            <span className="ml-2 text-[10px] tabular-nums text-[var(--muted)]">
                              {unfinished} open
                              {r.stale_decision_count > 0 ? ` · ${r.stale_decision_count} stale` : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className={`${tdCls} text-right`}>
                          <Link
                            href={`/admin/auctions/results/${r.sale_id}`}
                            className="border border-[var(--border-mid)] px-3 py-1 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
