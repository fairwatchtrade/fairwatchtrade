/* Admission-state reset — the watch-identity change law
   (Phase A of the selective-admission corridor work · 2026-08-29)

   Run: node scripts/admission-reset.test.mjs

   Admission answers are affirmations about ONE physical watch. These
   assertions guard the law that they never survive a material change of
   WHICH watch the draft describes — and, just as deliberately, that they
   survive everything else:

     · same brand + same reference identity → answers survive;
     · reference A → reference B (same brand) → answers clear;
     · profile brand → ordinary brand → answers clear;
     · ordinary brand → profile brand → the corridor starts fresh;
     · a reloaded unchanged draft is hydrated, not patched, so reload can
       never clear (proven structurally against the Sell Flow source);
     · a documented Rolex Style and its derived canonical reference are the
       SAME watch, so retyping one as the other never costs the seller
       their affirmations. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  watchIdentityChanged,
  normalizedReferenceIdentity,
} from "../lib/admission/requirementProfile.ts";
import { classifyRolexIdentifier } from "../lib/admission/rolexIdentifier.ts";

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
}
function eq(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  passed += 1;
}

/* ── the pure law ── */

// 1 · same identity survives
eq(
  "same brand + same reference → unchanged",
  watchIdentityChanged(
    { brand: "Rolex", reference: "79173" },
    { brand: "Rolex", reference: "79173" }
  ),
  false
);
eq(
  "trim noise is not an identity change",
  watchIdentityChanged(
    { brand: "Rolex", reference: " 79173 " },
    { brand: "Rolex", reference: "79173" }
  ),
  false
);
eq(
  "brand case is the dispatcher's own rule — not a change",
  watchIdentityChanged(
    { brand: "rolex", reference: "79173" },
    { brand: "Rolex", reference: "79173" }
  ),
  false
);

// 2 · reference A → reference B clears
eq(
  "Rolex reference A → reference B → changed",
  watchIdentityChanged(
    { brand: "Rolex", reference: "79173" },
    { brand: "Rolex", reference: "16610" }
  ),
  true
);

// 3 / 4 · brand changes clear in both directions
eq(
  "Rolex → ordinary brand → changed",
  watchIdentityChanged(
    { brand: "Rolex", reference: "79173" },
    { brand: "Parmigiani Fleurier", reference: "79173" }
  ),
  true
);
eq(
  "ordinary brand → Rolex → changed (fresh corridor)",
  watchIdentityChanged(
    { brand: "Parmigiani Fleurier", reference: "PFC274" },
    { brand: "Rolex", reference: "PFC274" }
  ),
  true
);

// 6 · the Style→canonical equivalence — same watch, same identity.
//     Derive the pair from the REAL classifier so this test can never pin
//     a stale example: whatever the grammar says the style's canonical is,
//     that is the equivalence the reset law must honour.
{
  const style = "R79173327B6252";
  const ident = classifyRolexIdentifier(style);
  ok("fixture style is recognized by the real grammar", ident.kind === "style");
  eq(
    "documented Style ↔ its canonical reference → same identity",
    watchIdentityChanged(
      { brand: "Rolex", reference: style },
      { brand: "Rolex", reference: ident.reference }
    ),
    false
  );
  eq(
    "documented Style → a DIFFERENT canonical → changed",
    watchIdentityChanged(
      { brand: "Rolex", reference: style },
      { brand: "Rolex", reference: "16610" }
    ),
    true
  );
  eq(
    "normalizedReferenceIdentity maps the style to its canonical under Rolex",
    normalizedReferenceIdentity("Rolex", style),
    ident.reference
  );
  eq(
    "the SAME text under an ordinary brand keeps its literal identity",
    normalizedReferenceIdentity("Parmigiani Fleurier", style),
    style
  );
}

/* ── the wiring — source-level, the same style the admission suite uses ── */
{
  const sellFlow = readFileSync(
    new URL("../components/SellFlow.tsx", import.meta.url),
    "utf8"
  );

  ok(
    "the ONE mutation door consults the identity-change law",
    /function patch\(p: Partial<ListingDraft>\)[\s\S]{0,900}watchIdentityChanged\(/.test(
      sellFlow
    )
  );
  ok(
    "the reset clears ONLY details.admission, never sibling details",
    sellFlow.includes("delete details.admission;") &&
      /const details = { ...next.details };/.test(sellFlow)
  );
  ok(
    "the guard fires only for identity keys, so unrelated patches never reset",
    sellFlow.includes('("brand" in p || "reference" in p)')
  );
  ok(
    "hydration bypasses the door: adoptRow writes setDraft directly, not patch",
    /const adoptRow = [\s\S]{0,300}setDraft\(/.test(sellFlow) &&
      !/const adoptRow = [\s\S]{0,300}\bpatch\(/.test(sellFlow)
  );
}

console.log(`admission-reset: ${passed} assertions PASS`);
