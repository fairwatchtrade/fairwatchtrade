import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountDashboard, { type AccountListing } from "@/components/AccountDashboard";

/* ────────────────────────────────────────────────────────────────────────
   MY LISTINGS — /account  (v1.43)

   Server wrapper. Reads the user from the SSR Supabase client, redirects to
   /sell (the login entry point for now) if unauthenticated, fetches the
   seller's own listings newest-first, and hands them to the client
   <AccountDashboard /> (same server-fetch → client-props pattern as
   browse/page.tsx → BrowseClient.tsx).

   Owner link: listings.seller_id (uuid → auth.users).

   PRIVACY: scoring fields (significance_score, score_state, combined_score)
   are NEVER selected or rendered — the query pulls only buyer-safe columns
   plus status. The curation/evaluate route is untouched (PFC274 = 62).
   ──────────────────────────────────────────────────────────────────────── */

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sell");
  }

  // v2.24 · integrity_hold_reason + seller_clarification_note join the
  // buyer-safe set: both exist to be shown to the owner (held-state copy,
  // clarification round). Still no scoring fields — PFC274 = 62 holds.
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, brand, model, reference, condition, asking_price, status, created_at, photos, integrity_hold_reason, seller_clarification_note"
    )
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const listings = (!error && Array.isArray(data) ? data : []) as AccountListing[];

  return <AccountDashboard listings={listings} />;
}
