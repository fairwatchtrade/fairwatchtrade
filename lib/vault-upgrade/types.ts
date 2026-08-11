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
  /* A Variant whose only distinction from its siblings or its parent Family
     is material or dial execution. The closed schema cannot express this —
     it is a rule about what a name may encode, not about shape. */
  | "TAXONOMY_HIERARCHY_VIOLATION"
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
  | "omit-legacy-field"
  | "apply-researched-fact"
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
    omittedLegacyFields: number;
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
  /** Result of the completion pass, when one has been run. */
  completion: CompletionRecord | null;
  /** Candidate bytes stored separately so downloads re-verify exact storage. */
  candidateBytes: ArrayBuffer | null;
  /** Provisional bytes, kept apart from candidateBytes so a held run's work
      product can never be delivered through the final-candidate path. */
  provisionalBytes: ArrayBuffer | null;
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

/* ════════════════════════════════════════════════════════════════════════
   COMPLETION — researched facts, provenance, and the finished candidate

   The analyzer above is deterministic and never researches. Everything
   below describes the completion pass that turns an analyzed file into a
   finished current-spec candidate: what was asked, what evidence answered
   it, and what a human still has to decide.
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Evidence strength for one requested fact.
 *
 * VERIFIED     — evidence is sufficient; the fact may enter the candidate.
 * UNRESOLVED   — evidence exists but cannot choose safely; withhold this
 *                exact fact and show the decision to a human.
 * UNSUPPORTED  — no qualifying evidence; omit rather than invent.
 */
export type ResearchOutcome = "VERIFIED" | "UNRESOLVED" | "UNSUPPORTED";

export type ResearchSource = {
  title: string;
  publisher: string | null;
  url: string;
};

/** One plausible answer the evidence supports but cannot decide between. */
export type ResearchOption = {
  value: string;
  evidence: string;
  sources: ResearchSource[];
};

/** Which bounded pass produced a result. */
export type ResearchPass = "hierarchy" | "reference";

/** What class of fact is being requested. Drives prompt and validation. */
export type ResearchKind =
  | "brand-fact"
  | "variant-description"
  | "variant-notes"
  | "variant-references";

/**
 * One bounded question, built from the source file and its exact unresolved
 * paths. Never a general "research this brand" instruction.
 */
export type ResearchRequest = {
  /** Exact JSON pointer the answer belongs at. */
  path: string;
  /** Leaf field name, e.g. "cluster" or "description". */
  field: string;
  kind: ResearchKind;
  /** Closed vocabulary where the contract defines one. */
  allowedValues?: readonly string[];
  /** Inclusive word range where the contract defines one. */
  wordRange?: readonly [number, number];
  /** Exact hierarchy context preserved from the source — never invented. */
  context: Record<string, unknown>;
};

/** One answer, as returned by the server and validated before use. */
export type ResearchResult = {
  path: string;
  outcome: ResearchOutcome;
  /** Present only when outcome is VERIFIED. */
  value?: unknown;
  sources: ResearchSource[];
  evidence: string;
  confidence: "high" | "moderate" | "low";
  /** Present only when outcome is UNRESOLVED. */
  options?: ResearchOption[];
};

/**
 * Exact record of one researched fact's disposition. Lives in the change
 * report, never inside the strict candidate — the active specification
 * closes every object, so provenance has no legal home in the file itself.
 */
export type ProvenanceEntry = {
  path: string;
  field: string;
  pass: ResearchPass;
  outcome: ResearchOutcome;
  previousValue: unknown;
  finalValue: unknown;
  sources: ResearchSource[];
  evidence: string;
  confidence: "high" | "moderate" | "low";
  options?: ResearchOption[];
};

/**
 * A genuine human decision. Field-level decisions never hold the whole
 * candidate; structural ones do.
 *
 * FIELD      — one uncertain fact; candidate continues without it.
 * STRUCTURAL — identity, hierarchy, duplicate-vs-sibling, deletion or
 *              relocation of hierarchy, or anything that would make the
 *              candidate structurally dishonest. Holds the candidate.
 */
export type DecisionScope = "FIELD" | "STRUCTURAL";

export type HumanDecision = {
  path: string;
  field: string;
  scope: DecisionScope;
  /** Exactly what is undecided. */
  issue: string;
  /** Why the updater cannot safely choose. */
  whyNotAutomatic: string;
  options: ResearchOption[];
  /** Whether omitting the field keeps the candidate contract-valid. */
  omittable: boolean;
};

/**
 * What a run actually consumed at the provider.
 *
 * Token classes are reported exactly as the provider returns them and are
 * never converted to money here: prices are not in the response, and a dollar
 * figure derived from a rate this file guessed at would look authoritative
 * and be wrong the moment pricing moved.
 *
 * `cacheReadInputTokens` is the number that matters most — it is the only
 * direct evidence that repeated context is being reused rather than bought
 * again on every request.
 */
export type ProviderUsage = {
  /** Input tokens billed at the full rate — nothing reused. */
  inputTokens: number;
  /** Input tokens written into the cache, billed at a premium once. */
  cacheCreationInputTokens: number;
  /** Input tokens served from the cache. */
  cacheReadInputTokens: number;
  outputTokens: number;
  /** Provider requests issued, including every continuation. */
  requests: number;
  /** Turns spent resuming a paused search loop. */
  continuations: number;
  /** Searches the provider ran on our behalf. */
  webSearches: number;
  /** The exact model asked for, so one run can be compared with another. */
  model: string;
};

/** Live phase of a completion run, for per-file progress. */
export type CompletionPhase =
  | "ANALYZING"
  | "STRUCTURAL_UPGRADE"
  | "RESEARCHING"
  | "REFERENCE_PASS"
  | "VALIDATING"
  | "FREEZING"
  | "DONE";

/** Terminal outcome of a completion run. */
export type CompletionStatus =
  | "CANDIDATE_READY"
  | "READY_WITH_HUMAN_DECISIONS"
  | "CURRENT_V3_2_NO_CHANGE"
  | "HUMAN_DECISION_REQUIRED"
  | "BLOCKED"
  | "FAILED_RETRYABLE"
  | "BLOCKED_PROVIDER_AUTHORIZATION";

export type CompletionCounts = {
  /** Findings closed by deterministic structural conversion. */
  completedStructurally: number;
  /** Findings closed by sourced research. */
  completedByResearch: number;
  /** References added by the dedicated Reference pass. */
  referencesAdded: number;
  /** Variants that correctly kept an empty references array. */
  emptyReferencesRetained: number;
  /** Genuine human decisions still open. */
  humanDecisions: number;
  /** Research rounds executed. */
  researchRounds: number;
};

/**
 * Result of one completion run. The candidate is present only when the
 * acceptance gate passed; decisions are always reported in full.
 */
export type CompletionRecord = {
  status: CompletionStatus;
  counts: CompletionCounts;
  /** Every structural transform plus every applied researched fact. */
  ledger: LedgerRow[];
  provenance: ProvenanceEntry[];
  decisions: HumanDecision[];
  /** Unresolved contract findings that are not human decisions. */
  issues: AnalysisIssue[];
  /**
   * The finished article. Present only when the acceptance gate passed, so
   * its existence is itself the claim that nothing is left open.
   */
  candidate: CandidateArtifact | null;
  /**
   * The accumulated work product of a run that is still held.
   *
   * A held run used to return nothing at all, which meant one open taxonomy
   * decision threw away every researched fact with it and the operator had
   * to rebuild the file by hand. This carries that work instead: every
   * transform applied, every sourced fact written, the disputed hierarchy
   * preserved exactly as it arrived.
   *
   * It is deliberately a separate field from `candidate` rather than a flag
   * on it. Nothing that reads `candidate` can serve this by accident, and
   * its filename says PROVISIONAL. It is never final, never verified, and
   * the decision that held it is still recorded in full.
   */
  provisionalCandidate: CandidateArtifact | null;
  sourceSha256: string;
  specificationSha256: string;
  contractId: string;
  engineVersion: string;
  upgradeRuleVersion: string;
  normalizationVersion: string;
  /** Exact single blocker when one prevented completion. */
  blocker: string | null;
  /**
   * Everything this file cost at the provider, summed across every research
   * call and every continuation — including the calls that failed, because a
   * run that spent tokens and then errored still spent them.
   */
  usage: ProviderUsage;
};
