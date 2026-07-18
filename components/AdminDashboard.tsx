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
  // Operations-Center attention fields (fetched by app/admin/page.tsx).
  completeness_score: number | null;
  significance_score: number | null;
  description_passed_ai: boolean | null;
  custom_brand_flag: boolean | null;
};

// One number, whole page updates. Tune after real listings arrive.
const LOW_COMPLETENESS_THRESHOLD = 12;

// A listing "needs attention" if any of these are true.
function isFlagged(l: AdminListing): boolean {
  return (
    l.description_passed_ai === false ||
    l.custom_brand_flag === true ||
    (l.completeness_score ?? 99) < LOW_COMPLETENESS_THRESHOLD
  );
}
function problemRank(l: AdminListing): number {
  return (
    (l.description_passed_ai === false ? 1 : 0) +
    (l.custom_brand_flag === true ? 1 : 0) +
    ((l.completeness_score ?? 99) < LOW_COMPLETENESS_THRESHOLD ? 1 : 0)
  );
}

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
      <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--muted)]">
        {title}
      </div>
      <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center">
        <div className="font-display text-[11px] italic text-[var(--muted)]">
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

  /* ── ZONE 1: NEEDS ATTENTION (work queue) ──────────────────────────────
     Config array — each item only renders if count > 0. Add a watch item =
     add one object. This is the hero: "what do I do first?" */
  const aiFailed = listings.filter((l) => l.description_passed_ai === false);
  const lowCompleteness = listings.filter(
    (l) => (l.completeness_score ?? 99) < LOW_COMPLETENESS_THRESHOLD
  );
  const customBrand = listings.filter((l) => l.custom_brand_flag === true);

  const attentionItems = [
    {
      key: "ai",
      count: aiFailed.length,
      label: (n: number) =>
        `${n} listing${n === 1 ? "" : "s"} failed AI description review`,
    },
    {
      key: "completeness",
      count: lowCompleteness.length,
      label: (n: number) =>
        `${n} listing${n === 1 ? "" : "s"} under completeness threshold (${LOW_COMPLETENESS_THRESHOLD})`,
    },
    {
      key: "custom",
      count: customBrand.length,
      label: (n: number) =>
        `${n} custom-brand submission${n === 1 ? "" : "s"} to verify`,
    },
    {
      key: "new24h",
      count: counts.last24h,
      label: (n: number) =>
        `${n} new listing${n === 1 ? "" : "s"} in last 24 hours`,
    },
  ].filter((i) => i.count > 0);

  // Explorer rows: problems float to the top, then newest first.
  const sortedListings = [...listings].sort((a, b) => {
    const pr = problemRank(b) - problemRank(a);
    if (pr !== 0) return pr;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-faint)] bg-[var(--ink)] px-8 py-4">
        <div>
          {/* v2.26c legibility pass — supporting microtype lifted one notch:
              --gold-subtle → --gold-dim (same gold family, opaque, ~2x
              contrast). Heading below stays --platinum, untouched. */}
          <div className="text-[8px] uppercase tracking-[4px] text-[var(--gold-dim)]">
            Admin · FairWatchTrade
          </div>
          <div className="mt-1 font-display text-[22px] font-light text-[var(--platinum)]">
            Marketplace Control
          </div>
        </div>

        {/* URGENT fix (Admin-Back-To-Account-Link.md): the only way back to
            /account from here was closing the tab and re-navigating by hand.
            Immediately visible, not buried — this is for founder utility
            only, no one else ever sees this page. */}
        <Link
          href="/account"
          className="border border-[var(--border-gold)] px-4 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--gold)] transition-colors hover:bg-[rgba(201,168,76,0.06)]"
        >
          ← Back to Seller Workspace
        </Link>
      </div>

      <div className="px-8 py-8">
        {/* ── ZONE 1: NEEDS ATTENTION — the work queue, always first ── */}
        <section
          className={`mb-10 border bg-[var(--surface)] ${
            attentionItems.length
              ? "border-[var(--border-subtle)] border-l-2 border-l-[var(--danger)]"
              : "border-[var(--border-faint)]"
          }`}
        >
          <div className="px-5 py-3">
            <div
              className={`text-[9px] uppercase tracking-[2.5px] ${
                attentionItems.length
                  ? "text-[var(--danger)]"
                  : "text-[var(--gold-dim)]"
              }`}
            >
              {attentionItems.length
                ? "Needs Attention"
                : "Nothing Needs Attention"}
            </div>
            {attentionItems.length > 0 ? (
              <ul className="mt-3 divide-y divide-white/5">
                {attentionItems.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center justify-between py-2.5"
                  >
                    <span className="text-[13px] text-[var(--platinum)]">
                      {item.label(item.count)}
                    </span>
                    <a
                      href="#explorer"
                      className="border border-[var(--border-subtle)] px-3 py-1 text-[10px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] transition-colors hover:border-[var(--gold-subtle)] hover:text-[var(--gold)]"
                    >
                      Review →
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 font-display text-[12px] italic text-[var(--muted)]">
                Queue is clear — no AI failures, completeness gaps, or
                custom-brand submissions pending.
              </div>
            )}
          </div>
        </section>

        {/* ── ZONE 2: MARKETPLACE HEALTH — informational cards ── */}
        <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--muted)]">
          Marketplace Health
        </div>
        {/* Stat cards — 2 col mobile, 3 tablet, 6 desktop */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div
              key={s.label}
              className="border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-4"
            >
              <div className="text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
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

        {/* ── ZONE 3: MARKETPLACE EXPLORER — the operator table ── */}
        <section id="explorer" className="mt-10">
          <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--muted)]">
            Marketplace Explorer · {listings.length} listing
            {listings.length === 1 ? "" : "s"} · problems first
          </div>

          {listings.length === 0 ? (
            <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center font-display text-[11px] italic text-[var(--muted)]">
              No listings in the marketplace yet.
            </div>
          ) : (
            <div className="overflow-x-auto border border-[var(--border-subtle)]">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[8px] uppercase tracking-[2px] text-[var(--muted)]">
                    <th className="px-4 py-3 font-normal">Brand</th>
                    <th className="px-4 py-3 font-normal">Model</th>
                    <th className="px-4 py-3 font-normal">Reference</th>
                    <th className="px-4 py-3 font-normal">Seller</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal">Compl.</th>
                    <th className="px-4 py-3 font-normal">Signif.</th>
                    <th className="px-4 py-3 font-normal">AI</th>
                    <th className="px-4 py-3 font-normal">Custom</th>
                    <th className="px-4 py-3 font-normal">Price</th>
                    <th className="px-4 py-3 font-normal">Created</th>
                    <th className="px-4 py-3 font-normal">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedListings.map((l) => {
                    const low =
                      (l.completeness_score ?? 99) < LOW_COMPLETENESS_THRESHOLD;
                    const aiFail = l.description_passed_ai === false;
                    const custom = l.custom_brand_flag === true;
                    return (
                      <tr
                        key={l.id}
                        className={`border-b border-white/5 ${
                          isFlagged(l) ? "bg-[var(--danger)]/[0.06]" : ""
                        }`}
                      >
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
                        <td
                          className={`px-4 py-3 text-[12px] ${
                            low
                              ? "font-semibold text-[var(--danger)]"
                              : "text-[var(--platinum-dim)]"
                          }`}
                        >
                          {l.completeness_score ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[var(--platinum-dim)]">
                          {l.significance_score ?? "—"}
                        </td>
                        <td
                          className={`px-4 py-3 text-[12px] font-semibold ${
                            aiFail
                              ? "text-[var(--danger)]"
                              : l.description_passed_ai === true
                              ? "text-[var(--platinum-dim)]"
                              : "text-[var(--ghost)]"
                          }`}
                        >
                          {aiFail
                            ? "✗"
                            : l.description_passed_ai === true
                            ? "✓"
                            : "—"}
                        </td>
                        <td
                          className={`px-4 py-3 text-[11px] uppercase tracking-[1px] ${
                            custom
                              ? "font-semibold text-[var(--gold)]"
                              : "text-[var(--ghost)]"
                          }`}
                        >
                          {custom ? "Flag" : "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[var(--platinum-dim)]">
                          {formatPrice(Number(l.asking_price))}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-[var(--muted)]">
                          {formatRelativeDate(l.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/listings/${l.id}`}
                            className="text-[11px] uppercase tracking-[1.5px] text-[var(--gold-dim)] transition-colors hover:text-[var(--gold)]"
                          >
                            Open →
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
