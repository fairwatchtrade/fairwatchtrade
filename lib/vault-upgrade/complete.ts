/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — completion pass

   This is the part that finishes the job. The analyzer says what is wrong;
   this owns the loop until the file is either a strict-valid current-spec
   candidate or a short list of decisions only a person can make:

     analyze → deterministic conversion → validate
       → research the supportable gaps → apply sourced results → validate
       → dedicated Reference pass → validate
       → classify what is left → freeze

   Three rules shape everything here:

   - Nothing enters the candidate without evidence. A researched value is
     applied only when it came back VERIFIED with a retrievable source and
     survived contract validation.
   - Hold the smallest possible surface. One uncertain fact withholds that
     one fact. Only identity, hierarchy, or something that would make the
     candidate structurally dishonest holds the whole file.
   - The original is never touched. Every transform happens on a working
     copy parsed from the source bytes.

   No database call, no reconciliation, no apply, no Galaxy action. A
   finished candidate is still only a candidate.
   ──────────────────────────────────────────────────────────────────────── */

import type { UpgradeEngine } from "./analyze.ts";
import { serializeCandidate, stableStringify } from "./canonicalize.ts";
import { sha256HexOfText, utf8Bytes } from "./hash.ts";
import {
  buildHierarchyRequests,
  buildReferenceRequests,
  MAX_REQUESTS_PER_CALL,
  MAX_RESEARCH_ROUNDS,
} from "./research.ts";
import type {
  AnalysisIssue,
  CompletionCounts,
  CompletionPhase,
  CompletionRecord,
  CompletionStatus,
  ContractVerification,
  HumanDecision,
  LedgerRow,
  ProvenanceEntry,
  ResearchPass,
  ResearchRequest,
  ResearchResult,
} from "./types.ts";

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Raised when the operator cancels. Never leaves partial state behind. */
export class CompletionCancelled extends Error {
  constructor() {
    super("Completion was cancelled.");
    this.name = "CompletionCancelled";
  }
}

export type ResearchTransportResult =
  | { ok: true; results: ResearchResult[]; unanswered: string[] }
  | { ok: false; code: string; detail: string };

/**
 * Executes one bounded research call. Injected so the loop can be proven
 * without a network, and so the only implementation that holds a credential
 * stays on the server.
 */
export type ResearchTransport = (payload: {
  contractId: string;
  specificationSha256: string;
  sourceSha256: string;
  brandName: string | null;
  pass: ResearchPass;
  requests: ResearchRequest[];
}) => Promise<ResearchTransportResult>;

export type CompleteOptions = {
  engine: UpgradeEngine;
  schema: Record<string, unknown>;
  contract: ContractVerification;
  filename: string;
  bytes: ArrayBuffer | Uint8Array;
  transport: ResearchTransport;
  onPhase?: (phase: CompletionPhase, detail?: string) => void;
  signal?: { aborted: boolean };
};

/* ── Pointer helpers ───────────────────────────────────────────────────── */

function pointerParts(pointer: string): string[] {
  return pointer
    .split("/")
    .slice(1)
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function valueAtPointer(doc: PlainObject, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return doc;
  let current: unknown = doc;
  for (const part of pointerParts(pointer)) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (isPlainObject(current)) current = current[part];
    else return undefined;
  }
  return current;
}

/** Set a value at an existing parent. Never creates hierarchy. */
function setAtPointer(
  doc: PlainObject,
  pointer: string,
  value: unknown
): boolean {
  const parts = pointerParts(pointer);
  if (parts.length === 0) return false;
  const leaf = parts[parts.length - 1];
  let parent: unknown = doc;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(parent)) parent = parent[Number(part)];
    else if (isPlainObject(parent)) parent = parent[part];
    else return false;
  }
  if (Array.isArray(parent)) {
    parent[Number(leaf)] = value;
    return true;
  }
  if (isPlainObject(parent)) {
    parent[leaf] = value;
    return true;
  }
  return false;
}

function fieldOf(pointer: string): string {
  return pointer.slice(pointer.lastIndexOf("/") + 1);
}

function checkCancelled(signal?: { aborted: boolean }): void {
  if (signal?.aborted) throw new CompletionCancelled();
}

/* ── Reference safety ──────────────────────────────────────────────────── */

/**
 * The specification reserves `references` for official manufacturer or
 * catalogue numbers and forbids names of any kind. A returned "reference"
 * that merely echoes the variant, family, or collection name is the exact
 * failure that rule exists to prevent, so it is refused here regardless of
 * how well sourced it claimed to be.
 */
function referenceLooksLikeAName(
  reference: string,
  context: Record<string, unknown>
): boolean {
  const candidate = reference.trim().toLowerCase();
  if (!candidate) return true;
  const names: string[] = [];
  for (const key of ["variant", "family", "collection", "brand"]) {
    const v = context[key];
    if (typeof v === "string") names.push(v.trim().toLowerCase());
  }
  const aliases = context.existingAliases;
  if (Array.isArray(aliases)) {
    for (const a of aliases) {
      if (typeof a === "string") names.push(a.trim().toLowerCase());
    }
  }
  return names.some((n) => n.length > 0 && n === candidate);
}

/* ── Applying researched results ───────────────────────────────────────── */

type ApplyOutcome = {
  ledger: LedgerRow[];
  provenance: ProvenanceEntry[];
  decisions: HumanDecision[];
  applied: number;
  referencesAdded: number;
  emptyReferencesRetained: number;
};

function applyResults(
  doc: PlainObject,
  requests: readonly ResearchRequest[],
  results: readonly ResearchResult[],
  unanswered: readonly string[],
  pass: ResearchPass
): ApplyOutcome {
  const byPath = new Map(requests.map((r) => [r.path, r]));
  const out: ApplyOutcome = {
    ledger: [],
    provenance: [],
    decisions: [],
    applied: 0,
    referencesAdded: 0,
    emptyReferencesRetained: 0,
  };

  for (const result of results) {
    const request = byPath.get(result.path);
    if (!request) continue;
    const field = fieldOf(result.path);
    const previousValue = valueAtPointer(doc, result.path) ?? null;

    /* Defence in depth. The server validates provider output before it ever
       reaches here, but the transport is an injectable seam, so the two
       conditions that matter most are re-checked at the point of use: a
       verified answer must actually carry a value, and it must carry at
       least one retrievable source. An uncited claim is not evidence, so it
       is treated as no answer and never written into the document. */
    const unusable =
      result.outcome === "VERIFIED" &&
      (result.value === undefined ||
        result.value === null ||
        result.sources.length === 0);
    const outcome = unusable ? "UNSUPPORTED" : result.outcome;
    const unusableReason =
      result.value === undefined || result.value === null
        ? "The answer was marked verified but carried no value, so it was discarded."
        : "The answer was marked verified but carried no retrievable source, so it was discarded.";

    /**
     * Variant notes are required by the closed schema but the
     * specification's own Variant template shows `"notes": ""` as a legal
     * value, and §10 makes notes technical detail rather than an assertion
     * about the watch. So when research establishes nothing, the empty
     * string is the contract's own answer — it claims nothing, and it is
     * recorded here as plainly as any other disposition.
     */
    if (request.kind === "variant-notes" && outcome !== "VERIFIED") {
      if (setAtPointer(doc, result.path, "")) {
        out.ledger.push({
          path: result.path,
          action: "apply-researched-fact",
          before: previousValue,
          after: "",
          reason:
            "No technical detail could be sourced. The v3.2 Variant template permits an empty notes string, so the field is present and empty — nothing is asserted about this watch.",
          rule: "RESEARCH-NOTES-EMPTY-PERMITTED",
          severity: "format",
        });
      }
      out.provenance.push({
        path: result.path,
        field,
        pass,
        outcome,
        previousValue,
        finalValue: "",
        sources: result.sources,
        evidence: unusable
          ? `${unusableReason} The permitted empty notes value was used instead.`
          : result.evidence ||
            "No qualifying technical detail was found; the permitted empty value was used.",
        confidence: result.confidence,
        options: result.options ?? undefined,
      });
      continue;
    }

    if (outcome === "UNRESOLVED") {
      out.provenance.push({
        path: result.path,
        field,
        pass,
        outcome: "UNRESOLVED",
        previousValue,
        finalValue: null,
        sources: result.sources,
        evidence: result.evidence,
        confidence: result.confidence,
        options: result.options ?? [],
      });
      out.decisions.push({
        path: result.path,
        field,
        scope: "FIELD",
        issue: `Evidence supports more than one value for ${field}.`,
        whyNotAutomatic:
          result.evidence ||
          "Credible sources disagree and the evidence is insufficient to choose safely.",
        options: result.options ?? [],
        /* Provisional. Final validation decides whether leaving this field
           out still yields a contract-valid candidate. */
        omittable: true,
      });
      continue;
    }

    if (outcome === "UNSUPPORTED") {
      out.provenance.push({
        path: result.path,
        field,
        pass,
        outcome: "UNSUPPORTED",
        previousValue,
        finalValue: null,
        sources: result.sources,
        evidence: unusable
          ? unusableReason
          : result.evidence || "No qualifying evidence supported this fact.",
        confidence: result.confidence,
      });
      continue;
    }

    /* ── VERIFIED ─────────────────────────────────────────────────────── */

    if (request.kind === "variant-references") {
      const refs = Array.isArray(result.value) ? result.value : [];
      const kept: PlainObject[] = [];
      const refused: string[] = [];
      for (const ref of refs) {
        const text =
          isPlainObject(ref) && typeof ref.reference === "string"
            ? ref.reference.trim()
            : null;
        if (!text) continue;
        if (referenceLooksLikeAName(text, request.context)) {
          refused.push(text);
          continue;
        }
        if (kept.some((k) => k.reference === text)) continue; // no duplicates
        kept.push({ reference: text });
      }

      if (kept.length === 0) {
        /* An empty reference array is a correct outcome, not a gap. */
        out.emptyReferencesRetained += 1;
        out.provenance.push({
          path: result.path,
          field,
          pass,
          outcome: "UNSUPPORTED",
          previousValue: [],
          finalValue: [],
          sources: result.sources,
          evidence:
            refused.length > 0
              ? `No official manufacturer reference was established. ${refused.length} returned value(s) were refused for repeating a name rather than a reference.`
              : result.evidence ||
                "No official manufacturer reference could be confidently identified; the empty array is retained.",
          confidence: result.confidence,
        });
        continue;
      }

      if (setAtPointer(doc, result.path, kept)) {
        out.applied += 1;
        out.referencesAdded += kept.length;
        out.ledger.push({
          path: result.path,
          action: "apply-researched-fact",
          before: previousValue,
          after: kept,
          reason: `Official manufacturer reference(s) established by sourced research: ${result.sources
            .map((s) => s.url)
            .join(", ")}.`,
          rule: "RESEARCH-REFERENCE-PASS",
          severity: "structural",
        });
        out.provenance.push({
          path: result.path,
          field,
          pass,
          outcome: "VERIFIED",
          previousValue,
          finalValue: kept,
          sources: result.sources,
          evidence: result.evidence,
          confidence: result.confidence,
        });
      }
      continue;
    }

    if (setAtPointer(doc, result.path, result.value)) {
      out.applied += 1;
      out.ledger.push({
        path: result.path,
        action: "apply-researched-fact",
        before: previousValue,
        after: result.value,
        reason: `Established by sourced research: ${result.sources
          .map((s) => s.url)
          .join(", ")}.`,
        rule: "RESEARCH-HIERARCHY-PASS",
        severity: "structural",
      });
      out.provenance.push({
        path: result.path,
        field,
        pass,
        outcome: "VERIFIED",
        previousValue,
        finalValue: result.value,
        sources: result.sources,
        evidence: result.evidence,
        confidence: result.confidence,
      });
    }
  }

  /* A question that came back with no answer at all is UNSUPPORTED — the
     report says so rather than leaving a silent hole. */
  for (const path of unanswered) {
    const request = byPath.get(path);
    const isNotes = request?.kind === "variant-notes";
    if (isNotes && setAtPointer(doc, path, "")) {
      out.ledger.push({
        path,
        action: "apply-researched-fact",
        before: null,
        after: "",
        reason:
          "The research pass returned no technical detail. The v3.2 Variant template permits an empty notes string, so the field is present and empty — nothing is asserted about this watch.",
        rule: "RESEARCH-NOTES-EMPTY-PERMITTED",
        severity: "format",
      });
    }
    out.provenance.push({
      path,
      field: fieldOf(path),
      pass,
      outcome: "UNSUPPORTED",
      previousValue: valueAtPointer(doc, path) ?? null,
      finalValue: isNotes ? "" : null,
      sources: [],
      evidence: "The research pass returned no answer for this path.",
      confidence: "low",
    });
  }

  return out;
}

/* ── Classifying what remains ──────────────────────────────────────────── */

/**
 * Whether an unresolved finding is the kind that must hold the entire
 * candidate. Identity, hierarchy shape, and contract contradictions do;
 * a single missing fact does not.
 */
function isStructural(issue: AnalysisIssue): boolean {
  return (
    issue.code === "UNSUPPORTED_SCHEMA_FIELD" ||
    issue.code === "LIFECYCLE_CONFLICT" ||
    issue.code === "CONDITIONAL_VIOLATION" ||
    issue.code === "VALUE_DECISION_REQUIRED"
  );
}

function decisionFromIssue(
  issue: AnalysisIssue,
  provenance: readonly ProvenanceEntry[]
): HumanDecision {
  const field = fieldOf(issue.path);
  const found = provenance.find((p) => p.path === issue.path);
  const structural = isStructural(issue);
  return {
    path: issue.path,
    field,
    scope: structural ? "STRUCTURAL" : "FIELD",
    issue: issue.reason,
    whyNotAutomatic: found
      ? found.outcome === "UNRESOLVED"
        ? `Research found competing answers and could not choose safely. ${found.evidence}`
        : `Research found no qualifying evidence for this fact. ${found.evidence}`
      : structural
        ? "This affects the file's identity or hierarchy, so the updater will not decide it."
        : "No sourced research could establish this fact.",
    options: found?.options ?? [],
    omittable: false,
  };
}

/* ── The loop ──────────────────────────────────────────────────────────── */

export async function completeUpgrade(
  options: CompleteOptions
): Promise<CompletionRecord> {
  const { engine, schema, contract, filename, bytes, transport, signal } = options;
  const phase = (p: CompletionPhase, detail?: string) =>
    options.onPhase?.(p, detail);

  const contractId = contract.ok ? contract.identity.contractId : "unverified";
  const specificationSha256 = contract.ok
    ? contract.identity.specificationSha256
    : "unverified";

  phase("ANALYZING");
  const first = await engine.prepareSource({ filename, bytes });
  const analysis = first.record;

  const counts: CompletionCounts = {
    completedStructurally: 0,
    completedByResearch: 0,
    referencesAdded: 0,
    emptyReferencesRetained: 0,
    humanDecisions: 0,
    researchRounds: 0,
  };

  const shell = (
    status: CompletionStatus,
    blocker: string | null,
    extra?: Partial<CompletionRecord>
  ): CompletionRecord => ({
    status,
    counts,
    ledger: [],
    provenance: [],
    decisions: [],
    issues: analysis.issues,
    candidate: null,
    sourceSha256: analysis.sourceSha256,
    specificationSha256,
    contractId,
    engineVersion: analysis.engineVersion,
    upgradeRuleVersion: analysis.upgradeRuleVersion,
    normalizationVersion: analysis.normalizationVersion,
    blocker,
    ...extra,
  });

  /* Inputs the deterministic pass could not even open are not research
     problems — they stop here, unchanged. */
  if (!first.document) {
    return shell(
      "BLOCKED",
      `The source could not be prepared for upgrade (${analysis.status}).`
    );
  }
  if (analysis.status === "CURRENT_SPEC_NO_CHANGE") {
    phase("DONE");
    return shell("CURRENT_V3_2_NO_CHANGE", null);
  }

  const doc = first.document;
  const ledger: LedgerRow[] = analysis.ledger.filter(
    (r) => r.action !== "canonical-serialize"
  );
  const provenance: ProvenanceEntry[] = [];
  const fieldDecisions: HumanDecision[] = [];

  counts.completedStructurally = ledger.filter(
    (r) => r.action === "omit-legacy-field" || r.action === "move-value"
  ).length;

  let issues: AnalysisIssue[] = analysis.issues;

  /** Re-validate the working document through the same deterministic pass. */
  async function revalidate(): Promise<AnalysisIssue[]> {
    phase("VALIDATING");
    const text = serializeCandidate(doc);
    const again = await engine.prepareSource({
      filename,
      bytes: utf8Bytes(text),
    });
    return again.record.issues;
  }

  async function runPass(
    requests: ResearchRequest[],
    pass: ResearchPass
  ): Promise<{ ok: true } | { ok: false; record: CompletionRecord }> {
    for (let i = 0; i < requests.length; i += MAX_REQUESTS_PER_CALL) {
      checkCancelled(signal);
      const batch = requests.slice(i, i + MAX_REQUESTS_PER_CALL);
      const response = await transport({
        contractId,
        specificationSha256,
        sourceSha256: analysis.sourceSha256,
        brandName: analysis.brandName,
        pass,
        requests: batch,
      });
      if (!response.ok) {
        const providerAuth =
          response.code ===
          "VAULT_UPGRADE_RESEARCH_PROVIDER_AUTHORIZATION_REQUIRED";
        return {
          ok: false,
          record: shell(
            providerAuth
              ? "BLOCKED_PROVIDER_AUTHORIZATION"
              : "FAILED_RETRYABLE",
            response.detail,
            { ledger, provenance, issues }
          ),
        };
      }
      const applied = applyResults(
        doc,
        batch,
        response.results,
        response.unanswered,
        pass
      );
      ledger.push(...applied.ledger);
      provenance.push(...applied.provenance);
      fieldDecisions.push(...applied.decisions);
      counts.completedByResearch += applied.applied;
      counts.referencesAdded += applied.referencesAdded;
      counts.emptyReferencesRetained += applied.emptyReferencesRetained;
    }
    return { ok: true };
  }

  /* ── Hierarchy and factual completion, iterated ─────────────────────── */

  let round = 0;
  while (round < MAX_RESEARCH_ROUNDS) {
    checkCancelled(signal);
    const requests = buildHierarchyRequests(doc, issues, schema).filter(
      /* Never ask the same question twice — a path already answered stays
         answered, whatever the answer was. */
      (r) => !provenance.some((p) => p.path === r.path)
    );
    if (requests.length === 0) break;

    round += 1;
    counts.researchRounds = round;
    phase("RESEARCHING", `${requests.length} unresolved fact(s), round ${round}`);
    const passResult = await runPass(requests, "hierarchy");
    if (!passResult.ok) return passResult.record;

    issues = await revalidate();
  }

  /* ── Dedicated Reference pass ───────────────────────────────────────── */

  checkCancelled(signal);
  const referenceRequests = buildReferenceRequests(doc);
  if (referenceRequests.length > 0) {
    phase("REFERENCE_PASS", `${referenceRequests.length} variant(s)`);
    const passResult = await runPass(referenceRequests, "reference");
    if (!passResult.ok) return passResult.record;
    issues = await revalidate();
  } else {
    issues = await revalidate();
  }

  /* ── Classify and freeze ────────────────────────────────────────────── */

  checkCancelled(signal);

  const decisions: HumanDecision[] = [];
  const decidedPaths = new Set<string>();

  for (const issue of issues) {
    const decision = decisionFromIssue(issue, provenance);
    decisions.push(decision);
    decidedPaths.add(issue.path);
  }
  /* Field-level uncertainties whose field is genuinely optional never
     appear as contract findings — they are carried through here so the
     candidate can still ship with the decision recorded beside it. */
  for (const decision of fieldDecisions) {
    if (!decidedPaths.has(decision.path)) {
      decisions.push({ ...decision, omittable: true });
      decidedPaths.add(decision.path);
    }
  }
  counts.humanDecisions = decisions.length;

  const base = (status: CompletionStatus, blocker: string | null) => ({
    status,
    counts,
    ledger,
    provenance,
    decisions,
    issues,
    sourceSha256: analysis.sourceSha256,
    specificationSha256,
    contractId,
    engineVersion: analysis.engineVersion,
    upgradeRuleVersion: analysis.upgradeRuleVersion,
    normalizationVersion: analysis.normalizationVersion,
    blocker,
  });

  /* The acceptance gate. A candidate exists only when the document passes
     the same closed-contract validation an already-current file would. */
  if (issues.length > 0) {
    return { ...base("HUMAN_DECISION_REQUIRED", null), candidate: null };
  }

  phase("FREEZING");
  ledger.push({
    path: "/",
    action: "canonical-serialize",
    before: null,
    after: null,
    reason:
      "Candidate serialized under normalization-v1 (governed key order, 2-space indent, LF).",
    rule: "V32-CANONICAL-SERIALIZE",
    severity: "format",
  });

  const candidateText = serializeCandidate(doc);
  const candidateSha = await sha256HexOfText(candidateText);
  const ledgerSha = await sha256HexOfText(stableStringify(ledger));
  const baseName = filename.replace(/\.json$/i, "");

  phase("DONE");
  return {
    ...base(
      decisions.length > 0 ? "READY_WITH_HUMAN_DECISIONS" : "CANDIDATE_READY",
      null
    ),
    candidate: {
      filename: `${baseName}.vault-lock-v3.2.${candidateSha.slice(0, 8)}.json`,
      text: candidateText,
      sha256: candidateSha,
      ledgerSha256: ledgerSha,
      byteLength: utf8Bytes(candidateText).length,
    },
  };
}
