/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — GOVERNED DOMAIN KNOWLEDGE (the editorial shelf)

   The sibling corpus beside the exact-reference claims corpus:

     exact-reference claims  →  what is true about THIS watch
     domain knowledge        →  what is useful to understand about
                                watches LIKE this
     the composer            →  turns the intersection into an article

   THE SCOPE LAW IS PRESERVED, NOT WIDENED. Reference claims stay bound to
   one Vault reference; domain knowledge is honestly reference-independent
   and lives here, in its own corpus with its own admission contracts. A
   domain statement that names a reference identifier is refused — the two
   scopes may meet only in the composer, under explicit typed linkage.

   REUSABLE DOES NOT MEAN UNGOVERNED. Every unit must be genuinely
   researched through the same DNS-pinned retrieval path, bound to
   retrieved text, and admitted through a class-specific deterministic
   contract. No model-memory fact becomes governed merely because it is
   generally true. No "everyone knows this". No confidence score.

   THE FACTS MAY BE REUSED. THE PROSE IS COMPOSED FRESH. This corpus
   stores knowledge units — statements, values, qualifiers, evidence —
   never stock article paragraphs.

   APPLICABILITY IS LOAD-BEARING. A unit reaches a composer only when a
   deterministic rule joins it to the exact reference's own composable
   claims (value match, subject match, statement term, line identity).
   The model never decides applicability from memory.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import {
  evidenceBindingRefusals,
  evidenceRefusals,
  normalizeForComparison,
  type ClaimEvidence,
  type RefusalCode,
  type ResearchOutcome,
  type RetrievedSource,
  type SourceClass,
} from "./claimAdmission.ts";
import type { ComposableClaim, CompositionIdentity } from "./composition.ts";

export const DOMAIN_KNOWLEDGE_CLASSES = [
  "GENERAL_HOROLOGY",
  "FEATURE_TECHNICAL_CONTEXT",
  "FEATURE_DESIGN_HISTORY",
  "CERTIFICATION_STANDARD_CONTEXT",
  "LINE_BRAND_CONTEXT",
] as const;
export type DomainKnowledgeClass = (typeof DOMAIN_KNOWLEDGE_CLASSES)[number];

export const DOMAIN_REFUSAL_CODES = [
  "DOMAIN_REFERENCE_CONTAMINATION",
  "DOMAIN_APPLICABILITY_MISSING",
  "DOMAIN_AUTHORITY_INSUFFICIENT",
] as const;
export type DomainRefusalCode =
  | RefusalCode
  | (typeof DOMAIN_REFUSAL_CODES)[number];

/* ── Applicability rules — deterministic joins to the exact reference ──
   A unit is applicable when ANY of its rules matches the reference's
   composable claims / governed identity. Every match is string- or
   value-mechanical; no model is consulted. */
export type DomainApplicabilityRule =
  | { kind: "value_match"; anyOf: string[] }
  | { kind: "subject_match"; subjects: string[] }
  | { kind: "statement_term"; terms: string[] }
  | { kind: "line_identity"; line: string };

export type DomainUnitInput = {
  /** Stable identity within the shelf, e.g. "beat_rate_28800". */
  knowledgeKey: string;
  knowledgeClass: DomainKnowledgeClass;
  /** Normalized concept key for grouping/audit, e.g. "beat_rate". */
  conceptKey: string;
  outcome: ResearchOutcome;
  /** The governed knowledge payload — reader-usable statement of fact,
      written as general knowledge, never about a specific reference. */
  statement: string;
  /** Mechanically comparable values for claim-scoped checks. */
  values: string[];
  qualifier?: string | null;
  evidence: ClaimEvidence[];
  applicability: DomainApplicabilityRule[];
};

/** The persisted slice composition needs. */
export type ComposableDomainUnit = {
  id: string;
  knowledgeKey: string;
  knowledgeClass: DomainKnowledgeClass;
  conceptKey: string;
  admission: string;
  evidenceBinding: string;
  statement: string;
  values: string[];
  qualifier: string | null;
  applicability: DomainApplicabilityRule[];
};

/* ── Class guards — what each knowledge class may and may not say ──────
   Mechanical causation IS the content of a technical explainer, so the
   causality guard is lifted for the technical classes; documented feature
   purpose is history's job, so the intent guard is lifted there — under
   that class's stronger sourcing. Significance, rarity and market
   authority are refused in EVERY class: the shelf stores knowledge, not
   vibes. */
const REFERENCE_IDENTIFIER_PATTERNS = [
  /\b\d{3,5}[A-Z]{2}\/\d{2}\/\d[A-Z]\d\b/i,
  /\b[A-Z]{1,3}\d{6,}[A-Z0-9]{0,6}\b/,
];

const SIGNIFICANCE_PATTERNS = [
  /\bsought[-\s]after\b/i, /\bcollectible\b/i, /\biconic\b/i, /\blegendary\b/i,
  /\bgrail\b/i, /\brare(r|st|ly)?\b/i, /\bscarce\b/i, /\bprized\b/i, /\bcoveted\b/i,
  /\bmost important\b/i, /\bhighly regarded\b/i, /\bdesirable\b/i,
  /\binvestment\b/i, /\bmarket\b/i, /\bcollectors? (?:regard|prize|prefer|love)\b/i,
];
const INTENT_PATTERNS = [
  /\bdesigned to\b/i, /\bintended to\b/i, /\bsought to\b/i, /\bwanted\b/i,
  /\bmeant to\b/i, /\bdeliberately\b/i, /\baims? to\b/i,
];
const CAUSALITY_PATTERNS = [
  /\bbecause\b/i, /\btherefore\b/i, /\bas a result\b/i, /\bconsequently\b/i,
  /\bwhich is why\b/i, /\bresulting in\b/i,
];
const CHRONOLOGY_PATTERNS = [
  /\b(?:1[6-9]\d{2}|20\d{2})\b/, /\bcenturies\b/i, /\bdecades\b/i,
  /\bsince\b/i, /\bfirst\b/i, /\borigin(?:ally|ated)?\b/i,
];

const INTENT_ALLOWED: readonly DomainKnowledgeClass[] = ["FEATURE_DESIGN_HISTORY"];
const CAUSALITY_ALLOWED: readonly DomainKnowledgeClass[] = [
  "GENERAL_HOROLOGY",
  "FEATURE_TECHNICAL_CONTEXT",
  "CERTIFICATION_STANDARD_CONTEXT",
];
const CHRONOLOGY_ALLOWED: readonly DomainKnowledgeClass[] = [
  "FEATURE_DESIGN_HISTORY",
  "LINE_BRAND_CONTEXT",
];

/** Source classes each knowledge class accepts at all. */
const DOMAIN_ACCEPTED_SOURCES: Record<DomainKnowledgeClass, readonly SourceClass[]> = {
  GENERAL_HOROLOGY: ["SPECIALIST_TECHNICAL", "MANUFACTURER_SPEC"],
  FEATURE_TECHNICAL_CONTEXT: ["SPECIALIST_TECHNICAL", "MANUFACTURER_SPEC"],
  FEATURE_DESIGN_HISTORY: [
    "MANUFACTURER_SPEC", "SPECIALIST_TECHNICAL", "AUCTION_HOUSE", "AUCTION_RECORD", "DEALER_ARCHIVE",
  ],
  CERTIFICATION_STANDARD_CONTEXT: ["SPECIALIST_TECHNICAL", "MANUFACTURER_SPEC"],
  LINE_BRAND_CONTEXT: [
    "MANUFACTURER_SPEC", "SPECIALIST_TECHNICAL", "AUCTION_HOUSE", "AUCTION_RECORD", "DEALER_ARCHIVE",
  ],
};

/** Hosts that ARE the governing body for a standard — the preferred
    authority for CERTIFICATION_STANDARD_CONTEXT. */
const STANDARD_BODY_HOSTS = ["cosc.swiss", "metas.ch", "iso.org", "poincondegeneve.ch"];

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type DomainAdmissionContext = {
  retrievals?: readonly RetrievedSource[];
};

/**
 * The domain admission contract. Deterministic: same unit, same refusals.
 * Evidence shape and retrieval binding reuse the exact-reference law —
 * there is no second, weaker sourcing path for "general knowledge".
 */
export function domainRefusals(
  unit: DomainUnitInput,
  ctx: DomainAdmissionContext
): DomainRefusalCode[] {
  const out = new Set<DomainRefusalCode>();

  if (unit.outcome !== "VERIFIED") out.add("OUTCOME_NOT_VERIFIED");
  if (!unit.knowledgeKey.trim() || !unit.conceptKey.trim() || !unit.statement.trim()) {
    out.add("INVALID_VALUE");
  }

  // A domain statement may not carry a reference identifier — that is how
  // shelf knowledge would masquerade as an exact-reference claim.
  const statement = normalizeForComparison(unit.statement);
  if (REFERENCE_IDENTIFIER_PATTERNS.some((p) => p.test(statement))) {
    out.add("DOMAIN_REFERENCE_CONTAMINATION");
  }

  // Applicability is load-bearing: a unit with no deterministic join to
  // any reference can never legitimately enter an article.
  if (!Array.isArray(unit.applicability) || unit.applicability.length === 0) {
    out.add("DOMAIN_APPLICABILITY_MISSING");
  }

  // Shared evidence shape law + retrieval binding, exactly as for claims.
  for (const code of evidenceRefusals(unit.evidence)) out.add(code);
  for (const code of evidenceBindingRefusals(
    { evidence: unit.evidence, values: unit.values, outcome: unit.outcome },
    { referenceText: "", retrievals: ctx.retrievals }
  )) {
    out.add(code);
  }

  // Source classes this knowledge class accepts.
  const accepted = DOMAIN_ACCEPTED_SOURCES[unit.knowledgeClass];
  for (const e of unit.evidence) {
    if (e.sourceClass && !accepted.includes(e.sourceClass)) {
      out.add("UNSUPPORTED_SOURCE_CLASS");
    }
  }

  // Authority contracts, per class.
  const hosts = new Set(unit.evidence.map((e) => hostOf(e.sourceUrl)).filter(Boolean));
  const hasManufacturer = unit.evidence.some((e) => e.sourceClass === "MANUFACTURER_SPEC");
  const onlyDealer = unit.evidence.length > 0 &&
    unit.evidence.every((e) => e.sourceClass === "DEALER_ARCHIVE");

  if (
    unit.knowledgeClass === "FEATURE_DESIGN_HISTORY" ||
    unit.knowledgeClass === "LINE_BRAND_CONTEXT"
  ) {
    // History does not auto-admit from a single retailer merely because
    // the page is real: primary/manufacturer material, or two independent
    // hosts.
    if (!hasManufacturer && hosts.size < 2) out.add("INSUFFICIENT_CORROBORATION");
    if (onlyDealer && hosts.size < 2) out.add("DOMAIN_AUTHORITY_INSUFFICIENT");
  }
  if (unit.knowledgeClass === "CERTIFICATION_STANDARD_CONTEXT") {
    // Prefer the certifying body itself; otherwise manufacturer material
    // corroborated by a second independent host.
    const hasBody = [...hosts].some((h) =>
      STANDARD_BODY_HOSTS.some((b) => h === b || h!.endsWith(`.${b}`))
    );
    if (!hasBody && !(hasManufacturer && hosts.size >= 2)) {
      out.add("DOMAIN_AUTHORITY_INSUFFICIENT");
    }
  }

  // Class guards: what this class of knowledge may not assert.
  if (SIGNIFICANCE_PATTERNS.some((p) => p.test(statement))) {
    out.add("UNSUPPORTED_SIGNIFICANCE");
  }
  if (!INTENT_ALLOWED.includes(unit.knowledgeClass) &&
      INTENT_PATTERNS.some((p) => p.test(statement))) {
    out.add("UNSUPPORTED_INTENT");
  }
  if (!CAUSALITY_ALLOWED.includes(unit.knowledgeClass) &&
      CAUSALITY_PATTERNS.some((p) => p.test(statement))) {
    out.add("UNSUPPORTED_CAUSALITY");
  }
  if (!CHRONOLOGY_ALLOWED.includes(unit.knowledgeClass) &&
      CHRONOLOGY_PATTERNS.some((p) => p.test(statement))) {
    out.add("UNSUPPORTED_CHRONOLOGY");
  }

  return [...out];
}

export function domainAdmissionFor(
  unit: DomainUnitInput,
  ctx: DomainAdmissionContext
): { admission: "ADMITTED" | "REFUSED" | "PENDING_REVIEW"; refusals: DomainRefusalCode[] } {
  const refusals = domainRefusals(unit, ctx);
  if (refusals.length === 0) return { admission: "ADMITTED", refusals: [] };
  if (unit.outcome !== "VERIFIED" && refusals.every((r) => r === "OUTCOME_NOT_VERIFIED")) {
    return { admission: "PENDING_REVIEW", refusals };
  }
  return { admission: "REFUSED", refusals };
}

/* ── Applicability evaluation ──────────────────────────────────────────── */
function ruleApplies(
  rule: DomainApplicabilityRule,
  claims: readonly ComposableClaim[],
  identity: CompositionIdentity
): boolean {
  const norm = (t: string) => normalizeForComparison(t).toLowerCase();
  switch (rule.kind) {
    case "value_match": {
      const wanted = rule.anyOf.map(norm);
      return claims.some((c) => c.values.some((v) => wanted.includes(norm(v))));
    }
    case "subject_match":
      return claims.some((c) => rule.subjects.map(norm).includes(norm(c.subject)));
    case "statement_term": {
      const terms = rule.terms.map(norm);
      return claims.some((c) => {
        const s = norm(c.statement);
        return terms.some((t) => s.includes(t));
      });
    }
    case "line_identity": {
      const line = norm(rule.line);
      return norm(identity.collection) === line || norm(identity.model).includes(line);
    }
    default:
      return false;
  }
}

/**
 * The intersection the composer is allowed to see: governed, retrieval-
 * bound, currently admitted units whose applicability rules join them to
 * this exact reference's composable claims or governed identity.
 */
export function applicableDomainUnits(
  units: readonly ComposableDomainUnit[],
  referenceClaims: readonly ComposableClaim[],
  identity: CompositionIdentity
): ComposableDomainUnit[] {
  return units.filter(
    (u) =>
      u.admission === "ADMITTED" &&
      u.evidenceBinding === "RETRIEVAL_BOUND" &&
      u.applicability.some((rule) => ruleApplies(rule, referenceClaims, identity))
  );
}
