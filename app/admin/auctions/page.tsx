/* ────────────────────────────────────────────────────────────────────────
   ADMIN — /admin/auctions  (paste-to-parse auction ingest, server component)

   Private single-admin tool. NOT linked from any public nav — direct URL
   only. The first real supply path behind the /api/auctions seam: admin
   pastes auction listing text → AI drafts structured fields → admin
   reviews/corrects → explicit save into auction_events. Human in the loop
   for every row. Text-only v1 by ruling — no URL fetching, ever, here.

   Auth: hardcoded single-admin email gate — the exact /admin/vault-review
   convention. Same silent bounce, same house chrome.
   Canary: PFC274 = 62 — not touched here.
   ──────────────────────────────────────────────────────────────────────── */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminAuctionIngest, {
  type AuctionEventRow,
} from "@/components/AdminAuctionIngest";

const ADMIN_EMAIL = "jmynatt74@gmail.com";

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
      "id, auction_house, auction_title, location, starts_at, ends_at, source_url, online_only, updated_at"
    )
    .order("starts_at", { ascending: true });

  return (
    <main className="min-h-screen bg-[var(--ink)] px-6 py-12 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <div className="text-[8px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
            Internal · Market
          </div>
          <h1 className="mt-2 font-display text-[28px] font-light tracking-[0.3px] text-[var(--platinum)]">
            Auction Ingest
          </h1>
          <p className="mt-1 font-display text-[14px] font-light italic text-[var(--muted)]">
            Paste the listing. The machine drafts; you decide. Nothing saves
            itself.
          </p>
        </div>

        <AdminAuctionIngest events={(events ?? []) as AuctionEventRow[]} />
      </div>
    </main>
  );
}
