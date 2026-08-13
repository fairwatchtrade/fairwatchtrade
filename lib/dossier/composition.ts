/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — CLAIM-LINKED COMPOSITION CONTRACTS

   The pure layer of the composition pipeline: which claims may feed the
   composer, what shape the composer must return, how that shape is
   validated, and the named refusals for every way it can go wrong. No DB,
   no network, no model — shared by the pipeline, the replay regression and
   the tests so all three read ONE definition (the claimAdmission.ts
   arrangement).

   THE GOVERNING PIPELINE:
     retrieval-bound admitted claims → claim-linked composition packet
     → specialized prose composer → claim-scoped deterministic verification
     → independent semantic fidelity verification → VERIFIED DRAFT

   THE INPUT RULE. Automatic composition may consume ONLY claims that are
   exact-reference-bound, ADMITTED, RETRIEVAL_BOUND, and current. Legacy
   shape-only admitted claims, pending, refused, unresolved, unsupported,
   sibling and listing facts stay out — auditable, never composable.

   PER-PARAGRAPH LINKAGE IS LOAD-BEARING. The fidelity replay proved that
   article-global membership cannot catch conflation: a sibling identifier
   is legitimately admitted SOMEWHERE in the packet. Every generated
   paragraph therefore names the exact claims it is permitted to express,
   and verification runs against those claims — never the global set.
   Linkage is internal governance metadata and never renders to readers.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import type { ClaimClass } from "./claimAdmission.ts";

/** The slice of a persisted claim the composition layer needs. */
export type ComposableClaim = {
  claimKey: string;
  claimClass: ClaimClass;
  admission: string;
  evidenceBinding: string;
  subject: string;
  statement: string;
  values: string[];
  qualifier: string | null;
  supports: string[];
  moduleHint: string | null;
};

/** Governed identity context from the Vault chain — NOT claims, but governed
    truth the opening line and connective prose may name. */
export type CompositionIdentity = {
  brand: string;
  collection: string;
  model: string;
  reference: string;
};

/** Internal composition shape. `claimIds` never reaches a reader. */
export type LinkedParagraph = { text: string; claimIds: string[] };
export type LinkedSection = {
  moduleId: string;
  heading: string;
  paragraphs: LinkedParagraph[];
};

/** Reader-facing shape, identical to DossierSection. Linkage stripped. */
export type PublicSection = {
  moduleId: string;
  heading: string;
  paragraphs: string[];
};

export const COMPOSITION_REFUSAL_CODES = [
  "NO_COMPOSABLE_CLAIMS",
  "COMPOSER_OUTPUT_MALFORMED",
  "PARAGRAPH_WITHOUT_CLAIM_LINKAGE",
  "UNKNOWN_CLAIM_LINKED",
  "INELIGIBLE_CLAIM_LINKED",
  "STALE_CLAIM_BASIS",
  "COMPOSER_UNAVAILABLE",
  "VERIFIER_UNAVAILABLE",
] as const;
export type CompositionRefusalCode = (typeof COMPOSITION_REFUSAL_CODES)[number];

/* ── Eligibility ───────────────────────────────────────────────────────
   The whole input rule in one place. A DESIGN_DESCRIPTION additionally
   requires every claim it rests on to itself be composable: an observation
   may not enter prose leaning on evidence the composer never sees. */
export function composableClaims(
  claims: readonly ComposableClaim[]
): ComposableClaim[] {
  const base = claims.filter(
    (c) => c.admission === "ADMITTED" && c.evidenceBinding === "RETRIEVAL_BOUND"
  );
  const keys = new Set(base.map((c) => c.claimKey));
  return base.filter(
    (c) =>
      c.claimClass !== "DESIGN_DESCRIPTION" ||
      (c.supports.length > 0 && c.supports.every((k) => keys.has(k)))
  );
}

/* ── Claim-set basis freshness ─────────────────────────────────────────
   The draft must be verified against the same governed claim basis it was
   composed from. No "probably still current". */
export function staleBasisRefusal(
  frozenHash: string | null,
  currentHash: string | null
): CompositionRefusalCode | null {
  if (!frozenHash || !currentHash || frozenHash !== currentHash) {
    return "STALE_CLAIM_BASIS";
  }
  return null;
}

/* ── Composer output validation ────────────────────────────────────────
   The composer's answer is structurally refused unless every paragraph
   carries explicit linkage to claims that were actually in its packet. */
export type ParsedComposition = {
  openingIdentity: string;
  sections: LinkedSection[];
};

export type CompositionStructureRefusal = {
  code: CompositionRefusalCode;
  detail: string;
};

export function parseComposerOutput(
  raw: string,
  eligibleKeys: readonly string[]
): { composition: ParsedComposition | null; refusals: CompositionStructureRefusal[] } {
  const refusals: CompositionStructureRefusal[] = [];
  const eligible = new Set(eligibleKeys);

  let parsed: unknown;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON object in output");
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    return {
      composition: null,
      refusals: [
        {
          code: "COMPOSER_OUTPUT_MALFORMED",
          detail: e instanceof Error ? e.message : String(e),
        },
      ],
    };
  }

  const obj = parsed as { openingIdentity?: unknown; sections?: unknown };
  if (typeof obj.openingIdentity !== "string" || !obj.openingIdentity.trim()) {
    refusals.push({
      code: "COMPOSER_OUTPUT_MALFORMED",
      detail: "openingIdentity missing or empty",
    });
  }
  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    refusals.push({
      code: "COMPOSER_OUTPUT_MALFORMED",
      detail: "sections missing or empty",
    });
    return { composition: null, refusals };
  }

  const sections: LinkedSection[] = [];
  for (const [si, entry] of (obj.sections as unknown[]).entries()) {
    const s = entry as {
      moduleId?: unknown;
      heading?: unknown;
      paragraphs?: unknown;
    };
    if (
      typeof s.moduleId !== "string" ||
      !s.moduleId.trim() ||
      typeof s.heading !== "string" ||
      !s.heading.trim() ||
      !Array.isArray(s.paragraphs) ||
      s.paragraphs.length === 0
    ) {
      refusals.push({
        code: "COMPOSER_OUTPUT_MALFORMED",
        detail: `section ${si} is not { moduleId, heading, paragraphs[] }`,
      });
      continue;
    }
    const paragraphs: LinkedParagraph[] = [];
    for (const [pi, p] of (s.paragraphs as unknown[]).entries()) {
      const par = p as { text?: unknown; claimIds?: unknown };
      if (typeof par.text !== "string" || !par.text.trim()) {
        refusals.push({
          code: "COMPOSER_OUTPUT_MALFORMED",
          detail: `section ${s.moduleId} paragraph ${pi} has no text`,
        });
        continue;
      }
      if (!Array.isArray(par.claimIds) || par.claimIds.length === 0) {
        refusals.push({
          code: "PARAGRAPH_WITHOUT_CLAIM_LINKAGE",
          detail: `section ${s.moduleId} paragraph ${pi} names no claims`,
        });
        continue;
      }
      const ids = par.claimIds.filter((c): c is string => typeof c === "string");
      for (const id of ids) {
        if (!eligible.has(id)) {
          refusals.push({
            code: "UNKNOWN_CLAIM_LINKED",
            detail: `section ${s.moduleId} paragraph ${pi} links "${id}", which is not in the governed packet`,
          });
        }
      }
      paragraphs.push({ text: par.text.trim(), claimIds: ids });
    }
    if (paragraphs.length > 0) {
      sections.push({ moduleId: s.moduleId, heading: s.heading.trim(), paragraphs });
    }
  }

  if (refusals.length > 0) return { composition: null, refusals };
  return {
    composition: {
      openingIdentity: (obj.openingIdentity as string).trim(),
      sections,
    },
    refusals: [],
  };
}

/** Strip governance metadata for the reader-facing article shape. */
export function toPublicSections(sections: readonly LinkedSection[]): PublicSection[] {
  return sections.map((s) => ({
    moduleId: s.moduleId,
    heading: s.heading,
    paragraphs: s.paragraphs.map((p) => p.text),
  }));
}

/* ── Semantic refusal vocabulary ───────────────────────────────────────
   Named classes only. No score, no "mostly okay". The vocabulary keeps the
   replay's established codes and adds the rarity/reception/market classes
   the build order names. */
export const SEMANTIC_REFUSAL_CODES = [
  "FACTUAL_ADDITION",
  "ALTERED_VALUE",
  "ATTRIBUTION_DRIFT",
  "INVENTED_CAUSALITY",
  "UNSUPPORTED_INTENT",
  "UNSUPPORTED_SIGNIFICANCE",
  "UNSUPPORTED_RARITY",
  "UNSUPPORTED_RECEPTION",
  "UNSUPPORTED_MARKET_SIGNIFICANCE",
  "CHRONOLOGY_DRIFT",
  "REFERENCE_CONFLATION",
  "OMITTED_QUALIFIER",
] as const;
export type SemanticRefusalCode = (typeof SEMANTIC_REFUSAL_CODES)[number];

export type SemanticRefusal = {
  code: SemanticRefusalCode;
  moduleId: string;
  paragraphIndex: number;
  quote: string;
  why: string;
};

export function parseVerifierOutput(raw: string): {
  refusals: SemanticRefusal[] | null;
  error: string | null;
} {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON object in output");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { refusals?: unknown };
    if (!Array.isArray(parsed.refusals)) throw new Error("refusals array missing");
    const codes = new Set<string>(SEMANTIC_REFUSAL_CODES);
    const refusals: SemanticRefusal[] = [];
    for (const r of parsed.refusals as unknown[]) {
      const o = r as Record<string, unknown>;
      if (typeof o.code !== "string" || !codes.has(o.code)) {
        throw new Error(`refusal code outside the vocabulary: ${String(o.code)}`);
      }
      refusals.push({
        code: o.code as SemanticRefusalCode,
        moduleId: typeof o.moduleId === "string" ? o.moduleId : "",
        paragraphIndex:
          typeof o.paragraphIndex === "number" ? o.paragraphIndex : -1,
        quote: typeof o.quote === "string" ? o.quote : "",
        why: typeof o.why === "string" ? o.why : "",
      });
    }
    return { refusals, error: null };
  } catch (e) {
    return { refusals: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── Prompts ───────────────────────────────────────────────────────────
   The composer is a specialized prose job: it improves the writing, never
   the facts. The verifier sees claims + finished prose, never the
   composer's reasoning — independence lives in the packet contract. */

export function composerSystemPrompt(): string {
  return `You are the writer of a reference-level article about one exact wristwatch reference, published by a curated marketplace for experienced collectors.

You receive GOVERNED IDENTITY (brand, collection, model, reference) and GOVERNED CLAIMS. These are the only facts you may use.

Your job: write the most engaging, natural, collector-literate article you can from the supplied governed material. Research, evidence and admission were done elsewhere and are not your concern — the writing is.

You may, and should:
- reorganize and synthesize the claims into a real narrative, not a list;
- compare and connect admitted facts with each other — let one claim illuminate another;
- vary tone, rhythm and sentence structure the way a good magazine feature does;
- use vivid, evocative, NON-FACTUAL descriptive language: metaphor, visual characterization, texture — language that paints what the admitted elements look and feel like without asserting any new verifiable fact;
- explain admitted design observations with real craft;
- write with warmth and specificity, as if you have the watch in front of you.

The factual walls — these are absolute:
- no new factual claims of any kind: no number, date, measurement, material, identifier or specification beyond the claims;
- no causality or manufacturer/designer intent unless a claim states it;
- no new chronology or temporal relations between events;
- no new attribution — never put a statement in a named source's mouth;
- no rarity, scarcity, market, demand, investment or collector-reception claims;
- no identity beyond the supplied material — never import sibling references or other models;
- never convert a model-specification claim into a statement about an individual watch's present condition;
- never mention evidence, claims, sources, verification, research, AI, or this process in the article text.

Vivid but non-factual is the line: "the grey dial keeps the temperature of the whole composition low" is writing; "the grey dial was a limited option" is a factual claim you may not invent.

Known temptations — refuse them yourself:
- temporal-span words unless a claim carries them: "decades", "centuries", "since <year>", "revived", "pioneered", "first use", "always been";
- what a line, model or detail "is known for", "is recognisable as", "has become", or what "standard" it represents;
- what the object was "conceived as", "built to be", or "meant for" — that is intent;
- rarity and reception words: "iconic", "sought-after", "rare", "collectible", "prized".
A history claim gives you its stated fact, not a licence to narrate the span between its date and today.

Where a claim carries a "qualifier", include the qualifier's wording essentially verbatim — light grammatical fitting only, never a loose paraphrase — inside a paragraph that uses the claim. The qualifier text was written to be reader-usable; carry it.

Reserve causal connectives — "because", "so that", "therefore", "in order to", "resulting in" — for causation a claim itself states. The gate on these words is mechanical: it refuses the word itself, even in soft uses like "because that is where the eye lands". Vivid description does not need them — recast the sentence.

Structure: fewer, fuller sections over many thin ones; a section should earn its heading. Let the article read as one considered piece with a beginning, a middle and an end — not a list of rooms. A short article from few claims is fine, but make every sentence in it worth reading.

Every paragraph must name, in "claimIds", the exact claim keys that permit it to exist. The opening identity line uses only the governed identity and needs no claimIds.

Answer with JSON only:
{"openingIdentity":"...","sections":[{"moduleId":"UPPER_SNAKE","heading":"...","paragraphs":[{"text":"...","claimIds":["..."]}]}]}`;
}

export function composerUserPrompt(
  identity: CompositionIdentity,
  claims: readonly ComposableClaim[]
): string {
  return (
    "GOVERNED IDENTITY:\n" +
    JSON.stringify(identity, null, 1) +
    "\n\nGOVERNED CLAIMS:\n" +
    JSON.stringify(
      claims.map((c) => ({
        claimKey: c.claimKey,
        claimClass: c.claimClass,
        statement: c.statement,
        ...(c.qualifier ? { qualifier: c.qualifier } : {}),
        ...(c.moduleHint ? { moduleHint: c.moduleHint } : {}),
      })),
      null,
      1
    )
  );
}

export function verifierSystemPrompt(): string {
  return `You are a fidelity verifier for a watch reference article.

You receive an article as sections of paragraphs. Each paragraph names its LINKED CLAIMS — the only claims that paragraph is permitted to express. You never receive, and never ask for, the reasoning of whoever wrote the prose.

Your only jurisdiction: does each paragraph say only what its linked claims permit it to say?

Rules:
- Judge each paragraph against ITS OWN linked claims, not the article's claims as a whole. A fact supported elsewhere in the article but not by this paragraph's linked claims is drift in this paragraph.
- Rewording, reordering and connective language are NOT drift.
- Vivid, evocative, NON-FACTUAL descriptive language is NOT drift: metaphor, visual characterization and texture applied to admitted elements assert no verifiable fact and require no claim support. Only assertions with factual content need a claim behind them.
- Any fact, number, date, identifier, attribution, causal relation, temporal relation, rarity, collector-reception or market-importance assertion not supported by the paragraph's linked claims IS drift — however beautifully it is phrased.
- A linked claim carrying a "qualifier" requires that qualifier's meaning to survive in a paragraph using the claim. Dropping it is drift.
- The governed identity (brand, collection, model, reference) may be named anywhere without linkage.
- Do not score. Do not express confidence. Do not judge writing quality. Report only named refusals.

Answer with JSON only:
{"refusals":[{"code":"<one of ${SEMANTIC_REFUSAL_CODES.join("|")}>","moduleId":"<section moduleId>","paragraphIndex":<0-based>,"quote":"<exact phrase from the prose>","why":"<one sentence>"}]}
An empty refusals array means every paragraph stays inside its linked claims.`;
}

export function verifierUserPrompt(
  identity: CompositionIdentity,
  openingIdentity: string,
  sections: readonly LinkedSection[],
  claims: readonly ComposableClaim[]
): string {
  const byKey = new Map(claims.map((c) => [c.claimKey, c]));
  const payload = sections.map((s) => ({
    moduleId: s.moduleId,
    heading: s.heading,
    paragraphs: s.paragraphs.map((p, i) => ({
      paragraphIndex: i,
      text: p.text,
      linkedClaims: p.claimIds.map((id) => {
        const c = byKey.get(id);
        return c
          ? {
              claimKey: c.claimKey,
              claimClass: c.claimClass,
              statement: c.statement,
              ...(c.qualifier ? { qualifier: c.qualifier } : {}),
            }
          : { claimKey: id, missing: true };
      }),
    })),
  }));
  return (
    "GOVERNED IDENTITY:\n" +
    JSON.stringify(identity, null, 1) +
    "\n\nOPENING IDENTITY LINE (identity-only, no linkage required):\n" +
    openingIdentity +
    "\n\nARTICLE WITH PER-PARAGRAPH LINKED CLAIMS:\n" +
    JSON.stringify(payload, null, 1)
  );
}
