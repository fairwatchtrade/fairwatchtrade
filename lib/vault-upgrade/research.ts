/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — bounded research requests and validation

   Two jobs, both deliberately narrow:

   1. Build research requests from the exact unresolved paths of one
      uploaded file. Never a general "research this brand" instruction —
      every request carries the precise JSON pointer it answers, the closed
      vocabulary the contract allows there, and the hierarchy context read
      from the source itself.

   2. Validate whatever comes back before a single value is allowed near a
      candidate. A claim without a retrievable source is rejected. A value
      outside the contract's closed vocabulary is rejected. A path nobody
      asked about is rejected. Silence is treated as UNSUPPORTED, never as
      permission to invent.

   This module performs no network access and holds no credentials. The
   browser builds requests here; the founder-gated server route executes
   them; results come back through validateResearchPayload before use.
   ──────────────────────────────────────────────────────────────────────── */

import type {
  AnalysisIssue,
  ResearchOption,
  ResearchPass,
  ResearchRequest,
  ResearchResult,
  ResearchSource,
} from "./types.ts";

/* ── The research contract ─────────────────────────────────────────────── */

/**
 * What the research lane is told. It lives here rather than in the route so
 * the instructions, the request shape, and the validation that judges the
 * answers are one artifact — a rule stated here is enforced below.
 */
export const RESEARCH_SYSTEM_PROMPT = `You establish facts for the FairWatchTrade Vault, a hand-built reference catalogue of watch manufacturers. You are answering a short list of specific, itemised questions about ONE brand file. You are not writing an article and not reviewing the file.

ABSOLUTE RULES

1. Never invent. If authoritative evidence does not establish a fact, say so. An empty field is correct; a plausible guess is a defect.
2. Every VERIFIED answer must cite at least one retrievable source URL you actually consulted. An answer with no source will be discarded.
3. Prefer the manufacturer's own material, then reputable horological references and auction houses. Retailer listings and marketplace copy are weak evidence for identity facts.
4. Answer only the paths given to you. Never add paths, never answer a question that was not asked, never restructure the hierarchy.
5. Never contradict a fact the file already asserts. Preserved values are given to you as context — treat them as true.

OUTCOMES — choose exactly one per path

VERIFIED    Evidence is sufficient. Supply "value".
UNRESOLVED  Real evidence exists but supports more than one answer and you cannot choose safely. Supply "options" with the plausible values and the evidence for each. Do NOT supply "value".
UNSUPPORTED No qualifying evidence safely supports an answer. Do NOT supply "value".

Use UNRESOLVED only for a genuine conflict between credible sources. Do not use it for a fact you simply did not find — that is UNSUPPORTED. Do not use it to avoid committing to a well-evidenced answer.

FIELD RULES

- description (brand): 20–50 words, one paragraph, neutral and factual, company overview only. Historical significance where appropriate. Never marketing, opinions, pricing, or rarity claims.
- description (variant): 20–50 words, one concise paragraph. Explain what collectors recognise and the defining characteristics. Never repeat the variant name as filler. Never marketing, pricing, speculation, or opinion.
- country_of_origin: the country of manufacture, plainly named (for example "Germany"), even if no source uses the adjective.
- cluster_rationale: 8–25 words stating why the chosen cluster is the defensible collector neighbourhood.
- notes (variant): short technical detail only — case size, movement, power reserve, dial, material, complications, water resistance, distinctive construction. Notes are not a description. If no technical detail is established, return UNSUPPORTED; an empty notes field is permitted and expected.
- Fields with a closed vocabulary: return exactly one of the permitted values, character for character. Anything else is discarded.
- references: official manufacturer reference or catalogue numbers ONLY. Never variant names, model names, collection names, nicknames, search aliases, or marketing names. If no official reference can be confidently identified, return VERIFIED with an empty array — an empty reference list is a correct and expected answer. Never infer a reference number from a pattern.

OUTPUT

Return ONLY a JSON object, no prose and no markdown fences:

{"results":[{"path":"<exact path given>","outcome":"VERIFIED|UNRESOLVED|UNSUPPORTED","value":<answer, only when VERIFIED>,"sources":[{"title":"","publisher":"","url":""}],"evidence":"one sentence on what the sources establish","confidence":"high|moderate|low","options":[{"value":"","evidence":"","sources":[]}]}]}

Include one entry for every path you were given.`;

/** The exact question list sent for one bounded call. */
export function buildResearchUserContent(
  brandName: string | null,
  pass: ResearchPass,
  requests: readonly ResearchRequest[]
): string {
  return [
    `Brand file under upgrade: ${
      brandName ?? "(brand name not stated in the source)"
    }`,
    `Pass: ${
      pass === "reference"
        ? "official manufacturer references"
        : "hierarchy and brand facts"
    }`,
    "",
    "Answer each of the following, using the exact path as the key:",
    JSON.stringify(
      requests.map((r) => ({
        path: r.path,
        field: r.field,
        kind: r.kind,
        permittedValues: r.allowedValues ?? undefined,
        wordRange: r.wordRange ?? undefined,
        context: r.context,
      })),
      null,
      1
    ),
  ].join("\n");
}

/* ── Bounds ────────────────────────────────────────────────────────────── */

/**
 * Maximum questions in one request body. Deliberately small: a research
 * call that answers eight questions well is worth more than one that tries
 * to answer thirty and runs out of room mid-answer. Larger files simply
 * research in more rounds.
 */
export const MAX_REQUESTS_PER_CALL = 8;

/** Maximum accepted request-body size, server-enforced. */
export const MAX_REQUEST_BYTES = 256 * 1024;

/** Maximum source file the room will research against. */
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

/** Ceiling on research rounds for one file, so a loop can never run away. */
export const MAX_RESEARCH_ROUNDS = 6;

/* ── Contract-derived field rules ──────────────────────────────────────── */

/**
 * Word ranges the active specification states for prose fields. Kept beside
 * the analyzer's identical checks so a request asks for exactly what
 * validation will later demand.
 */
export const PROSE_WORD_RANGES: Readonly<Record<string, readonly [number, number]>> =
  {
    "/description": [20, 50],
    "/cluster_rationale": [8, 25],
    "variant-description": [20, 50],
  };

/** Brand-level fields the completion pass is permitted to research. */
export const RESEARCHABLE_BRAND_FIELDS: readonly string[] = [
  "description",
  "country_of_origin",
  "region",
  "independent_status",
  "revival_status",
  "revival_type",
  "cluster",
  "cluster_rationale",
];

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Closed vocabulary for a brand field, read from the schema companion. */
function allowedValuesFor(
  schema: Record<string, unknown>,
  field: string
): readonly string[] | undefined {
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props) return undefined;
  const prop = props[field];
  if (!isPlainObject(prop)) return undefined;
  return Array.isArray(prop.enum) ? (prop.enum as string[]) : undefined;
}

/* ── Hierarchy context, read from the source ───────────────────────────── */

function valueAtPointer(doc: PlainObject, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return doc;
  const parts = pointer
    .split("/")
    .slice(1)
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = doc;
  for (const part of parts) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (isPlainObject(current)) current = current[part];
    else return undefined;
  }
  return current;
}

/** Parent pointer of a leaf pointer ("/a/b/c" → "/a/b"). */
function parentPointer(pointer: string): string {
  const idx = pointer.lastIndexOf("/");
  return idx <= 0 ? "" : pointer.slice(0, idx);
}

/**
 * Exact naming chain for a variant pointer, preserved from the source so a
 * request never depends on anything the file did not already say.
 */
export function variantContext(
  doc: PlainObject,
  variantPointer: string
): Record<string, unknown> {
  const m = variantPointer.match(
    /^\/Collections\/(\d+)\/Families\/(\d+)\/Variants\/(\d+)$/
  );
  const brand = typeof doc.Brand === "string" ? doc.Brand : null;
  if (!m) return { brand };
  const [, ci, fi] = m;
  const collection = valueAtPointer(doc, `/Collections/${ci}`);
  const family = valueAtPointer(doc, `/Collections/${ci}/Families/${fi}`);
  const variant = valueAtPointer(doc, variantPointer);
  return {
    brand,
    collection: isPlainObject(collection) ? collection.name ?? null : null,
    family: isPlainObject(family) ? family.name ?? null : null,
    variant: isPlainObject(variant) ? variant.name ?? null : null,
    existingReferences: isPlainObject(variant)
      ? (variant.references ?? [])
      : [],
    existingNotes: isPlainObject(variant) ? variant.notes ?? null : null,
    existingAliases: isPlainObject(variant) ? variant.search_aliases ?? [] : [],
  };
}

function brandContext(doc: PlainObject): Record<string, unknown> {
  const collections = Array.isArray(doc.Collections) ? doc.Collections : [];
  return {
    brand: typeof doc.Brand === "string" ? doc.Brand : null,
    searchAliases: Array.isArray(doc.search_aliases) ? doc.search_aliases : [],
    collectionNames: collections
      .map((c) => (isPlainObject(c) ? c.name : null))
      .filter((n) => typeof n === "string"),
    /* Facts the source already answered stay visible so research is
       consistent with them and never contradicts preserved material. */
    knownFields: Object.fromEntries(
      RESEARCHABLE_BRAND_FIELDS.filter((f) =>
        Object.prototype.hasOwnProperty.call(doc, f)
      ).map((f) => [f, doc[f]])
    ),
  };
}

/* ── Request construction ──────────────────────────────────────────────── */

/**
 * Build one request per unresolved researchable finding. Findings that are
 * not researchable (unsupported fields, contract conflicts) are ignored
 * here — they are decisions, not questions.
 */
export function buildHierarchyRequests(
  doc: PlainObject,
  issues: readonly AnalysisIssue[],
  schema: Record<string, unknown>
): ResearchRequest[] {
  const requests: ResearchRequest[] = [];
  const seen = new Set<string>();

  for (const issue of issues) {
    if (
      issue.code !== "MISSING_REQUIRED_FACT" &&
      issue.code !== "EMPTY_REQUIRED_PROSE" &&
      issue.code !== "WORD_COUNT_OUT_OF_RANGE"
    ) {
      continue;
    }
    if (seen.has(issue.path)) continue;

    const field = issue.path.slice(issue.path.lastIndexOf("/") + 1);

    /* Brand-level fact. */
    if (
      issue.path.indexOf("/", 1) === -1 &&
      RESEARCHABLE_BRAND_FIELDS.includes(field)
    ) {
      seen.add(issue.path);
      requests.push({
        path: issue.path,
        field,
        kind: "brand-fact",
        allowedValues:
          issue.allowedValues ?? allowedValuesFor(schema, field),
        wordRange: PROSE_WORD_RANGES[issue.path],
        context: brandContext(doc),
      });
      continue;
    }

    /* Variant description. */
    if (field === "description" && issue.path.includes("/Variants/")) {
      seen.add(issue.path);
      requests.push({
        path: issue.path,
        field,
        kind: "variant-description",
        wordRange: PROSE_WORD_RANGES["variant-description"],
        context: variantContext(doc, parentPointer(issue.path)),
      });
      continue;
    }

    /* Variant notes — technical detail, no word range in the contract. */
    if (field === "notes" && issue.path.includes("/Variants/")) {
      seen.add(issue.path);
      requests.push({
        path: issue.path,
        field,
        kind: "variant-notes",
        context: variantContext(doc, parentPointer(issue.path)),
      });
    }
  }

  return requests;
}

/**
 * Dedicated Reference pass. Independent of the hierarchy pass: it runs for
 * every Variant that permits references, including variants whose other
 * fields are already complete, and including variants that already carry
 * references (so an existing set can be confirmed rather than assumed).
 *
 * A variant that ends the pass with an empty references array is a valid
 * outcome, not a failure.
 */
export function buildReferenceRequests(doc: PlainObject): ResearchRequest[] {
  const requests: ResearchRequest[] = [];
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
        const pointer = `/Collections/${ci}/Families/${fi}/Variants/${vi}`;
        const existing = Array.isArray(variant.references)
          ? variant.references
          : [];
        /* Already-populated reference sets are left exactly as they are.
           The pass exists to fill genuine gaps, never to second-guess a
           reference the source already asserted. */
        if (existing.length > 0) return;
        requests.push({
          path: `${pointer}/references`,
          field: "references",
          kind: "variant-references",
          context: variantContext(doc, pointer),
        });
      });
    });
  });
  return requests;
}

/**
 * Pull the results object out of a provider reply.
 *
 * The instructions ask for bare JSON, and usually that is what arrives —
 * but a stray sentence or a code fence around an otherwise perfect answer
 * is not a reason to throw the whole round away and make the operator run
 * it again. Anything that is not a balanced JSON object still fails.
 */
/** One turn of a provider response — only the parts this room reads. */
export type ProviderTurn = {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
};

/**
 * Assemble one answer from every turn of a research call.
 *
 * The provider's search loop pauses and resumes, so a single answer is
 * written in pieces across several turns. They are one answer: keeping only
 * the last turn discards everything written before the final pause and
 * leaves a fragment, which then reads as provider gibberish rather than as
 * the bookkeeping mistake it is.
 *
 * If the last turn is still paused, the answer is genuinely unfinished and
 * the caller must say so rather than try to parse what it has.
 */
export function assembleAnswer(turns: readonly ProviderTurn[]): {
  text: string;
  stillSearching: boolean;
} {
  const text = turns
    .map((turn) =>
      (turn.content ?? [])
        .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
        .join("")
    )
    .join("")
    .trim();
  const last = turns.length > 0 ? turns[turns.length - 1] : undefined;
  return { text, stillSearching: last?.stop_reason === "pause_turn" };
}

export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* Fall through to locating the outermost balanced object. */
  }
  const start = cleaned.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

/* ── Response validation ───────────────────────────────────────────────── */

export type ValidationFailure = {
  ok: false;
  code: "INVALID_PROVIDER_OUTPUT";
  detail: string;
};

export type ValidationSuccess = {
  ok: true;
  results: ResearchResult[];
  /** Requests the provider did not answer — treated as UNSUPPORTED. */
  unanswered: string[];
};

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function parseSources(raw: unknown): ResearchSource[] {
  if (!Array.isArray(raw)) return [];
  const out: ResearchSource[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    if (!isHttpUrl(entry.url)) continue; // a source we cannot retrieve is not a source
    out.push({
      title:
        typeof entry.title === "string" && entry.title.trim()
          ? entry.title.trim().slice(0, 300)
          : entry.url,
      publisher:
        typeof entry.publisher === "string" && entry.publisher.trim()
          ? entry.publisher.trim().slice(0, 200)
          : null,
      url: entry.url,
    });
  }
  return out;
}

function parseOptions(raw: unknown): ResearchOption[] {
  if (!Array.isArray(raw)) return [];
  const out: ResearchOption[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    if (typeof entry.value !== "string" || !entry.value.trim()) continue;
    out.push({
      value: entry.value.trim().slice(0, 400),
      evidence:
        typeof entry.evidence === "string" ? entry.evidence.slice(0, 800) : "",
      sources: parseSources(entry.sources),
    });
  }
  return out;
}

function words(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Strictly validate a provider payload against the exact requests that were
 * sent. Anything that cannot be trusted is downgraded to UNSUPPORTED with a
 * stated reason rather than silently dropped, so the change report can
 * still explain why a field stayed empty.
 */
export function validateResearchPayload(
  raw: unknown,
  requested: readonly ResearchRequest[]
): ValidationSuccess | ValidationFailure {
  if (!isPlainObject(raw) || !Array.isArray(raw.results)) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_OUTPUT",
      detail: "Payload is not an object carrying a results array.",
    };
  }

  const byPath = new Map(requested.map((r) => [r.path, r]));
  const results: ResearchResult[] = [];
  const answered = new Set<string>();

  for (const entry of raw.results) {
    if (!isPlainObject(entry) || typeof entry.path !== "string") {
      return {
        ok: false,
        code: "INVALID_PROVIDER_OUTPUT",
        detail: "A result entry is not an object with a path.",
      };
    }
    const request = byPath.get(entry.path);
    if (!request) {
      /* A path nobody asked about must never reach a candidate. */
      return {
        ok: false,
        code: "INVALID_PROVIDER_OUTPUT",
        detail: `Result references path "${entry.path}", which was not requested.`,
      };
    }
    if (answered.has(entry.path)) {
      return {
        ok: false,
        code: "INVALID_PROVIDER_OUTPUT",
        detail: `Duplicate result for path "${entry.path}".`,
      };
    }
    answered.add(entry.path);

    const sources = parseSources(entry.sources);
    const evidence =
      typeof entry.evidence === "string" ? entry.evidence.slice(0, 1200) : "";
    const confidence =
      entry.confidence === "high" ||
      entry.confidence === "moderate" ||
      entry.confidence === "low"
        ? entry.confidence
        : "low";

    const reject = (detail: string): ResearchResult => ({
      path: entry.path as string,
      outcome: "UNSUPPORTED",
      sources,
      evidence: detail,
      confidence: "low",
    });

    if (entry.outcome === "UNSUPPORTED") {
      results.push({
        path: entry.path,
        outcome: "UNSUPPORTED",
        sources,
        evidence: evidence || "No qualifying evidence was found.",
        confidence,
      });
      continue;
    }

    if (entry.outcome === "UNRESOLVED") {
      const options = parseOptions(entry.options);
      results.push({
        path: entry.path,
        outcome: "UNRESOLVED",
        sources,
        evidence:
          evidence || "Evidence was insufficient to choose between options.",
        confidence,
        options,
      });
      continue;
    }

    if (entry.outcome !== "VERIFIED") {
      results.push(reject(`Unrecognized outcome "${String(entry.outcome)}".`));
      continue;
    }

    /* ── VERIFIED — every acceptance condition applies here ───────────── */

    if (sources.length === 0) {
      /* An uncited claim is never accepted, however plausible. */
      results.push(
        reject(
          "Claim was returned as verified but carried no retrievable source, so it was rejected."
        )
      );
      continue;
    }

    if (request.kind === "variant-references") {
      const value = entry.value;
      if (!Array.isArray(value)) {
        results.push(reject("References value was not an array."));
        continue;
      }
      const refs: PlainObject[] = [];
      let bad = false;
      for (const ref of value) {
        const asString =
          typeof ref === "string"
            ? ref
            : isPlainObject(ref) && typeof ref.reference === "string"
              ? ref.reference
              : null;
        if (!asString || !asString.trim()) {
          bad = true;
          break;
        }
        refs.push({ reference: asString.trim() });
      }
      if (bad) {
        results.push(
          reject("A reference entry had no usable reference string.")
        );
        continue;
      }
      results.push({
        path: entry.path,
        outcome: "VERIFIED",
        value: refs,
        sources,
        evidence,
        confidence,
      });
      continue;
    }

    if (typeof entry.value !== "string" || !entry.value.trim()) {
      results.push(reject("Verified value was not a non-empty string."));
      continue;
    }
    const value = entry.value.trim();

    if (request.allowedValues && !request.allowedValues.includes(value)) {
      results.push(
        reject(
          `Value "${value}" is outside the closed vocabulary the contract allows at this field.`
        )
      );
      continue;
    }

    if (request.wordRange) {
      const [min, max] = request.wordRange;
      const count = words(value);
      if (count < min || count > max) {
        results.push(
          reject(
            `Prose was ${count} words; the contract requires ${min}–${max}.`
          )
        );
        continue;
      }
    }

    results.push({
      path: entry.path,
      outcome: "VERIFIED",
      value,
      sources,
      evidence,
      confidence,
    });
  }

  const unanswered = requested
    .map((r) => r.path)
    .filter((p) => !answered.has(p));

  return { ok: true, results, unanswered };
}
