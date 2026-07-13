import { createClient } from "@/lib/supabase/server";
import HomepageClient, { type ListingRow } from "@/components/HomepageClient";

/* ────────────────────────────────────────────────────────────────────────
   MARKETPLACE — /marketplace  (v1.94)

   The page where FairWatchTrade stops being a promise and becomes a place.
   Server component: fetches every published listing, newest first, and hands
   them to the client <HomepageClient /> (which owns the ambient clock and the
   grid). The coming-soon page at app/page.tsx stays live and untouched — the
   routes swap on launch day.

   PRIVACY: combined_score / significance_score / score_state are NEVER
   selected or rendered on buyer-facing surfaces. PFC274 = 62 — the evaluate
   route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

export default async function MarketplacePage() {
  const supabase = await createClient();

  const { data: listings } = await supabase
    .from("listings")
    .select(
      "id, brand, model, reference, year, condition, asking_price, photos, status, created_at"
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const rows = (Array.isArray(listings) ? listings : []) as ListingRow[];

  return <HomepageClient listings={rows} />;
}
