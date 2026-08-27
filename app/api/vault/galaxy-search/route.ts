import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchGalaxyBrands } from "@/lib/vaultGalaxySearch";

/* ════════════════════════════════════════════════════════════════════════
   PUBLIC GALAXY SEARCH — server-side alias matching   (v6.86)

   The Vault Galaxy is public and stays public. What changed is that the brand
   `search_aliases` corpus (curated collector-language IP) no longer ships to
   the browser inside the page payload. The page delivers brands WITHOUT
   aliases; this route holds the alias data and answers one query at a time.

   IT RETURNS ONLY per-brand scores and the best-match id — never the aliases
   themselves. A visitor can probe individual queries ("does 'lange' match
   something?"); a visitor can no longer download the whole dictionary in one
   request the way an anonymous page fetch used to allow.

   NO AUTH by design: the Galaxy is anonymously reachable, so its search must
   be too. This reads the same public `vault_galaxy_brands` view the page
   reads, ordered identically so tie-breaks match the client exactly.

   The scoring lives in lib/vaultGalaxySearch and is shared with the client's
   offline fallback, so this route and that fallback can never rank differently.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  const supabase = await createClient();
  const { data: brands, error } = await supabase
    .from("vault_galaxy_brands")
    .select("id, name, description, search_aliases, cluster")
    .order("name");

  if (error || !brands) {
    /* Fail soft: no scores. The client falls back to matching the fields it
       already holds (name/description/cluster), so search never breaks and
       our infra problem never becomes a broken Galaxy. */
    return NextResponse.json({ scores: {}, bestId: null });
  }

  return NextResponse.json(searchGalaxyBrands(brands, q));
}
