/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — CLAIM-SCOPED DETERMINISTIC FIDELITY VERIFICATION

   Runs BEFORE semantic verification spends a model call. Everything here is
   mechanically provable — set membership, numeric equality, pattern
   presence — no model, no score, no randomness. Same inputs, same refusals.

   THE SCOPE RULE, proven by the fidelity replay: checks run per paragraph
   against that paragraph's LINKED claims, never against the article-global
   claim set. A sibling reference value is legitimately admitted somewhere
   in the packet; only linkage scope can catch it appearing in the wrong
   paragraph.

   NORMALIZATION folds presentation noise only (quotes, dashes, no-break
   spaces, unit spellings, 42 vs 42.00, thousands separators). Factual
   distinctions are never folded: 42 mm stays distinct from 44 mm, mm from
   m, one reference suffix from another, "circa" from "in".

   LANGUAGE GUARDS. Causality, intent, significance, rarity and chronology
   language in a paragraph is drift UNLESS a linked claim's own statement or
   qualifier carries that language — connective prose may not create factual
   meaning. Subtler phrasings remain the semantic verifier's jurisdiction;
   these patterns are the mechanical floor, not the whole defence.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { normalizeForComparison } from "./claimAdmission.ts";
import type {
  ComposableClaim,
  CompositionIdentity,
  LinkedSection,
} from "./composition.ts";

export const DETERMINISTIC_REFUSAL_CODES = [
  "ALTERED_OR_ADDED_VALUE",
  "REFERENCE_CONFLATION",
  "ATTRIBUTION_DRIFT",
  "OMITTED_QUALIFIER",
  "UNSUPPORTED_CAUSALITY_LANGUAGE",
  "UNSUPPORTED_INTENT_LANGUAGE",
  "UNSUPPORTED_SIGNIFICANCE_LANGUAGE",
  "UNSUPPORTED_CHRONOLOGY_LANGUAGE",
  "UNKNOWN_CLAIM_LINKED",
] as const;
export type DeterministicRefusalCode =
  (typeof DETERMINISTIC_REFUSAL_CODES)[number];

export type DeterministicRefusal = {
  code: DeterministicRefusalCode;
  moduleId: string;
  paragraphIndex: number;
  detail: string;
};

/* ── Unit-aware normalization — comparison only ─────────────────────────
   Folds unit SPELLINGS that denote the same unit; never folds one unit
   into another. "70 hrs" and "70 hours" are one fact; "42 mm" and "42 m"
   are two. Word-boundary guards keep "mm" out of the metre folding. */
function canonicalizeUnits(text: string): string {
  return text
    .replace(/\bhrs?\b|\bhours?\b/gi, "h")
    .replace(/\bmetres?\b|\bmeters?\b/gi, "m")
    .replace(/\bvibrations\s+per\s+hour\b|\bvph\b|\bA\/h\b/gi, "vph");
}

function norm(text: string): string {
  return canonicalizeUnits(normalizeForComparison(text)).toLowerCase();
}

/* ── Mechanical token extraction ───────────────────────────────────────
   Every mechanically comparable assertion in a body of prose. Patterns
   cover both manufacturer identifier grammars seen in the corpus:
   Breguet-style 5967BB/11/9W6 and Breitling-style UB0134101B1U1. */
type MechanicalToken = { kind: string; value: string };

const UNIT_MEASURE =
  /\b\d+(?:[.,]\d+)?\s?(?:mm|m|bar|hz|h|jewels?|lignes|vph|atm)\b/gi;
const LIGNE_FRACTION = /\b\d+[¼½¾]\s?lignes\b/gi;
const YEAR = /\b(?:1[6-9]\d{2}|20\d{2})\b/g;
const REFERENCE_SLASHED = /\b\d{3,5}[A-Z]{2}\/\d{2}\/\d[A-Z]\d\b/gi;
const REFERENCE_COMPACT = /\b[A-Z]{1,3}\d{6,}[A-Z0-9]{0,6}\b/g;
const CALIBRE_DOTTED = /\b\d{2,4}\.\d\b/g;
const THOUSANDS_NUMBER = /\b\d{1,3}(?:,\d{3})+\b/g;
const KARAT = /\b\d{1,2}k\b/gi;
const ROMAN_SPAN = /\b[ivx]+-[ivx]+\b/gi;
const COUNT_POSITIONS = /\b(?:three|four|five|six|seven|eight)\s+positions\b/gi;

/** Attribution names checked by presence. Presence in prose without
    presence in a linked claim is drift. */
const ATTRIBUTION_NAMES = [
  "sotheby's",
  "christie's",
  "phillips",
  "bonhams",
  "antiquorum",
  "my-watchsite",
  "frederic piguet",
  "frédéric piguet",
  "cosc",
];

function mechanicalTokens(text: string): MechanicalToken[] {
  const t = norm(text);
  const out: MechanicalToken[] = [];
  const push = (kind: string, value: string) => out.push({ kind, value });

  for (const m of t.matchAll(UNIT_MEASURE)) push("measurement", m[0]);
  for (const m of t.matchAll(LIGNE_FRACTION)) push("measurement", m[0]);
  for (const m of t.matchAll(YEAR)) push("year", m[0]);
  for (const m of t.matchAll(REFERENCE_SLASHED)) push("reference", m[0]);
  for (const m of norm(text.toUpperCase()).toUpperCase().matchAll(REFERENCE_COMPACT)) {
    push("reference", m[0].toLowerCase());
  }
  for (const m of t.matchAll(CALIBRE_DOTTED)) push("calibre", m[0]);
  for (const m of t.matchAll(THOUSANDS_NUMBER)) push("number", m[0]);
  for (const m of t.matchAll(KARAT)) push("karat", m[0]);
  for (const m of t.matchAll(ROMAN_SPAN)) push("roman_span", m[0]);
  for (const m of t.matchAll(COUNT_POSITIONS)) push("measurement", m[0]);
  for (const name of ATTRIBUTION_NAMES) {
    if (t.includes(name)) push("attribution", name);
  }
  return out;
}

/* ── Token support ─────────────────────────────────────────────────────
   A token is supported when the linked claims' own material carries it:
   exact normalized inclusion first, then numeric equivalence under a
   COMPATIBLE unit (42 mm ↔ 42.00 mm; never 42 mm ↔ 42 m), then bare-number
   equivalence only when a claim VALUE is itself the bare number
   (28,800 ↔ 28800). */
function numericOf(s: string): { num: number; unit: string } | null {
  const m = s.match(/^([\d][\d,.\s¼½¾]*?)\s*([a-z/]*)$/i);
  if (!m) return null;
  const frac = m[1].includes("¼") ? 0.25 : m[1].includes("½") ? 0.5 : m[1].includes("¾") ? 0.75 : 0;
  const num = Number(m[1].replace(/[,\s¼½¾]/g, "")) + frac;
  if (!Number.isFinite(num)) return null;
  return { num, unit: m[2].toLowerCase() };
}

function tokenSupported(token: MechanicalToken, haystack: string, claimValues: string[]): boolean {
  const v = norm(token.value);
  if (v.length === 0) return true;
  if (haystack.includes(v)) return true;
  if (haystack.includes(v.replace(/\s/g, ""))) return true;

  const tn = numericOf(v);
  if (!tn) return false;

  // Same number under the same canonical unit, anywhere in linked material.
  if (tn.unit) {
    const pattern = new RegExp(
      `([\\d][\\d,.]*)\\s*${tn.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "g"
    );
    for (const hit of haystack.matchAll(pattern)) {
      if (Number(hit[1].replace(/,/g, "")) === tn.num) return true;
    }
    // A claim value that is exactly the bare number also supports a
    // unit-annotated prose rendering of it ("28,800 vph" ← value "28,800").
    return claimValues.some((cv) => {
      const cn = numericOf(norm(cv));
      return cn !== null && cn.unit === "" && cn.num === tn.num;
    });
  }
  // Bare-number token (years, thousands): numeric equality against values.
  return claimValues.some((cv) => {
    const cn = numericOf(norm(cv));
    return cn !== null && cn.num === tn.num;
  });
}

/* ── Language guards ───────────────────────────────────────────────────
   Prose may carry this language only when a linked claim's statement or
   qualifier carries it — the composer's connectives may not create causal,
   intent, significance or chronology meaning of their own. */
const LANGUAGE_GUARDS: { code: DeterministicRefusalCode; patterns: RegExp[] }[] = [
  {
    code: "UNSUPPORTED_CAUSALITY_LANGUAGE",
    patterns: [
      /\bbecause\b/i, /\btherefore\b/i, /\bas a result\b/i, /\bconsequently\b/i,
      /\bwhich is why\b/i, /\bso that\b/i, /\bin order to\b/i, /\bresulting in\b/i,
      /\bthanks to\b/i, /\bowing to\b/i,
    ],
  },
  {
    code: "UNSUPPORTED_INTENT_LANGUAGE",
    patterns: [
      /\bdesigned to\b/i, /\bintended to\b/i, /\bsought to\b/i, /\bwanted\b/i,
      /\bmeant to\b/i, /\bdeliberately\b/i, /\baims? to\b/i, /\bchose to\b/i,
    ],
  },
  {
    code: "UNSUPPORTED_SIGNIFICANCE_LANGUAGE",
    patterns: [
      /\bsought[-\s]after\b/i, /\bcollectible\b/i, /\biconic\b/i, /\blegendary\b/i,
      /\bgrail\b/i, /\brare(st|ly)?\b/i, /\bscarce\b/i, /\bprized\b/i, /\bcoveted\b/i,
      /\bmost important\b/i, /\bhighly regarded\b/i, /\bdesirable\b/i,
      /\binvestment\b/i, /\bsignificant\b/i, /\bcelebrated\b/i, /\brenowned\b/i,
    ],
  },
  {
    code: "UNSUPPORTED_CHRONOLOGY_LANGUAGE",
    patterns: [
      /\byears? (?:before|after|later|earlier)\b/i, /\bcenturies\b/i, /\brevived\b/i,
      /\bfirst use\b/i, /\bintroduced in \d{4}\b/i, /\bsince \d{4}\b/i,
      /\bpredates?\b/i, /\bdecades\b/i, /\bpioneered\b/i,
    ],
  },
];

/* ── The verifier ──────────────────────────────────────────────────────── */
export function deterministicFidelityCheck(
  sections: readonly LinkedSection[],
  claims: readonly ComposableClaim[],
  identity: CompositionIdentity,
  openingIdentity?: string
): DeterministicRefusal[] {
  const byKey = new Map(claims.map((c) => [c.claimKey, c]));
  const refusals: DeterministicRefusal[] = [];

  /* Governed identity is expressible everywhere: the full reference, its
     bare stem, and the brand/collection/model names. */
  const identityText = norm(
    `${identity.brand} ${identity.collection} ${identity.model} ${identity.reference}`
  );
  const referenceNorm = norm(identity.reference);

  const check = (
    moduleId: string,
    paragraphIndex: number,
    text: string,
    claimIds: readonly string[]
  ) => {
    const linked = claimIds.map((id) => byKey.get(id)).filter(Boolean) as ComposableClaim[];
    for (const id of claimIds) {
      if (!byKey.has(id)) {
        refusals.push({
          code: "UNKNOWN_CLAIM_LINKED",
          moduleId,
          paragraphIndex,
          detail: `paragraph links "${id}", which is not a governed claim in the packet`,
        });
      }
    }

    const linkedMaterial = norm(
      linked
        .map((c) => `${c.statement} ${(c.values ?? []).join(" ")} ${c.qualifier ?? ""}`)
        .join(" ")
    );
    const linkedValues = linked.flatMap((c) => c.values ?? []);
    const seen = new Set<string>();

    for (const tok of mechanicalTokens(text)) {
      const key = `${tok.kind}:${tok.value}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Identity allowance: the exact reference, its substrings (bare model
      // stems), and identity names never need linkage.
      const v = norm(tok.value);
      if (identityText.includes(v) || referenceNorm.includes(v)) continue;

      if (tokenSupported(tok, linkedMaterial, linkedValues)) continue;

      const isForeignReference =
        tok.kind === "reference" && v !== referenceNorm;
      refusals.push({
        code:
          tok.kind === "attribution"
            ? "ATTRIBUTION_DRIFT"
            : isForeignReference
              ? "REFERENCE_CONFLATION"
              : "ALTERED_OR_ADDED_VALUE",
        moduleId,
        paragraphIndex,
        detail: `${tok.kind} "${tok.value}" appears in the paragraph but is not carried by its linked claims`,
      });
    }

    // Language guards: meaning-bearing connective language must come from a
    // linked claim, never from the composer.
    for (const guard of LANGUAGE_GUARDS) {
      for (const pattern of guard.patterns) {
        if (pattern.test(text) && !pattern.test(linkedMaterial)) {
          refusals.push({
            code: guard.code,
            moduleId,
            paragraphIndex,
            detail: `pattern ${pattern} appears in the paragraph but in none of its linked claims`,
          });
        }
      }
    }
  };

  for (const s of sections) {
    s.paragraphs.forEach((p, i) => check(s.moduleId, i, p.text, p.claimIds));
  }

  /* The opening line is identity-only: any mechanical token beyond the
     governed identity is drift. */
  if (openingIdentity) {
    for (const tok of mechanicalTokens(openingIdentity)) {
      const v = norm(tok.value);
      if (identityText.includes(v) || referenceNorm.includes(v)) continue;
      refusals.push({
        code: "ALTERED_OR_ADDED_VALUE",
        moduleId: "OPENING_IDENTITY",
        paragraphIndex: 0,
        detail: `opening line carries ${tok.kind} "${tok.value}" beyond the governed identity`,
      });
    }
  }

  /* Drift by omission: every linked claim carrying a qualifier must have
     that qualifier's anchor survive in at least one paragraph that links
     the claim. */
  const qualifierCarried = new Map<string, boolean>();
  for (const s of sections) {
    for (const p of s.paragraphs) {
      const body = norm(p.text);
      for (const id of p.claimIds) {
        const c = byKey.get(id);
        if (!c?.qualifier) continue;
        const anchor = norm(c.qualifier).split(/[,;]/)[0].slice(0, 34);
        const prior = qualifierCarried.get(id) ?? false;
        qualifierCarried.set(id, prior || body.includes(anchor));
      }
    }
  }
  for (const [id, carried] of qualifierCarried) {
    if (!carried) {
      const c = byKey.get(id);
      refusals.push({
        code: "OMITTED_QUALIFIER",
        moduleId: "ARTICLE",
        paragraphIndex: -1,
        detail: `${id} requires the qualifier "${c?.qualifier}" and no paragraph linking it carries the qualifier`,
      });
    }
  }

  return refusals;
}
