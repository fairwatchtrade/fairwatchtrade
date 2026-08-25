import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CatalogueClient, { type ListingRow } from "@/components/CatalogueClient";
import type { CatalogueMatchRow, CatalogueSearch } from "@/lib/catalogueMatches";
import { getSignedInDisplayIdentity } from "@/lib/signedInDisplayIdentity";

/* ────────────────────────────────────────────────────────────────────────
   BUYER CATALOGUE — /catalogue

   "What happened while I was away?" — a collector's morning brief, not an
   account page. Server wrapper following the same server-fetch → client-props
   pattern as app/account/page.tsx → AccountDashboard. Reads the user from the
   SSR Supabase client; an unauthenticated visitor is sent to SIGN-IN with
   /catalogue preserved as the callbackUrl.

   Permissioned Adjacency (2026-08-12 build order): the old "Discovery" feed
   — the marketplace-wide newest three published listings — is GONE. Browse
   is what is on FairWatchTrade; Catalogue is what is relevant to THIS
   collector. What renders here now is collector-scoped truth only: the
   collector's own saved searches and the matches FairWatchTrade accrued for
   them (exact, and — only where the collector opted in per search —
   explainable close matches). Both reads are RLS own-row; the listing join
   resolves under listings_select_public_or_own, so an unpublished match
   simply returns no listing and renders nothing.

   PRIVACY: combined_score / significance_score / score_state are NEVER
   selected or rendered on buyer-facing surfaces. Not now, not in any future
   addition to this file. PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

export default async function CataloguePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?callbackUrl=/catalogue");
  }

  const displayName = await getSignedInDisplayIdentity(supabase, user);

  // The collector's saved searches — names for attribution, paused and
  // include_adjacent so presentation can honor both at read time.
  const { data: searchRows } = await supabase
    .from("saved_searches")
    .select("id, name, paused, include_adjacent");

  // Accrued matches, newest first, each with its listing (or null when the
  // watch is no longer publicly readable — those render nothing here).
  const { data: matchRows } = await supabase
    .from("saved_search_matches")
    .select(
      "id, saved_search_id, match_kind, adjacent_reason, created_at, listing:listings(id, brand, model, reference, year, condition, asking_price, asking_currency, photos, details, status, created_at)"
    )
    .order("created_at", { ascending: false });

  const searches = (Array.isArray(searchRows) ? searchRows : []) as CatalogueSearch[];
  const matches = (Array.isArray(matchRows)
    ? matchRows
    : []) as unknown as CatalogueMatchRow<ListingRow>[];

  return (
    <CatalogueClient
      displayName={displayName}
      searches={searches}
      matchRows={matches}
    />
  );
}
