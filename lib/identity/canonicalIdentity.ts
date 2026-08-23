/* ════════════════════════════════════════════════════════════════════════
   CANONICAL WATCH IDENTITY — the pure half (client-safe, no runtime deps)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     Manufacturer reference TEXT is not canonical listing identity.

   `listings.reference` is what a seller typed. `listings.vault_reference_id`
   is what FairWatchTrade has determined the watch canonically IS. They are
   different facts with different provenance and they never collapse into
   one another. This file holds only the normalization and the key — the
   part that must run identically in the browser and on the server, so a
   resolution made in the Sell Flow and a validation made at publication
   agree about what "the same identity context" means.

   ── WHY THE REFERENCE NORMALIZER IS DELIBERATELY TIMID ─────────────────
   Brand text tolerates aggressive normalization: "girard perregaux" and
   "Girard-Perregaux" are one maker, and stripping punctuation is safe
   because a maker's identity does not live in its hyphen.

   A reference is the opposite. Under the Exact Identifier Search Law one
   changed character can identify a different case material, dial,
   movement, generation, or market. "5711/1A-010" and "57111A010" are not
   established to be the same watch, and this seam is not permitted to
   assume it. So reference normalization does exactly two things —
   collapses whitespace and compares without case — and nothing else. No
   punctuation stripping, no separator folding, no "helpful" tidying.

   Widening this normalizer widens what the platform will silently call
   the same watch. That is a founder ruling, not an implementation detail.
   ════════════════════════════════════════════════════════════════════════ */

import { normalizeBrand } from "@/lib/brandIndex";

/** The identity context a canonical resolution is made against. Model is
    optional supporting context; brand and reference are the real inputs. */
export type CanonicalIdentityContext = {
  brand: string;
  model: string;
  reference: string;
};

/**
 * Timid by design — whitespace collapse only. Case is handled at compare
 * time. See the header: this is the Exact Identifier Search Law's floor.
 */
export function normalizeReferenceText(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

/** Compare key for a reference. Case-insensitive, nothing else. */
export function referenceCompareKey(s: string): string {
  return normalizeReferenceText(s).toLowerCase();
}

/**
 * Model text is only ever used for EXACT hierarchy-name equality, never for
 * substring or fuzzy matching, so it normalizes as aggressively as brand.
 */
export function normalizeModelText(s: string): string {
  return normalizeBrand(s);
}

/**
 * The stable fingerprint of the identity context that produced a canonical
 * link. Stored beside the resolved id so a later edit to brand, model, or
 * reference is DETECTABLE rather than silently carrying a stale identity.
 *
 * An empty brand or reference yields "" — no context, therefore no key, and
 * therefore nothing a stale id could ever match against.
 */
export function canonicalIdentityKey(ctx: CanonicalIdentityContext): string {
  const brand = normalizeBrand(ctx.brand ?? "");
  const reference = referenceCompareKey(ctx.reference ?? "");
  if (!brand || !reference) return "";
  return `${brand}|${normalizeModelText(ctx.model ?? "")}|${reference}`;
}

/**
 * True when a previously resolved canonical id still belongs to the identity
 * text currently on the draft. The one question the Sell Flow asks before
 * carrying a canonical id forward.
 */
export function canonicalKeyStillValid(
  storedKey: string | null | undefined,
  ctx: CanonicalIdentityContext
): boolean {
  const key = canonicalIdentityKey(ctx);
  return key !== "" && key === (storedKey ?? "");
}

/** The three states a deterministic resolution may end in. Never a guess. */
export type CanonicalResolutionStatus = "resolved" | "no_match" | "ambiguous";

export type CanonicalResolution = {
  status: CanonicalResolutionStatus;
  /** Present only when status is "resolved". */
  vaultReferenceId: string | null;
  /** The identity key this resolution was made against. */
  key: string;
};
