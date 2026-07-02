import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   ADMIN DASHBOARD — components/AdminDashboard.tsx  (v1.95)

   The operator table. Dark, minimal, information-dense — same tokens as the
   rest of the platform, not a different product. Pure presentation: all data
   is fetched and derived in the server page; this renders it. No client state,
   so it stays a server component (refresh to update).

   Phase-2 sections are honest shells — the copy is always "Data model not yet
   available", never "No records found" / "No flags found" (those would imply
   the system checked real data; it hasn't).

   PFC274 = 62 — no scoring fields are rendered here.
   ──────────────────────────────────────────────────────────────────────── */

export type AdminListing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  condition: string;
  asking_price: number;
  status: string;
  created_at: string;
  seller_id: string;
};

type Counts = {
  published: number;
  drafts: number;
  rejected: number;
  last24h: number;
  last7d: number;
  notifications: number;
};

const VALUE_COLOR: Record<string, string> = {
  gold: "text-[var(--gold)]",
  danger: "text-[var(--danger)]",
  platinum: "text-[var(--platinum)]",
  muted: "text-[var(--muted)]",
};

function formatPrice(n: number): string {
  return `$${Number(n).toLocaleString("en-US")}`;
}

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    published: "border-green-800 text-green-400",
    draft: "border-[var(--border-gold)] text-[var(--gold)]",
    rejected: "border-red-900 text-red-400",
  };
  return (
    <span
      className={`border px-2 py-0.5 text-[9px] uppercase tracking-[1.5px] ${
        colors[status] ?? "border-[var(--border-subtle)] text-[var(--ghost)]"
      }`}
    >
      {status}
    </span>
  );
}

// Honest Phase-2 shell — structure without implying a data check happened.
function ComingSoonSection({ title }: { title: string }) {
  return (
    <section className="mt-8">
      <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
        {title}
      </div>
      <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center">
        <div className="font-display text-[11px] italic text-[var(--ghost)]">
          Data model not yet available.
        </div>
      </div>
    </section>
  );
}

export default function AdminDashboard({
  listings,
  sellerMap,
  counts,
}: {
  listings: AdminListing[];
  sellerMap: Record<string, string>;
  counts: Counts;
}) {
  const stats = [
    { label: "Published", value: counts.published, color: "gold" },
    { label: "Drafts", value: counts.drafts, color: "muted" },
    { label: "Rejected", value: counts.rejected, color: "danger" },
    { label: "Last 24h", value: counts.last24h, color: "platinum" },
    { label: "Last 7 days", value: counts.last7d, color: "platinum" },
    { label: "Notifications sent", value: counts.notifications, color: "muted" },
  ];

  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">
      {/* Header */}
      <div className="border-b border-[var(--border-faint)] bg-[var(--ink)] px-8 py-4">
        <div className="text-[8px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
          Admin · FairWatchTrade
        </div>
        <div className="mt-1 font-display text-[22px] font-light text-[var(--platinum)]">
          Marketplace Control
        </div>
      </div>

      <div className="px-8 py-8">
        {/* Stat cards — 2 col mobile, 3 tablet, 6 desktop */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div
              key={s.label}
              className="border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-4"
            >
              <div className="text-[8px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                {s.label}
              </div>
              <div
                className={`mt-1 font-display text-[32px] font-light ${
                  VALUE_COLOR[s.color] ?? "text-[var(--platinum)]"
                }`}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Listings table — full inventory */}
        <section className="mt-10">
          <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
            Listings · {listings.length} total
          </div>

          {listings.length === 0 ? (
            <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center font-display text-[11px] italic text-[var(--ghost)]">
              No listings in the marketplace yet.
            </div>
          ) : (
            <div className="overflow-x-auto border border-[var(--border-subtle)]">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[8px] uppercase tracking-[2px] text-[var(--ghost)]">
                    <th className="px-4 py-3 font-normal">Brand</th>
                    <th className="px-4 py-3 font-normal">Model</th>
                    <th className="px-4 py-3 font-normal">Reference</th>
                    <th className="px-4 py-3 font-normal">Seller</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal">Price</th>
                    <th className="px-4 py-3 font-normal">Created</th>
                    <th className="px-4 py-3 font-normal">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr key={l.id} className="border-b border-white/5">
                      <td className="px-4 py-3 text-[12px] text-[var(--platinum)]">
                        {l.brand}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--muted)]">
                        {l.model ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--slate)]">
                        {l.reference}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--slate)]">
                        {sellerMap[l.seller_id] ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={l.status} />
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--platinum-dim)]">
                        {formatPrice(Number(l.asking_price))}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-[var(--muted)]">
                        {formatRelativeDate(l.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/listings/${l.id}`}
                          className="text-[11px] uppercase tracking-[1.5px] text-[var(--gold-subtle)] transition-colors hover:text-[var(--gold)]"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Phase 2 shells — structure now, data when the columns exist ── */}
        <ComingSoonSection title="AI Review Queue" />
        {/* Phase 2: requires listings.ai_flag_status — data not available yet;
            do not imply the system checked real data. */}
        <ComingSoonSection title="Seller Strikes" />
        {/* Phase 2: requires strikes table schema definition — data not
            available yet; do not imply the system checked real data. */}
        <ComingSoonSection title="Curation Health" />
        {/* Phase 2: requires curation metrics — data not available yet. */}
        <ComingSoonSection title="Marketplace Snapshot" />
        {/* Phase 2: requires marketplace aggregates — data not available yet. */}
        <ComingSoonSection title="Buyer Activity" />
        {/* Phase 2: requires buyer activity tracking — data not available yet. */}
      </div>
    </main>
  );
}
