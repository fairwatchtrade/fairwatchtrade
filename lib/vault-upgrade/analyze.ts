/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — deterministic analyzer

   One job: compare exact source bytes to the active v3.2 contract and
   either produce a deterministic candidate with an exact change ledger, or
   return the truthful unresolved status without fabricating compliance.

   Deterministic input set: source bytes, specification bytes, engine
   version, mapping version, normalization version. No timestamps enter any
   hashed payload. Repeated analysis of identical inputs is byte-identical.

   The engine never researches, never generates prose, never infers
   lifecycle, never promotes Reference-like numbers, never drops fields.
   ──────────────────────────────────────────────────────────────────────── */

import AjvImport from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";
import { serializeCandidate, stableStringify } from "./canonicalize.ts";
import { sha256HexOfBytes, sha256HexOfText, utf8Bytes, utf8Text } from "./hash.ts";
import {
  ADDABLE_EMPTY_CONTAINERS,
  GOVERNED_LEGACY_DISPOSITIONS,
  LEGACY_LIFECYCLE_MOVES,
  LEGACY_RENAMES,
  RULE_ADD_REQUIRED_EMPTY,
  RULE_CANONICAL_SERIALIZE,
  RULE_REF_STRING_TO_OBJECT,
  UPGRADE_RULE_VERSION,
} from "./rules/legacy-safe-v1.ts";
import {
  isExecutionToken,
  nameTokens,
  TAXONOMY_SPEC_CLAUSE,
} from "./rules/taxonomy-v1.ts";
import type {
  AnalysisIssue,
  AnalysisRecord,
  AnalysisStatus,
  ContractVerification,
  Detection,
  LedgerRow,
} from "./types.ts";

export const ENGINE_VERSION = "upgrade-engine-v1";

/* ajv ships CJS; raw node resolves the default import differently from the
   bundler, so accept either shape. */
const AjvClass = ((AjvImport as unknown as { default?: unknown }).default ??
  AjvImport) as typeof AjvImport;

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/* ── Engine factory ────────────────────────────────────────────────────── */

/**
 * The transformed working document alongside its analysis. The completion
 * pass needs the document itself to continue working on; ordinary analysis
 * discards it. `document` is null when the source never reached the
 * transform stage (unparseable, unsupported, or ambiguous input).
 */
export type PreparedSource = {
  record: AnalysisRecord;
  document: Record<string, unknown> | null;
};

export type UpgradeEngine = {
  analyzeSource: (input: {
    filename: string;
    bytes: ArrayBuffer | Uint8Array;
  }) => Promise<AnalysisRecord>;
  /** Same deterministic pass, keeping the transformed document. */
  prepareSource: (input: {
    filename: string;
    bytes: ArrayBuffer | Uint8Array;
  }) => Promise<PreparedSource>;
};

export function createUpgradeEngine(
  schema: Record<string, unknown>,
  contract: ContractVerification
): UpgradeEngine {
  let validator: ValidateFunction | null = null;
  function getValidator(): ValidateFunction {
    if (!validator) {
      const ajv = new AjvClass({ allErrors: true, strict: true });
      validator = ajv.compile(schema);
    }
    return validator;
  }

  async function runAnalysis(
    input: { filename: string; bytes: ArrayBuffer | Uint8Array },
    holder: { doc: PlainObject | null }
  ): Promise<AnalysisRecord> {
    const sourceSha256 = await sha256HexOfBytes(input.bytes);
    const specificationSha256 = contract.ok
      ? contract.identity.specificationSha256
      : "unverified";

    const base = (status: AnalysisStatus): AnalysisRecord => ({
      status,
      detection: null,
      issues: [],
      ledger: [],
      counts: {
        transforms: 0,
        renamedKeys: 0,
        movedValues: 0,
        addedContainers: 0,
        convertedReferences: 0,
        omittedLegacyFields: 0,
        unresolved: 0,
      },
      sourceSha256,
      specificationSha256,
      candidate: null,
      parseError: null,
      brandName: null,
      engineVersion: ENGINE_VERSION,
      upgradeRuleVersion: UPGRADE_RULE_VERSION,
      normalizationVersion: "normalization-v1",
      contractId: contract.ok ? contract.identity.contractId : "unverified",
    });

    /* 1 — the active contract must be hash-bound before any candidate work. */
    if (!contract.ok) {
      return base("ACTIVE_CONTRACT_MISMATCH");
    }

    /* 2 — strict JSON parse. */
    const text = utf8Text(input.bytes);
    let root: unknown;
    try {
      root = JSON.parse(text);
    } catch (err) {
      const record = base("INVALID_JSON");
      record.parseError = err instanceof Error ? err.message : String(err);
      return record;
    }

    /* 3 — source-format detection from structural markers. */
    const detection = detectSourceFormat(root);
    const record = base("BLOCKED");
    record.detection = detection;
    if (isPlainObject(root)) {
      if (typeof root.Brand === "string") record.brandName = root.Brand;
      else if (typeof root.name === "string") record.brandName = root.name;
    }

    if (detection.sourceContract === "UNSUPPORTED_SOURCE_FORMAT") {
      record.status = "UNSUPPORTED_SOURCE_FORMAT";
      return record;
    }
    if (detection.sourceContract === "AMBIGUOUS_SOURCE_FORMAT") {
      record.status = "AMBIGUOUS_SOURCE_FORMAT";
      return record;
    }

    /* 4 — apply registered transforms to a working copy. */
    const doc = JSON.parse(text) as PlainObject;
    holder.doc = doc;
    const ledger: LedgerRow[] = [];
    const issues: AnalysisIssue[] = [];

    if (detection.mappingSelected.includes("legacy-lowercase")) {
      applyLegacyRenames(doc, ledger);
    }
    applyGovernedDispositions(doc, ledger);
    applyLifecycleMoves(doc, ledger, issues);
    addRequiredEmptyContainers(doc, ledger);
    convertReferenceStrings(doc, ledger, issues);

    /* 5 — closed-schema validation of the transformed document. */
    const validate = getValidator();
    const valid = validate(doc);
    if (!valid && validate.errors) {
      mapSchemaErrors(validate.errors, doc, issues);
    }

    /* 6 — conditional lifecycle rules (analyzer-enforced, not schema). */
    checkLifecycleConditionals(doc, issues);

    /* 7 — content completeness (never auto-filled — reported only). */
    checkContentCompleteness(doc, issues);

    /* 8 — taxonomy meaning the closed schema cannot express (§12/§13). */
    checkTaxonomyHierarchy(doc, issues);

    /* 9 — status and candidate. */
    dedupeAndSortIssues(issues);
    record.issues = issues;
    record.ledger = ledger;
    record.counts = {
      transforms: ledger.length,
      renamedKeys: ledger.filter((r) => r.action === "rename-key").length,
      movedValues: ledger.filter((r) => r.action === "move-value").length,
      addedContainers: ledger.filter((r) => r.action === "add-empty-container")
        .length,
      convertedReferences: ledger.filter(
        (r) => r.action === "convert-reference-string"
      ).length,
      omittedLegacyFields: ledger.filter(
        (r) => r.action === "omit-legacy-field"
      ).length,
      unresolved: issues.length,
    };

    const hasBlocked = issues.some((i) => i.code === "UNSUPPORTED_SCHEMA_FIELD");
    const hasDecision = issues.some(
      (i) =>
        i.code === "VALUE_DECISION_REQUIRED" ||
        i.code === "LIFECYCLE_CONFLICT" ||
        i.code === "CONDITIONAL_VIOLATION" ||
        i.code === "TAXONOMY_HIERARCHY_VIOLATION"
    );
    const hasResearch = issues.some(
      (i) =>
        i.code === "MISSING_REQUIRED_FACT" ||
        i.code === "EMPTY_REQUIRED_PROSE" ||
        i.code === "WORD_COUNT_OUT_OF_RANGE"
    );

    if (hasBlocked) {
      record.status = "BLOCKED";
      return record;
    }
    if (hasDecision) {
      record.status = "DECISION_REQUIRED";
      return record;
    }
    if (hasResearch) {
      record.status = "RESEARCH_REQUIRED";
      return record;
    }

    if (ledger.length === 0) {
      record.status = "CURRENT_SPEC_NO_CHANGE";
      return record;
    }

    /* Candidate: canonical serialization under normalization-v1. */
    ledger.push({
      path: "/",
      action: "canonical-serialize",
      before: null,
      after: null,
      reason:
        "Candidate serialized under normalization-v1 (governed key order, 2-space indent, LF).",
      rule: RULE_CANONICAL_SERIALIZE,
      severity: "format",
    });
    record.counts.transforms = ledger.length;

    const candidateText = serializeCandidate(doc);
    const candidateSha = await sha256HexOfText(candidateText);
    const ledgerSha = await sha256HexOfText(stableStringify(ledger));
    const baseName = input.filename.replace(/\.json$/i, "");
    record.candidate = {
      filename: `${baseName}.vault-lock-v3.2.${candidateSha.slice(0, 8)}.json`,
      text: candidateText,
      sha256: candidateSha,
      ledgerSha256: ledgerSha,
      byteLength: utf8Bytes(candidateText).length,
    };
    record.status = "STRUCTURAL_UPGRADE_READY";
    return record;
  }

  async function prepareSource(input: {
    filename: string;
    bytes: ArrayBuffer | Uint8Array;
  }): Promise<PreparedSource> {
    const holder: { doc: PlainObject | null } = { doc: null };
    const record = await runAnalysis(input, holder);
    return { record, document: holder.doc };
  }

  async function analyzeSource(input: {
    filename: string;
    bytes: ArrayBuffer | Uint8Array;
  }): Promise<AnalysisRecord> {
    return (await prepareSource(input)).record;
  }

  return { analyzeSource, prepareSource };
}

/* ── Source-format detection ───────────────────────────────────────────── */

export function detectSourceFormat(root: unknown): Detection {
  if (!isPlainObject(root)) {
    return {
      sourceContract: "UNSUPPORTED_SOURCE_FORMAT",
      detectionBasis: "Top-level JSON value is not an object.",
      certaintyClass: "UNSUPPORTED",
      mappingSelected: "none",
      mappingVersion: UPGRADE_RULE_VERSION,
    };
  }

  const hasBrandKey = typeof root.Brand === "string";
  const hasCollectionsKey = Array.isArray(root.Collections);
  const hasLegacyCollections = Array.isArray(root.collections);
  const currentMarkers = hasBrandKey || hasCollectionsKey;
  const legacyMarkers = hasLegacyCollections;

  if (currentMarkers && legacyMarkers) {
    return {
      sourceContract: "AMBIGUOUS_SOURCE_FORMAT",
      detectionBasis:
        "Root carries both current-contract markers (Brand/Collections) and legacy markers (collections) — two structural mappings could plausibly apply.",
      certaintyClass: "AMBIGUOUS",
      mappingSelected: "none",
      mappingVersion: UPGRADE_RULE_VERSION,
    };
  }

  if (currentMarkers) {
    /* Mixed nesting: current root with legacy lowercase containers below. */
    if (hasMixedNestedContainers(root)) {
      return {
        sourceContract: "AMBIGUOUS_SOURCE_FORMAT",
        detectionBasis:
          "Current-contract root markers with legacy lowercase container keys (families/variants) in the hierarchy — mixed-version structure has no single deterministic mapping.",
        certaintyClass: "AMBIGUOUS",
        mappingSelected: "none",
        mappingVersion: UPGRADE_RULE_VERSION,
      };
    }

    const legacyLifecycle =
      typeof root.independent_status === "string" &&
      LEGACY_LIFECYCLE_MOVES.some(
        (m) => m.legacyIndependentStatus === root.independent_status
      );
    if (legacyLifecycle) {
      return {
        sourceContract: "SUPPORTED_LEGACY_CONTRACT",
        detectionBasis: `independent_status "${String(
          root.independent_status
        )}" is a lifecycle value the v3.2 specification removed from that field — an explicit pre-v3.2 marker.`,
        certaintyClass: "EXPLICIT",
        mappingSelected: "legacy-lifecycle",
        mappingVersion: UPGRADE_RULE_VERSION,
      };
    }

    const v32BrandKeys = new Set([
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
    ]);
    const rootKeys = Object.keys(root);
    const withinSchema = rootKeys.every((k) => v32BrandKeys.has(k));
    if (withinSchema && hasBrandKey) {
      return {
        sourceContract: "CURRENT_CONTRACT",
        detectionBasis:
          "Root key set matches the v3.2 Brand schema with no legacy markers.",
        certaintyClass: "STRUCTURALLY_UNIQUE",
        mappingSelected: "none",
        mappingVersion: UPGRADE_RULE_VERSION,
      };
    }
    return {
      sourceContract: "UNVERSIONED_BUT_STRUCTURALLY_RECOGNIZED",
      detectionBasis:
        "Current-contract structural markers (Brand/Collections) with keys outside the closed v3.2 Brand key set — recognized structure, not cleanly current.",
      certaintyClass: "STRUCTURALLY_UNIQUE",
      mappingSelected: "none",
      mappingVersion: UPGRADE_RULE_VERSION,
    };
  }

  if (legacyMarkers) {
    const lifecycle =
      typeof root.independent_status === "string" &&
      LEGACY_LIFECYCLE_MOVES.some(
        (m) => m.legacyIndependentStatus === root.independent_status
      );
    return {
      sourceContract: "SUPPORTED_LEGACY_CONTRACT",
      detectionBasis:
        "Root lowercase \"collections\" container matches the registered legacy hand-built structure; no current-contract markers present.",
      certaintyClass: "STRUCTURALLY_UNIQUE",
      mappingSelected: lifecycle
        ? "legacy-lowercase+legacy-lifecycle"
        : "legacy-lowercase",
      mappingVersion: UPGRADE_RULE_VERSION,
    };
  }

  return {
    sourceContract: "UNSUPPORTED_SOURCE_FORMAT",
    detectionBasis:
      "No recognized structural markers: neither v3.2 (Brand/Collections) nor registered legacy (collections) containers are present.",
    certaintyClass: "UNSUPPORTED",
    mappingSelected: "none",
    mappingVersion: UPGRADE_RULE_VERSION,
  };
}

function hasMixedNestedContainers(root: PlainObject): boolean {
  const collections = Array.isArray(root.Collections) ? root.Collections : [];
  for (const collection of collections) {
    if (!isPlainObject(collection)) continue;
    if (Array.isArray(collection.families)) return true;
    const families = Array.isArray(collection.Families)
      ? collection.Families
      : [];
    for (const family of families) {
      if (!isPlainObject(family)) continue;
      if (Array.isArray(family.variants)) return true;
    }
  }
  return false;
}

/* ── Transforms ────────────────────────────────────────────────────────── */

function renameKey(
  obj: PlainObject,
  from: string,
  to: string
): boolean {
  if (
    !Object.prototype.hasOwnProperty.call(obj, from) ||
    Object.prototype.hasOwnProperty.call(obj, to)
  ) {
    return false;
  }
  obj[to] = obj[from];
  delete obj[from];
  return true;
}

function applyLegacyRenames(doc: PlainObject, ledger: LedgerRow[]): void {
  for (const rule of LEGACY_RENAMES.filter((r) => r.level === "brand")) {
    if (renameKey(doc, rule.from, rule.to)) {
      ledger.push({
        path: `/${rule.from}`,
        action: "rename-key",
        before: rule.from,
        after: rule.to,
        reason: `${rule.reason} Value preserved exactly.`,
        rule: rule.rule,
        severity: "structural",
      });
    }
  }
  const collections = Array.isArray(doc.Collections) ? doc.Collections : [];
  collections.forEach((collection, ci) => {
    if (!isPlainObject(collection)) return;
    for (const rule of LEGACY_RENAMES.filter((r) => r.level === "collection")) {
      if (renameKey(collection, rule.from, rule.to)) {
        ledger.push({
          path: `/Collections/${ci}/${rule.from}`,
          action: "rename-key",
          before: rule.from,
          after: rule.to,
          reason: `${rule.reason} Value preserved exactly.`,
          rule: rule.rule,
          severity: "structural",
        });
      }
    }
    const families = Array.isArray(collection.Families)
      ? collection.Families
      : [];
    families.forEach((family, fi) => {
      if (!isPlainObject(family)) return;
      for (const rule of LEGACY_RENAMES.filter((r) => r.level === "family")) {
        if (renameKey(family, rule.from, rule.to)) {
          ledger.push({
            path: `/Collections/${ci}/Families/${fi}/${rule.from}`,
            action: "rename-key",
            before: rule.from,
            after: rule.to,
            reason: `${rule.reason} Value preserved exactly.`,
            rule: rule.rule,
            severity: "structural",
          });
        }
      }
    });
  });
}

/**
 * Omit registered legacy fields whose disposition the specification itself
 * decides. Only the exact fields in the registry are touched; anything else
 * outside the closed schema still stops the upgrade for a human. The exact
 * removed value is written to the ledger so the change report retains the
 * legacy material the candidate no longer carries.
 */
function applyGovernedDispositions(
  doc: PlainObject,
  ledger: LedgerRow[]
): void {
  function dispose(
    obj: PlainObject,
    level: "brand" | "collection" | "family",
    basePath: string
  ): void {
    for (const rule of GOVERNED_LEGACY_DISPOSITIONS) {
      if (rule.level !== level) continue;
      if (!Object.prototype.hasOwnProperty.call(obj, rule.field)) continue;
      const removed = obj[rule.field];
      delete obj[rule.field];
      ledger.push({
        path: `${basePath}/${rule.field}`,
        action: "omit-legacy-field",
        before: removed,
        after: null,
        reason: `${rule.reason} Governing clause: ${rule.specClause}`,
        rule: rule.rule,
        severity: "structural",
      });
    }
  }

  dispose(doc, "brand", "");
  const collections = Array.isArray(doc.Collections) ? doc.Collections : [];
  collections.forEach((collection, ci) => {
    if (!isPlainObject(collection)) return;
    dispose(collection, "collection", `/Collections/${ci}`);
    const families = Array.isArray(collection.Families)
      ? collection.Families
      : [];
    families.forEach((family, fi) => {
      if (!isPlainObject(family)) return;
      dispose(family, "family", `/Collections/${ci}/Families/${fi}`);
    });
  });
}

function applyLifecycleMoves(
  doc: PlainObject,
  ledger: LedgerRow[],
  issues: AnalysisIssue[]
): void {
  const status = doc.independent_status;
  if (typeof status !== "string") return;
  const move = LEGACY_LIFECYCLE_MOVES.find(
    (m) => m.legacyIndependentStatus === status
  );
  if (!move) return;

  if (Object.prototype.hasOwnProperty.call(doc, "revival_status")) {
    issues.push({
      path: "/independent_status",
      code: "LIFECYCLE_CONFLICT",
      reason: `independent_status carries the legacy lifecycle value "${status}" while revival_status is also present ("${String(
        doc.revival_status
      )}") — two lifecycle answers exist and the engine will not choose between them.`,
      value: status,
    });
    return;
  }

  doc.revival_status = move.revivalStatus;
  delete doc.independent_status;
  ledger.push({
    path: "/revival_status",
    action: "move-value",
    before: { path: "/independent_status", value: status },
    after: move.revivalStatus,
    reason: `${move.reason} independent_status is removed because the legacy file answered lifecycle there, not ownership; ownership remains an unresolved required fact.`,
    rule: move.rule,
    severity: "structural",
  });
}

function addContainer(
  obj: PlainObject,
  key: string,
  path: string,
  ledger: LedgerRow[]
): void {
  if (Object.prototype.hasOwnProperty.call(obj, key)) return;
  obj[key] = [];
  ledger.push({
    path: `${path}/${key}`,
    action: "add-empty-container",
    before: null,
    after: [],
    reason:
      "Added the required empty container. No factual value was inferred or created.",
    rule: RULE_ADD_REQUIRED_EMPTY,
    severity: "structural",
  });
}

function addRequiredEmptyContainers(
  doc: PlainObject,
  ledger: LedgerRow[]
): void {
  for (const key of ADDABLE_EMPTY_CONTAINERS.brand) {
    addContainer(doc, key, "", ledger);
  }
  const collections = Array.isArray(doc.Collections) ? doc.Collections : [];
  collections.forEach((collection, ci) => {
    if (!isPlainObject(collection)) return;
    for (const key of ADDABLE_EMPTY_CONTAINERS.collection) {
      addContainer(collection, key, `/Collections/${ci}`, ledger);
    }
    const families = Array.isArray(collection.Families)
      ? collection.Families
      : [];
    families.forEach((family, fi) => {
      if (!isPlainObject(family)) return;
      for (const key of ADDABLE_EMPTY_CONTAINERS.family) {
        addContainer(family, key, `/Collections/${ci}/Families/${fi}`, ledger);
      }
      const variants = Array.isArray(family.Variants) ? family.Variants : [];
      variants.forEach((variant, vi) => {
        if (!isPlainObject(variant)) return;
        for (const key of ADDABLE_EMPTY_CONTAINERS.variant) {
          addContainer(
            variant,
            key,
            `/Collections/${ci}/Families/${fi}/Variants/${vi}`,
            ledger
          );
        }
      });
    });
  });
}

function convertReferenceStrings(
  doc: PlainObject,
  ledger: LedgerRow[],
  issues: AnalysisIssue[]
): void {
  const collections = Array.isArray(doc.Collections) ? doc.Collections : [];
  collections.forEach((collection, ci) => {
    if (!isPlainObject(collection)) return;
    const families = Array.isArray(collection.Families)
      ? collection.Families
      : [];
    families.forEach((family, fi) => {
      if (!isPlainObject(family)) return;
      const variants = Array.isArray(family.Variants) ? family.Variants : [];
      variants.forEach((variant, vi) => {
        if (!isPlainObject(variant)) return;
        const refs = variant.references;
        if (!Array.isArray(refs)) return;
        refs.forEach((ref, ri) => {
          const path = `/Collections/${ci}/Families/${fi}/Variants/${vi}/references/${ri}`;
          if (typeof ref === "string") {
            refs[ri] = { reference: ref };
            ledger.push({
              path,
              action: "convert-reference-string",
              before: ref,
              after: { reference: ref },
              reason:
                "Legacy exact Reference string converted to the v3.2 Reference object. The string is preserved exactly; no metadata was invented.",
              rule: RULE_REF_STRING_TO_OBJECT,
              severity: "format",
            });
          } else if (!isPlainObject(ref)) {
            issues.push({
              path,
              code: "VALUE_DECISION_REQUIRED",
              reason:
                "Reference entry is neither an exact string nor a Reference object — no registered conversion applies.",
              value: ref,
            });
          }
        });
      });
    });
  });
}

/* ── Validation mapping ────────────────────────────────────────────────── */

function valueAtPointer(doc: PlainObject, pointer: string): unknown {
  if (pointer === "") return doc;
  const parts = pointer
    .split("/")
    .slice(1)
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = doc;
  for (const part of parts) {
    if (Array.isArray(current)) {
      current = current[Number(part)];
    } else if (isPlainObject(current)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function mapSchemaErrors(
  errors: ErrorObject[],
  doc: PlainObject,
  issues: AnalysisIssue[]
): void {
  for (const err of errors) {
    const at = err.instancePath || "";
    if (err.keyword === "additionalProperties") {
      const prop = (err.params as { additionalProperty: string })
        .additionalProperty;
      const path = `${at}/${prop}`;
      issues.push({
        path,
        code: "UNSUPPORTED_SCHEMA_FIELD",
        reason: `Field "${prop}" is not part of the closed v3.2 schema at this level. It has not been dropped — decide what happens to it.`,
        value: valueAtPointer(doc, path),
      });
    } else if (err.keyword === "required") {
      const prop = (err.params as { missingProperty: string }).missingProperty;
      issues.push({
        path: `${at}/${prop}`,
        code: "MISSING_REQUIRED_FACT",
        reason: `Required v3.2 field "${prop}" is absent from the source. The engine will not manufacture a value.`,
      });
    } else if (err.keyword === "enum") {
      const allowed = (err.params as { allowedValues: string[] }).allowedValues;
      issues.push({
        path: at,
        code: "VALUE_DECISION_REQUIRED",
        reason: `Value is not one of the permitted v3.2 values for this field.`,
        value: valueAtPointer(doc, at),
        allowedValues: allowed,
      });
    } else if (err.keyword === "type") {
      issues.push({
        path: at,
        code: "VALUE_DECISION_REQUIRED",
        reason: `Value has the wrong type — the contract expects ${String(
          (err.params as { type: string }).type
        )}.`,
        value: valueAtPointer(doc, at),
      });
    } else {
      issues.push({
        path: at,
        code: "VALUE_DECISION_REQUIRED",
        reason: `Contract violation (${err.keyword}): ${err.message ?? ""}`.trim(),
        value: valueAtPointer(doc, at),
      });
    }
  }
}

/* ── Conditional lifecycle rules ───────────────────────────────────────── */

function checkLifecycleConditionals(
  doc: PlainObject,
  issues: AnalysisIssue[]
): void {
  const revivalStatus = doc.revival_status;
  const revivalType = doc.revival_type;
  const continuity = doc.historical_continuity;
  const hasType = Object.prototype.hasOwnProperty.call(doc, "revival_type");
  const hasContinuity = Object.prototype.hasOwnProperty.call(
    doc,
    "historical_continuity"
  );

  if (revivalStatus === "revived" && !hasType) {
    issues.push({
      path: "/revival_type",
      code: "MISSING_REQUIRED_FACT",
      reason:
        'revival_status "revived" requires revival_type ("original" or "acquired") — how the brand was revived is a fact the engine will not guess.',
      allowedValues: ["original", "acquired"],
    });
  }
  if (hasType && revivalStatus !== "revived") {
    issues.push({
      path: "/revival_type",
      code: "CONDITIONAL_VIOLATION",
      reason: `revival_type is present ("${String(
        revivalType
      )}") but revival_status is "${String(
        revivalStatus
      )}" — the contract permits revival_type only when revival_status is "revived".`,
      value: revivalType,
    });
  }
  if (hasContinuity && continuity === "revived" && revivalStatus !== "revived") {
    issues.push({
      path: "/historical_continuity",
      code: "CONDITIONAL_VIOLATION",
      reason: `historical_continuity "revived" requires revival_status "revived" (found "${String(
        revivalStatus
      )}") — the two fields must never contradict on a dormancy-and-return.`,
      value: continuity,
    });
  }
  if (
    hasContinuity &&
    revivalStatus === "revived" &&
    typeof continuity === "string" &&
    continuity !== "revived"
  ) {
    issues.push({
      path: "/historical_continuity",
      code: "CONDITIONAL_VIOLATION",
      reason: `revival_status "revived" with historical_continuity "${continuity}" — a revived brand's continuity record must be "revived".`,
      value: continuity,
    });
  }
  if (
    hasContinuity &&
    continuity === "interrupted" &&
    revivalStatus !== "active"
  ) {
    issues.push({
      path: "/historical_continuity",
      code: "CONDITIONAL_VIOLATION",
      reason: `historical_continuity "interrupted" is reserved for gaps that are not a revival — revival_status must be "active" (found "${String(
        revivalStatus
      )}").`,
      value: continuity,
    });
  }
}

/* ── Content completeness ──────────────────────────────────────────────── */

function pushProseIssue(
  issues: AnalysisIssue[],
  path: string,
  label: string,
  value: unknown,
  min: number | null,
  max: number | null
): void {
  if (typeof value !== "string") return; // type errors already reported
  if (value.trim().length === 0) {
    issues.push({
      path,
      code: "EMPTY_REQUIRED_PROSE",
      reason: `${label} is present but empty. Missing truth remains missing — the engine will not write it.`,
      value,
    });
    return;
  }
  if (min !== null && max !== null) {
    const words = wordCount(value);
    if (words < min || words > max) {
      issues.push({
        path,
        code: "WORD_COUNT_OUT_OF_RANGE",
        reason: `${label} is ${words} words; the contract requires ${min}–${max}.`,
        value,
      });
    }
  }
}

function checkContentCompleteness(
  doc: PlainObject,
  issues: AnalysisIssue[]
): void {
  pushProseIssue(issues, "/Brand", "Brand name", doc.Brand, null, null);
  pushProseIssue(
    issues,
    "/description",
    "Brand description",
    doc.description,
    20,
    50
  );
  pushProseIssue(
    issues,
    "/country_of_origin",
    "country_of_origin",
    doc.country_of_origin,
    null,
    null
  );
  pushProseIssue(
    issues,
    "/cluster_rationale",
    "cluster_rationale",
    doc.cluster_rationale,
    8,
    25
  );

  const collections = Array.isArray(doc.Collections) ? doc.Collections : [];
  collections.forEach((collection, ci) => {
    if (!isPlainObject(collection)) return;
    pushProseIssue(
      issues,
      `/Collections/${ci}/name`,
      "Collection name",
      collection.name,
      null,
      null
    );
    const families = Array.isArray(collection.Families)
      ? collection.Families
      : [];
    families.forEach((family, fi) => {
      if (!isPlainObject(family)) return;
      pushProseIssue(
        issues,
        `/Collections/${ci}/Families/${fi}/name`,
        "Family name",
        family.name,
        null,
        null
      );
      const variants = Array.isArray(family.Variants) ? family.Variants : [];
      variants.forEach((variant, vi) => {
        if (!isPlainObject(variant)) return;
        const vPath = `/Collections/${ci}/Families/${fi}/Variants/${vi}`;
        pushProseIssue(
          issues,
          `${vPath}/name`,
          "Variant name",
          variant.name,
          null,
          null
        );
        pushProseIssue(
          issues,
          `${vPath}/description`,
          "Variant description",
          variant.description,
          20,
          50
        );
        const refs = Array.isArray(variant.references)
          ? variant.references
          : [];
        refs.forEach((ref, ri) => {
          if (!isPlainObject(ref)) return;
          pushProseIssue(
            issues,
            `${vPath}/references/${ri}/reference`,
            "Reference number",
            ref.reference,
            null,
            null
          );
        });
      });
    });
  });
}

/* ── Taxonomy: what a name is allowed to encode (v3.2 §12/§13) ─────────── */

/**
 * Materials and dial colours say how a watch was executed, not which watch
 * it is, so they may never be the thing that earns a Variant its own node.
 * The closed schema cannot express that: it is a rule about meaning, and a
 * file can satisfy every structural check while breaking it.
 *
 * The test is comparative, never a banned-word scan. A Variant's identity is
 * whatever its name says that its siblings' names do not — or, when it is an
 * only child and has no siblings to define it, whatever it says that its
 * parent Family does not. Subtract that shared ground and judge the rest:
 *
 *   nothing left           → the name restates its parent; nothing claimed
 *   only execution words   → material and dial are doing the dividing → raise
 *   anything else remains  → a real identity is present; leave it alone,
 *                            even when a material word sits beside it
 *
 * That last line is the whole point. "Datograph Up/Down Platinum" survives on
 * "Up/Down" while "Saxonia Thin White Gold" does not, and a Honeygold piece
 * survives on "Lumen" exactly as Handwerkskunst and anniversary pieces do.
 *
 * The finding is raised and never acted on. Whether two entries are separate
 * watches or one watch in two executions is a judgement about what these
 * objects ARE, and restructuring on a guess would destroy the distinction it
 * was trying to record.
 */
function checkTaxonomyHierarchy(
  doc: PlainObject,
  issues: AnalysisIssue[]
): void {
  const collections = Array.isArray(doc.Collections) ? doc.Collections : [];
  collections.forEach((collection, ci) => {
    if (!isPlainObject(collection)) return;
    const families = Array.isArray(collection.Families)
      ? collection.Families
      : [];
    families.forEach((family, fi) => {
      if (!isPlainObject(family)) return;
      const variants = Array.isArray(family.Variants) ? family.Variants : [];
      if (variants.length === 0) return;

      const siblingTokens = variants.map(
        (v) => new Set(isPlainObject(v) ? nameTokens(v.name) : [])
      );
      const familyTokens = new Set(nameTokens(family.name));
      const hasSiblings = variants.length > 1;

      variants.forEach((variant, vi) => {
        if (!isPlainObject(variant)) return;
        const own = nameTokens(variant.name);
        if (own.length === 0) return;

        const shared = hasSiblings
          ? new Set(
              own.filter((token) =>
                siblingTokens.every((set, i) => i === vi || set.has(token))
              )
            )
          : familyTokens;

        const residual = own.filter((token) => !shared.has(token));
        if (residual.length === 0) return;
        if (!residual.every(isExecutionToken)) return;

        const against = hasSiblings
          ? "the other Variants in its Family"
          : "its parent Family";
        issues.push({
          path: `/Collections/${ci}/Families/${fi}/Variants/${vi}/name`,
          code: "TAXONOMY_HIERARCHY_VIOLATION",
          reason: `This Variant is distinguished from ${against} only by ${residual.join(
            ", "
          )} — material and dial execution, which the specification does not permit to create hierarchy. Whether these are genuinely separate watches, or executions of one watch whose references belong together, is a decision about the taxonomy: the engine reports it and restructures nothing. Governing clause: ${TAXONOMY_SPEC_CLAUSE}`,
          value: variant.name,
        });
      });
    });
  });
}

/* ── Issue hygiene ─────────────────────────────────────────────────────── */

function dedupeAndSortIssues(issues: AnalysisIssue[]): void {
  const seen = new Set<string>();
  const unique = issues.filter((i) => {
    const key = `${i.path}|${i.code}|${i.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) =>
    a.path === b.path
      ? a.code.localeCompare(b.code)
      : a.path.localeCompare(b.path)
  );
  issues.length = 0;
  issues.push(...unique);
}
