/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — CLAIM CLASSES AND ADMISSION CONTRACTS

   The deterministic layer between research and prose. Pure and
   dependency-free, so the population path, the future composer, the future
   verifier and the tests all read ONE definition and cannot drift — the
   arrangement lib/vault/enrichmentFactTypes.ts already uses for the
   enrichment gate.

   THE GOVERNING RULE. A machine-gathered claim enters the governed corpus
   only through an explicit, claim-class-specific admission contract. Never
   because a model sounded confident, never because a domain looked
   plausible, never because two models agreed, never because a score crossed
   a line. THERE IS NO CONFIDENCE FIELD HERE, by construction.

   The evidence refusals below are deliberate ports of the enrichment gate's
   hard-won rules (placeholder hosts, prose-as-source, ISO dates) — both were
   found inside already-"validated" packs carrying verified: true, and this
   corpus would inherit the same trap without them.

   WHY THREE CLASSES. A corpus of hard facts alone produces a specification
   sheet; unconstrained prose produces invention. The third class exists so
   the Dossier can read like considered writing while still refusing
   explanation it cannot support:

     · OBJECTIVE_FACT      — measurable/specified truth about this reference
     · CONTEXTUAL_FACT     — history, chronology, attribution, documented
                             reception, relationship to adjacent references
     · DESIGN_DESCRIPTION  — bounded observation of what is visibly there:
                             proportion, layering, contrast, geometry,
                             texture, reading order

   The distinction is load-bearing:
     bounded observation is allowed; unsupported explanation is not.
   "The chapter ring and hands form a distinct reading layer" is observation.
   "Breguet designed it that way because…" is a causal claim that needs its
   own admitted evidence.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const CLAIM_CLASSES = [
  "OBJECTIVE_FACT",
  "CONTEXTUAL_FACT",
  "DESIGN_DESCRIPTION",
] as const;
export type ClaimClass = (typeof CLAIM_CLASSES)[number];

/** The research trichotomy, reused verbatim from the Vault research
    validator. An uncited claim is never accepted, however plausible. */
export const RESEARCH_OUTCOMES = ["VERIFIED", "UNRESOLVED", "UNSUPPORTED"] as const;
export type ResearchOutcome = (typeof RESEARCH_OUTCOMES)[number];

/** Corpus state. Distinct from the research outcome: a VERIFIED finding can
    still be REFUSED admission, and an UNRESOLVED finding is durable but
    never automatically publishable. */
export const ADMISSION_STATES = ["ADMITTED", "REFUSED", "PENDING_REVIEW"] as const;
export type AdmissionState = (typeof ADMISSION_STATES)[number];

export const SOURCE_CLASSES = [
  "MANUFACTURER_SPEC",
  "AUCTION_HOUSE",
  "AUCTION_RECORD",
  "SPECIALIST_TECHNICAL",
  "DEALER_ARCHIVE",
  "SPECIALIST_OBSERVATION",
] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

/** Named refusal conditions. Every one is a stated reason a human can read;
    none is a threshold. Refusal is a first-class durable state, never a log
    line. */
export const REFUSAL_CODES = [
  "OUTCOME_NOT_VERIFIED",
  "IDENTITY_AMBIGUITY",
  "MISSING_EVIDENCE",
  "PLACEHOLDER_SOURCE",
  "PROSE_AS_SOURCE",
  "INVALID_DATE",
  "INVALID_VALUE",
  "UNSUPPORTED_SOURCE_CLASS",
  "INSUFFICIENT_CORROBORATION",
  "CONFLICTING_SOURCE",
  "IMPLAUSIBLE_VALUE",
  "SIBLING_REFERENCE_CONTAMINATION",
  "UNSUPPORTED_CAUSALITY",
  "UNSUPPORTED_INTENT",
  "UNSUPPORTED_SIGNIFICANCE",
  "UNSUPPORTED_CHRONOLOGY",
  "UNSUPPORTED_ATTRIBUTION",
  "UNLINKED_OBSERVATION",
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

export type ClaimEvidence = {
  sourceClass: SourceClass | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceExcerpt: string | null;
  sourceAccessed: string | null;
};

export type ClaimInput = {
  /** Stable identity within the reference. */
  claimKey: string;
  claimClass: ClaimClass;
  outcome: ResearchOutcome;
  /** What the claim is about — the corpus equivalent of a research path. */
  subject: string;
  /** Reader-usable sentence. */
  statement: string;
  /** Mechanically comparable values, for claim-scoped deterministic checks. */
  values: string[];
  /** A recheck/limit condition the prose MUST carry if it uses this claim. */
  qualifier?: string | null;
  /** Competing readings — only meaningful for UNRESOLVED. */
  options?: { value: string; evidence: string }[];
  /** Primary evidence. Corroboration is expressed by additional entries. */
  evidence: ClaimEvidence[];
  /** DESIGN_DESCRIPTION only: the admitted claims this observation rests on. */
  supports?: string[];
  /** Traceability seam toward DossierSection.moduleId — never rendered. */
  moduleHint?: string | null;
};

/* ── Typographic normalisation — FOR COMPARISON ONLY ────────────────────
   The replay proved this is load-bearing: approved copy carries curly
   apostrophes, narrow no-break spaces and en dashes deliberately, and a
   comparator that does not fold them refuses perfectly faithful prose.
   Compare normalized. Preserve beautifully — nothing here ever rewrites
   stored content. */
export function normalizeForComparison(text: string): string {
  return text
    .replace(/[   ⁠]/g, " ")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—‑]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const PLACEHOLDER_HOSTS = ["example.com", "example.org", "example.net", "localhost"];
const PROSE_SOURCE_PATTERNS = [
  /^verified\s+independent\s+source$/i,
  /^independent\s+source$/i,
  /^manufacturer$/i,
  /^official\s+source$/i,
  /^specialist\s+source$/i,
  /replace[-\s]?with[-\s]?real/i,
];

/** Source classes that may carry each claim class. */
const ACCEPTED_SOURCE_CLASSES: Record<ClaimClass, readonly SourceClass[]> = {
  OBJECTIVE_FACT: [
    "MANUFACTURER_SPEC",
    "SPECIALIST_TECHNICAL",
    "AUCTION_RECORD",
    "DEALER_ARCHIVE",
  ],
  CONTEXTUAL_FACT: [
    "MANUFACTURER_SPEC",
    "AUCTION_HOUSE",
    "AUCTION_RECORD",
    "SPECIALIST_TECHNICAL",
    "DEALER_ARCHIVE",
  ],
  DESIGN_DESCRIPTION: ["SPECIALIST_OBSERVATION", "SPECIALIST_TECHNICAL"],
};

/** A contextual claim from one of these alone is enough; anything else must
    be corroborated by a second, independent source host. */
const PRIMARY_CONTEXT_SOURCES: readonly SourceClass[] = ["MANUFACTURER_SPEC", "AUCTION_HOUSE"];

/* ── What a bounded observation may NOT assert ─────────────────────────
   DESIGN_DESCRIPTION may describe what is visibly there. The moment it
   explains WHY, ranks importance, places events in time, or attributes a
   statement to someone, it has left its class and needs separately admitted
   evidence. These patterns are the deterministic guard. */
const CLASS_GUARDS: { code: RefusalCode; patterns: RegExp[] }[] = [
  {
    code: "UNSUPPORTED_CAUSALITY",
    patterns: [
      /\bbecause\b/i, /\btherefore\b/i, /\bas a result\b/i, /\bconsequently\b/i,
      /\bwhich is why\b/i, /\bso that\b/i, /\bin order to\b/i, /\bresulting in\b/i,
    ],
  },
  {
    code: "UNSUPPORTED_INTENT",
    patterns: [
      /\bdesigned to\b/i, /\bintended to\b/i, /\bsought to\b/i, /\bwanted to\b/i,
      /\bmeant to\b/i, /\bdeliberately\b/i, /\baims? to\b/i, /\bin pursuit of\b/i,
    ],
  },
  {
    code: "UNSUPPORTED_SIGNIFICANCE",
    patterns: [
      /\bsought[-\s]after\b/i, /\bcollectible\b/i, /\biconic\b/i, /\blegendary\b/i,
      /\bgrail\b/i, /\brare(st)?\b/i, /\bscarce\b/i, /\bprized\b/i, /\bcoveted\b/i,
      /\bmost important\b/i, /\bhighly regarded\b/i, /\bdesirable\b/i, /\binvestment\b/i,
    ],
  },
  {
    code: "UNSUPPORTED_CHRONOLOGY",
    patterns: [
      /\byears? (before|after|later|earlier)\b/i, /\bcenturies\b/i, /\brevived\b/i,
      /\bfirst use\b/i, /\bintroduced in \d{4}\b/i, /\bsince \d{4}\b/i, /\bpredates?\b/i,
    ],
  },
  {
    code: "UNSUPPORTED_ATTRIBUTION",
    patterns: [
      /\baccording to\b/i, /\bidentifies\b/i, /\breports? that\b/i, /\bstates? that\b/i,
      /\bdescribes? it as\b/i, /\bper [A-Z]/,
    ],
  },
];

/** A full manufacturer reference identifier, e.g. 5967BB/11/9W6. */
const REFERENCE_IDENTIFIER = /\b\d{3,5}[A-Z]{2}\/\d{2}\/\d[A-Z]\d\b/g;

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

/** Evidence refusals shared by every class that requires citation. */
function evidenceRefusals(evidence: ClaimEvidence[]): RefusalCode[] {
  const out: RefusalCode[] = [];
  if (evidence.length === 0) return ["MISSING_EVIDENCE"];
  for (const e of evidence) {
    if (!e.sourceClass || !e.sourceName || !e.sourceUrl || !e.sourceAccessed || !e.sourceExcerpt) {
      out.push("MISSING_EVIDENCE");
      continue;
    }
    const host = hostOf(e.sourceUrl);
    if (!host) out.push("MISSING_EVIDENCE");
    else if (PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      out.push("PLACEHOLDER_SOURCE");
    }
    if (PROSE_SOURCE_PATTERNS.some((p) => p.test(e.sourceName ?? ""))) out.push("PROSE_AS_SOURCE");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.sourceAccessed ?? "")) out.push("INVALID_DATE");
  }
  return out;
}

export type AdmissionContext = {
  /** The exact reference this corpus row is bound to, as text. */
  referenceText: string;
  /** Claim keys already ADMITTED for this reference — for DESIGN linkage. */
  admittedKeys?: readonly string[];
};

/**
 * The whole admission contract, per class. Returns the named refusals; an
 * empty array means the claim satisfies its class contract. Deterministic:
 * same inputs, same refusals, no model, no score, no randomness.
 */
export function claimRefusals(claim: ClaimInput, ctx: AdmissionContext): RefusalCode[] {
  const refusals = new Set<RefusalCode>();

  // Only a VERIFIED finding is a candidate for admission at all. UNRESOLVED
  // and UNSUPPORTED persist durably but are never automatically publishable.
  if (claim.outcome !== "VERIFIED") refusals.add("OUTCOME_NOT_VERIFIED");

  if (!claim.claimKey.trim() || !claim.subject.trim() || !claim.statement.trim()) {
    refusals.add("INVALID_VALUE");
  }

  // Source class must be one this claim class accepts.
  const accepted = ACCEPTED_SOURCE_CLASSES[claim.claimClass];
  for (const e of claim.evidence) {
    if (e.sourceClass && !accepted.includes(e.sourceClass)) {
      refusals.add("UNSUPPORTED_SOURCE_CLASS");
    }
  }
  for (const code of evidenceRefusals(claim.evidence)) refusals.add(code);

  // Exact-reference scope. A claim about this reference may not carry a
  // foreign reference identifier — that is how sibling facts leak in. Only
  // CONTEXTUAL_FACT may legitimately name an adjacent reference, because
  // documenting the relationship IS its job.
  const mentioned = new Set(
    (normalizeForComparison(claim.statement).match(REFERENCE_IDENTIFIER) ?? []).map((r) =>
      r.toUpperCase()
    )
  );
  mentioned.delete(normalizeForComparison(ctx.referenceText).toUpperCase());
  if (mentioned.size > 0 && claim.claimClass !== "CONTEXTUAL_FACT") {
    refusals.add("SIBLING_REFERENCE_CONTAMINATION");
  }

  if (claim.claimClass === "CONTEXTUAL_FACT") {
    // Stronger support: a primary authority alone is sufficient; anything
    // else must be corroborated by a second INDEPENDENT source host.
    const hasPrimary = claim.evidence.some(
      (e) => e.sourceClass && PRIMARY_CONTEXT_SOURCES.includes(e.sourceClass)
    );
    const hosts = new Set(claim.evidence.map((e) => hostOf(e.sourceUrl)).filter(Boolean));
    if (!hasPrimary && hosts.size < 2) refusals.add("INSUFFICIENT_CORROBORATION");
  }

  if (claim.claimClass === "DESIGN_DESCRIPTION") {
    // An observation must rest on admitted facts about this same reference.
    const supports = claim.supports ?? [];
    const admitted = new Set(ctx.admittedKeys ?? []);
    if (supports.length === 0 || !supports.every((k) => admitted.has(k))) {
      refusals.add("UNLINKED_OBSERVATION");
    }
    // …and must stay inside its class: describe, never explain, rank, date
    // or attribute.
    const text = normalizeForComparison(claim.statement);
    for (const guard of CLASS_GUARDS) {
      if (guard.patterns.some((p) => p.test(text))) refusals.add(guard.code);
    }
  }

  return [...refusals];
}

export function admissionFor(
  claim: ClaimInput,
  ctx: AdmissionContext
): { admission: AdmissionState; refusals: RefusalCode[] } {
  const refusals = claimRefusals(claim, ctx);
  if (refusals.length === 0) return { admission: "ADMITTED", refusals: [] };
  // A finding that is merely not-yet-resolved is held, not refused outright:
  // it stays durable, out of composition, and available to the human path.
  if (
    claim.outcome !== "VERIFIED" &&
    refusals.every((r) => r === "OUTCOME_NOT_VERIFIED")
  ) {
    return { admission: "PENDING_REVIEW", refusals };
  }
  return { admission: "REFUSED", refusals };
}

/**
 * Canonical serialization of an admitted claim set — the input to the
 * claim-set hash. Ordered by claim key, carrying only governed content, so
 * the hash is stable across rereads and changes only when the evidence
 * basis materially changes. Runtime noise (ids, timestamps, provenance)
 * is deliberately excluded.
 */
export function claimSetHashInput(
  claims: readonly Pick<
    ClaimInput,
    "claimKey" | "claimClass" | "statement" | "values" | "qualifier"
  >[]
): string {
  const rows = [...claims]
    .sort((a, b) => a.claimKey.localeCompare(b.claimKey))
    .map((c) =>
      JSON.stringify({
        k: c.claimKey,
        c: c.claimClass,
        s: c.statement,
        v: [...c.values].sort(),
        q: c.qualifier ?? null,
      })
    );
  return rows.join("\n");
}
