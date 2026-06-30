import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/* ════════════════════════════════════════════════════════════════════════
   VAULT DRILL-DOWN — app/api/vault/[brandId]/route.ts   (v1.70)

   Returns a brand's full subtree: collections → families → variants →
   references. Called when a star (brand) is entered in the galaxy.

   Nested select is SAFE as written — verified against the live schema:
   each level has exactly ONE foreign key to its parent
     vault_collections.brand_id   → vault_brands.id
     vault_families.collection_id  → vault_collections.id
     vault_variants.family_id      → vault_families.id
     vault_references.variant_id   → vault_variants.id
   Single unambiguous FK per pair → Supabase resolves the nested relation by
   table name (no !fk disambiguation needed). RLS public-read is enabled.

   Visual mapping (3-body galaxy, 5-tier data):
     collection = planet, variant = moon. FAMILY is grouping metadata the
     client surfaces inside the collection card — not an orbital body.
     references appear in the variant detail card.
   ════════════════════════════════════════════════════════════════════════ */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const supabase = await createClient();

  const { data: collections, error } = await supabase
    .from("vault_collections")
    .select(
      `
      id, name, description, sort_order,
      vault_families (
        id, name, description, sort_order,
        vault_variants (
          id, name, description, notes, search_aliases, sort_order,
          vault_references ( id, reference, metadata, sort_order )
        )
      )
    `
    )
    .eq("brand_id", brandId)
    .order("sort_order");

  if (error) {
    return NextResponse.json(
      { collections: [], error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ collections: collections ?? [] });
}
