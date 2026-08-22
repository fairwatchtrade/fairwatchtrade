/* Sell Flow validation — behavior pins for the shared required/assist seam.

   Run: node --experimental-strip-types scripts/sell-validation.test.mjs

   Pins the three corrections from the founder's 2026-08-22 live walk:

     · a cleared required value stays missing (it must never be treated as
       "unchanged" and quietly restored from persisted state);
     · Continue ASSISTS rather than disables — the press is held to reveal
       what is missing, and a non-blocking question lets the seller past on
       the second press while a blocking one keeps the step open;
     · a populated typeahead reopens the real choices instead of echoing
       the value already selected.                                        */

import assert from "node:assert/strict";
import {
  MISSING_REQUIRED_CLS,
  detailsMissingRequired,
  continueHeld,
  typeaheadMenuOptions,
} from "../lib/sellValidation.ts";

let n = 0;
const ok = (name) => {
  n += 1;
  console.log(`  ✓ ${name}`);
};

// 1 · The approved alarm treatment, exactly as ruled.
{
  assert.match(MISSING_REQUIRED_CLS, /border-\[3px\]/);
  assert.match(MISSING_REQUIRED_CLS, /#880015/);
  assert.match(MISSING_REQUIRED_CLS, /border-solid/);
  assert.match(MISSING_REQUIRED_CLS, /\bp-2\b/); // inner breathing room
  ok("missing-required treatment is a full 3px #880015 perimeter with padding");
}

// 2 · A cleared Case size is missing — the exact defect: the field was
//     emptied on purpose and must not read as satisfied.
{
  const missing = detailsMissingRequired({ caseSizeMm: "", crownPresent: true });
  assert.equal(missing.length, 1);
  assert.equal(missing[0].key, "caseSizeMm");
  assert.equal(missing[0].blocking, true);
  ok("cleared Case size is missing and blocking");
}

// 3 · Whitespace is not a value.
{
  assert.equal(detailsMissingRequired({ caseSizeMm: "   ", crownPresent: true }).length, 1);
  assert.equal(detailsMissingRequired({ caseSizeMm: "40", crownPresent: true }).length, 0);
  ok("whitespace-only Case size is still missing; a real value satisfies");
}

// 4 · Crown present is required-to-answer but NON-blocking (v6.22 ruling).
{
  const missing = detailsMissingRequired({ caseSizeMm: "40" });
  assert.equal(missing.length, 1);
  assert.equal(missing[0].key, "crownPresent");
  assert.equal(missing[0].blocking, false);
  ok("unanswered Crown present is marked but non-blocking");
}

// 5 · Continue assists: first press held, second press advances past a
//     non-blocking question.
{
  const soft = detailsMissingRequired({ caseSizeMm: "40" });
  assert.equal(continueHeld(soft, false), true);
  assert.equal(continueHeld(soft, true), false);
  ok("non-blocking miss: first press reveals, second press advances");
}

// 6 · A blocking miss keeps the step open no matter how many presses.
{
  const hard = detailsMissingRequired({ caseSizeMm: "", crownPresent: false });
  assert.equal(continueHeld(hard, false), true);
  assert.equal(continueHeld(hard, true), true);
  ok("blocking miss holds the step open on every press");
}

// 7 · Nothing missing never holds the seller.
{
  assert.equal(continueHeld([], false), false);
  assert.equal(continueHeld(detailsMissingRequired({ caseSizeMm: "40", crownPresent: false }), true), false);
  ok("a complete step is never held");
}

// 8 · Both missing: every item is revealed at once, blocking one first.
{
  const missing = detailsMissingRequired({ caseSizeMm: "" });
  assert.deepEqual(missing.map((m) => m.key), ["caseSizeMm", "crownPresent"]);
  assert.equal(missing[0].anchor, "case-size-field");
  ok("every missing item is reported together, blocking one first");
}

// 9 · The typeahead defect: a committed selection reopens the full list.
{
  const CLOSURES = ["Deployant Clasp", "Pin Buckle", "Butterfly Clasp", "Fold-Over Clasp"];
  const reopened = typeaheadMenuOptions("Deployant Clasp", CLOSURES, 6);
  assert.deepEqual(reopened, CLOSURES);
  assert.ok(reopened.includes("Pin Buckle"), "other choices must be reachable");
  ok("populated typeahead reopens all choices, not just the current value");
}

// 10 · Typing still filters, and an empty field still offers everything.
{
  const CLOSURES = ["Deployant Clasp", "Pin Buckle", "Butterfly Clasp"];
  assert.deepEqual(typeaheadMenuOptions("clasp", CLOSURES, 6), [
    "Deployant Clasp",
    "Butterfly Clasp",
  ]);
  assert.deepEqual(typeaheadMenuOptions("", CLOSURES, 6), CLOSURES);
  assert.deepEqual(typeaheadMenuOptions("zzz", CLOSURES, 6), []);
  ok("typed queries still filter; free text that matches nothing stays quiet");
}

// 11 · Case-insensitive commit detection, and the cap still applies.
{
  const many = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta"];
  assert.deepEqual(typeaheadMenuOptions("beta", many, 3), ["Alpha", "Beta", "Gamma"]);
  ok("committed value matches case-insensitively and respects maxSuggestions");
}

console.log(`\nsell-validation: ${n} pins hold.`);
