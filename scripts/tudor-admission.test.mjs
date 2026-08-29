/* Tudor Admission Corridor — reference authority + profile + gates
   (Dormant Phase B · 2026-08-29)

   Run: node scripts/tudor-admission.test.mjs

   The law under test: SELECT REFERENCES DELIBERATELY, THEN JUDGE THE WATCH
   HONESTLY. Selectivity lives at the reference-admission level, read from
   `vault_references.metadata.fwt_admission` and NOWHERE else; the profile,
   evidence corridor and gates then judge the individual watch and never
   re-litigate commonness, liquidity, scarcity or collector merit.

   Equally under test: the corridor is DORMANT by construction. A brand-only
   lookup for Tudor is null; an unadmitted, unresolved, missing or malformed
   reference is null; and every malformation of the authored metadata
   contract fails CLOSED to not-admitted. And Rolex is untouched — the same
   profile object, the same stop copy, the same documentation branch. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseTudorAdmission,
  isTudorBrand,
  TUDOR_NOT_ADMITTED,
} from "../lib/admission/tudorReference.ts";
import {
  requirementProfileFor,
  tudorProfileFor,
  evaluateAdmissionGates,
  evaluatePublishAdmission,
  missingRequiredViews,
  ADMISSION_STOPS,
  TUDOR_ADMISSION_STOPS,
  TUDOR_REFERENCE_NOT_ADMITTED,
  COMPONENT_KEYS,
} from "../lib/admission/requirementProfile.ts";

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
}
function eq(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  passed += 1;
}

const REF_ID = "00000000-0000-4000-8000-000000000001";

/* 79090 is the architecture/test reference for Track 2 — the real reference
   the enhanced corridor was designed against. A fixture, never production
   data: nothing here writes anywhere. */
const ENHANCED_META = {
  fwt_admission: {
    status: "admitted",
    documentation_policy: "enhanced_evidence_allowed",
    identity_evidence: {
      required_identifiers: [
        { key: "reference_marking", label: "Reference marking", photo_required: true },
        { key: "serial_marking", label: "Serial marking", photo_required: true },
      ],
    },
  },
};
const ORIGINAL_META = {
  fwt_admission: { status: "admitted", documentation_policy: "original_required" },
};

/* ── A · the metadata contract, fail-closed in every direction ── */
{
  const adm = parseTudorAdmission(ORIGINAL_META, REF_ID);
  ok("original_required admits", adm.admitted === true);
  eq("policy carried", adm.admitted && adm.documentationPolicy, "original_required");
  const enh = parseTudorAdmission(ENHANCED_META, REF_ID);
  ok("enhanced_evidence_allowed admits", enh.admitted === true);
  eq(
    "identifier requirements carried, snake→camel, in order",
    enh.admitted && enh.identityEvidence,
    [
      { key: "reference_marking", label: "Reference marking", photoRequired: true },
      { key: "serial_marking", label: "Serial marking", photoRequired: true },
    ]
  );

  eq("null metadata → not admitted", parseTudorAdmission(null, REF_ID), TUDOR_NOT_ADMITTED);
  eq("empty object → not admitted", parseTudorAdmission({}, REF_ID), TUDOR_NOT_ADMITTED);
  eq(
    "unknown status fails closed",
    parseTudorAdmission({ fwt_admission: { ...ORIGINAL_META.fwt_admission, status: "pending" } }, REF_ID),
    TUDOR_NOT_ADMITTED
  );
  eq(
    "unknown documentation_policy fails closed",
    parseTudorAdmission({ fwt_admission: { status: "admitted", documentation_policy: "papers_optional" } }, REF_ID),
    TUDOR_NOT_ADMITTED
  );
  eq(
    "enhanced policy WITHOUT identifiers is an invalid admission, not a lenient one",
    parseTudorAdmission({ fwt_admission: { status: "admitted", documentation_policy: "enhanced_evidence_allowed" } }, REF_ID),
    TUDOR_NOT_ADMITTED
  );
  eq(
    "identifier with empty label fails closed",
    parseTudorAdmission(
      { fwt_admission: { ...ENHANCED_META.fwt_admission, identity_evidence: { required_identifiers: [{ key: "x", label: " ", photo_required: true }] } } },
      REF_ID
    ),
    TUDOR_NOT_ADMITTED
  );
  eq(
    "non-boolean photo_required fails closed",
    parseTudorAdmission(
      { fwt_admission: { ...ENHANCED_META.fwt_admission, identity_evidence: { required_identifiers: [{ key: "x", label: "X", photo_required: "yes" }] } } },
      REF_ID
    ),
    TUDOR_NOT_ADMITTED
  );
  eq("missing reference id → not admitted", parseTudorAdmission(ORIGINAL_META, ""), TUDOR_NOT_ADMITTED);
}

/* ── B · dispatch: dormant by construction, Rolex untouched ── */
{
  eq("brand-only Tudor lookup is null — the dormant state", requirementProfileFor("Tudor"), null);
  eq("Tudor with a not-admitted answer is null", requirementProfileFor("Tudor", TUDOR_NOT_ADMITTED), null);
  eq("Tudor with null answer is null", requirementProfileFor("Tudor", null), null);
  const admitted = parseTudorAdmission(ORIGINAL_META, REF_ID);
  const p = requirementProfileFor("Tudor", admitted);
  ok("Tudor with an ADMITTED reference receives a profile", p !== null && p.brand === "Tudor");
  ok(
    "Rolex is the SAME object with or without a second argument",
    requirementProfileFor("Rolex") === requirementProfileFor("Rolex", admitted)
  );
  eq("ordinary brands stay null regardless", requirementProfileFor("Parmigiani Fleurier", admitted), null);
  ok("isTudorBrand uses the dispatcher's equality", isTudorBrand("  tudor ") && !isTudorBrand("Rolex"));
}

/* ── C · the derived Tudor profile ── */
const P_ORIG = tudorProfileFor(parseTudorAdmission(ORIGINAL_META, REF_ID));
const P_ENH = tudorProfileFor(parseTudorAdmission(ENHANCED_META, REF_ID));
{
  ok("original_required requires the Papers/Warranty view",
    P_ORIG.requiredViews.some((v) => v.category === "Papers/Warranty"));
  ok("enhanced profile does NOT precondition the papers view",
    !P_ENH.requiredViews.some((v) => v.category === "Papers/Warranty"));
  ok("both profiles require the marking-bearing evidence views",
    ["Caseback", "Crown Side", "Non-Crown Side"].every(
      (c) => P_ENH.requiredViews.some((v) => v.category === c) &&
             P_ORIG.requiredViews.some((v) => v.category === c)));
  const docCond = (p) => p.entryConditions.find((c) => c.key === "documentationAvailable");
  ok("original_required documentation condition STOPS on No",
    docCond(P_ORIG).stopsWhenFalse === undefined);
  eq("enhanced documentation condition ROUTES on No, never stops",
    docCond(P_ENH).stopsWhenFalse, false);
  ok("both keep the complete-watch condition, stopping",
    [P_ORIG, P_ENH].every((p) => {
      const c = p.entryConditions.find((x) => x.key === "completeWatch");
      return c && c.stopsWhenFalse === undefined && c.stop === TUDOR_ADMISSION_STOPS.incompleteWatch;
    }));
  ok("tudorProfileFor of a refusal is null", tudorProfileFor(TUDOR_NOT_ADMITTED) === null);
}

/* ── D · gates: Track 1, Track 2, and the preserved Rolex/default branch ── */
const allOriginal = Object.fromEntries(COMPONENT_KEYS.map((k) => [k, "original"]));
const BASE = {
  includedWithWatch: [],
  documentation: undefined,
  description: "Honest, complete description of the watch.",
  provenanceNote: "",
  photoCategories: ["Dial", "Caseback", "Crown Side", "Non-Crown Side", "Bracelet/Strap", "Clasp/Pin Buckle"],
};
const identityGate = (r) => r.gates.find((g) => g.key === "identity");

{
  // Track 1 — original_required without papers: blocked with TUDOR copy
  const r = evaluateAdmissionGates(P_ORIG, {
    ...BASE,
    admission: { documentationAvailable: false, completeWatch: true, components: allOriginal },
  });
  eq("Tudor original_required without papers is blocked", identityGate(r).status, "blocked");
  eq("…with Tudor's own stop copy", identityGate(r).detail, TUDOR_ADMISSION_STOPS.documentationUnavailable);
  ok("…which never mentions Rolex", !/rolex/i.test(identityGate(r).detail));
}
{
  // Track 1 — papers present and photographed: proceeds
  const r = evaluateAdmissionGates(P_ORIG, {
    ...BASE,
    includedWithWatch: ["Papers"],
    photoCategories: [...BASE.photoCategories, "Papers/Warranty"],
    admission: { documentationAvailable: true, completeWatch: true, components: allOriginal },
  });
  eq("Tudor original_required with papers passes identity", identityGate(r).status, "pass");
  ok("…and the whole gate set is ready", r.ready);
}
{
  // Track 1 on an ENHANCED reference — papers exist, so the normal gate governs
  const r = evaluateAdmissionGates(P_ENH, {
    ...BASE,
    admission: { documentationAvailable: true, completeWatch: true, components: allOriginal },
  });
  eq("enhanced reference WITH papers takes the normal documentation gate — itemization required",
    identityGate(r).status, "blocked");
}
{
  // Track 2 — papers absent, evidence incomplete: blocked, naming what's missing
  const r = evaluateAdmissionGates(P_ENH, {
    ...BASE,
    admission: {
      documentationAvailable: false, completeWatch: true, components: allOriginal,
      enhancedIdentityEvidence: { reference_marking: "79090" },
    },
  });
  eq("Track 2 with a missing identifier is blocked", identityGate(r).status, "blocked");
  ok("…and names the missing marking", identityGate(r).detail.includes("Serial marking"));
  ok("…without pretending it is a papers failure", !identityGate(r).detail.includes("original identity-bearing documentation"));
}
{
  // Track 2 — complete: identity passes, whole set ready
  const r = evaluateAdmissionGates(P_ENH, {
    ...BASE,
    admission: {
      documentationAvailable: false, completeWatch: true, components: allOriginal,
      enhancedIdentityEvidence: { reference_marking: "79090", serial_marking: "123456" },
    },
  });
  eq("Track 2 with complete identity evidence passes", identityGate(r).status, "pass");
  ok("…and is ready end to end", r.ready);
  // and completeness remains its own unwaived gate
  const inc = evaluateAdmissionGates(P_ENH, {
    ...BASE,
    admission: {
      documentationAvailable: false, completeWatch: false, components: allOriginal,
      enhancedIdentityEvidence: { reference_marking: "79090", serial_marking: "123456" },
    },
  });
  ok("Track 2 never waives the complete-watch gate",
    inc.gates.find((g) => g.key === "completeness").status === "blocked" && !inc.ready);
}
{
  // Rolex/default preservation — the exact existing branch, the exact copy
  const rolex = requirementProfileFor("Rolex");
  const blockedRolex = evaluateAdmissionGates(rolex, { ...BASE, admission: { completeWatch: true, components: allOriginal } });
  eq("Rolex without papers keeps the EXACT Rolex stop copy",
    identityGate(blockedRolex).detail, ADMISSION_STOPS.documentationUnavailable);
  const blockedNull = evaluateAdmissionGates(null, { ...BASE, admission: { completeWatch: true, components: allOriginal } });
  eq("a null profile takes the identical default branch",
    identityGate(blockedNull).detail, ADMISSION_STOPS.documentationUnavailable);
}

/* ── E · server verdict: an incomplete admitted Tudor is REFUSED ── */
{
  const verdict = evaluatePublishAdmission(P_ENH, {
    ...BASE,
    admission: {
      documentationAvailable: false, completeWatch: false, components: allOriginal,
      enhancedIdentityEvidence: { reference_marking: "79090", serial_marking: "123456" },
    },
  });
  ok("incomplete admitted Tudor fails the publish verdict", verdict.ok === false);
  ok("…for completeness, in Tudor's words",
    verdict.ok === false && verdict.detail.includes(TUDOR_ADMISSION_STOPS.incompleteWatch));
  ok("missing required views refuse with the Tudor brand named",
    (() => { const v = evaluatePublishAdmission(P_ORIG, { ...BASE, photoCategories: [] , admission: {} }); return v.ok === false && v.detail.startsWith("Tudor listings require"); })());
  eq("the enhanced profile's views are all real photo categories",
    missingRequiredViews(P_ENH, BASE.photoCategories).length, 0);
}

/* ── F · copy law: the reference-policy stop, and no lectures ── */
{
  ok("the not-admitted stop is reference-level and non-evidential",
    TUDOR_REFERENCE_NOT_ADMITTED.includes("not currently admitted") &&
      TUDOR_REFERENCE_NOT_ADMITTED.includes("selected Tudor references rather than the brand generally"));
  const allCopy = JSON.stringify({ TUDOR_ADMISSION_STOPS, TUDOR_REFERENCE_NOT_ADMITTED, a: P_ORIG.activationNote, b: P_ENH.activationNote, c: P_ENH.photosNote });
  ok("Tudor copy never lectures about merit, commonness, liquidity or composition",
    !/(collector merit|too common|liquidity|mass|high horology|volume)/i.test(allCopy));
  ok("Tudor copy never instructs opening a case",
    /Never open a case/.test(P_ENH.photosNote));
}

/* ── G · the preserved branch, mechanically ── */
{
  const src = readFileSync(new URL("../lib/admission/requirementProfile.ts", import.meta.url), "utf8");
  ok("the pre-existing documentation chain survives verbatim as the default branch",
    src.includes('} else if (admission?.documentationAvailable !== true) {') &&
      src.includes("} else if (!papersItemized(includedWithWatch)) {") &&
      src.includes("} else if (!papersPhotographed) {"));
  ok("the Track 2 turn is guarded on the reference's policy AND absent papers",
    /enhancedEvidenceActive =\s*\r?\n\s*profile\?\.documentationPolicy === "enhanced_evidence_allowed" &&\s*\r?\n\s*admission\?\.documentationAvailable !== true;/.test(src));
}

/* ── H · server wiring: the gate is a real refusal, not copy ── */
{
  const route = readFileSync(new URL("../app/api/listings/route.ts", import.meta.url), "utf8");
  ok("the listings POST re-resolves Tudor admission server-side",
    route.includes("resolveTudorReferenceAdmission({"));
  ok("a non-admitted Tudor reference is refused with HTTP 400 and the reference-policy stop",
    /reference_not_admitted[\s\S]{0,200}TUDOR_REFERENCE_NOT_ADMITTED[\s\S]{0,200}status: 400/.test(route));
  ok("the Rolex Style grammar is guarded to Rolex and never touches Tudor",
    /admissionProfile\.brand === "Rolex"[\s\S]{0,120}classifyRolexIdentifier\(body\.reference\)/.test(route));
  ok("the retry pre-check still precedes the admission gate — a retry resumes, never re-gates",
    route.indexOf("idempotency pre-check") < route.indexOf("await resolveTudorReferenceAdmission"));
  const cr = readFileSync(new URL("../app/api/canonical-reference/route.ts", import.meta.url), "utf8");
  ok("the canonical-reference route derives the Tudor summary for the client corridor",
    cr.includes("tudorAdmission") && cr.includes("parseTudorAdmission("));
}

console.log(`tudor-admission: ${passed} assertions PASS`);
