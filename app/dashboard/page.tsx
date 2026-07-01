import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient, { type ListingRow } from "@/components/DashboardClient";

/* ────────────────────────────────────────────────────────────────────────
   BUYER DASHBOARD — /dashboard  (v1.90)

   "What happened while I was away?" — a collector's morning brief, not an
   account page. Server wrapper following the same server-fetch → client-props
   pattern as app/account/page.tsx → AccountDashboard and browse/page.tsx →
   BrowseClient. Reads the user from the SSR Supabase client, redirects to
   /sell (the login entry point for now) if unauthenticated, pulls the
   greeting name from profiles and the newest 3 published listings for the
   discovery feed, and hands them to the client <DashboardClient />.

   Catalogue + saved-watches are Phase 2 (tables don't exist yet) — the client
   renders honest empty shells, no fabricated matches.

   PRIVACY: combined_score / significance_score / score_state are NEVER
   selected or rendered on buyer-facing surfaces. Not now, not in any future
   addition to this file. PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sell");
  }

  // Greeting name.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? null;

  // Discovery feed — the same published listings as /browse, newest 3 only.
  // PRIVACY: combined_score / significance_score / score_state are NEVER
  // selected here. PFC274 = 62.
  const { data: listings } = await supabase
    .from("listings")
    .select(
      "id, brand, model, reference, year, condition, asking_price, photos, details, status, created_at"
    )
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(3);

  const recentListings = (Array.isArray(listings) ? listings : []) as ListingRow[];

  return (
    <DashboardClient displayName={displayName} recentListings={recentListings} />
  );
}
