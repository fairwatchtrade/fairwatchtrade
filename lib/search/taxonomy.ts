/* ────────────────────────────────────────────────────────────────────────
   GOVERNED TAXONOMY RESOLUTION — SFX-006B

   This file holds the resolution LAW. It holds no corpus, so it is safe to
   import anywhere; the corpus itself lives in the generated, server-only
   artifact (v6.86 protected-alias posture) and is handed in.

   The Vault stores identity as Brand → Collection → Family → Variant →
   Reference. Search previously knew only Brand and Collection, so a real
   governed name like "Tonda PF" — a FAMILY under Collection "Tonda" —
   degraded to free text. This resolves names at the level the Vault actually
   stores, and refuses to guess anywhere else.

   THREE RULES, all of them refusals:

     · Longest phrase wins. "tonda pf" is tried before "pf", so a two-word
       governed Family is never shredded into a one-word brand alias.

     · Ambiguous means Text. A key that maps to more than one governed node
       resolves to NOTHING and stays honest free text. 72 names genuinely
       collide between collections and families, so this is the common case,
       not an edge case. Ambiguity is precomputed in the generator.

     · Nothing is inferred. A Brand plus a Family never implies a Variant or a
       Reference; only what the collector actually typed is resolved.
   ──────────────────────────────────────────────────────────────────────── */

/** One governed identity node. Short keys keep the generated artifact small. */
export type GovernedNode = {
  /** Vault level. */
  k: "brand" | "collection" | "family" | "variant";
  /** Governed display name — becomes the meaning's machine value. */
  n: string;
  /** Owning brand's display name. */
  b: string;
  /** Owning collection, where the level has one. */
  c?: string;
  /** Owning family, where the level has one. */
  f?: string;
};

export type GovernedIndex = {
  /** Normalized key → node, or 0 for known-but-ambiguous. */
  keys: Record<string, GovernedNode | 0>;
  /** Longest key in words — the n-gram ceiling. */
  maxWords: number;
};

export type GovernedMeaning = {
  kind: "brand" | "collection" | "family" | "variant";
  value: string;
  label: string;
  source: string[];
};

/* Must stay identical in meaning to norm() in
   scripts/generate-vault-taxonomy.mjs, or generated keys and lookup keys
   would silently disagree. Diacritics fold so "tonda metrographe" reaches
   "Tonda Métrographe" from an ordinary keyboard. */
export function normalizeTaxonomyKey(input: string): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LEVEL_LABEL: Record<GovernedNode["k"], string> = {
  brand: "Brand",
  collection: "Collection",
  family: "Family",
  variant: "Variant",
};

/**
 * Resolve governed identities out of leftover words.
 *
 * Returns the meanings found and the words that survived unresolved. Consumed
 * words are removed; everything else is handed back untouched so the caller's
 * existing honest-text fallback still owns it.
 */
export function resolveGovernedPhrases(
  words: string[],
  index: GovernedIndex | null | undefined
): { meanings: GovernedMeaning[]; leftover: string[] } {
  if (!index || !words.length) return { meanings: [], leftover: words };

  const ceiling = Math.max(1, Math.min(index.maxWords || 1, 8));
  const meanings: GovernedMeaning[] = [];
  const leftover: string[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i < words.length) {
    let matched = false;

    /* Longest first. A shorter governed name is only considered after every
       longer phrase starting here has failed, which is what stops "tonda pf"
       from collapsing into the brand alias "pf". */
    const span = Math.min(ceiling, words.length - i);
    for (let take = span; take >= 1; take -= 1) {
      const slice = words.slice(i, i + take);
      const key = normalizeTaxonomyKey(slice.join(" "));
      if (!key) continue;

      const hit = index.keys[key];
      if (hit === undefined) continue;

      /* Known but ambiguous: resolve to nothing and let the words fall through
         to honest Text. Deliberately does NOT consume them. */
      if (hit === 0) continue;

      const id = `${hit.k}:${hit.n}`;
      if (!seen.has(id)) {
        seen.add(id);
        meanings.push({
          kind: hit.k,
          value: hit.n,
          label: `${LEVEL_LABEL[hit.k]}: ${hit.n}`,
          source: slice,
        });
      }
      i += take;
      matched = true;
      break;
    }

    if (!matched) {
      leftover.push(words[i]);
      i += 1;
    }
  }

  return { meanings, leftover };
}
