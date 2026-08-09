/* Sell brand index — corpus composition, alias safety, resolution rules.

   Run: node --experimental-strip-types scripts/brand-index.test.mjs

   These assertions guard the Sell brand field's substance:
     · the curated static list is the floor and never shrinks, including
       when the Vault query returns nothing at all;
     · brands the platform already knows through the Vault become
       selectable instead of being called "not on our standard index";
     · an alias widens what can be FOUND but never rewrites a name that is
       itself a brand — the Vault records "TAG Heuer" as an alias of
       "Heuer", "MB&F" as an alias of a second row, and "Citizen" as an
       alias of "The Citizen", and every one of those must stay itself;
     · an alias claimed by two makers resolves to neither;
     · an alias in a non-Latin script never becomes a wildcard match key;
     · aliases never render as their own selector rows;
     · nothing here decides admission: an unknown brand is still
       submittable and still flagged for review, Rolex still routes to its
       requirement profile, and Tudor's evaluator doctrine is untouched. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildBrandIndex,
  matchBrands,
  normalizeBrand,
  resolveTypedBrand,
  MIN_BRAND_CHARS,
} from "../lib/brandIndex.ts";
import { WATCH_BRANDS } from "../lib/brands.ts";
import { requirementProfileFor } from "../lib/admission/requirementProfile.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

/* A faithful excerpt of vault_brands AS IT STOOD BEFORE the 2026-08-09
   identity repair — the duplicate Chaykin row, the "The Citizen" naming, the
   TAG-Heuer-under-Heuer alias and the second MB&F claimant are all preserved
   here deliberately. The upstream data is now clean, but this consumer must
   keep failing safely if bad data ever returns, so the fixture stays
   adversarial on purpose. Do not "update" it to match current production. */
const VAULT = [
  { name: "A. Lange & Söhne", search_aliases: ["Lange", "A Lange & Sohne"] },
  { name: "Audemars Piguet", search_aliases: ["AP"] },
  { name: "Bulgari", search_aliases: ["Bvlgari", "Bulgari watches"] },
  { name: "Constantin Chaykin", search_aliases: ["Konstantin Chaykin", "Chaykin"] },
  { name: "Girard-Perregaux", search_aliases: ["GP"] },
  { name: "H. Moser & Cie.", search_aliases: ["Moser", "H Moser", "Moser & Cie"] },
  { name: "Hajime Asaoka", search_aliases: [] },
  { name: "Heuer", search_aliases: ["TAG Heuer", "Ed. Heuer & Co."] },
  { name: "Jaeger-LeCoultre", search_aliases: ["JLC", "Jaeger LeCoultre"] },
  { name: "Kari Voutilainen", search_aliases: ["Voutilainen"] },
  { name: "Konstantin Chaykin", search_aliases: ["Chaykin"] },
  { name: "Kurono", search_aliases: ["Kurono Tokyo"] },
  { name: "MB&F", search_aliases: ["Maximilian Büsser & Friends"] },
  { name: "mbf mad", search_aliases: ["MB&F", "Maximilian Büsser & Friends"] },
  { name: "Mühle-Glashütte", search_aliases: ["Muhle", "Muhle Glashutte"] },
  { name: "Otsuka Lotec", search_aliases: [] },
  { name: "Philippe Dufour", search_aliases: [] },
  { name: "Poljot", search_aliases: ["Полет"] },
  { name: "Rexhep Rexhepi", search_aliases: ["Akrivia", "Rexhep Rexhepi Akrivia"] },
  { name: "Rolex", search_aliases: [] },
  { name: "The Citizen", search_aliases: ["Citizen", "Citizen Watch"] },
  { name: "Tudor", search_aliases: [] },
  { name: "ZIM", search_aliases: ["ЗИМ"] },
];

const index = buildBrandIndex(WATCH_BRANDS, VAULT);
const floor = buildBrandIndex(WATCH_BRANDS, []);

console.log("\nCorpus composition");

check("the static list is the floor when the Vault returns nothing", () => {
  assert.equal(floor.names.length, new Set(WATCH_BRANDS.map(normalizeBrand)).size);
  for (const brand of WATCH_BRANDS) {
    assert.equal(resolveTypedBrand(brand, floor).isCustom, false, brand);
  }
  assert.equal(floor.aliasTo.size, 0);
});

check("every static brand survives the widened corpus", () => {
  for (const brand of WATCH_BRANDS) {
    assert.equal(resolveTypedBrand(brand, index).isCustom, false, brand);
  }
  assert.ok(index.names.length > floor.names.length);
});

check("Vault brands the static list never had become selectable", () => {
  for (const brand of [
    "Otsuka Lotec",
    "Hajime Asaoka",
    "A. Lange & Söhne",
    "Philippe Dufour",
    "Mühle-Glashütte",
  ]) {
    const r = resolveTypedBrand(brand, index);
    assert.equal(r.isCustom, false, brand);
    assert.equal(r.name, brand);
    assert.equal(resolveTypedBrand(brand, floor).isCustom, true, `${brand} was absent before`);
  }
});

check("a widened brand is reachable by typing", () => {
  assert.ok(matchBrands("otsuka", index).includes("Otsuka Lotec"));
  assert.ok(matchBrands("asaoka", index).includes("Hajime Asaoka"));
});

console.log("\nAlias safety — a name that is a brand stays that brand");

check("aliases that shadow a canonical brand never rewrite it", () => {
  for (const [typed, mustStay] of [
    ["TAG Heuer", "TAG Heuer"],
    ["MB&F", "MB&F"],
    ["Citizen", "Citizen"],
    ["Voutilainen", "Voutilainen"],
    ["Akrivia", "Akrivia"],
    ["Bvlgari", "Bvlgari"],
    ["Kurono Tokyo", "Kurono Tokyo"],
    ["Muhle", "Muhle"],
    ["Konstantin Chaykin", "Konstantin Chaykin"],
  ]) {
    const r = resolveTypedBrand(typed, index);
    assert.equal(r.name, mustStay, `${typed} must not be rewritten`);
    assert.equal(r.isCustom, false, typed);
  }
});

check("an alias claimed by two makers resolves to neither", () => {
  const r = resolveTypedBrand("Chaykin", index);
  assert.equal(r.isCustom, true);
  assert.equal(r.name, "Chaykin");
  assert.equal(index.aliasTo.has(normalizeBrand("Chaykin")), false);
  assert.equal(index.aliasTo.has(normalizeBrand("Maximilian Büsser & Friends")), false);
});

check("a non-Latin alias never becomes a wildcard match key", () => {
  assert.equal(normalizeBrand("Полет"), "");
  assert.equal(index.aliasTo.has(""), false);
  for (const key of index.aliasTo.keys()) assert.notEqual(key, "");
});

check("unambiguous aliases do resolve to the canonical brand", () => {
  for (const [typed, expected] of [
    ["jlc", "Jaeger-LeCoultre"],
    ["JLC", "Jaeger-LeCoultre"],
    ["moser", "H. Moser & Cie."],
    ["ap", "Audemars Piguet"],
    ["gp", "Girard-Perregaux"],
    ["lange", "A. Lange & Söhne"],
  ]) {
    const r = resolveTypedBrand(typed, index);
    assert.equal(r.name, expected, typed);
    assert.equal(r.isCustom, false, typed);
  }
});

check("an alias never appears as its own selector row", () => {
  const rows = matchBrands("jlc", index);
  assert.deepEqual(rows, ["Jaeger-LeCoultre"]);
  assert.equal(rows.includes("JLC"), false);
  for (const q of ["moser", "lange", "ap"]) {
    for (const row of matchBrands(q, index)) {
      assert.ok(index.canonical.has(normalizeBrand(row)), `${row} must be canonical`);
    }
  }
});

check("no duplicate rows for one maker", () => {
  for (const q of ["voutilainen", "chaykin", "heuer", "citizen"]) {
    const rows = matchBrands(q, index);
    assert.equal(new Set(rows).size, rows.length, q);
  }
});

console.log("\nMatching and normalization");

check("normalized spellings resolve to the canonical display name", () => {
  assert.equal(resolveTypedBrand("fp journe", index).name, "F.P. Journe");
  assert.equal(resolveTypedBrand("girard perregaux", index).name, "Girard-Perregaux");
  assert.equal(resolveTypedBrand("PARMIGIANI FLEURIER", index).name, "Parmigiani Fleurier");
});

check("the list stays shut below the minimum character count", () => {
  assert.equal(MIN_BRAND_CHARS, 2);
  assert.deepEqual(matchBrands("r", index), []);
  assert.deepEqual(matchBrands("", index), []);
  assert.ok(matchBrands("ro", index).length > 0);
});

check("prefix matches rank ahead of substring matches", () => {
  const rows = matchBrands("seiko", index);
  assert.equal(rows[0], "Seiko");
  assert.ok(rows.includes("Grand Seiko"));
});

check("results stay capped", () => {
  assert.ok(matchBrands("a", index).length <= 8);
  assert.ok(matchBrands("er", index).length <= 8);
});

console.log("\nThis field recognizes brands — it never decides admission");

check("an unknown brand is still submittable, still flagged", () => {
  const r = resolveTypedBrand("Trilobe", index);
  assert.equal(r.isCustom, true);
  assert.equal(r.name, "Trilobe");
  assert.deepEqual(matchBrands("trilobe", index), []);
});

check("empty input is never reported as custom", () => {
  assert.equal(resolveTypedBrand("", index).isCustom, false);
  assert.equal(resolveTypedBrand("   ", index).isCustom, false);
});

check("Rolex still routes to its requirement profile", () => {
  const r = resolveTypedBrand("rolex", index);
  assert.equal(r.name, "Rolex");
  assert.equal(r.isCustom, false);
  assert.equal(requirementProfileFor(r.name)?.brand, "Rolex");
});

check("no non-Rolex brand acquires the Rolex profile", () => {
  for (const brand of ["Tudor", "Otsuka Lotec", "A. Lange & Söhne", "Heuer", "TAG Heuer"]) {
    assert.equal(requirementProfileFor(brand), null, brand);
  }
});

check("the evaluator's brand doctrine is untouched by this change", () => {
  const prompt = readFileSync(new URL("../lib/evaluationPrompt.ts", import.meta.url), "utf8");
  assert.ok(prompt.includes("Tudor (all references)"), "Tudor hard rejection preserved");
  assert.ok(prompt.includes("Tudor remains a hard rejection."));
  assert.ok(prompt.includes("ROLEX — SELECTIVE ADMISSION"));
});

check("the canary route is not a dependency of this field", () => {
  const combobox = readFileSync(new URL("../components/BrandCombobox.tsx", import.meta.url), "utf8");
  assert.equal(combobox.includes("api/evaluate"), false);
});

console.log(`\n${passed}/${passed} passed\n`);
