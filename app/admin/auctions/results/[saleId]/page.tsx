/* ────────────────────────────────────────────────────────────────────────
   ADMIN — /admin/auctions/results/[saleId]  (sale inspection, server)

   Read-first. One completed sale's whole truth on one page: the sale, its
   source artifacts with their literal rights/retention states, every lot,
   the current result chain heads, and current identity-resolution truth
   with canonical fingerprint freshness — without a terminal, SQL, local
   file path, or hidden route.

   WHAT THIS PAGE REFUSES TO DO: claim source bytes are held when retention
   says metadata_only; become a forensic workstation.

   ⚠ THE "NO IDENTITY ADJUDICATION" REFUSAL THAT STOOD HERE IS RETIRED, and
   deliberately rather than quietly. It was written when no founder review
   workflow for identity existed and this page was right not to invent one.
   One does exist: identity_resolution_review_case is the governed writer,
   the domain already admits subject_type 'auction_lot', and the read model
   below has always surfaced the resulting decision. The page was refusing
   to offer a door to machinery that had since been built.

   So this page is read-first with exactly ONE decision seam on it, mounted
   below the lots table. It still invents no identity architecture: the
   panel calls the existing resolver for candidates and the existing RPC to
   record, and writes nothing itself.

   ⚠ IDENTITY IS NOT PUBLICATION. An exact decision here does not grant
   rights or move a lot into public Market Evidence. Monaco's rights and
   publication state are governed separately and are untouched.

   Auth: founder-UID gate, trusted client only past it — the strongest
   existing admin server pattern.

   Canary: PFC274 = 62 — not touched here.
   ──────────────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchSaleDetail } from "@/lib/auction-operations/readModel";
import { formatMoney } from "@/lib/formatMoney";
import AuctionLotIdentity from "@/components/AuctionLotIdentity";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export const dynamic = "force-dynamic";

const dtCls = "text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]";
const ddCls = "text-[12px] text-[var(--platinum-dim)]";

export default async function AuctionSaleDetailPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const { saleId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_USER_ID) {
    redirect("/");
  }

  const detail = await fetchSaleDetail(createServiceClient(), saleId).catch(() => null);
  if (!detail || !detail.sale) notFound();

  const { sale, artifacts, lots } = detail;
  const outcomes: Record<string, number> = {};
  let priced = 0;
  let resultCount = 0;
  for (const lot of lots) {
    if (lot.result) {
      resultCount += 1;
      outcomes[lot.result.sale_outcome] = (outcomes[lot.result.sale_outcome] ?? 0) + 1;
      if (lot.result.price_realized !== null) priced += 1;
    }
  }

  return (
    <main className="min-h-screen bg-[var(--ink)] px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin/auctions"
          className="text-[10px] uppercase tracking-[2px] text-[var(--slate)] hover:text-[var(--platinum)]"
        >
          ← Auction Operations
        </Link>

        <div className="mt-4 mb-8">
          <div className="text-[10px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
            {sale.house.name}
          </div>
          <h1 className="mt-2 font-display text-[26px] font-light text-[var(--platinum)]">
            {sale.sale_name}
          </h1>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            {sale.sale_date ?? "Date not recorded"}
            {sale.location ? ` · ${sale.location}` : ""}
            {sale.source_url ? (
              <>
                {" · "}
                <a
                  className="underline decoration-[var(--border-mid)] underline-offset-2 hover:text-[var(--platinum)]"
                  href={sale.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  source
                </a>
              </>
            ) : null}
          </p>
        </div>

        {/* ── counts — literal, derived on this page's own data ── */}
        <section className="mb-8 grid grid-cols-2 gap-px border border-[var(--border-subtle)] bg-[var(--border-faint)] sm:grid-cols-4 lg:grid-cols-6">
          {[
            ["Lots", lots.length],
            ["Current results", resultCount],
            ["Sold", outcomes.sold ?? 0],
            ["Passed", outcomes.passed ?? 0],
            ["Withdrawn", outcomes.withdrawn ?? 0],
            ["Unsold", outcomes.unsold ?? 0],
          ].map(([k, v]) => (
            <div key={String(k)} className="bg-[var(--surface)] px-3 py-2">
              <div className={dtCls}>{k}</div>
              <div className="text-[16px] tabular-nums text-[var(--platinum)]">{v}</div>
            </div>
          ))}
        </section>

        {priced < (outcomes.sold ?? 0) && (
          <p className="mb-8 border border-[var(--border-gold)] px-4 py-3 text-[12px] text-[var(--platinum-dim)]">
            {(outcomes.sold ?? 0) - priced} sold lot{(outcomes.sold ?? 0) - priced === 1 ? "" : "s"}{" "}
            carry no realized price on purpose — their source prices remain under semantic
            quarantine (see the source artifact statements below) until a pricing-semantics ruling
            releases them through the governed correction chain.
          </p>
        )}

        {/* ── source artifacts — the literal stored rights truth ── */}
        <section className="mb-8">
          <h2 className="mb-3 font-display text-[18px] font-light text-[var(--platinum)]">
            Source evidence
          </h2>
          <div className="space-y-3">
            {artifacts.map((a) => (
              <div key={a.id} className="border border-[var(--border-subtle)] p-4">
                <div className="break-all text-[12px] text-[var(--platinum-dim)]">{a.source_url}</div>
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-5">
                  <div>
                    <dt className={dtCls}>Intake</dt>
                    <dd className={ddCls}>{a.intake_method}</dd>
                  </div>
                  <div>
                    <dt className={dtCls}>Permission</dt>
                    <dd className={ddCls}>{a.permission_status}</dd>
                  </div>
                  <div>
                    <dt className={dtCls}>Publication</dt>
                    <dd className={ddCls}>{a.publication_status}</dd>
                  </div>
                  <div>
                    <dt className={dtCls}>Public use</dt>
                    <dd className={ddCls}>{a.public_use_scope}</dd>
                  </div>
                  <div>
                    <dt className={dtCls}>Retention</dt>
                    <dd className={ddCls}>{a.artifact_retention_scope}</dd>
                  </div>
                </dl>
                {a.content_hash && (
                  <p className="mt-2 break-all text-[10px] text-[var(--muted)]">
                    Content SHA-256: <span className="tabular-nums">{a.content_hash}</span>
                  </p>
                )}
                {a.attribution_note && (
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">{a.attribution_note}</p>
                )}
                {a.price_basis_statement && (
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                    <span className="uppercase tracking-[1px]">Price basis · </span>
                    {a.price_basis_statement}
                  </p>
                )}
                {a.omission_statement && (
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                    <span className="uppercase tracking-[1px]">Omissions · </span>
                    {a.omission_statement}
                  </p>
                )}
              </div>
            ))}
            {artifacts.length === 0 && (
              <p className="border border-[var(--border-subtle)] px-4 py-6 text-center text-[13px] italic text-[var(--muted)]">
                No source artifacts are recorded for this sale.
              </p>
            )}
          </div>
        </section>

        {/* ── lots + current results + identity truth ── */}
        <section>
          <h2 className="mb-3 font-display text-[18px] font-light text-[var(--platinum)]">Lots</h2>
          {lots.length === 0 ? (
            <p className="border border-[var(--border-subtle)] px-4 py-6 text-center text-[13px] italic text-[var(--muted)]">
              No lots are recorded for this sale.
            </p>
          ) : (
            <div className="overflow-x-auto border border-[var(--border-subtle)]">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    {["Lot", "Brand", "Model", "Reference", "Outcome", "Result", "Identity"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-faint)]">
                  {lots.map((lot) => (
                    <tr key={lot.id}>
                      <td className="px-3 py-2 text-[12px] tabular-nums text-[var(--platinum)]">
                        {lot.lot_number}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[var(--platinum-dim)]">
                        {lot.brand_text ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[var(--platinum-dim)]">
                        {lot.model_text ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[var(--platinum-dim)]">
                        {lot.reference_text ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px] uppercase tracking-[1px] text-[var(--platinum-dim)]">
                        {lot.result?.sale_outcome ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px] tabular-nums text-[var(--platinum-dim)]">
                        {lot.result?.price_realized != null
                          ? formatMoney(lot.result.price_realized, lot.result.currency)
                          : lot.result?.sale_outcome === "sold"
                            ? "withheld"
                            : "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-[var(--platinum-dim)]">
                        {lot.identity
                          ? `${lot.identity.outcome}${lot.identity.fingerprint_fresh ? "" : " · stale"}`
                          : "no case"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* THE ONE DECISION SEAM ON A READ-FIRST PAGE. Mounted below the
            table rather than inside it: the table is the sale's truth and
            stays server-rendered and static, while adjudication is a
            deliberate, one-lot-at-a-time act that a founder opts into.
            Passing only the four identity-bearing fields keeps the client
            island from receiving result prices it has no business holding. */}
        <AuctionLotIdentity
          lots={lots.map((l) => ({
            id: l.id,
            lot_number: l.lot_number,
            brand_text: l.brand_text,
            model_text: l.model_text,
            reference_text: l.reference_text,
            hasIdentity: !!l.identity,
          }))}
        />
      </div>
    </main>
  );
}
