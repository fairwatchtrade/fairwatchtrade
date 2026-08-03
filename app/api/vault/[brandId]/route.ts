import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/* ════════════════════════════════════════════════════════════════════════
   VAULT DRILL-DOWN — app/api/vault/[brandId]/route.ts   (v3.26)

   Returns a brand's live subtree: collections → families → variants →
   references. Called when a star (brand) is entered in the galaxy.

   ── WHY THIS IS ONE RPC AND NOT A NESTED SELECT ──────────────────────
   It used to be a nested PostgREST select filtered only by brand_id, which
   made it the widest hole in the Galaxy: any brand UUID returned that
   brand's entire subtree regardless of publication state, and no
   descendant level carried publication state at all.

   Filtering here, in the client, or as four remembered .eq() filters would
   all leave the same class of bug one forgetful edit away. Instead
   public.galaxy_brand_subtree() assembles the response from the
   ancestor-closed vault_galaxy_* views, so:

     · a hidden brand yields SQL NULL → 404, and no body is ever built;
     · every level returned is live AND has none but live ancestors;
     · a descendant incorrectly marked live under a hidden ancestor is
       structurally unreachable, not merely filtered;
     · knowing or guessing a UUID buys nothing.

   The JSON shape is unchanged — the client still reads collections with
   nested vault_families → vault_variants → vault_references, ordered by
   sort_order — so VaultGalaxy needed no edit.

   Visual mapping (3-body galaxy, 5-tier data):
     collection = planet, variant = moon. FAMILY is grouping metadata the
     client surfaces inside the collection card — not an orbital body.
     references appear in the variant detail card.
   ════════════════════════════════════════════════════════════════════════ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;

  // A malformed id is not a database question.
  if (!UUID_RE.test(brandId)) {
    return NextResponse.json({ collections: [], error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("galaxy_brand_subtree", {
    p_brand_id: brandId,
  });

  if (error) {
    return NextResponse.json(
      { collections: [], error: error.message },
      { status: 500 }
    );
  }

  // NULL means "not a live brand". Unpublished and non-existent are
  // deliberately indistinguishable from outside — the Galaxy owes a
  // withheld brand no acknowledgement that it exists.
  if (data === null) {
    return NextResponse.json({ collections: [], error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ collections: data });
}
