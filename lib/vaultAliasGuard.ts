/* ════════════════════════════════════════════════════════════════════════
   VAULT ALIAS GUARD — write-side collision prevention.

   Brand enrichment asks a language model for one brand's aliases at a time,
   with no knowledge of the other 191 rows. That isolation is how the corpus
   acquired aliases that quietly claimed a different maker's identity:
   "TAG Heuer" filed under Heuer, "MB&F" filed under a second row, "Chaykin"
   claimed by two brands at once, and Cyrillic strings that normalize to an
   empty key and would match everything.

   This guard runs immediately before any alias write. It screens a proposal
   against the whole existing corpus and returns two lists: the aliases that
   are safe to store, and the ones held back with the exact reason.

   IT NEVER PICKS A WINNER. When two brands could claim the same alias, both
   canonical rows are preserved untouched and the ambiguity is reported for
   a person to settle. Silently choosing is how the defect was created; a
   loud hold is the correction.

   Normalization is shared with the Sell consumer (lib/brandIndex.ts) so the
   write side and the read side can never disagree about what "the same
   alias" means.
   ════════════════════════════════════════════════════════════════════════ */

import { normalizeBrand } from "./brandIndex.ts";

/** An existing brand row, narrowed to what screening needs. */
export type BrandRow = {
  id: string;
  name: string;
  search_aliases?: string[] | null;
};

export type AliasHoldReason =
  /** Normalizes to nothing usable — a non-Latin string would match everything. */
  | "empty_key"
  /** Restates the brand's own name; carries no search value. */
  | "self_reference"
  /** Equals another brand's canonical name — the cross-brand shadow. */
  | "shadows_canonical"
  /** Another brand already claims this alias. */
  | "claimed_by_other_brand"
  /** Proposed twice in the same batch. */
  | "duplicate_in_proposal";

export type HeldAlias = {
  alias: string;
  reason: AliasHoldReason;
  /** The other brand involved, when the reason names one. */
  conflictsWith?: string;
};

export type AliasVerdict = {
  /** Safe to write, in proposal order. */
  accepted: string[];
  /** Withheld, each with the reason a person needs to settle it. */
  held: HeldAlias[];
};

export const HOLD_EXPLANATIONS: Record<AliasHoldReason, string> = {
  empty_key: "normalizes to an empty key and would match every brand",
  self_reference: "restates the brand's own name",
  shadows_canonical: "is another brand's canonical name",
  claimed_by_other_brand: "is already claimed by another brand",
  duplicate_in_proposal: "was proposed more than once in this batch",
};

/**
 * Screen proposed aliases for one brand against the existing corpus.
 *
 * @param brandId  the row receiving the aliases
 * @param brandName  its canonical name
 * @param proposed  the aliases the enrichment step wants to write
 * @param corpus  every brand row, including the one being written
 */
export function screenAliases(
  brandId: string,
  brandName: string,
  proposed: readonly string[],
  corpus: readonly BrandRow[]
): AliasVerdict {
  const ownKey = normalizeBrand(brandName);

  /* Every OTHER brand's canonical name, and every alias any other brand
     already holds. Both are grounds to refuse — one is a shadow, the other
     is a contested claim. */
  const canonicalElsewhere = new Map<string, string>();
  const claimedElsewhere = new Map<string, string>();
  for (const row of corpus) {
    if (!row || row.id === brandId) continue;
    const key = normalizeBrand(row.name ?? "");
    if (key) canonicalElsewhere.set(key, row.name);
    for (const alias of row.search_aliases ?? []) {
      const aliasKey = normalizeBrand(alias ?? "");
      if (aliasKey && !claimedElsewhere.has(aliasKey)) {
        claimedElsewhere.set(aliasKey, row.name);
      }
    }
  }

  const accepted: string[] = [];
  const held: HeldAlias[] = [];
  const seen = new Set<string>();

  for (const alias of proposed) {
    const key = normalizeBrand(alias ?? "");

    if (!key) {
      held.push({ alias, reason: "empty_key" });
      continue;
    }
    if (key === ownKey) {
      held.push({ alias, reason: "self_reference" });
      continue;
    }
    if (seen.has(key)) {
      held.push({ alias, reason: "duplicate_in_proposal" });
      continue;
    }
    const shadowed = canonicalElsewhere.get(key);
    if (shadowed) {
      held.push({ alias, reason: "shadows_canonical", conflictsWith: shadowed });
      continue;
    }
    const claimed = claimedElsewhere.get(key);
    if (claimed) {
      held.push({ alias, reason: "claimed_by_other_brand", conflictsWith: claimed });
      continue;
    }

    seen.add(key);
    accepted.push(alias);
  }

  return { accepted, held };
}

/** One line per held alias, for the operator running the enrichment. */
export function describeHeld(held: readonly HeldAlias[]): string[] {
  return held.map((h) => {
    const why = HOLD_EXPLANATIONS[h.reason];
    return h.conflictsWith
      ? `held "${h.alias}" — ${why} (${h.conflictsWith})`
      : `held "${h.alias}" — ${why}`;
  });
}
