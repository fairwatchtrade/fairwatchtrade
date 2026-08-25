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

   ⚠ WHAT THE FINGERPRINT DELIBERATELY OMITS is the larger half of this
   correction. `variantContext` also carries `existingReferences`,
   `existingNotes` and `existingAliases`; `brandContext` carries
   `knownFields`. Those are SIBLING STATE, and they change as the very same
   run fills the file in. Folding them into the fingerprint would mean
   accepting a variant's notes invalidated its own description a moment
   later — a cache that empties itself as it is used. Only the inputs
   relevant to THIS fact are fingerprinted.

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
    })
  );
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
