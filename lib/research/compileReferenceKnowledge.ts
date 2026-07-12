import { createServiceClient } from "@/lib/supabase/service";
import { upsertVersioned } from "@/lib/research/versionedUpsert";

/* ════════════════════════════════════════════════════════════════════════
   REFERENCE KNOWLEDGE COMPILER — lib/research/compileReferenceKnowledge.ts

   Input: referenceId — a vault_references.id, ALREADY resolved (from the
   resolution seam, when non-null). This function does not resolve; it only
   compiles. Callers must not invoke this with an unresolved/null reference —
   per the locked degradation rule, no reference_knowledge row should ever be
   created for a listing that hasn't resolved. Wiring "when to call this" is
   future orchestration, not part of this build.

   Joins the VERIFIED live chain (re-confirmed this session, unchanged from
   Phase 1 verification):
     vault_references.variant_id   → vault_variants.id
     vault_variants.family_id      → vault_families.id
     vault_families.collection_id  → vault_collections.id
     vault_collections.brand_id    → vault_brands.id

   Produces ONLY fields verified to exist in the live schema today. Several
   fields the original Phase 1 brief described as Reference Knowledge content
   (movement, beat rate, production years, known variations) do NOT exist as
   columns anywhere in this chain — they are NOT invented here. See the
   delivery notes for this flagged gap.

   vault_brands' Vault-Galaxy-internal fields (galaxy_x/y/z, cluster,
   cluster_staging, cluster_reviewed, cluster_rationale, region_staging,
   cluster_rationale_staging) are deliberately EXCLUDED from the payload —
   they are curation/display-engine internals, not collector-facing Reference
   Knowledge.

   vault_references.metadata is empty for every live row today (verified).
   It is still read and passed through under referenceMetadata so the
   compiler is forward-compatible the moment the Vault starts populating it —
   this does not fabricate content, it stores whatever is actually there
   (currently {}).

   Writes to reference_knowledge, keyed by vault_reference_id, via the shared
   upsertVersioned helper — idempotent refresh, version bump, never a
   partial/corrupting write.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type CompileResult =
  | { ok: true; id: string; version: number }
  | { ok: false; reason: string };

export async function compileReferenceKnowledge(referenceId: string): Promise<CompileResult> {
  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[research] reference_knowledge: service client unavailable:", e);
    return { ok: false, reason: "service_client_unavailable" };
  }

  // Single nested select down the verified chain. Each level has exactly one
  // FK to its parent (confirmed this session), so PostgREST embedding is
  // unambiguous without needing an explicit constraint-name hint.
  const { data, error } = await service
    .from("vault_references")
    .select(
      `
      id, reference, sort_order, metadata,
      vault_variants (
        id, name, description, notes, search_aliases, sort_order,
        vault_families (
          id, name, description, sort_order,
          vault_collections (
            id, name, description, sort_order,
            vault_brands (
              id, name, slug, description, country_of_origin, independent_status, region, search_aliases
            )
          )
        )
      )
    `
    )
    .eq("id", referenceId)
    .maybeSingle();

  if (error) {
    console.error("[research] reference_knowledge: Vault join read failed:", error.message);
    return { ok: false, reason: "vault_join_read_failed" };
  }
  if (!data) {
    // Referenced ID doesn't exist in the Vault (shouldn't happen if the
    // caller only passes IDs that came from the resolution seam, but never
    // trust an upstream caller blindly). No row written.
    return { ok: false, reason: "reference_not_found" };
  }

  // Supabase's nested embed returns arrays or single objects depending on
  // whether the relation is inferred as to-one; these are all to-one FKs, so
  // treat as objects but defensively unwrap if the client returns arrays.
  const variant = Array.isArray(data.vault_variants) ? data.vault_variants[0] : data.vault_variants;
  const family = variant ? (Array.isArray(variant.vault_families) ? variant.vault_families[0] : variant.vault_families) : null;
  const collection = family ? (Array.isArray(family.vault_collections) ? family.vault_collections[0] : family.vault_collections) : null;
  const brand = collection ? (Array.isArray(collection.vault_brands) ? collection.vault_brands[0] : collection.vault_brands) : null;

  if (!variant || !family || !collection || !brand) {
    // A broken chain (should be prevented by the NOT NULL FKs, but the join
    // itself is the truth here — an INNER-style embed returning a gap means
    // the chain didn't fully resolve). Do not write a partial row.
    console.error(
      `[research] reference_knowledge: incomplete Vault chain for reference ${referenceId} — not writing.`
    );
    return { ok: false, reason: "incomplete_vault_chain" };
  }

  const payload = {
    brand: {
      name: brand.name ?? null,
      slug: brand.slug ?? null,
      description: brand.description ?? null,
      countryOfOrigin: brand.country_of_origin ?? null,
      independentStatus: brand.independent_status ?? null,
      region: brand.region ?? null,
      searchAliases: brand.search_aliases ?? [],
    },
    collection: {
      name: collection.name ?? null,
      description: collection.description ?? null,
    },
    family: {
      name: family.name ?? null,
      description: family.description ?? null,
    },
    variant: {
      name: variant.name ?? null,
      description: variant.description ?? null,
      notes: variant.notes ?? null,
      searchAliases: variant.search_aliases ?? [],
    },
    reference: {
      reference: data.reference ?? null,
      sortOrder: data.sort_order ?? null,
      // Pass-through only — empty today for every live row. Not fabricated.
      referenceMetadata: data.metadata ?? {},
    },
  };

  const sectionFreshness = {
    vault: "compiled", // this compiler has exactly one section today
  };

  const result = await upsertVersioned(
    service,
    "reference_knowledge",
    "vault_reference_id",
    referenceId,
    payload,
    sectionFreshness
  );

  if (!result) {
    return { ok: false, reason: "upsert_failed" };
  }
  return { ok: true, id: result.id, version: result.version };
}
