/* ════════════════════════════════════════════════════════════════════════
   ACCEPTED RESEARCH FACTS — durable at the fact, not at the file

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Accepted research is remembered per work item."

   It was, and that was the defect. Work items are keyed by `sourceSha256`
   — one record per unique source byte sequence — so a single edited
   character produced a new key, a new work item, and every fact the
   founder had already paid to establish was researched again. Correct one
   typo in a brand description and the whole file's research bill is paid a
   second time, with nothing on screen indicating why.

   `sourceSha256` KEEPS ITS JOB, UNCHANGED. It is the identity of a byte
   sequence, and it is the right key for provenance, candidate verification,
   staging and delivery — everything that must be able to say "these exact
   bytes". What it was never fit for is remembering a FACT, because a fact
   about one variant does not stop being true when a different variant is
   edited. Two keys, two questions, both correct.

   ── WHAT MAKES A FACT THE SAME FACT ──────────────────────────────────

   The key answers "which fact is this", and deliberately excludes the
   array indices in the JSON pointer. `/Collections/0/Families/0/Variants/2`
   is a POSITION, not an identity: insert one collection near the top of
   the file and every pointer below it shifts, while not one watch has
   changed. Keying on position would reopen an entire file because a
   sibling was added — the exact class of spurious invalidation this
   correction exists to remove.

   So a variant fact is identified by the NAMES that locate it — collection,
   family, variant — and a brand-level fact by its pointer, which carries no
   index and is already stable.

   ── WHAT MAKES A FACT REOPEN ─────────────────────────────────────────

   The fingerprint answers "do the inputs that justified this answer still
   hold". It carries the constraint surface the answer was produced under:
   the field, the kind, the closed vocabulary, the word range, and the
   locator parts themselves. A field whose permitted values are narrowed, or
   whose word range moves, has a genuinely different question behind it, and
   the previous answer is no longer evidence for the new one.

   It also carries the CAUSAL PARENTS of the field — the preserved values
   the research instructions forbid the answer from contradicting. See
   CAUSAL_PARENTS below; that is where the reasoning lives.

   ⚠ WHAT THE FINGERPRINT DELIBERATELY OMITS is the other half, and the
   distinction is the whole design. `variantContext` carries
   `existingReferences`, `existingNotes` and `existingAliases`;
   `brandContext` carries `collectionNames` and `searchAliases`, plus the
   NON-parent half of `knownFields`. Those are sibling or output state, and
   they change as the very same run fills the file in. Folding them in would
   mean accepting a variant's notes invalidated its own description a moment
   later — a cache that empties itself as it is used.

   The test is not "is this in the context" but "can changing this make the
   accepted answer FALSE".

   ── THE VERSION AXIS ─────────────────────────────────────────────────

   Spec, upgrade-rule, normalization and engine versions are all in the key.
   A fact accepted under v3.2 is not evidence under a later contract, and it
   must not silently survive a spec bump — it becomes a different key and is
   simply not found, which is the honest outcome. Nothing is mutated or
   deleted to achieve that.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { sha256HexOfText } from "./hash.ts";
import type { ResearchRequest } from "./types.ts";

/** Versions that make an accepted fact evidence, or stop it being evidence. */
export type FactContractVersions = {
  specificationSha256: string;
  upgradeRuleVersion: string;
  normalizationVersion: string;
  engineVersion: string;
};

/** One durable accepted research fact. */
export type AcceptedFact = {
  /** Primary key — see factKey(). */
  factKey: string;
  /** Reuse gate — see factInputFingerprint(). */
  inputFingerprint: string;

  brand: string;
  field: string;
  kind: string;
  /** The names that locate the fact, or the brand-level pointer. */
  locator: string[];

  /** The accepted value, exactly as it was applied to the document. */
  value: unknown;

  /* ── provenance: why this is allowed to be reused ── */
  /** The pointer it was accepted at. Positional, so it is RECORDED, never
      keyed on — a later file may legitimately place the same fact
      elsewhere. */
  acceptedAtPath: string;
  /** The exact source bytes it was first established against. This is the
      link back to the work item, and the reason source hashing is not
      weakened by any of this. */
  sourceSha256: string;
  /** Sources the provider cited, carried forward verbatim. */
  evidence: unknown;
  acceptedAtIso: string;

  specificationSha256: string;
  upgradeRuleVersion: string;
  normalizationVersion: string;
  engineVersion: string;
};

/** Stable JSON — key order can never change a hash. */
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(",")}}`;
}

function normalizeName(v: unknown): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

/**
 * The names that locate a fact, index-free.
 *
 * Brand-level facts use the pointer, which is already stable (`/description`,
 * `/region` — no array indices exist above the collections). Variant-level
 * facts use collection → family → variant names, so reordering the file
 * moves nothing.
 */
export function factLocator(request: ResearchRequest): string[] {
  const ctx = (request.context ?? {}) as Record<string, unknown>;
  const collection = ctx.collection;
  const family = ctx.family;
  const variant = ctx.variant;
  if (collection === undefined && family === undefined && variant === undefined) {
    /* Brand-level: the pointer IS the identity. */
    return [request.path];
  }
  return [normalizeName(collection), normalizeName(family), normalizeName(variant)];
}

/** Which fact is this. Index-free, version-scoped. */
export async function factKey(
  brandName: string | null,
  request: ResearchRequest,
  versions: FactContractVersions
): Promise<string> {
  return sha256HexOfText(
    stable({
      brand: normalizeName(brandName),
      field: request.field,
      kind: request.kind,
      locator: factLocator(request),
      spec: versions.specificationSha256,
      rule: versions.upgradeRuleVersion,
      norm: versions.normalizationVersion,
      engine: versions.engineVersion,
    })
  );
}

/**
 * Do the inputs that justified this answer still hold.
 *
 * Constraint surface plus locator only. Sibling state is excluded on
 * purpose — see the header.
 */
export async function factInputFingerprint(
  request: ResearchRequest
): Promise<string> {
  return sha256HexOfText(
    stable({
      field: request.field,
      kind: request.kind,
      locator: factLocator(request),
      allowedValues: request.allowedValues ? [...request.allowedValues].sort() : null,
      wordRange: request.wordRange ?? null,
      /* The preserved values this answer was required not to contradict. */
      causalInputs: causalInputsOf(request),
    })
  );
}

/* ── CAUSAL PARENTS ───────────────────────────────────────────────────────
   Which preserved values can make an accepted answer FALSE.

   The research instructions are explicit: "Never contradict a fact the file
   already asserts. Preserved values are given to you as context - treat them
   as true." That makes `brandContext.knownFields` a binding constraint on
   the answer, not background. An earlier build omitted all of it, which was
   wrong: change country_of_origin from Japan to Switzerland and an accepted
   `region` of "Asia" is not stale, it is false.

   ⚠ THE FIX IS NOT TO FINGERPRINT ALL OF knownFields. That map carries every
   researchable brand field including the ones the current run is filling, so
   hashing it whole would mean accepting `description` invalidated `region`
   moments later - self-invalidation, the original defect wearing a new hat.

   So each field names only the values that are UPSTREAM of it. A field is
   never its own parent, which is what keeps a run from invalidating its own
   work while it proceeds.

     region            <- country_of_origin   (region is derived from country)
     cluster           <- country_of_origin   (the vocabulary is country-linked:
                                               Japanese, German, British,
                                               American, Heritage Swiss)
     cluster_rationale <- cluster             (the contract defines it as "why
                                               the CHOSEN cluster is defensible")
     revival_type      <- revival_status      (meaningful only when revived)
     description       <- country_of_origin,  (a company overview asserting
                          independent_status   Swiss independence becomes false
                                               when either changes)

   Deliberately absent: `searchAliases` and `collectionNames` are naming and
   inventory, not claims the answer asserts; `country_of_origin`,
   `independent_status` and `revival_status` have no parents inside the
   researchable set.

   VARIANT FACTS HAVE NO CAUSAL PARENTS. `existingReferences`,
   `existingNotes` and `existingAliases` are sibling or output state: a
   description of a watch does not become false because a reference was added
   beside it, and the contract already forbids the description repeating the
   variant name, which the locator carries. They stay omitted, on purpose. */
const CAUSAL_PARENTS: Readonly<Record<string, readonly string[]>> = {
  region: ["country_of_origin"],
  cluster: ["country_of_origin"],
  cluster_rationale: ["cluster"],
  revival_type: ["revival_status"],
  description: ["country_of_origin", "independent_status"],
};

/**
 * The causal inputs for one request, read from the preserved values the
 * request actually carries.
 *
 * SEMANTIC, not byte-exact: values are whitespace-collapsed and case-folded,
 * so re-indenting a file or changing "switzerland" to "Switzerland" does not
 * reopen anything. The acceptance law asks for semantic equivalence, and a
 * cosmetic edit is equivalence.
 *
 * Brand-level only. `description` appears in the map, and a VARIANT
 * description must not pick it up - variant requests carry no `knownFields`,
 * so the lookup finds nothing and contributes nothing.
 */
export function causalInputsOf(request: ResearchRequest): Record<string, string> {
  if (request.kind !== "brand-fact") return {};
  const parents = CAUSAL_PARENTS[request.field];
  if (!parents || parents.length === 0) return {};
  const ctx = (request.context ?? {}) as Record<string, unknown>;
  const known = (ctx.knownFields ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const parent of [...parents].sort()) {
    /* Absent and empty are the same state - "the file does not assert this"
       - and must not be two different fingerprints. */
    out[parent] = normalizeName(known[parent]);
  }
  return out;
}

export type ReuseDecision =
  | { verdict: "reuse"; fact: AcceptedFact }
  | { verdict: "reopen"; reason: "inputs_changed"; previous: AcceptedFact }
  | { verdict: "research"; reason: "never_accepted" };

/**
 * The whole rule, in one place: unchanged fact survives, changed fact
 * reopens, unknown fact is researched.
 */
export function decideReuse(
  stored: AcceptedFact | undefined,
  inputFingerprint: string
): ReuseDecision {
  if (!stored) return { verdict: "research", reason: "never_accepted" };
  if (stored.inputFingerprint !== inputFingerprint) {
    return { verdict: "reopen", reason: "inputs_changed", previous: stored };
  }
  return { verdict: "reuse", fact: stored };
}

export type PartitionedRequests = {
  /** Reusable — never sent to the provider. */
  reused: { request: ResearchRequest; fact: AcceptedFact }[];
  /** Must be researched: never accepted, or the inputs moved. */
  toResearch: ResearchRequest[];
  /** Reopened facts, for the ledger — a reopen is a fact losing its
      evidence, and that is worth saying out loud rather than silently
      re-billing. */
  reopened: { request: ResearchRequest; previous: AcceptedFact }[];
};

/**
 * Split a batch before it reaches the provider. Pure: the caller supplies
 * the lookup, so this is testable without IndexedDB.
 */
export async function partitionByAcceptedFacts(
  brandName: string | null,
  requests: readonly ResearchRequest[],
  versions: FactContractVersions,
  lookup: (keys: string[]) => Promise<Map<string, AcceptedFact>>
): Promise<PartitionedRequests> {
  const keyed = await Promise.all(
    requests.map(async (request) => ({
      request,
      key: await factKey(brandName, request, versions),
      fingerprint: await factInputFingerprint(request),
    }))
  );
  const found = await lookup(keyed.map((k) => k.key));

  const out: PartitionedRequests = { reused: [], toResearch: [], reopened: [] };
  for (const entry of keyed) {
    const decision = decideReuse(found.get(entry.key), entry.fingerprint);
    if (decision.verdict === "reuse") {
      out.reused.push({ request: entry.request, fact: decision.fact });
    } else {
      if (decision.verdict === "reopen") {
        out.reopened.push({ request: entry.request, previous: decision.previous });
      }
      out.toResearch.push(entry.request);
    }
  }
  return out;
}

/** Build the durable record for a fact the run just accepted. */
export async function buildAcceptedFact(params: {
  brandName: string | null;
  request: ResearchRequest;
  value: unknown;
  evidence: unknown;
  sourceSha256: string;
  versions: FactContractVersions;
  nowIso: string;
}): Promise<AcceptedFact> {
  const { brandName, request, versions } = params;
  return {
    factKey: await factKey(brandName, request, versions),
    inputFingerprint: await factInputFingerprint(request),
    brand: normalizeName(brandName),
    field: request.field,
    kind: request.kind,
    locator: factLocator(request),
    value: params.value,
    acceptedAtPath: request.path,
    sourceSha256: params.sourceSha256,
    evidence: params.evidence ?? null,
    acceptedAtIso: params.nowIso,
    specificationSha256: versions.specificationSha256,
    upgradeRuleVersion: versions.upgradeRuleVersion,
    normalizationVersion: versions.normalizationVersion,
    engineVersion: versions.engineVersion,
  };
}
