/* ════════════════════════════════════════════════════════════════════════
   BRAND INDEX — the Sell brand field's recognition corpus.

   One typeahead index, composed at read time from two live sources:

     · lib/brands.ts — the curated static list. It is the guaranteed floor:
       it renders instantly and survives any network failure.
     · vault_brands  — the Vault corpus the phone wizard and the Galaxy
       already read. Composed, never copied.

   THIS INDEX IS A RECOGNITION AID, NEVER AN ADMISSION GATE.

   A seller may always submit a brand that is not in it; an unrecognized
   name is reported as custom so the listing carries custom_brand_flag into
   review. Admission is decided downstream — by the curation evaluation, by
   the brand-specific requirement profile, and by approval before
   publication. Widening this index therefore admits nothing. It only stops
   the flow from telling a seller that a brand the platform demonstrably
   knows is not on its standard index.

   ALIASES ARE FOR MATCHING, NOT FOR REWRITING.

   The Vault's alias data cannot safely canonicalize a name a seller typed:
   "TAG Heuer" is recorded as an alias of "Heuer", "MB&F" as an alias of a
   second row, "Citizen" as an alias of "The Citizen", and "Chaykin" points
   at two different makers. Rewriting on that basis would destroy real brand
   identities. So:

     · a canonical name always wins — text that names a brand stays that
       brand;
     · an alias resolves only when it is unambiguous and is not itself a
       canonical brand;
     · an alias never appears as its own row, so a maker that already has a
       selector identity never gains a second one.

   Ambiguous input resolves to nothing and is reported as custom, which
   routes it to a person rather than to a guess.
   ════════════════════════════════════════════════════════════════════════ */

/** A vault_brands row, narrowed to the two columns this index needs. */
export type VaultBrandRow = { name: string; search_aliases?: string[] | null };

export type BrandIndex = {
  /** Canonical display names, de-duplicated by normalized form, A→Z. */
  names: string[];
  /** Normalized canonical form → display name. */
  canonical: Map<string, string>;
  /** Normalized alias → canonical display name. Ambiguous aliases and
      aliases that shadow a canonical brand are deliberately absent. */
  aliasTo: Map<string, string>;
};

export type ResolvedBrand = {
  /** The name to store. Canonical when recognized; exactly what was typed
      when not. */
  name: string;
  /** True when the name is off the index — the listing is flagged for
      review rather than silently fragmenting brand data. */
  isCustom: boolean;
};

/** Two characters before the list opens — unchanged from the original field. */
export const MIN_BRAND_CHARS = 2;

/** Case-insensitive, accent-stripped, punctuation- and space-insensitive, so
    "moser" → "H. Moser & Cie." and "girard perregaux" → "Girard-Perregaux".
    Text in a non-Latin script normalizes to empty and is never a match key. */
export function normalizeBrand(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]/g, ""); // drop spaces & punctuation
}

export function buildBrandIndex(
  staticNames: readonly string[],
  vaultRows: readonly VaultBrandRow[] = []
): BrandIndex {
  const canonical = new Map<string, string>();

  /* The static list goes in first: its display spellings are the ones
     sellers already see, and first-wins keeps them stable when the Vault
     spells the same maker differently. */
  for (const name of staticNames) {
    const key = normalizeBrand(name);
    if (key && !canonical.has(key)) canonical.set(key, name);
  }
  for (const row of vaultRows) {
    const key = normalizeBrand(row?.name ?? "");
    if (key && !canonical.has(key)) canonical.set(key, row.name);
  }

  /* Alias candidates are gathered before any are accepted, because
     acceptance depends on whether a second maker claims the same alias. */
  const candidates = new Map<string, Set<string>>();
  for (const row of vaultRows) {
    const target = normalizeBrand(row?.name ?? "");
    const display = canonical.get(target);
    if (!display) continue;
    for (const alias of row.search_aliases ?? []) {
      const key = normalizeBrand(alias ?? "");
      // Empty (non-Latin script), self-referential, or shadowing a real brand.
      if (!key || key === target || canonical.has(key)) continue;
      if (!candidates.has(key)) candidates.set(key, new Set());
      candidates.get(key)!.add(display);
    }
  }

  const aliasTo = new Map<string, string>();
  for (const [key, targets] of candidates) {
    if (targets.size === 1) aliasTo.set(key, [...targets][0]);
  }

  const names = [...canonical.values()].sort((a, b) => a.localeCompare(b));
  return { names, canonical, aliasTo };
}

/** Prefix matches first, then substring matches, each A→Z. Aliases widen what
    can be found; the rows themselves are always canonical brand names. */
export function matchBrands(
  query: string,
  index: BrandIndex,
  limit = 8
): string[] {
  const q = normalizeBrand(query);
  if (q.length < MIN_BRAND_CHARS) return [];

  const prefix = new Set<string>();
  const sub = new Set<string>();
  const consider = (key: string, display: string) => {
    if (key.startsWith(q)) prefix.add(display);
    else if (key.includes(q)) sub.add(display);
  };

  for (const [key, display] of index.canonical) consider(key, display);
  for (const [key, display] of index.aliasTo) consider(key, display);

  const byName = (a: string, b: string) => a.localeCompare(b);
  return [
    ...[...prefix].sort(byName),
    ...[...sub].filter((name) => !prefix.has(name)).sort(byName),
  ].slice(0, limit);
}

/** The one resolution rule: canonical wins, then an unambiguous alias, then
    the text stands as the seller wrote it and is flagged for review. */
export function resolveTypedBrand(
  text: string,
  index: BrandIndex
): ResolvedBrand {
  const raw = text ?? "";
  const key = normalizeBrand(raw);
  if (!key) return { name: raw, isCustom: false };

  const exact = index.canonical.get(key);
  if (exact) return { name: exact, isCustom: false };

  const alias = index.aliasTo.get(key);
  if (alias) return { name: alias, isCustom: false };

  return { name: raw, isCustom: true };
}
