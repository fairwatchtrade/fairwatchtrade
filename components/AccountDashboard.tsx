"use client";

import { useState } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   ACCOUNT DASHBOARD — client shell for /account  (v1.43)

   Architecture: "Global navigation changes WHERE you are; workspace controls
   change WHAT you're doing."
     • Left panel = global module nav (Dashboard / Inventory / coming-soon).
     • Right workspace = the active module's controls + content.

   Receives `listings` as a prop from the server page (app/account/page.tsx),
   which owns auth + the query. No fetching here. Counts are derived from the
   prop — no new queries. The listing-card markup is preserved verbatim from
   v1.42.

   PRIVACY: only buyer-safe fields + status arrive in the prop; scoring fields
   (significance_score, score_state, combined_score) never reach this layer.
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

// Status badge styling. `published` = gold, `pending` = muted, `rejected` = red.
const STATUS_STYLES: Record<string, string> = {
  published: "border-[#C9A84C] text-[#C9A84C]",
  pending: "border-white/15 text-[#8A8F9E]",
  rejected: "border-[#D4544C]/50 text-[#D4544C]",
};

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  pending: "Pending",
  rejected: "Rejected",
};

const CTA_CLASS =
  "inline-flex items-center justify-center rounded-md bg-[#C9A84C] px-4 py-2 text-sm font-medium text-[#0D0F14] transition hover:bg-[#C9A84C]/90";

// Left-panel modules — GLOBAL nav. No counts here.
const MODULES: Array<{ id: ModuleId; label: string; soon: boolean }> = [
  { id: "dashboard", label: "Dashboard", soon: false },
  { id: "inventory", label: "Inventory", soon: false },
  { id: "market", label: "Market Intelligence", soon: true },
  { id: "messages", label: "Messages", soon: true },
  { id: "analytics", label: "Analytics", soon: true },
];

/* ── Listing card — markup preserved verbatim from v1.42 (key now lives on the
   call site, since this is a component rather than an inline .map body). ── */
function ListingCard({ row }: { row: AccountListing }) {
  const title = row.model ? `${row.brand} ${row.model}` : row.brand;
  const meta = [row.reference ? `Ref. ${row.reference}` : "", row.condition]
    .filter(Boolean)
    .join(" · ");
  const price = `$${Number(row.asking_price).toLocaleString("en-US")}`;
  const badgeClass = STATUS_STYLES[row.status] ?? "border-white/15 text-[#8A8F9E]";
  const badgeLabel = STATUS_LABELS[row.status] ?? row.status;

  const card = (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="truncate text-[15px] font-medium text-[#E8E4DC]">
          {title}
        </div>
        {meta && (
          <div className="mt-1 text-[12px] text-[#B7BAC4]">{meta}</div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="text-[15px] font-semibold text-[#C9A84C]">{price}</span>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badgeClass}`}
        >
          {badgeLabel}
        </span>
      </div>
    </div>
  );

  // Only published listings have a live public detail page.
  return row.status === "published" ? (
    <Link
      href={`/listings/${row.id}`}
      className="block rounded-lg border border-white/10 bg-[#13151C] px-4 py-3 transition hover:border-[#C9A84C]/40"
    >
      {card}
    </Link>
  ) : (
    <div className="rounded-lg border border-white/10 bg-[#13151C] px-4 py-3">
      {card}
    </div>
  );
}

/* ── DASHBOARD module — KPI cards live here and ONLY here, then a recent-3
   preview. ── */
function DashboardView({
  listings,
  counts,
}: {
  listings: AccountListing[];
  counts: Counts;
}) {
  const kpis: Array<{ label: string; value: number; valueClass: string }> = [
    { label: "Active Listings", value: counts.active, valueClass: "text-[#C9A84C]" },
    { label: "Drafts", value: counts.draft, valueClass: "text-[#E8E4DC]" },
    { label: "Pending", value: counts.pending, valueClass: "text-[#E8E4DC]" },
    {
      label: "Rejected",
      value: counts.rejected,
      valueClass: counts.rejected > 0 ? "text-[#D4544C]" : "text-[#8A8F9E]",
    },
  ];

  const recent = listings.slice(0, 3); // already ordered created_at desc

  return (
    <div>
      {/* KPI ROW */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border border-white/10 bg-[#13151C] px-4 py-4"
          >
            <div className="text-[11px] uppercase tracking-[0.15em] text-[#8A8F9E]">
              {kpi.label}
            </div>
            <div className={`mt-1 text-2xl font-light ${kpi.valueClass}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* HEADER */}
      <div className="mt-8">
        <h1 className="text-2xl font-light text-[#E8E4DC]">Seller Dashboard</h1>
        <p className="mt-1 text-[13px] text-[#8A8F9E]">
          Manage your listings, monitor activity, and prepare for future seller
          intelligence.
        </p>
        <div className="mt-4">
          <Link href="/sell" className={CTA_CLASS}>
            Create New Listing
          </Link>
        </div>
      </div>

      {/* RECENT PREVIEW — last 3, no tabs */}
      <div className="mt-8">
        <div className="text-[11px] uppercase tracking-[0.15em] text-[#8A8F9E]">
          Recent Listings
        </div>
        {recent.length === 0 ? (
          <div className="mt-4 rounded-xl border border-white/10 px-4 py-12 text-center">
            <p className="text-[14px] text-[#B7BAC4]">
              No listings yet. Create your first one.
            </p>
            <div className="mt-5">
              <Link href="/sell" className={CTA_CLASS}>
                Create New Listing
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {recent.map((row) => (
              <ListingCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── INVENTORY module — top bar, status tabs, filtered list. Primary daily
   task; this is the default module. ── */
function InventoryView({
  listings,
  counts,
  activeTab,
  setActiveTab,
}: {
  listings: AccountListing[];
  counts: Counts;
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
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
      {/* TOP BAR */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-light text-[#E8E4DC]">Inventory</h2>
        <Link href="/sell" className={CTA_CLASS}>
          Create New Listing
        </Link>
      </div>

      {/* STATUS TABS */}
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-b border-white/10">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-[13px] transition ${
                isActive
                  ? "border-[#C9A84C] text-[#E8E4DC]"
                  : "border-transparent text-[#B7BAC4] hover:text-[#E8E4DC]"
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[11px] tabular-nums text-[#8A8F9E]">
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* FILTERED LIST */}
      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 px-4 py-12 text-center">
          <p className="text-[14px] text-[#B7BAC4]">No listings in this view.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((row) => (
            <ListingCard key={row.id} row={row} />
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

  // Counts derived from the prop — no new queries.
  const counts: Counts = {
    total: listings.length,
    active: listings.filter((l) => l.status === "published").length,
    draft: listings.filter((l) => l.status === "draft").length,
    pending: listings.filter((l) => l.status === "pending").length,
    rejected: listings.filter((l) => l.status === "rejected").length,
  };

  return (
    <main className="min-h-screen bg-[#0D0F14] text-[#E8E4DC]">
      <div className="flex">
        {/* LEFT CONTROL PANEL — desktop only. Global nav: changes WHERE you are. */}
        <aside className="hidden min-h-screen w-60 shrink-0 flex-col border-r border-white/10 bg-[#13151C] md:flex">
          {/* Header zone */}
          <div className="flex items-center justify-center px-4 py-10 text-center">
            <span className="text-[13px] font-light uppercase tracking-[0.25em] text-[#C9A84C]">
              Seller Panel
              <span className="mt-1 block text-[10px] tracking-[0.15em] text-[#8A8F9E]">
                Your Workspace
              </span>
            </span>
          </div>
          {/* full-bleed hairline divider */}
          <div className="border-t border-white/10" />

          {/* Module nav — no counts */}
          <nav className="space-y-1 px-3 pt-4">
            {MODULES.map((m) => {
              if (m.soon) {
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-2.5 pl-3 pr-2 text-[13px] text-[#8A8F9E]/50"
                  >
                    <span>{m.label}</span>
                    <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-[#8A8F9E]/40">
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
                  className={`flex w-full items-center border-l-2 py-2.5 pl-3 text-left text-[13px] transition ${
                    isActive
                      ? "border-[#C9A84C] font-medium text-[#C9A84C]"
                      : "border-transparent text-[#B7BAC4] hover:text-[#E8E4DC]"
                  }`}
                >
                  <span>{m.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* RIGHT WORKSPACE — controls change WHAT you're doing. */}
        <div className="min-w-0 flex-1 border-l border-white/10 px-6 pt-4 pb-8">
          {/* Mobile: Inventory only — no module switching (panel hidden). */}
          <div className="md:hidden">
            <InventoryView
              listings={listings}
              counts={counts}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          </div>

          {/* Desktop: module-driven. */}
          <div className="hidden md:block">
            {activeModule === "dashboard" ? (
              <DashboardView listings={listings} counts={counts} />
            ) : (
              <InventoryView
                listings={listings}
                counts={counts}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
