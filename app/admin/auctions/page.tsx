/* ────────────────────────────────────────────────────────────────────────
   ADMIN — /admin/auctions  (Auction Operations, server component)

   The single obvious auction room: Upcoming Auctions (future event /
   calendar truth → the public MarketBar) and Auction Results (completed
   sale / historical evidence truth → Market Intel) — one page, two
   workspaces, two data domains that never merge. Reached through the
   visible Auctions doorway in Marketplace Control; no hidden URL required.

   Auth: this page keeps the established hardcoded single-admin email gate
   (the /admin/vault-review convention) for the Upcoming machinery it always
   had; the Results read model additionally requires the trusted client,
   created only after that gate passes. Every Results API route carries its
   own independent founder-UID gate — neither surface trusts the other.

   Canary: PFC274 = 62 — not touched here.
   ──────────────────────────────────────────────────────────────────────── */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import AdminAuctionOperations from "@/components/AdminAuctionOperations";
import { type AuctionEventRow } from "@/components/AdminAuctionIngest";
import { fetchResultsReadModel } from "@/lib/auction-operations/readModel";
import type { ResultsSaleRow } from "@/lib/auction-operations/resultsPresentation";

const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const dynamic = "force-dynamic";

export default async function AdminAuctionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in, or not the admin → bounce. No hint that the page exists.
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    redirect("/");
  }

  const { data: events } = await supabase
    .from("auction_events")
    .select(
      "id, auction_house, auction_title, location, starts_at, ends_at, source_url, preview_url, catalog_url, online_only, updated_at"
    )
    .order("starts_at", { ascending: true });

  // Results read model — trusted client, reached only past the gate above.
  let results: ResultsSaleRow[] = [];
  try {
    results = await fetchResultsReadModel(createServiceClient());
  } catch (e) {
    // The room stays usable for Upcoming work even if the read model is
    // briefly unavailable; the Results list simply reports empty truth.
    console.error("[auction-ops] results read model unavailable:", e);
  }

  return (
    <main className="min-h-screen bg-[var(--ink)] px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
            Admin · Market
          </div>
          <h1 className="mt-2 font-display text-[28px] font-light tracking-[0.3px] text-[var(--platinum)]">
            Auction Operations
          </h1>
          <p className="mt-1 font-display text-[14px] font-light italic text-[var(--muted)]">
            Upcoming sales for the public strip. Completed results for Market Intel. Two jobs, one
            room.
          </p>
        </div>

        <AdminAuctionOperations upcoming={(events ?? []) as AuctionEventRow[]} results={results} />
      </div>
    </main>
  );
}
