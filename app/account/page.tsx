import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/* ────────────────────────────────────────────────────────────────────────
   MY LISTINGS — /account  (v1.42)

   Seller-facing dashboard of the signed-in user's own listings. Server
   Component: reads the user from the SSR Supabase client, redirects to /sell
   (the login entry point for now) if unauthenticated, then lists their rows
   newest-first.

   Owner link: listings.seller_id (uuid → auth.users).

   v1.42 — presentation rewrite only: two-column seller dashboard (left control
   panel + right workspace, KPI cards, coming-soon nav). Auth, query, ownership
   filter, status logic, and the listing cards are unchanged from v1.40/1.41.

   PRIVACY: scoring fields (significance_score, score_state, combined_score)
   are NEVER selected or rendered — the query pulls only buyer-safe columns
   plus status. The curation/evaluate route is untouched (PFC274 = 62).
   ──────────────────────────────────────────────────────────────────────── */

type AccountListing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  condition: string;
  asking_price: number;
  status: string;
  created_at: string;
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

// Coming-soon panel items — no counts, no hover, "Soon" pill beside each.
const COMING_SOON = [
  "Comparable Listings",
  "Market Data",
  "Sales This Month",
  "Sales Pending",
  "Messages",
  "Account",
];

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sell");
  }

  const { data, error } = await supabase
    .from("listings")
    .select("id, brand, model, reference, condition, asking_price, status, created_at")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const listings = (!error && Array.isArray(data) ? data : []) as AccountListing[];

  // Counts derived from the already-fetched array — no new queries.
  const totalCount = listings.length;
  const activeCount = listings.filter((l) => l.status === "published").length;
  const draftCount = listings.filter((l) => l.status === "draft").length;
  const pendingCount = listings.filter((l) => l.status === "pending").length;
  const rejectedCount = listings.filter((l) => l.status === "rejected").length;

  // Left-panel nav rows that carry live counts.
  const navCounts: Array<{ label: string; n: number }> = [
    { label: "My Listings", n: totalCount },
    { label: "Drafts", n: draftCount },
    { label: "Pending", n: pendingCount },
    { label: "Rejected", n: rejectedCount },
  ];

  // KPI cards. Rejected turns red only when there is something to flag.
  const kpis: Array<{ label: string; value: number; valueClass: string }> = [
    { label: "Active Listings", value: activeCount, valueClass: "text-[#C9A84C]" },
    { label: "Drafts", value: draftCount, valueClass: "text-[#E8E4DC]" },
    { label: "Pending", value: pendingCount, valueClass: "text-[#E8E4DC]" },
    {
      label: "Rejected",
      value: rejectedCount,
      valueClass: rejectedCount > 0 ? "text-[#D4544C]" : "text-[#8A8F9E]",
    },
  ];

  return (
    <main className="min-h-screen bg-[#0D0F14] text-[#E8E4DC]">
      <div className="flex overflow-hidden">
        {/* LEFT CONTROL PANEL — desktop only */}
        <aside className="hidden min-h-screen w-60 shrink-0 flex-col border-r border-white/10 shadow-[1px_0_0_0_rgba(255,255,255,0.06)] bg-[#13151C] px-4 py-6 md:flex">
          <div className="text-[11px] uppercase tracking-[0.15em] text-[#8A8F9E]">
            Seller Panel
          </div>

          <nav className="mt-5 space-y-1">
            {/* Active page */}
            <div className="flex items-center justify-between border-l-2 border-[#C9A84C] py-2 pl-3 text-[13px] text-[#E8E4DC]">
              <span>Dashboard</span>
            </div>

            {navCounts.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between border-l-2 border-transparent py-2 pl-3 text-[13px] text-[#B7BAC4] transition hover:text-[#E8E4DC]"
              >
                <span>{item.label}</span>
                <span className="text-[12px] tabular-nums text-[#B7BAC4]">
                  {item.n}
                </span>
              </div>
            ))}
          </nav>

          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="text-[11px] uppercase tracking-[0.15em] text-[#8A8F9E]">
              Coming Soon
            </div>
            <div className="mt-3 space-y-1.5">
              {COMING_SOON.map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-1 pl-3 text-[13px] text-[#8A8F9E]/50"
                >
                  <span>{label}</span>
                  <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-[#8A8F9E]/40">
                    Soon
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* RIGHT WORKSPACE */}
        <div className="min-w-0 flex-1 overflow-hidden border-l border-white/10 px-6 pt-4 pb-8">
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

          {/* WORKSPACE HEADER */}
          <div className="mt-8">
            <h1 className="text-2xl font-light text-[#E8E4DC]">Seller Dashboard</h1>
            <p className="mt-1 text-[13px] text-[#8A8F9E]">
              Manage your listings, monitor activity, and prepare for future
              seller intelligence.
            </p>
            <div className="mt-4">
              <Link href="/sell" className={CTA_CLASS}>
                Create New Listing
              </Link>
            </div>
          </div>

          {/* MY LISTINGS SECTION */}
          <div className="mt-8">
            <div className="text-[11px] uppercase tracking-[0.15em] text-[#8A8F9E]">
              My Listings
            </div>

            {listings.length === 0 ? (
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
                {listings.map((row) => {
                  const title = row.model ? `${row.brand} ${row.model}` : row.brand;
                  const meta = [
                    row.reference ? `Ref. ${row.reference}` : "",
                    row.condition,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const price = `$${Number(row.asking_price).toLocaleString("en-US")}`;
                  const badgeClass =
                    STATUS_STYLES[row.status] ?? "border-white/15 text-[#8A8F9E]";
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
                        <span className="text-[15px] font-semibold text-[#C9A84C]">
                          {price}
                        </span>
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
                      key={row.id}
                      href={`/listings/${row.id}`}
                      className="block rounded-lg border border-white/10 bg-[#13151C] px-4 py-3 transition hover:border-[#C9A84C]/40"
                    >
                      {card}
                    </Link>
                  ) : (
                    <div
                      key={row.id}
                      className="rounded-lg border border-white/10 bg-[#13151C] px-4 py-3"
                    >
                      {card}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
