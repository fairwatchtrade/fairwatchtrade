/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — CLAIMS CORPUS CANARY (Breitling Chronomat B01 42)

   Run: node scripts/dossier-claims-canary.mjs            (dry — verdicts only)
        node scripts/dossier-claims-canary.mjs --apply    (writes production)

   ONE bounded canary, never a 388-reference sweep.

   WHY NOT THE BREGUET 5967. The build order preferred it because the repo
   carries a hash-bound approved article for it. The corpus refused: its own
   seed states that "reference 5967BB/11/9W6 is not presently in the
   canonical Vault… it creates no Vault row, no identity decision, and no
   listing binding". The corpus makes exact Vault reference identity
   MANDATORY, so the preferred canary is architecturally unbound and cannot
   carry governed claims. The identity law is the stronger law; it won.

   WHY THIS REFERENCE. UB0134101B1U1 is in the Vault, carries the live
   production Collector Dossier (listing j75878), and is the exact dossier
   the founder opened and judged. If a governed article ever replaces the
   skeleton, this is the reference where it becomes visible.

   EVIDENCE IS REAL. Every source below was retrieved during population and
   its values are quoted from the retrieved page. No URL here is
   constructed, guessed, or plausible-looking — that is precisely the trap
   the placeholder-host and prose-as-source refusals exist to catch, and a
   fabricated-but-real-looking source would slip past both.

   Admission is decided ONLY by lib/dossier/claimAdmission.ts. This file
   supplies claims; it never decides. Deliberately included:
     · one UNRESOLVED (case-material description differs between sources)
     · one UNSUPPORTED (no production-figure statement located)
     · two engineered refusals, so refusal durability is provable in
       production: a placeholder-source fact and an observation smuggling
       causality and intent.
   ════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");

for (const line of readFileSync(join(here, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const { admissionFor } = await import("../lib/dossier/claimAdmission.ts");

const REFERENCE_TEXT = "UB0134101B1U1";
const ACCESSED = "2026-08-13";

/* The two sources actually retrieved during this population pass. */
const TOPPER = (excerpt) => ({
  sourceClass: "DEALER_ARCHIVE",
  sourceName: "Topper Fine Jewelers — Breitling Chronomat B01 42 UB0134101B1U1",
  sourceUrl: "https://topperjewelers.com/products/breitling-chronomat-b01-42-ub0134101b1u1",
  sourceExcerpt: excerpt,
  sourceAccessed: ACCESSED,
});
const BETTERIDGE = (excerpt) => ({
  sourceClass: "DEALER_ARCHIVE",
  sourceName: "Betteridge — Breitling Chronomat B01 42 Stainless Steel & 18k Red Gold UB0134101B1U1",
  sourceUrl: "https://www.betteridge.com/Breitling-Chronomat-B01-42-Stainless-Steel-and.-18k-Red-Gold-Watch-UB0134101B1U1/p/17531836",
  sourceExcerpt: excerpt,
  sourceAccessed: ACCESSED,
});
/* Observation of the same retrieved material — the class that lets the
   Dossier read like writing rather than a parts list. */
const OBSERVE = (excerpt) => ({
  sourceClass: "SPECIALIST_OBSERVATION",
  sourceName: "Specialist observation of the retrieved reference documentation",
  sourceUrl: "https://topperjewelers.com/products/breitling-chronomat-b01-42-ub0134101b1u1",
  sourceExcerpt: excerpt,
  sourceAccessed: ACCESSED,
});

const CLAIMS = [
  /* ── Objective facts: measurable/specified truth about this reference ── */
  { claimKey: "B01", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "case.diameter_mm",
    statement: "The case measures 42 mm in diameter.", values: ["42 mm"],
    evidence: [TOPPER('Case Diameter: "42.00 mm"'), BETTERIDGE('Diameter: "42mm"')],
    moduleHint: "AT_A_GLANCE" },

  { claimKey: "B02", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "case.water_resistance",
    statement: "The model is specified for 200 m (660 ft) of water resistance.",
    values: ["200 m", "660 ft"],
    evidence: [TOPPER('Water Resistance: "200 m (660 ft)"'), BETTERIDGE('Water Resistance: "200 Meters"')],
    qualifier: "describes the original model specification, not the present condition of an individual watch",
    moduleHint: "AT_A_GLANCE" },

  { claimKey: "B03", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "movement.calibre",
    statement: "The movement is the self-winding Breitling Manufacture Calibre 01.",
    values: ["01"],
    evidence: [TOPPER('Movement Calibre: "Breitling 01 (Manufacture)"; Movement Type: "self-winding mechanical"')],
    moduleHint: "MOVEMENT" },

  { claimKey: "B04", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "movement.power_reserve",
    statement: "The calibre offers approximately 70 hours of power reserve.",
    values: ["70 hrs"],
    evidence: [TOPPER('Power Reserve: "approx. 70 hrs"')],
    moduleHint: "MOVEMENT" },

  { claimKey: "B05", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "movement.frequency",
    statement: "The calibre runs at 28,800 vibrations per hour.",
    values: ["28,800 v.p.h"],
    evidence: [TOPPER('Frequency/Vibrations: "28,800 v.p.h"')],
    moduleHint: "MOVEMENT" },

  { claimKey: "B06", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "movement.jewels",
    statement: "The calibre carries 47 jewels.", values: ["47 jewels"],
    evidence: [TOPPER('Jewel Count: "47 jewels"')],
    moduleHint: "MOVEMENT" },

  { claimKey: "B07", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "movement.chronograph",
    statement: "The chronograph reads to a quarter second, with 30-minute and 12-hour totalizers.",
    values: [],
    evidence: [TOPPER('Chronograph Totalizers: "1/4th second chronograph, 30-minute and 12-hour totalizers"')],
    moduleHint: "MOVEMENT" },

  { claimKey: "B08", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "dial.colour",
    statement: "The dial is grey.", values: ["Grey"],
    evidence: [TOPPER('Dial Colour: "Grey"'), BETTERIDGE('Color: "Grey"')],
    moduleHint: "DIAL" },

  { claimKey: "B09", claimClass: "OBJECTIVE_FACT", outcome: "UNRESOLVED", subject: "case.material",
    statement: "Retrieved sources describe the two-tone case material in different terms.",
    values: [],
    options: [
      { value: "Stainless steel & 18ct Rose gold", evidence: 'Topper Fine Jewelers: Case Material: "Stainless steel & 18ct Rose gold"' },
      { value: "18K Rose Gold with stainless steel", evidence: 'Betteridge: Material: "18K Rose Gold" (combined with stainless steel in bicolored configuration)' },
    ],
    evidence: [TOPPER('Case Material: "Stainless steel & 18ct Rose gold"'), BETTERIDGE('Material: "18K Rose Gold"')],
    moduleHint: "AT_A_GLANCE" },

  /* ── Contextual: history and documented description ─────────────────── */
  { claimKey: "B20", claimClass: "CONTEXTUAL_FACT", outcome: "VERIFIED", subject: "history.chronomat_line",
    statement: "The Chronomat line dates to 1984, when Breitling emphasised the mechanical chronograph against the prevailing trend.",
    values: ["1984"],
    evidence: [BETTERIDGE('the page notes heritage dating to 1984, when it "bravely going against the trend" by emphasizing mechanical chronograph design'),
               TOPPER('Chronomat B01 42 model documentation')],
    moduleHint: "HISTORY" },

  { claimKey: "B21", claimClass: "CONTEXTUAL_FACT", outcome: "VERIFIED", subject: "movement.certification",
    statement: "Retailer documentation describes the Breitling Calibre 01 in this reference as COSC certified.",
    values: [],
    evidence: [BETTERIDGE('Calibre: "Breitling 01 COSC certified calibre"'),
               TOPPER('Movement Calibre: "Breitling 01 (Manufacture)"')],
    moduleHint: "MOVEMENT" },

  { claimKey: "B22", claimClass: "CONTEXTUAL_FACT", outcome: "UNSUPPORTED", subject: "history.production_figures",
    statement: "No production-figure statement for this reference was located in the material reviewed.",
    values: [],
    evidence: [TOPPER('No production figures appear in the retrieved reference documentation.')],
    qualifier: "does not establish that no such figure exists",
    moduleHint: "SOURCES_EVIDENCE_PREPARATION" },

  /* ── Bounded observation: what is visibly there, resting on admitted facts ── */
  { claimKey: "D01", claimClass: "DESIGN_DESCRIPTION", outcome: "VERIFIED", subject: "bezel.rider_tabs",
    statement: "The bezel carries four rider tabs at the quarters, a shape the Chronomat has worn since its earliest form.",
    values: [], supports: ["B01"],
    evidence: [OBSERVE('the watch features "an iconic bezel with four rider tabs"')],
    moduleHint: "CASE_AND_BEZEL" },

  { claimKey: "D02", claimClass: "DESIGN_DESCRIPTION", outcome: "VERIFIED", subject: "dial.reading_order",
    statement: "Three sub-dials sit across a grey field, with silver-tone hands and indexes picked out in red, so the running display reads a layer above the chronograph counters.",
    values: [], supports: ["B07", "B08"],
    evidence: [OBSERVE('Features: Three sub-dials, date display, silver-tone hands and indexes with red details')],
    moduleHint: "DIAL" },

  { claimKey: "D03", claimClass: "DESIGN_DESCRIPTION", outcome: "VERIFIED", subject: "bracelet.form",
    statement: "The bicoloured Rouleaux bracelet carries the same two metals as the case, so the eye reads one continuous material story from bezel to clasp.",
    values: [], supports: ["B01"],
    evidence: [OBSERVE('Bracelet: "Bicolored" Rouleaux style')],
    moduleHint: "CASE_AND_BEZEL" },

  /* ── Engineered to REFUSE — refusal durability must be provable ──────── */
  { claimKey: "X01", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "case.lug_width",
    statement: "The lug width measures 22 mm.", values: ["22 mm"],
    evidence: [{
      sourceClass: "DEALER_ARCHIVE", sourceName: "Verified Independent Source",
      sourceUrl: "https://example.com/breitling-ub0134101b1u1",
      sourceExcerpt: "Lug width 22 mm.", sourceAccessed: ACCESSED,
    }],
    moduleHint: "AT_A_GLANCE" },

  { claimKey: "X02", claimClass: "DESIGN_DESCRIPTION", outcome: "VERIFIED", subject: "dial.intent",
    statement: "The dial was designed to read at a glance because Breitling wanted pilots to time a descent without hunting for the counters.",
    values: [], supports: ["B08"],
    evidence: [OBSERVE('Observation of the dial layout.')],
    moduleHint: "DIAL" },
];

const CLASS_ORDER = { OBJECTIVE_FACT: 0, CONTEXTUAL_FACT: 1, DESIGN_DESCRIPTION: 2 };
const ordered = [...CLAIMS].sort((a, b) => CLASS_ORDER[a.claimClass] - CLASS_ORDER[b.claimClass]);

/* ── Dry pass ───────────────────────────────────────────────────────────── */
const admittedDry = new Set();
const verdicts = [];
for (const c of ordered) {
  const v = admissionFor(c, { referenceText: REFERENCE_TEXT, admittedKeys: [...admittedDry] });
  if (v.admission === "ADMITTED") admittedDry.add(c.claimKey);
  verdicts.push({ key: c.claimKey, class: c.claimClass, outcome: c.outcome, admission: v.admission, refusals: v.refusals.join(",") });
}
console.table(verdicts);
console.log("verdict counts:", verdicts.reduce((a, v) => ({ ...a, [v.admission]: (a[v.admission] ?? 0) + 1 }), {}), "\n");

if (!APPLY) {
  console.log("dry run — pass --apply to write the canary to production");
  process.exit(0);
}

/* ── Apply ──────────────────────────────────────────────────────────────── */
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: ref } = await db
  .from("vault_references")
  .select("id, reference")
  .eq("reference", REFERENCE_TEXT)
  .maybeSingle();
if (!ref) {
  console.error(`STOP: reference ${REFERENCE_TEXT} is not in the Vault — identity must be exact.`);
  process.exit(1);
}
console.log(`exact reference resolved: ${ref.reference} -> ${ref.id}`);

const admitted = new Set();
for (const c of ordered) {
  const v = admissionFor(c, { referenceText: ref.reference, admittedKeys: [...admitted] });
  const { data: prior } = await db
    .from("collector_dossier_claims")
    .select("id")
    .eq("vault_reference_id", ref.id)
    .eq("claim_key", c.claimKey)
    .eq("lifecycle", "current")
    .maybeSingle();
  if (prior) {
    await db.from("collector_dossier_claims").update({ lifecycle: "retired" }).eq("id", prior.id);
  }
  const { error } = await db.from("collector_dossier_claims").insert({
    vault_reference_id: ref.id,
    claim_key: c.claimKey, claim_class: c.claimClass, outcome: c.outcome,
    admission: v.admission, refusals: v.refusals,
    subject: c.subject, statement: c.statement, values: c.values,
    qualifier: c.qualifier ?? null, options: c.options ?? [], evidence: c.evidence,
    supports: c.supports ?? [], module_hint: c.moduleHint ?? null,
    provenance: "MACHINE_RESEARCH", lifecycle: "current",
    supersedes_id: prior?.id ?? null,
  });
  if (error) {
    console.error(`STOP: ${c.claimKey} — ${error.message}`);
    process.exit(1);
  }
  if (v.admission === "ADMITTED") admitted.add(c.claimKey);
}

const { data: hash } = await db.rpc("collector_dossier_claim_set_hash", { p_reference_id: ref.id });
console.log(`\npersisted. claim-set hash: ${hash}`);
