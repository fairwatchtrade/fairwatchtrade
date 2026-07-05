"use client";

import { useState } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   ACCOUNT DASHBOARD — client shell for /account  (v1.59)

   Architecture: "Global navigation changes WHERE you are; workspace controls
   change WHAT you're doing."
     • Left panel = global module nav (Dashboard / Inventory / coming-soon).
     • Right workspace = the active module's controls + content.

   Receives `listings` as a prop from the server page (app/account/page.tsx),
   which owns auth + the query. No fetching here. Counts are derived from the
   prop — no new queries.

   PRIVACY: only buyer-safe fields + status arrive in the prop; scoring fields
   (significance_score, score_state, combined_score) never reach this layer.

   v1.59: Studio three-column instrument-panel migration. All state, module
   switching, tab filtering, count derivation, and the published-vs-div link
   logic are preserved verbatim — token + layout-shape changes only. The
   right context panel (selected-listing detail, activity, market pulse) is
   Phase 2 and intentionally NOT built here; a visual-only `selectedListing`
   state is wired so rows can show a selected treatment now.
   ──────────────────────────────────────────────────────────────────────── */

export type AccountListing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  condition: string;
  asking_price: number;
  status: string;
  created_at: string;
};

type ModuleId = "dashboard" | "inventory" | "market" | "messages" | "analytics";
type TabId = "all" | "published" | "draft" | "pending" | "rejected";

type Counts = {
  total: number;
  active: number;
  draft: number;
  pending: number;
  rejected: number;
};

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  pending: "Pending",
  rejected: "Rejected",
  draft: "Draft",
};

// Left-panel modules — GLOBAL nav. No counts here. Labels use the prototype's
// shorter forms so they fit the 152px panel without wrapping.
const MODULES: Array<{ id: ModuleId; label: string; soon: boolean }> = [
  { id: "dashboard", label: "Overview", soon: false },
  { id: "inventory", label: "Listings", soon: false },
  { id: "market", label: "Market Intel", soon: true },
  { id: "messages", label: "Messages", soon: true },
  { id: "analytics", label: "Analytics", soon: true },
];

/* ── Listing row — Studio row treatment (replaces the v1.42 card). Markup
   shape follows the prototype; the published-vs-div link logic and the
   visual selected-state are preserved/added here. ── */
function ListingRow({
  row,
  selected,
  onSelect,
}: {
  row: AccountListing;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const price = `$${Number(row.asking_price).toLocaleString("en-US")}`;
  const badgeLabel = STATUS_LABELS[row.status] ?? row.status;
  const badgeClass =
    row.status === "published"
      ? "text-[var(--success)]"
      : row.status === "rejected"
        ? "text-[var(--danger)]"
        : "text-[var(--muted)]";

  const inner = (
    <div
      onClick={() => onSelect(row.id)}
      className={`relative flex cursor-pointer items-center gap-3 border-b border-[rgba(255,255,255,0.03)] px-6 py-[14px] transition hover:bg-[rgba(255,255,255,0.02)] ${
        selected
          ? "bg-[rgba(201,168,76,0.04)] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-[var(--gold)]"
          : ""
      }`}
    >
      {/* Dial thumbnail placeholder — 36×36 */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--border-faint)] bg-[var(--surface)]">
        <div className="h-4 w-4 rounded-full border border-[var(--border-subtle)]" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="mb-[3px] text-[8.5px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
          {row.brand}
        </div>
        <div className="truncate font-display text-[14px] font-light text-[var(--platinum)]">
          {row.model ?? row.brand}
        </div>
        <div className="mt-[2px] text-[9px] tracking-[0.3px] text-[var(--ghost)]">
          Ref. {row.reference}
        </div>
      </div>

      {/* Price + status */}
      <div className="shrink-0 text-right">
        <div className="font-display text-[16px] font-light text-[var(--platinum-dim)]">
          {price}
        </div>
        <div className={`mt-[3px] text-[8px] uppercase tracking-[1.5px] ${badgeClass}`}>
          {badgeLabel}
        </div>
      </div>
    </div>
  );

  // Only published listings have a live public detail page.
  return row.status === "published" ? (
    <Link href={`/listings/${row.id}`} className="group block">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

/* ── DASHBOARD module — KPI stat strip, then a recent-3 preview. ── */
function DashboardView({
  listings,
  counts,
  selectedListing,
  onSelect,
}: {
  listings: AccountListing[];
  counts: Counts;
  selectedListing: string | null;
  onSelect: (id: string) => void;
}) {
  const kpis: Array<{ label: string; value: number; valueClass: string }> = [
    { label: "Active Listings", value: counts.active, valueClass: "text-[var(--gold)]" },
    { label: "Drafts", value: counts.draft, valueClass: "text-[var(--platinum)]" },
    { label: "Pending", value: counts.pending, valueClass: "text-[var(--platinum)]" },
    {
      label: "Rejected",
      value: counts.rejected,
      valueClass: counts.rejected > 0 ? "text-[var(--danger)]" : "text-[var(--muted)]",
    },
  ];

  const recent = listings.slice(0, 3); // already ordered created_at desc

  return (
    <div>
      {/* KPI STAT STRIP — full-width, border-divided */}
      <div className="flex border-b border-[var(--border-faint)]">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="flex-1 border-r border-[var(--border-faint)] px-6 py-4 last:border-r-0"
          >
            <div className="text-[8px] uppercase tracking-[2px] text-[var(--muted)]">
              {kpi.label}
            </div>
            <div className={`mt-1 font-display text-[22px] font-light ${kpi.valueClass}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* RECENT PREVIEW — last 3, no tabs */}
      <div className="px-6 pt-5 pb-3 text-[8px] uppercase tracking-[3px] text-[var(--muted)]">
        Recent Listings
      </div>
      {recent.length === 0 ? (
        <div className="mx-6 border border-[var(--border-faint)] px-6 py-10 text-center">
          <p className="text-[13px] text-[var(--muted)]">
            No listings yet. Create your first one.
          </p>
        </div>
      ) : (
        <div>
          {recent.map((row) => (
            <ListingRow
              key={row.id}
              row={row}
              selected={selectedListing === row.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── INVENTORY module — status tabs, filtered list. Default module. ── */
function InventoryView({
  listings,
  counts,
  activeTab,
  setActiveTab,
  selectedListing,
  onSelect,
}: {
  listings: AccountListing[];
  counts: Counts;
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
  selectedListing: string | null;
  onSelect: (id: string) => void;
}) {
  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    { id: "all", label: "All", count: counts.total },
    { id: "published", label: "Active", count: counts.active },
    { id: "draft", label: "Drafts", count: counts.draft },
    { id: "pending", label: "Pending", count: counts.pending },
    { id: "rejected", label: "Rejected", count: counts.rejected },
  ];

  const filtered =
    activeTab === "all" ? listings : listings.filter((l) => l.status === activeTab);

  return (
    <div>
      {/* STATUS TABS */}
      <div className="flex border-b border-[var(--border-faint)]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-4 py-[10px] text-[10px] uppercase tracking-[1.5px] transition ${
                isActive
                  ? "border-[var(--gold)] text-[var(--platinum)]"
                  : "border-transparent text-[var(--ghost)] hover:text-[var(--slate)]"
              }`}
            >
              {tab.label}
              <span className="ml-1 text-[8px] text-[var(--gold)]">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* FILTERED LIST */}
      {filtered.length === 0 ? (
        <div className="mx-6 mt-6 border border-[var(--border-faint)] px-6 py-10 text-center">
          <p className="text-[13px] text-[var(--muted)]">No listings in this view.</p>
        </div>
      ) : (
        <div>
          {filtered.map((row) => (
            <ListingRow
              key={row.id}
              row={row}
              selected={selectedListing === row.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountDashboard({
  listings,
}: {
  listings: AccountListing[];
}) {
  // Default module = Inventory: the listings are the primary daily task.
  const [activeModule, setActiveModule] = useState<ModuleId>("inventory");
  const [activeTab, setActiveTab] = useState<TabId>("published");
  // Visual-only selected-row state (right context panel is Phase 2).
  const [selectedListing, setSelectedListing] = useState<string | null>(null);

  // Counts derived from the prop — no new queries.
  const counts: Counts = {
    total: listings.length,
    active: listings.filter((l) => l.status === "published").length,
    draft: listings.filter((l) => l.status === "draft").length,
    pending: listings.filter((l) => l.status === "pending").length,
    rejected: listings.filter((l) => l.status === "rejected").length,
  };

  const moduleTitle = activeModule === "dashboard" ? "Overview" : "Listings";

  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">
      <div className="flex">
        {/* LEFT CONTROL PANEL — desktop only. Global nav: changes WHERE you are. */}
        <aside className="hidden min-h-screen w-[152px] shrink-0 flex-col border-r border-[var(--border-faint)] bg-[var(--ink)] pt-7 pb-6 md:flex">
          {/* Header zone */}
          <div className="mb-5 px-5">
            <div className="text-[8px] uppercase tracking-[3px] text-[var(--ghost)]">
              Seller Panel
            </div>
            <div className="mt-[3px] text-[9px] uppercase tracking-[2px] text-[var(--gold)]">
              Your Workspace
            </div>
          </div>

          {/* Module nav — no counts */}
          <nav>
            {MODULES.map((m) => {
              if (m.soon) {
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-5 py-[9px] text-[11px] text-[var(--ghost)]"
                  >
                    <span>{m.label}</span>
                    <span className="text-[8px] tracking-[1px] text-[var(--ghost)]">
                      Soon
                    </span>
                  </div>
                );
              }
              const isActive = activeModule === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveModule(m.id)}
                  className={`relative flex w-full items-center justify-between px-5 py-[9px] text-left text-[11px] tracking-[0.5px] transition ${
                    isActive
                      ? "border-l-2 border-[var(--gold)] text-[var(--platinum)]"
                      : "border-l-2 border-transparent text-[var(--muted)] hover:text-[var(--slate)]"
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{ background: "rgba(201,168,76,0.04)" }}
                    />
                  )}
                  <span className="relative">{m.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Bottom identity zone */}
          <div className="mt-auto border-t border-[var(--border-faint)] px-5 pt-5">
            <div className="text-[10px] text-[var(--muted)]">Seller</div>
            <div className="mt-[2px] text-[9px] text-[var(--ghost)]">Active workspace</div>
          </div>
        </aside>

        {/* RIGHT WORKSPACE — controls change WHAT you're doing. */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Shared workspace header */}
          <div className="flex-shrink-0 border-b border-[var(--border-faint)] px-6 pt-5 pb-0">
            <div className="mb-4 flex items-center justify-between">
              {/* Mobile is Inventory-only; desktop reflects the active module. */}
              <h2 className="font-display text-[20px] font-light tracking-[0.5px] text-[var(--platinum)]">
                <span className="md:hidden">Listings</span>
                <span className="hidden md:inline">{moduleTitle}</span>
              </h2>
              <Link
                href="/sell"
                className="bg-[var(--gold)] px-4 py-[7px] font-[Inter] text-[9px] font-normal uppercase tracking-[2px] text-[var(--ink)]"
              >
                Create Listing
              </Link>
            </div>
          </div>

          {/* Mobile: Inventory only — no module switching (panel hidden). */}
          <div className="md:hidden">
            <InventoryView
              listings={listings}
              counts={counts}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              selectedListing={selectedListing}
              onSelect={setSelectedListing}
            />
          </div>

          {/* Desktop: module-driven. */}
          <div className="hidden md:block">
            {activeModule === "dashboard" ? (
              <DashboardView
                listings={listings}
                counts={counts}
                selectedListing={selectedListing}
                onSelect={setSelectedListing}
              />
            ) : (
              <InventoryView
                listings={listings}
                counts={counts}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                selectedListing={selectedListing}
                onSelect={setSelectedListing}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
