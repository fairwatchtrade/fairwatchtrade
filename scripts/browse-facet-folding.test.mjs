/* Free-text facet folding — v4.4.

   Run: node --experimental-strip-types scripts/browse-facet-folding.test.mjs

   Found by Jason in the production Refine rail: DIAL COLOR listed "champagne"
   (1) and "Champagne" (3) as separate tiles. Proved on production that this
   was not merely untidy — ?dialColor=Champagne returned 3 watches, silently
   withholding the fourth champagne-dialled watch, because facets were counted
   on the raw stored string and filtering was an exact-string match.

   Folding is presentation only. Stored values are untouched, and the
   server-side saved-search watcher already matched case-insensitively
   (lower(dialColorType) ~ lower(val)) — so Browse was the strict one, and
   this closes an existing divergence rather than opening one. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { facetKey, foldFacets } from "../lib/browseFacets.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../components/BrowseClient.tsx"), "utf8");

let n = 0;
const ok = (name) => console.log(`  PASS ${++n}  ${name}`);

/* ── 1 · The reported case, exactly ──────────────────────────────────── */
const dials = ["Champagne", "champagne", "Champagne", "Champagne", "Abyss Blue", "Blue"];
assert.deepEqual(foldFacets(dials), [
  ["Abyss Blue", 1],
  ["Blue", 1],
  ["Champagne", 4],
]);
ok("champagne + Champagne become ONE tile counting 4 — the withheld watch is restored");

/* ── 2 · The label is the spelling the data actually uses most ───────── */
assert.deepEqual(foldFacets(["salmon", "salmon", "Salmon"]), [["salmon", 3]]);
assert.deepEqual(foldFacets(["Salmon", "salmon", "Salmon"]), [["Salmon", 3]]);
ok("the majority spelling wins the label in either direction — never an invented one");

const invented = foldFacets(["chAMpagne", "CHAMPAGNE"]).map(([l]) => l);
assert.ok(
  invented.every((l) => ["chAMpagne", "CHAMPAGNE"].includes(l)),
  "the label must be a spelling some seller actually wrote",
);
ok("the displayed label is always a real stored spelling, never a normalised invention");

/* A tie must resolve deterministically, not by row order. */
assert.deepEqual(foldFacets(["Blue", "blue"]), foldFacets(["blue", "Blue"]));
assert.deepEqual(foldFacets(["Blue", "blue"]), [["Blue", 2]]);
ok("an exact tie resolves alphabetically — the same input set always yields the same label");

/* ── 3 · Whitespace and empties are not values ───────────────────────── */
assert.deepEqual(foldFacets([" Champagne ", "Champagne"]), [["Champagne", 2]]);
assert.deepEqual(foldFacets(["", null, undefined, "   "]), []);
ok("surrounding whitespace folds too; empty, null and blank are never a facet");

/* ── 4 · Vocabulary differences are deliberately NOT merged ──────────── */
const materials = foldFacets(["stainless", "Stainless Steel", "Stainless Steel", "gold filled"]);
assert.deepEqual(materials, [
  ["gold filled", 1],
  ["stainless", 1],
  ["Stainless Steel", 2],
]);
ok("stainless vs Stainless Steel stay two honest tiles — case-folding must not guess at vocabulary");

/* ── 5 · Already-clean facets are untouched ──────────────────────────── */
const docs = ["Full Set", "Papers Only", "Papers Only", "Watch Only"];
assert.deepEqual(foldFacets(docs), [
  ["Full Set", 1],
  ["Papers Only", 2],
  ["Watch Only", 1],
]);
ok("a controlled vocabulary passes through unchanged — folding is a no-op where nothing is dirty");

/* ── 6 · Sorted alphabetically, same shape as before ─────────────────── */
const labels = foldFacets(["zebra", "Alpha", "mid"]).map(([l]) => l);
assert.deepEqual(labels, ["Alpha", "mid", "zebra"]);
ok("output stays [label, count] sorted alphabetically — the rail's existing shape");

/* ── 7 · The key itself ──────────────────────────────────────────────── */
assert.equal(facetKey(" Champagne "), "champagne");
assert.equal(facetKey(null), "");
assert.equal(facetKey(undefined), "");
ok("facetKey trims and folds, and treats absent as empty rather than throwing");

/* ── 8 · Both the tiles AND the filter fold ──────────────────────────── */
assert.ok(
  /const materialFacets = useMemo\(\s*\(\) => countByFolded/.test(src) &&
    /const dialFacets = useMemo\(\s*\(\) => countByFolded/.test(src),
  "the two free-text facets must be counted folded",
);
assert.ok(
  src.includes("selectedMaterialsFolded.has(facetKey(l.details?.caseMaterial ?? \"\"))") &&
    src.includes("selectedDialsFolded.has(facetKey(l.details?.dialColorType ?? \"\"))"),
  "filtering must compare folded on BOTH sides — folding the tiles alone would leave results wrong",
);
assert.ok(
  !/selectedDials\.has\(l\.details/.test(src) && !/selectedMaterials\.has\(l\.details/.test(src),
  "the old exact-string match must be gone, not merely bypassed",
);
ok("tiles and results fold together — a folded tile over an unfolded filter would be worse than the bug");

/* The memo that feeds the result set must depend on the folded sets, or the
   room would keep serving a stale result after the selection changes. */
/* The dependency array is the block between the filter body's close and the
   end of the useMemo — locate it from the last filter clause forward. */
const afterFilter = src.slice(src.indexOf("selectedDialsFolded.has(facetKey"));
const depsArray = afterFilter.slice(0, afterFilter.indexOf("]"));
assert.ok(
  depsArray.includes("selectedMaterialsFolded") && depsArray.includes("selectedDialsFolded"),
  "the filtered memo must depend on the folded sets it actually reads",
);
assert.ok(
  !/\n\s+selectedMaterials,\n/.test(depsArray) && !/\n\s+selectedDials,\n/.test(depsArray),
  "the superseded raw sets must not linger in the dependency array",
);
ok("the filtered memo depends on the folded sets it reads — no stale result after a change");

/* ── 9 · A stale lowercase link still selects the right watches ──────── */
const selected = new Set(["champagne"].map(facetKey));
assert.ok(selected.has(facetKey("Champagne")), "an older lowercase URL must still match the folded tile");
assert.ok(
  src.includes("selected.has(value) || selectedFolded.has(facetKey(value))"),
  "the tile must also read as chosen when the URL carries a different spelling",
);
ok("a saved or shared link carrying the old spelling still selects the same watches and lights the tile");

console.log(`\n  browse-facet-folding: ${n} sections, all assertions passed`);
