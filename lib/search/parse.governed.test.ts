/* ────────────────────────────────────────────────────────────────────────
   SFX-006B — governed taxonomy resolution proof.

   Dependency-free: Node's built-in test runner with native type stripping.

     node --test lib/search/parse.governed.test.ts

   No test framework was added to package.json for this round.
   ──────────────────────────────────────────────────────────────────────── */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSearch, matchesMeaning, SEARCH_MEANING_VERSION } from "./parse.ts";
import type { GovernedIndex } from "./taxonomy.ts";
import {
  GOVERNED_KEYS,
  GOVERNED_MAX_WORDS,
} from "./server/vaultTaxonomy.generated.ts";

const taxonomy: GovernedIndex = {
  keys: GOVERNED_KEYS,
  maxWords: GOVERNED_MAX_WORDS,
};

const kinds = (q: string, opts = {}) =>
  parseSearch(q, { taxonomy, ...opts }).meanings.map((m) => `${m.kind}:${m.value}`);

/* The governed proof listing: brand "Parmigiani Fleurier", model "Tonda PF". */
const parmigiani = { brand: "Parmigiani Fleurier", model: "Tonda PF", reference: "IDPROOF-01" };
const datejust = { brand: "Rolex", model: "Datejust", reference: "79173" };

test("parmigiani tonda pf resolves Brand + Family, never Text", () => {
  const got = kinds("parmigiani tonda pf");
  assert.ok(got.includes("brand:Parmigiani Fleurier"), `brand missing: ${got}`);
  assert.ok(got.includes("family:Tonda PF"), `family missing: ${got}`);
  assert.equal(
    got.some((k) => k.startsWith("text:")),
    false,
    `nothing should remain as text: ${got}`
  );
  // Longest-phrase-first: "pf" must not have been eaten as the brand alias.
  assert.equal(got.filter((k) => k.startsWith("brand:")).length, 1);
});

test("tonda alone resolves Collection", () => {
  assert.deepEqual(kinds("tonda"), ["collection:Tonda"]);
});

test("diacritics fold — tonda metrographe reaches Tonda Métrographe", () => {
  assert.ok(kinds("tonda metrographe").includes("family:Tonda Métrographe"));
});

test("exact known manufacturer reference is unchanged and outranks taxonomy", () => {
  const s = parseSearch("79173", { taxonomy, knownReferences: ["79173"] });
  assert.equal(s.reference, "79173");
  assert.equal(s.code, null);
  assert.deepEqual(s.meanings, []);
});

test("identifier-shaped unresolved query stays an exact request, never text", () => {
  const s = parseSearch("ZZ-9999-QQ", { taxonomy });
  assert.equal(s.reference, "ZZ-9999-QQ");
  assert.deepEqual(s.meanings, []);
});

test("ambiguous governed name stays honest Text", () => {
  const ambiguous = Object.keys(GOVERNED_KEYS).find(
    (k) => GOVERNED_KEYS[k] === 0 && /^[a-z]{4,}$/.test(k)
  );
  assert.ok(ambiguous, "expected at least one alphabetic ambiguous key");
  const got = kinds(ambiguous!);
  assert.ok(
    got.every((k) => !/^(brand|collection|family|variant):/.test(k)),
    `ambiguous "${ambiguous}" must not resolve to a governed level: ${got}`
  );
  assert.ok(got.some((k) => k.startsWith("text:")), `expected text: ${got}`);
});

test("without taxonomy, behaviour is unchanged from before this round", () => {
  const got = parseSearch("parmigiani tonda pf").meanings.map((m) => `${m.kind}:${m.value}`);
  assert.ok(got.includes("brand:Parmigiani Fleurier"), `hand-written brand rule survives: ${got}`);
  assert.ok(got.includes("text:tonda pf"), `unresolved stays text: ${got}`);
});

test("Family meaning restricts — matches the governed listing, not a Datejust", () => {
  const fam = { kind: "family" as const, value: "Tonda PF", label: "Family: Tonda PF", source: [] };
  assert.equal(matchesMeaning(parmigiani, fam), true);
  assert.equal(matchesMeaning(datejust, fam), false);
});

test("Variant is not inferred from Brand + Family", () => {
  const v = {
    kind: "variant" as const,
    value: "Micro-Rotor Steel",
    label: "Variant: Micro-Rotor Steel",
    source: [],
  };
  assert.equal(matchesMeaning(parmigiani, v), false);
});

test("meaning schema version records the semantic change", () => {
  assert.equal(SEARCH_MEANING_VERSION, 2);
});
