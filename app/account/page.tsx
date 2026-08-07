import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountDashboard, {
  type AccountListing,
  type AccountDecisionEvent,
} from "@/components/AccountDashboard";

/* ────────────────────────────────────────────────────────────────────────
   MY LISTINGS — /account  (v1.43)

   Server wrapper. Reads the user from the SSR Supabase client; an
   unauthenticated visitor is sent to SIGN-IN with /account preserved as the
   callbackUrl (the same pattern as /catalogue — never bounced to /sell).
   Fetches the seller's own listings newest-first and hands them to the client
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
    redirect("/login?callbackUrl=/account");
  }

  // v2.24 · integrity_hold_reason + seller_clarification_note join the
  // buyer-safe set: both exist to be shown to the owner (held-state copy,
  // clarification round). Still no scoring fields — PFC274 = 62 holds.
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, brand, model, reference, condition, asking_price, asking_currency, status, created_at, photos, integrity_hold_reason, seller_clarification_note, rejection_reason"
    )
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const listings = (!error && Array.isArray(data) ? data : []) as AccountListing[];

  /* ── The reason the seller is owed ──────────────────────────────────────
     rejection_reason was never fetched here, so a founder could write a
     reason that only the dealer workspace could read — the ordinary seller
     saw the word "Rejected" and nothing else. It joins the select above.

     The decision events carry the rest: return-to-draft has no listing
     column of its own, and only the event history can say what was decided
     BEFORE the current state. RLS scopes this to the seller's own listings,
     and the founder-only reviewer note lives in a different table entirely,
     so nothing internal can arrive here. Newest first, capped — this is a
     status explanation, not an audit log. */
  const ids = listings.map((l) => l.id);
  let decisions: AccountDecisionEvent[] = [];
  if (ids.length > 0) {
    const { data: events } = await supabase
      .from("listing_decision_events")
      .select("listing_id, decision, seller_message, created_at")
      .in("listing_id", ids)
      .order("id", { ascending: false })
      .limit(60);
    decisions = (Array.isArray(events) ? events : []) as AccountDecisionEvent[];
  }

  return <AccountDashboard listings={listings} decisions={decisions} />;
}
