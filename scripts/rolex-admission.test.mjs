/* Rolex Admission — requirement profile + publication gates
   (Rolex Admission Design Gate v1 · Ruling 2026-08-06)

   Run: node --experimental-strip-types scripts/rolex-admission.test.mjs

   These assertions guard the corridor's substance:
     · Rolex — and only Rolex — receives the requirement profile;
     · Tudor is never routed through Rolex-only logic;
     · the eight required views map truthfully onto the existing photo
       taxonomy (no invented categories);
     · "full set" stays supportability-gated in the derived documentation,
       the seller's own language, and the publication gates;
     · component and packaging states never publish stronger than their
       evidence;
     · the server-side verdict cannot be satisfied by an empty or partial
       admission state — Rolex cannot bypass the profile;
     · the evaluator prompt no longer hard-rejects Rolex by brand while
       Tudor's hard rejection is preserved verbatim in spirit. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  requirementProfileFor,
  missingRequiredViews,
  governDocumentation,
  fullSetSupportable,
  usesFullSetLanguage,
  unclassifiedComponents,
  replacementComponents,
  evaluateAdmissionGates,
  evaluatePublishAdmission,
  admissionBoxIncluded,
  COMPONENT_KEYS,
} from "../lib/admission/requirementProfile.ts";
import { FAIRWATCHTRADE_SYSTEM_PROMPT } from "../lib/evaluationPrompt.ts";

let pass = 0;
const ok = (name, c) => { assert.ok(c, name); pass++; };
const eq = (name, a, b) => { assert.equal(a, b, name); pass++; };

/* ── Profile lookup — Rolex only, case-insensitive, never Tudor ── */
ok("Rolex gets the profile", requirementProfileFor("Rolex") !== null);
ok("case-insensitive lookup", requirementProfileFor("  rolex ") !== null);
eq("Tudor is NOT routed through the Rolex profile", requirementProfileFor("Tudor"), null);
eq("Parmigiani takes the standard path", requirementProfileFor("Parmigiani Fleurier"), null);
eq("empty brand takes the standard path", requirementProfileFor(""), null);
eq("undefined brand takes the standard path", requirementProfileFor(undefined), null);
eq("Rolex GMT-ish freetext is not the brand", requirementProfileFor("Rolex-style homage"), null);

const profile = requirementProfileFor("Rolex");

/* ── The eight required views map onto the EXISTING photo taxonomy ── */
const EXISTING_CATEGORIES = [
  "Dial", "Caseback", "Non-Crown Side", "Crown Side", "Movement (closeup)",
  "Bracelet/Strap", "Full watch, strap/bracelet extended", "Clasp/Pin Buckle",
  "Box", "Papers/Warranty", "Other",
];
eq("exactly 8 required views", profile.requiredViews.length, 8);
for (const v of profile.requiredViews) {
  ok(`required view "${v.view}" uses a real category (${v.category})`,
    EXISTING_CATEGORIES.includes(v.category));
}
ok("Box is NOT a required view (optional, classified when included)",
  !profile.requiredViews.some((v) => v.category === "Box"));

/* ── missingRequiredViews ── */
const allCats = profile.requiredViews.map((v) => v.category);
eq("no photos → all 8 missing", missingRequiredViews(profile, []).length, 8);
eq("all views present → none missing", missingRequiredViews(profile, allCats).length, 0);
eq("one absent view is named", missingRequiredViews(profile, allCats.slice(1)).length, 1);

/* ── full-set supportability ── */
const originalBox = { packaging: "original_to_watch" };
const periodBox = { packaging: "period_appropriate" };
const FULLSET_INCLUDED = ["Box", "Papers"];
ok("original box + papers + box included → supportable",
  fullSetSupportable(originalBox, FULLSET_INCLUDED));
ok("period-appropriate box is NOT full-set supportable",
  !fullSetSupportable(periodBox, FULLSET_INCLUDED));
ok("no box included is NOT full-set supportable",
  !fullSetSupportable(originalBox, ["Papers"]));
ok("box without papers is NOT full-set supportable",
  !fullSetSupportable(originalBox, ["Box"]));
ok("warranty card counts as papers",
  fullSetSupportable(originalBox, ["Box", "Warranty Card"]));

/* ── governed documentation: never stronger than the evidence ── */
eq("Rolex Full Set degrades to Papers Only when box unproven",
  governDocumentation("Full Set", profile, periodBox, FULLSET_INCLUDED), "Papers Only");
eq("Rolex Full Set stands when the box is original to this watch",
  governDocumentation("Full Set", profile, originalBox, FULLSET_INCLUDED), "Full Set");
eq("Box Only is a physical-inclusion claim, untouched",
  governDocumentation("Box Only", profile, periodBox, ["Box"]), "Box Only");
eq("non-profile brands pass through untouched",
  governDocumentation("Full Set", null, periodBox, FULLSET_INCLUDED), "Full Set");

/* ── full-set language detection ── */
ok("detects 'full set'", usesFullSetLanguage("Comes as a full set with everything"));
ok("detects 'Full-Set'", usesFullSetLanguage("Full-Set example"));
ok("detects 'fullset'", usesFullSetLanguage("fullset!"));
ok("plain description is clean", !usesFullSetLanguage("Complete with box and papers"));
ok("null-safe", !usesFullSetLanguage(null));

/* ── component classification helpers ── */
const allOriginal = Object.fromEntries(COMPONENT_KEYS.map((k) => [k, "original"]));
eq("empty admission → all 8 unclassified", unclassifiedComponents(undefined).length, 8);
eq("all classified → none unclassified",
  unclassifiedComponents({ components: allOriginal }).length, 0);
ok("bogus representation string does not count as classified",
  unclassifiedComponents({ components: { ...allOriginal, crown: "totally-original-trust-me" } })
    .includes("crown"));
eq("replacement components are named",
  replacementComponents({ components: { ...allOriginal, crown: "service_replacement" } })[0],
  "crown");

/* ── the four publication gates ── */
const READY_INPUT = {
  admission: {
    documentationAvailable: true,
    completeWatch: true,
    components: allOriginal,
    packaging: "original_to_watch",
  },
  includedWithWatch: ["Box", "Papers"],
  documentation: "Full Set",
  description: "Honest, complete description of the watch.",
  provenanceNote: "",
  photoCategories: allCats,
};

{
  const { gates, ready } = evaluateAdmissionGates(READY_INPUT);
  ok("fully supported listing is ready", ready);
  eq("four gates render", gates.length, 4);
  ok("all four pass", gates.every((g) => g.status === "pass"));
}

{
  const { gates, ready } = evaluateAdmissionGates({
    ...READY_INPUT,
    admission: { ...READY_INPUT.admission, documentationAvailable: undefined },
  });
  ok("no documentation affirmation → not ready", !ready);
  eq("identity gate blocked", gates.find((g) => g.key === "identity").status, "blocked");
}

{
  const { gates } = evaluateAdmissionGates({
    ...READY_INPUT,
    photoCategories: allCats.filter((c) => c !== "Papers/Warranty"),
  });
  ok("papers claimed but not photographed → identity blocked",
    gates.find((g) => g.key === "identity").status === "blocked");
}

{
  const { gates, ready } = evaluateAdmissionGates({
    ...READY_INPUT,
    admission: { ...READY_INPUT.admission, components: { dial: "original" } },
  });
  ok("unclassified components → not ready", !ready);
  const g = gates.find((x) => x.key === "components");
  eq("components gate blocked", g.status, "blocked");
  ok("correction names the unclassified components", /Hands/.test(g.correction ?? ""));
}

{
  const replaced = { ...allOriginal, crown: "service_replacement" };
  const base = {
    ...READY_INPUT,
    admission: { ...READY_INPUT.admission, components: replaced },
  };
  const unconfirmed = evaluateAdmissionGates(base);
  eq("service replacement without plain statement → needs confirmation",
    unconfirmed.gates.find((g) => g.key === "components").status,
    "needs_confirmation");
  ok("needs confirmation is not ready", !unconfirmed.ready);
  const confirmed = evaluateAdmissionGates({
    ...base,
    admission: { ...base.admission, componentsStatedPlainly: true },
  });
  eq("affirmed plain statement → pass",
    confirmed.gates.find((g) => g.key === "components").status, "pass");
}

{
  const { gates, ready } = evaluateAdmissionGates({
    ...READY_INPUT,
    admission: { ...READY_INPUT.admission, completeWatch: false },
  });
  ok("head-only/project watch → not ready", !ready);
  eq("completeness gate blocked",
    gates.find((g) => g.key === "completeness").status, "blocked");
}

{
  const { gates } = evaluateAdmissionGates({
    ...READY_INPUT,
    admission: { ...READY_INPUT.admission, packaging: undefined },
    documentation: "Papers Only",
  });
  eq("included box without classification → packaging blocked",
    gates.find((g) => g.key === "packaging").status, "blocked");
}

{
  const { gates } = evaluateAdmissionGates({
    ...READY_INPUT,
    admission: { ...READY_INPUT.admission, packaging: "period_appropriate" },
    documentation: "Papers Only",
    description: "Beautiful watch, full set, worn twice.",
  });
  const g = gates.find((x) => x.key === "packaging");
  eq("unsupported 'full set' language → blocked", g.status, "blocked");
  ok("required correction names the honest classification",
    /period-appropriate/.test(g.correction ?? ""));
}

{
  const { gates } = evaluateAdmissionGates({
    ...READY_INPUT,
    admission: { ...READY_INPUT.admission, packaging: "period_appropriate" },
    documentation: "Full Set",
  });
  eq("defense in depth: an unsupportable Full Set claim in documentation blocks",
    gates.find((x) => x.key === "packaging").status, "blocked");
}

/* ── server-side verdict: Rolex cannot bypass the profile ── */
{
  const v = evaluatePublishAdmission(profile, READY_INPUT);
  ok("fully supported listing publishes", v.ok);
}
{
  const v = evaluatePublishAdmission(profile, {
    ...READY_INPUT,
    admission: undefined,
  });
  ok("empty admission state cannot publish", !v.ok);
}
{
  const v = evaluatePublishAdmission(profile, {
    ...READY_INPUT,
    photoCategories: ["Dial"],
  });
  ok("missing required views cannot publish", !v.ok);
  ok("the verdict names the missing views", /Caseback/.test(v.detail));
}

/* ── box-inclusion composition (read-time, single source of truth) ── */
ok("box included reads from the checklist", admissionBoxIncluded(["Box"]));
ok("no checklist box → no box", !admissionBoxIncluded(["Papers"]));

/* ── evaluator prompt: brand-only rejection removed, Tudor preserved ── */
ok("prompt no longer hard-rejects Rolex by brand",
  !/- Rolex \(all references, all eras\)/.test(FAIRWATCHTRADE_SYSTEM_PROMPT));
ok("prompt keeps the Tudor hard rejection",
  /- Tudor \(all references\)/.test(FAIRWATCHTRADE_SYSTEM_PROMPT));
ok("prompt carries the selective-admission section",
  /ROLEX — SELECTIVE ADMISSION/.test(FAIRWATCHTRADE_SYSTEM_PROMPT));
ok("Rolex is never normal-path approved",
  /never "approved"/.test(FAIRWATCHTRADE_SYSTEM_PROMPT));

/* ── the client corridor requires an explicitly admitting decision ── */
{
  const sellFlow = readFileSync(new URL("../components/SellFlow.tsx", import.meta.url), "utf8");
  ok("SellFlow gates profile brands on an explicitly admitting decision",
    sellFlow.includes('decision === "approved" || decision === "approved_with_guidance"'));
  ok("server route enforces the admission verdict",
    readFileSync(new URL("../app/api/listings/route.ts", import.meta.url), "utf8")
      .includes("evaluatePublishAdmission"));
}

console.log(`rolex-admission: ${pass} assertions PASS`);
