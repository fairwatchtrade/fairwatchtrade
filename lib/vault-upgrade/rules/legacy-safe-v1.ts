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

/* Registry version. v2 adds the governed legacy-field dispositions below;
   the rename, lifecycle, container, and reference rules are unchanged from
   v1. The filename keeps its original name — this constant, not the file
   name, is the authority on which rule set produced a candidate. */
export const UPGRADE_RULE_VERSION = "legacy-safe-v2";

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

/* ── Governed legacy-field dispositions ───────────────────────────────────
   The v3.2 specification closes the field set at every level. For these
   exact fields the specification itself already decided the disposition, so
   omitting them is deterministic conversion — not a judgement the engine is
   making on its own.

   Two things this registry is careful about:

   - It is an allowlist of named fields, never "drop anything unrecognized".
     A legacy field that is NOT registered here still stops the upgrade as
     UNSUPPORTED_SCHEMA_FIELD, because nothing has decided its fate.
   - Omission is never silent. Every disposition writes a ledger row
     carrying the exact removed value, so the change report retains the
     legacy material even though the candidate does not.

   Variant.id is deliberately absent: v3.2 §7 lists "id" as an allowed
   optional Variant field, so it is preserved, not disposed of. */

export type DispositionRule = {
  rule: string;
  level: "brand" | "collection" | "family";
  field: string;
  /** Clause of the active specification that decides this disposition. */
  specClause: string;
  reason: string;
};

export const GOVERNED_LEGACY_DISPOSITIONS: readonly DispositionRule[] = [
  {
    rule: "LSV2-DISPOSE-BRAND-ID",
    level: "brand",
    field: "id",
    specClause: "v3.2 §4 — \"No other Brand-level fields may be added.\"",
    reason:
      "The v3.2 Brand schema is closed and does not include \"id\"; the specification lists \"id\" as permitted only on a Variant (§7). The legacy brand identifier is omitted from the candidate and its exact value is retained in the change report.",
  },
  {
    rule: "LSV2-DISPOSE-COLLECTION-ID",
    level: "collection",
    field: "id",
    specClause: "v3.2 §5 — \"No other fields may be added.\"",
    reason:
      "The v3.2 Collection schema is closed to name, Families, and optional search_aliases; \"id\" is permitted only on a Variant (§7). The legacy identifier is omitted from the candidate and retained in the change report.",
  },
  {
    rule: "LSV2-DISPOSE-FAMILY-ID",
    level: "family",
    field: "id",
    specClause: "v3.2 §6 — \"No other fields may be added.\"",
    reason:
      "The v3.2 Family schema is closed to name, Variants, and optional search_aliases; \"id\" is permitted only on a Variant (§7). The legacy identifier is omitted from the candidate and retained in the change report.",
  },
  {
    rule: "LSV2-DISPOSE-ARCHITECTURAL-REVIEW",
    level: "brand",
    field: "architectural_review",
    specClause:
      "v3.2 §18 — \"Do not use: architectural_review [] unless explicitly requested by FairWatchTrade in a separate review workflow.\"",
    reason:
      "The specification names this field directly and directs that it not be carried in Vault output. It is omitted from the candidate and its exact value is retained in the change report.",
  },
] as const;

/** Omit a registered legacy field; the ledger keeps the exact value. */
export const RULE_OMIT_LEGACY_FIELD = "V32-OMIT-LEGACY-FIELD";

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
