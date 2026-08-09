/* Vault alias guard — write-side collision prevention.

   Run: node --experimental-strip-types scripts/vault-alias-guard.test.mjs

   Each case below is a defect the live corpus actually contained before the
   2026-08-09 repair. The guard exists so enrichment cannot recreate them:
     · an alias equal to another brand's canonical name (TAG Heuer → Heuer);
     · an alias already claimed by a different brand (Chaykin);
     · an alias that normalizes to an empty key (Cyrillic);
     · a cross-brand canonical shadow (MB&F claimed by a second row).

   The guard must never choose a winner. Every refusal is reported with a
   reason so a person settles the identity. */
import assert from "node:assert/strict";
import {
  screenAliases,
  describeHeld,
  HOLD_EXPLANATIONS,
} from "../lib/vaultAliasGuard.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const HEUER = { id: "b-heuer", name: "Heuer", search_aliases: ["Ed. Heuer & Co."] };
const TAG = { id: "b-tag", name: "TAG Heuer", search_aliases: [] };
const MBF = { id: "b-mbf", name: "MB&F", search_aliases: ["Maximilian Büsser & Friends"] };
const MAD = { id: "b-mad", name: "mbf mad", search_aliases: [] };
const KONSTANTIN = { id: "b-kc", name: "Konstantin Chaykin", search_aliases: ["Chaykin"] };
const CITIZEN = { id: "b-cit", name: "Citizen", search_aliases: ["The Citizen"] };
const POLJOT = { id: "b-pol", name: "Poljot", search_aliases: [] };

const CORPUS = [HEUER, TAG, MBF, MAD, KONSTANTIN, CITIZEN, POLJOT];

console.log("\nThe four defects the live corpus actually had");

check("an alias equal to another brand's canonical name is held", () => {
  const v = screenAliases(HEUER.id, HEUER.name, ["TAG Heuer", "Ed. Heuer & Co."], CORPUS);
  assert.deepEqual(v.accepted, ["Ed. Heuer & Co."]);
  assert.equal(v.held.length, 1);
  assert.equal(v.held[0].alias, "TAG Heuer");
  assert.equal(v.held[0].reason, "shadows_canonical");
  assert.equal(v.held[0].conflictsWith, "TAG Heuer");
});

check("a second row cannot claim MB&F's name", () => {
  const v = screenAliases(MAD.id, MAD.name, ["MB&F", "Maximilian Büsser & Friends"], CORPUS);
  assert.deepEqual(v.accepted, []);
  assert.deepEqual(v.held.map((h) => h.reason), ["shadows_canonical", "claimed_by_other_brand"]);
});

check("an alias another brand already claims is held", () => {
  const v = screenAliases("b-other", "Constantin Chaykin", ["Chaykin"], CORPUS);
  assert.deepEqual(v.accepted, []);
  assert.equal(v.held[0].reason, "claimed_by_other_brand");
  assert.equal(v.held[0].conflictsWith, "Konstantin Chaykin");
});

check("an alias that normalizes to nothing is held", () => {
  const v = screenAliases(POLJOT.id, POLJOT.name, ["Полет", "Poljot Watches"], CORPUS);
  assert.deepEqual(v.accepted, ["Poljot Watches"]);
  assert.equal(v.held[0].reason, "empty_key");
});

console.log("\nThe guard never picks a winner");

check("both canonical rows survive a contested alias", () => {
  const before = CORPUS.map((b) => `${b.id}:${b.name}:${(b.search_aliases ?? []).join(",")}`);
  screenAliases(MAD.id, MAD.name, ["MB&F"], CORPUS);
  screenAliases(HEUER.id, HEUER.name, ["TAG Heuer"], CORPUS);
  const after = CORPUS.map((b) => `${b.id}:${b.name}:${(b.search_aliases ?? []).join(",")}`);
  assert.deepEqual(after, before, "screening must not mutate the corpus");
});

check("every held alias carries a stated reason", () => {
  const v = screenAliases(MAD.id, MAD.name, ["MB&F", "Полет", "mbf mad", "MB&F"], CORPUS);
  for (const h of v.held) assert.ok(HOLD_EXPLANATIONS[h.reason], h.reason);
  const lines = describeHeld(v.held);
  assert.equal(lines.length, v.held.length);
  for (const line of lines) assert.match(line, /^held ".*" — .+/);
});

console.log("\nOrdinary aliases still pass");

check("legitimate aliases are accepted in order", () => {
  const v = screenAliases(KONSTANTIN.id, KONSTANTIN.name, ["Chaykin", "Constantin Chaykin"], CORPUS);
  assert.deepEqual(v.accepted, ["Chaykin", "Constantin Chaykin"]);
  assert.deepEqual(v.held, []);
});

check("a brand's own alias is not a conflict with itself", () => {
  const v = screenAliases(MBF.id, MBF.name, ["Maximilian Büsser & Friends"], CORPUS);
  assert.deepEqual(v.accepted, ["Maximilian Büsser & Friends"]);
});

check("restating the brand's own name is held", () => {
  const v = screenAliases(MBF.id, MBF.name, ["mb&f", "MBF"], CORPUS);
  assert.deepEqual(v.accepted, []);
  assert.deepEqual(v.held.map((h) => h.reason), ["self_reference", "self_reference"]);
});

check("a repeat inside one batch is held once", () => {
  const v = screenAliases(CITIZEN.id, CITIZEN.name, ["Citizen Watch", "citizen watch"], CORPUS);
  assert.deepEqual(v.accepted, ["Citizen Watch"]);
  assert.equal(v.held[0].reason, "duplicate_in_proposal");
});

check("an empty proposal is not an error", () => {
  const v = screenAliases(CITIZEN.id, CITIZEN.name, [], CORPUS);
  assert.deepEqual(v.accepted, []);
  assert.deepEqual(v.held, []);
});

check("normalization matches the Sell consumer", () => {
  // Accent- and punctuation-insensitive, exactly as brandIndex normalizes.
  const v = screenAliases("b-x", "Some Brand", ["T.A.G. Heuer", "citizen"], CORPUS);
  assert.deepEqual(v.accepted, []);
  assert.deepEqual(v.held.map((h) => h.conflictsWith), ["TAG Heuer", "Citizen"]);
});

console.log(`\n${passed}/${passed} passed\n`);
