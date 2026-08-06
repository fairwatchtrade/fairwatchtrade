/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — legacy-safe-v1 rule registry

   The complete registry of structural conversions the first-release engine
   is permitted to perform. Nothing outside this registry may be applied.
   Every rule is deterministic, has one unambiguous meaning, and is covered
   by a fixture in scripts/vault-upgrade-fixtures/.

   The registry never invents facts. Lifecycle value moves below preserve an
   explicit source value into the exact v3.2 field the specification itself
   names as its successor ("discontinued … replaces the old defunct") — they
   never infer lifecycle from age, wording, or outside knowledge.
   ──────────────────────────────────────────────────────────────────────── */

export const UPGRADE_RULE_VERSION = "legacy-safe-v1";

/* ── Registered exact key renames ─────────────────────────────────────────
   Applied only when the source format is deterministically recognized as
   the registered legacy lowercase structure (pre-v3 hand-built shape:
   { name, collections: [{ families: [{ variants: [{ references }] }] }] }).
   Each rename has identical source and destination semantics. */

export type RenameRule = {
  rule: string;
  /** Hierarchy level the rename applies at. */
  level: "brand" | "collection" | "family";
  from: string;
  to: string;
  reason: string;
};

export const LEGACY_RENAMES: readonly RenameRule[] = [
  {
    rule: "LSV1-RENAME-ROOT-NAME",
    level: "brand",
    from: "name",
    to: "Brand",
    reason:
      "Legacy root key \"name\" holds the brand name; v3.2 names the same value \"Brand\".",
  },
  {
    rule: "LSV1-RENAME-ROOT-COLLECTIONS",
    level: "brand",
    from: "collections",
    to: "Collections",
    reason:
      "Legacy root key \"collections\" is the same container v3.2 names \"Collections\".",
  },
  {
    rule: "LSV1-RENAME-COLLECTION-FAMILIES",
    level: "collection",
    from: "families",
    to: "Families",
    reason:
      "Legacy collection key \"families\" is the same container v3.2 names \"Families\".",
  },
  {
    rule: "LSV1-RENAME-FAMILY-VARIANTS",
    level: "family",
    from: "variants",
    to: "Variants",
    reason:
      "Legacy family key \"variants\" is the same container v3.2 names \"Variants\".",
  },
] as const;

/* ── Registered lifecycle value moves ─────────────────────────────────────
   v3.2 removed the lifecycle values "defunct" and "revived" from the
   ownership field independent_status and moved lifecycle to revival_status.
   The specification itself states the exact successor value for each.

   Preconditions (both enforced by the analyzer):
   - the source independent_status is exactly the registered legacy value;
   - revival_status is absent from the source (a present value alongside a
     legacy lifecycle value is a conflict → DECISION_REQUIRED, never a move).

   The move removes independent_status (the legacy file answered lifecycle
   there, not ownership) — ownership then remains a missing required fact
   and is reported as RESEARCH_REQUIRED, never guessed. */

export type LifecycleMoveRule = {
  rule: string;
  legacyIndependentStatus: string;
  revivalStatus: "revived" | "discontinued";
  reason: string;
};

export const LEGACY_LIFECYCLE_MOVES: readonly LifecycleMoveRule[] = [
  {
    rule: "LSV1-MOVE-LIFECYCLE-DEFUNCT",
    legacyIndependentStatus: "defunct",
    revivalStatus: "discontinued",
    reason:
      "v3.2 removed \"defunct\" from independent_status; revival_status \"discontinued\" is the value the specification names as its replacement.",
  },
  {
    rule: "LSV1-MOVE-LIFECYCLE-REVIVED",
    legacyIndependentStatus: "revived",
    revivalStatus: "revived",
    reason:
      "v3.2 moved the lifecycle answer \"revived\" from independent_status to revival_status with identical meaning.",
  },
] as const;

/* ── Core v3.2 structural rules (not legacy-specific) ──────────────────── */

/** Add a required empty container only where absence carries no factual meaning. */
export const RULE_ADD_REQUIRED_EMPTY = "V32-ADD-REQUIRED-EMPTY";

/** Convert a legacy exact Reference string into { "reference": "<exact string>" }. */
export const RULE_REF_STRING_TO_OBJECT = "V32-REF-STRING-TO-OBJECT";

/** Canonical serialization of the candidate under normalization-v1. */
export const RULE_CANONICAL_SERIALIZE = "V32-CANONICAL-SERIALIZE";

/* Containers added empty when absent — only fields the closed schema
   REQUIRES whose absence carries no factual meaning. Optional containers
   (Collection.search_aliases, Family.search_aliases) are never added:
   their omission is already valid, and adding them would turn a current-
   spec file into a needless candidate.
   Never prose, never scalar facts, never Variant.notes. */
export const ADDABLE_EMPTY_CONTAINERS: Readonly<
  Record<"brand" | "collection" | "family" | "variant", readonly string[]>
> = {
  brand: ["search_aliases", "Collections"],
  collection: ["Families"],
  family: ["Variants"],
  variant: ["search_aliases", "references"],
};
