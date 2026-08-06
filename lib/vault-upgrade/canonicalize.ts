/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — canonical serialization (normalization-v1)

   Governed candidate serialization: schema-declared key order at every
   hierarchy level, 2-space indentation, LF line endings, one trailing
   newline, UTF-8. Equivalent inputs must produce byte-identical candidates,
   so this module is the single place layout is decided.

   stableStringify (alphabetical key order, no whitespace) is the separate
   deterministic form used for hashing ledgers and the schema companion.
   ──────────────────────────────────────────────────────────────────────── */

export const NORMALIZATION_VERSION = "normalization-v1";

/* Key order per hierarchy level. Conditional/optional keys are emitted in
   this declared position when present, omitted entirely when absent. */
const BRAND_KEY_ORDER = [
  "Brand",
  "description",
  "country_of_origin",
  "region",
  "independent_status",
  "revival_status",
  "revival_type",
  "historical_continuity",
  "cluster",
  "cluster_rationale",
  "search_aliases",
  "Collections",
] as const;

const COLLECTION_KEY_ORDER = ["name", "search_aliases", "Families"] as const;

const FAMILY_KEY_ORDER = ["name", "search_aliases", "Variants"] as const;

const VARIANT_KEY_ORDER = [
  "id",
  "name",
  "description",
  "search_aliases",
  "notes",
  "references",
] as const;

const REFERENCE_KEY_ORDER = [
  "reference",
  "dial",
  "case",
  "movement",
  "notes",
] as const;

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function orderKeys(source: PlainObject, order: readonly string[]): PlainObject {
  const out: PlainObject = {};
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key];
    }
  }
  // Any key outside the declared order (should not exist in a candidate —
  // unknown fields block candidate generation upstream) is preserved after
  // the declared keys in source order rather than silently dropped.
  for (const key of Object.keys(source)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = source[key];
    }
  }
  return out;
}

/** Rebuild a Brand document with governed key order at every level. */
export function canonicalizeVaultDocument(doc: PlainObject): PlainObject {
  const brand = orderKeys(doc, BRAND_KEY_ORDER);
  if (Array.isArray(brand.Collections)) {
    brand.Collections = brand.Collections.map((collection) => {
      if (!isPlainObject(collection)) return collection;
      const c = orderKeys(collection, COLLECTION_KEY_ORDER);
      if (Array.isArray(c.Families)) {
        c.Families = c.Families.map((family) => {
          if (!isPlainObject(family)) return family;
          const f = orderKeys(family, FAMILY_KEY_ORDER);
          if (Array.isArray(f.Variants)) {
            f.Variants = f.Variants.map((variant) => {
              if (!isPlainObject(variant)) return variant;
              const v = orderKeys(variant, VARIANT_KEY_ORDER);
              if (Array.isArray(v.references)) {
                v.references = v.references.map((reference) =>
                  isPlainObject(reference)
                    ? orderKeys(reference, REFERENCE_KEY_ORDER)
                    : reference
                );
              }
              return v;
            });
          }
          return f;
        });
      }
      return c;
    });
  }
  return brand;
}

/** Candidate file text: canonical order, 2-space indent, LF, trailing newline. */
export function serializeCandidate(doc: PlainObject): string {
  return JSON.stringify(canonicalizeVaultDocument(doc), null, 2) + "\n";
}

/**
 * Deterministic compact stringify with recursively sorted object keys.
 * Used for hashing ledgers and the schema companion — layout-independent.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as PlainObject;
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}
