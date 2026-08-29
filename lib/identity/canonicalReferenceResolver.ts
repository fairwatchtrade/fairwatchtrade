/* ════════════════════════════════════════════════════════════════════════
   CANONICAL WATCH IDENTITY — the Vault-backed half (SERVER ONLY)

   Deterministic resolution of a listing's identity text to exactly one
   governed `vault_references.id`, and the server-side validation that a
   canonical link arriving over the network is real and compatible.

   ── THIS IS NOT THE PLAUSIBILITY CHECK ─────────────────────────────────
   /api/validate-reference is an ADVISORY layer: it asks whether a
   reference looks consistent with a manufacturer, it is model-mediated,
   it fails open, and it renders silence when content. It has no idea what
   the Vault contains and it never returns an identity.

   This file is IDENTITY PLUMBING: deterministic, Vault-backed, and silent
   about opinions. The two share a moment in the Sell Flow and nothing
   else. Plausibility must never become identity authority — an advisory
   verdict cannot mint a canonical link, and a canonical link is never
   evidence that a reference is "valid".

   ── THE THREE STATES, AND WHY THERE IS NO FOURTH ───────────────────────
     exactly one candidate  → resolved
     zero candidates        → no_match   → null
     more than one          → ambiguous  → null

   `vault_references.reference` is NOT unique, and a real duplicate already
   exists in the corpus. Two rows sharing a reference string are two
   different watches the Vault deliberately distinguishes. Collapsing them
   because their text matches would be the exact failure the Exact
   Identifier Search Law names: a near match presented as the found object.
   Ambiguity therefore resolves to NULL — never to "the first one", never
   to "the closest", never to a score.

   Unknown is an honest answer here. A null canonical link costs nothing;
   a wrong one silently misfiles a watch under another watch's identity.
   ════════════════════════════════════════════════════════════════════════ */

import { createServiceClient } from "@/lib/supabase/service";
import { normalizeBrand } from "@/lib/brandIndex";
import {
  canonicalIdentityKey,
  normalizeModelText,
  referenceCompareKey,
  type CanonicalIdentityContext,
  type CanonicalResolution,
} from "@/lib/identity/canonicalIdentity";

/* Hierarchy is required, not optional: a reference whose chain to a brand is
   broken cannot be constrained by brand, and an unconstrained reference match
   is precisely what this seam refuses to make. !inner drops those rows. */
const SELECT_WITH_CHAIN =
  "id, reference, vault_variants!inner(id, name, vault_families!inner(id, name, vault_collections!inner(id, name, vault_brands!inner(id, name))))";

type ChainRow = {
  id: string;
  reference: string | null;
  vault_variants: {
    id: string;
    name: string | null;
    vault_families: {
      id: string;
      name: string | null;
      vault_collections: {
        id: string;
        name: string | null;
        vault_brands: { id: string; name: string | null } | null;
      } | null;
    } | null;
  } | null;
};

/** A candidate flattened to the four names a constraint can be applied to. */
export type CanonicalCandidate = {
  vaultReferenceId: string;
  reference: string;
  brand: string;
  collection: string;
  family: string;
  variant: string;
};

function flatten(row: ChainRow): CanonicalCandidate | null {
  const variant = row.vault_variants;
  const family = variant?.vault_families;
  const collection = family?.vault_collections;
  const brand = collection?.vault_brands;
  if (!variant || !family || !collection || !brand || !row.reference) return null;
  return {
    vaultReferenceId: row.id,
    reference: row.reference,
    brand: brand.name ?? "",
    collection: collection.name ?? "",
    family: family.name ?? "",
    variant: variant.name ?? "",
  };
}

/* PostgREST hands the pattern to LIKE, so a reference containing % or _
   would otherwise match rows it has no business matching. Escaped here
   rather than stripped — the characters are part of the identifier. */
function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Every Vault reference whose reference text equals the claimed text
 * (case-insensitively) AND which sits under the claimed brand. Brand
 * equality is CANONICAL-NAME ONLY — aliases resolve upstream in the Sell
 * Flow's brand field, and an alias is not permitted to widen identity here
 * because the Vault's alias data is knowingly ambiguous in both directions.
 */
export async function findCanonicalCandidates(
  ctx: CanonicalIdentityContext
): Promise<CanonicalCandidate[]> {
  const refKey = referenceCompareKey(ctx.reference ?? "");
  const brandKey = normalizeBrand(ctx.brand ?? "");
  if (!refKey || !brandKey) return [];

  const db = createServiceClient();
  const { data, error } = await db
    .from("vault_references")
    .select(SELECT_WITH_CHAIN)
    .ilike("reference", escapeLikePattern(refKey));

  if (error || !data) return [];

  return (data as unknown as ChainRow[])
    .map(flatten)
    .filter((c): c is CanonicalCandidate => c !== null)
    /* ilike is anchored and wildcard-free above, but the equality is
       re-asserted on the returned text so collation quirks can never widen
       what counts as the same reference. */
    .filter((c) => referenceCompareKey(c.reference) === refKey)
    .filter((c) => normalizeBrand(c.brand) === brandKey)
    .sort((a, b) => a.vaultReferenceId.localeCompare(b.vaultReferenceId));
}

/**
 * Deterministic resolution. Brand-constrained; when brand alone leaves more
 * than one candidate, model text may narrow further, but ONLY by exact
 * normalized equality against a hierarchy name the Vault actually records
 * (variant, family, or collection). Substring and fuzzy narrowing are
 * deliberately absent — a narrowing that can be wrong is a guess wearing a
 * constraint's clothes.
 */
export async function resolveCanonicalReference(
  ctx: CanonicalIdentityContext
): Promise<CanonicalResolution> {
  const key = canonicalIdentityKey(ctx);
  if (!key) return { status: "no_match", vaultReferenceId: null, key: "" };

  const candidates = await findCanonicalCandidates(ctx);
  if (candidates.length === 0) {
    return { status: "no_match", vaultReferenceId: null, key };
  }
  if (candidates.length === 1) {
    return { status: "resolved", vaultReferenceId: candidates[0].vaultReferenceId, key };
  }

  const model = normalizeModelText(ctx.model ?? "");
  if (model) {
    const narrowed = candidates.filter(
      (c) =>
        normalizeModelText(c.variant) === model ||
        normalizeModelText(c.family) === model ||
        normalizeModelText(c.collection) === model
    );
    if (narrowed.length === 1) {
      return { status: "resolved", vaultReferenceId: narrowed[0].vaultReferenceId, key };
    }
  }

  return { status: "ambiguous", vaultReferenceId: null, key };
}

/**
 * The publication-time authority. A canonical id that arrived over the
 * network is never trusted as an assertion of identity — the server
 * re-resolves from the submitted identity text and the SERVER'S answer is
 * what persists.
 *
 * A supplied id is therefore only ever a corroboration: it is reported back
 * as agreeing or not, and a disagreement changes nothing about what is
 * written. Anything the server cannot resolve unambiguously persists NULL.
 */
export async function resolveCanonicalForPersistence(
  ctx: CanonicalIdentityContext,
  suppliedId: unknown
): Promise<{
  vaultReferenceId: string | null;
  status: CanonicalResolution["status"];
  suppliedAgreed: boolean | null;
}> {
  let resolution: CanonicalResolution;
  try {
    resolution = await resolveCanonicalReference(ctx);
  } catch {
    /* Identity is an enrichment, never a gate. A Vault read failure must
       cost the listing its canonical link, never its publication. */
    return { vaultReferenceId: null, status: "no_match", suppliedAgreed: null };
  }

  const supplied =
    typeof suppliedId === "string" && suppliedId.trim() !== "" ? suppliedId.trim() : null;

  return {
    vaultReferenceId: resolution.vaultReferenceId,
    status: resolution.status,
    suppliedAgreed: supplied === null ? null : supplied === resolution.vaultReferenceId,
  };
}

/**
 * Founder correction path. An admin chooses a REAL row, so the only
 * question is whether that row still exists — compatibility with the
 * listing's free text is deliberately NOT enforced here, because
 * correcting a link on a listing whose seller text is wrong is exactly
 * what this control is for.
 */
export async function vaultReferenceExists(id: string): Promise<CanonicalCandidate | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("vault_references")
    .select(SELECT_WITH_CHAIN)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return flatten(data as unknown as ChainRow);
}

/** The current canonical link on a listing, presented for a human. */
export async function describeCanonicalLink(
  vaultReferenceId: string | null
): Promise<CanonicalCandidate | null> {
  if (!vaultReferenceId) return null;
  return vaultReferenceExists(vaultReferenceId);
}

/** Founder search over the Vault, for choosing a link. Never a Vault editor. */
export async function searchVaultReferences(
  q: string,
  limit = 25
): Promise<CanonicalCandidate[]> {
  const term = (q ?? "").trim();
  if (!term) return [];
  const db = createServiceClient();
  const { data, error } = await db
    .from("vault_references")
    .select(SELECT_WITH_CHAIN)
    .ilike("reference", `%${escapeLikePattern(term)}%`)
    .order("reference")
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as ChainRow[])
    .map(flatten)
    .filter((c): c is CanonicalCandidate => c !== null);
}

/** The raw governed metadata of one Vault reference — the admission
    contract's home. Deliberately NOT part of SELECT_WITH_CHAIN: identity
    resolution and policy reading are different questions, and the chain
    select feeds surfaces that have no business carrying policy blobs. */
export async function vaultReferenceMetadata(id: string): Promise<unknown | null> {
  if (!id) return null;
  const db = createServiceClient();
  const { data, error } = await db
    .from("vault_references")
    .select("metadata")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { metadata?: unknown }).metadata ?? null;
}
