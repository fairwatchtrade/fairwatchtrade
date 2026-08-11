/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — taxonomy-v1 execution vocabulary

   The v3.2 specification closes the *shape* of a Vault file, and the schema
   enforces that shape. It also states a rule about meaning that no schema
   can express:

     §13 — "Steel, gold, titanium, bronze, ceramic, carbon, and similar
            materials NEVER create hierarchy. Materials belong only inside
            notes or structured reference fields."
     §12 — "Never split Families by: color, material, dial color, bracelet."

   A file can satisfy every structural rule and still break this one, so it
   is checked separately, against the vocabulary below.

   Two things this registry is deliberate about:

   - It is NOT a banned-word list. A material word appearing in a Variant
     name proves nothing on its own — "Datograph Up/Down Platinum" names a
     real model. What matters is whether material and dial are ALL that
     distinguishes one Variant from its siblings or its parent Family. The
     detector subtracts the shared identity first and judges only what is
     left. See checkTaxonomyHierarchy in ../analyze.ts.
   - It is intentionally under-inclusive. A word missing here means a
     Variant is left alone; a word wrongly present here means a good file is
     accused. The first costs a missed finding, the second costs trust in
     every finding, so the vocabulary admits only words that are plainly
     execution rather than identity. Collector identities — Lumen,
     Handwerkskunst, Up/Down, anniversary and homage editions — are absent
     by design and must stay absent.
   ──────────────────────────────────────────────────────────────────────── */

export const TAXONOMY_RULE_VERSION = "taxonomy-v1";

/** A Variant distinguished from its siblings or Family only by execution. */
export const RULE_MATERIAL_DIAL_HIERARCHY = "V32-MATERIAL-DIAL-HIERARCHY";

export const TAXONOMY_SPEC_CLAUSE =
  'v3.2 §13 — "Steel, gold, titanium, bronze, ceramic, carbon, and similar materials NEVER create hierarchy." §12 — "Never split Families by: color, material, dial color, bracelet."';

/* Case, bracelet, and dial materials. */
const MATERIALS: readonly string[] = [
  "steel",
  "stainless",
  "gold",
  "goldene",
  "honeygold",
  "yellow",
  "white",
  "rose",
  "pink",
  "red",
  "platinum",
  "titanium",
  "tantalum",
  "palladium",
  "bronze",
  "brass",
  "ceramic",
  "carbon",
  "aluminium",
  "aluminum",
  "silver",
  "18k",
  "14k",
  "9k",
  "750",
  "950",
  "925",
];

/* Dial colours and dial surface treatments. */
const DIAL_EXECUTIONS: readonly string[] = [
  "black",
  "blue",
  "grey",
  "gray",
  "green",
  "brown",
  "beige",
  "cream",
  "ivory",
  "champagne",
  "argente",
  "salmon",
  "slate",
  "anthracite",
  "burgundy",
  "purple",
  "copper",
  "rhodium",
  "ice",
  "opaline",
  "lacquer",
  "lacquered",
  "enamel",
  "sunburst",
  "matte",
  "gloss",
  "glossy",
];

/* Words naming the attribute itself rather than any identity it carries.
   "Odysseus Titanium Ice Blue Dial" is distinguished by material and dial
   colour; the word "Dial" adds no identity of its own. */
const ATTRIBUTE_NOUNS: readonly string[] = [
  "dial",
  "dials",
  "case",
  "bracelet",
  "strap",
  "bezel",
  "colour",
  "color",
  "finish",
];

/**
 * The full execution vocabulary. A residual made only of these words is a
 * material/dial distinction and nothing else.
 */
export const EXECUTION_VOCABULARY: ReadonlySet<string> = new Set([
  ...MATERIALS,
  ...DIAL_EXECUTIONS,
  ...ATTRIBUTE_NOUNS,
]);

/**
 * Connectives and generic packaging words that carry no identity either
 * way. Removed before comparison so "Blue Edition" is judged on "blue"
 * alone, while "30th Anniversary Edition" still keeps "anniversary".
 */
const NOISE: ReadonlySet<string> = new Set([
  "and",
  "with",
  "the",
  "of",
  "a",
  "an",
  "in",
  "for",
  "&",
  "edition",
  "version",
  "model",
]);

/* Built from escape sequences rather than literal characters: a combining
   mark or a curly quote typed directly into a character class is invisible
   in review and easy to damage silently. */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const QUOTE_CHARACTERS = new RegExp("[\\u201c\\u201d\\u2018\\u2019\"'`]", "g");

/** Fold diacritics so "Argenté" and "Argente" are the same token. */
function foldAccents(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "");
}

/**
 * Split a hierarchy name into comparable tokens. Deterministic for
 * identical input — no locale-sensitive operations.
 *
 * "/" is deliberately NOT a separator: "Up/Down" is one designation, and
 * keeping it whole means it reads as itself in a finding rather than as two
 * meaningless fragments.
 */
export function nameTokens(name: unknown): string[] {
  if (typeof name !== "string") return [];
  return foldAccents(name)
    .toLowerCase()
    .replace(QUOTE_CHARACTERS, " ")
    .split(/[\s,.()\-–—]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !NOISE.has(token));
}

/** Whether a token is execution rather than identity. */
export function isExecutionToken(token: string): boolean {
  return EXECUTION_VOCABULARY.has(token);
}
