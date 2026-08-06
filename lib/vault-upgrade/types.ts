/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — shared types

   Types for the deterministic file-upgrade engine behind /admin/vault-upgrade.
   These describe file-upgrade outcomes only. They never mean certified,
   database-reconciled, ingested, published, or Galaxy-visible.

   Erasable-syntax-only TypeScript (no enums) so scripts/*.test.mjs can import
   these modules directly under node.
   ──────────────────────────────────────────────────────────────────────── */

/** File-upgrade analysis statuses. Exact vocabulary — do not extend casually. */
export type AnalysisStatus =
  | "CURRENT_SPEC_NO_CHANGE"
  | "STRUCTURAL_UPGRADE_READY"
  | "RESEARCH_REQUIRED"
  | "DECISION_REQUIRED"
  | "UNSUPPORTED_SOURCE_FORMAT"
  | "AMBIGUOUS_SOURCE_FORMAT"
  | "INVALID_JSON"
  | "DUPLICATE_SOURCE"
  | "ACTIVE_CONTRACT_MISMATCH"
  | "BLOCKED";

/** Source-format detection outcomes. */
export type SourceContract =
  | "CURRENT_CONTRACT"
  | "SUPPORTED_LEGACY_CONTRACT"
  | "UNVERSIONED_BUT_STRUCTURALLY_RECOGNIZED"
  | "AMBIGUOUS_SOURCE_FORMAT"
  | "UNSUPPORTED_SOURCE_FORMAT";

/** Deterministic contract certainty — never probabilistic wording. */
export type CertaintyClass =
  | "EXPLICIT"
  | "STRUCTURALLY_UNIQUE"
  | "AMBIGUOUS"
  | "UNSUPPORTED";

export type Detection = {
  sourceContract: SourceContract;
  /** Short factual statement of what structural markers decided the format. */
  detectionBasis: string;
  certaintyClass: CertaintyClass;
  /** Mapping identifier applied, or "none". */
  mappingSelected: string;
  mappingVersion: string;
};

/** Unresolved-item classes. Each maps to exactly one status family. */
export type IssueCode =
  /* → BLOCKED */
  | "UNSUPPORTED_SCHEMA_FIELD"
  /* → DECISION_REQUIRED */
  | "VALUE_DECISION_REQUIRED"
  | "LIFECYCLE_CONFLICT"
  | "CONDITIONAL_VIOLATION"
  /* → RESEARCH_REQUIRED */
  | "MISSING_REQUIRED_FACT"
  | "EMPTY_REQUIRED_PROSE"
  | "WORD_COUNT_OUT_OF_RANGE";

export type AnalysisIssue = {
  /** Exact JSON pointer path, e.g. "/Collections/0/Families/1/name". */
  path: string;
  code: IssueCode;
  /** Human-readable factual reason. Deterministic for identical input. */
  reason: string;
  /** Exact preserved source value where one exists. */
  value?: unknown;
  /** Permitted values, where the contract closes the vocabulary. */
  allowedValues?: readonly string[];
};

export type LedgerAction =
  | "rename-key"
  | "move-value"
  | "add-empty-container"
  | "convert-reference-string"
  | "canonical-serialize";

export type LedgerSeverity = "structural" | "format";

/** One exact change. Every transform the engine performs appears here. */
export type LedgerRow = {
  path: string;
  action: LedgerAction;
  before: unknown;
  after: unknown;
  reason: string;
  rule: string;
  severity: LedgerSeverity;
};

export type CandidateArtifact = {
  /** Genuinely new filename — never the source filename. */
  filename: string;
  /** Canonical serialized candidate text (LF, trailing newline). */
  text: string;
  sha256: string;
  ledgerSha256: string;
  byteLength: number;
};

/**
 * Deterministic analysis record. Excludes all runtime timestamps — repeated
 * analysis of identical bytes under the same contract must be byte-identical.
 */
export type AnalysisRecord = {
  status: AnalysisStatus;
  detection: Detection | null;
  issues: AnalysisIssue[];
  ledger: LedgerRow[];
  /** Counts derived from the exact ledger and issue list — never authored. */
  counts: {
    transforms: number;
    renamedKeys: number;
    movedValues: number;
    addedContainers: number;
    convertedReferences: number;
    unresolved: number;
  };
  sourceSha256: string;
  specificationSha256: string;
  candidate: CandidateArtifact | null;
  /** Parse failure detail when status is INVALID_JSON. */
  parseError: string | null;
  /** Brand name read from the source where recognizable (for search). */
  brandName: string | null;
  engineVersion: string;
  upgradeRuleVersion: string;
  normalizationVersion: string;
  contractId: string;
};

/** Room review states an operator can place a work item into. */
export type ReviewState = "NONE" | "RETURNED_FOR_RESEARCH" | "HELD_FOR_DECISION";

export type StagingRecord = {
  stagedAtIso: string;
  operator: string;
  specificationSha256: string;
  sourceSha256: string;
  candidateSha256: string | null;
  candidateFilename: string | null;
  ledgerSha256: string | null;
  statusAtStaging: AnalysisStatus;
  unresolvedAtStaging: number;
};

export type DuplicateUpload = {
  filename: string;
  atIso: string;
};

/**
 * Persisted work item — one per unique source byte sequence (keyed by
 * source SHA-256). Lives only in the local browser (IndexedDB).
 */
export type WorkItem = {
  sourceSha256: string;
  sourceFilename: string;
  sourceByteLength: number;
  /** Exact original bytes. Never rewritten. */
  sourceBytes: ArrayBuffer;
  uploadedAtIso: string;
  updatedAtIso: string;
  lastAction: string;
  operator: string;
  /** Re-uploads of identical bytes resolve here — never a second job. */
  duplicateUploads: DuplicateUpload[];
  analysis: AnalysisRecord | null;
  /** Candidate bytes stored separately so downloads re-verify exact storage. */
  candidateBytes: ArrayBuffer | null;
  reviewState: ReviewState;
  staging: StagingRecord | null;
};

export type ContractIdentity = {
  contractId: string;
  specificationFilename: string;
  specificationSha256: string;
  schemaCompanionSha256: string;
  upgradeRuleVersion: string;
  normalizationVersion: string;
  registeredOn: string;
  status: "active";
};

export type ContractVerification =
  | { ok: true; identity: ContractIdentity }
  | { ok: false; code: "ACTIVE_CONTRACT_MISMATCH"; detail: string };
