/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — DOMAIN KNOWLEDGE CANARY (Breitling)

   Run: node scripts/dossier-domain-canary.mjs            (dry)
        node scripts/dossier-domain-canary.mjs --apply    (writes production)

   Two honest moves, both through the closed retrieval trust chain:

   1 · REBIND THE LEGACY EXACT-REFERENCE CLAIMS. The stored topperjewelers
       and betteridge retrievals already carry Calibre 01, the chronograph
       registers, COSC, the Rouleaux bracelet and the sub-dial layout — so
       B03, B07, B21, D02 and D03 stop being honest-but-unbound legacy and
       become RETRIEVAL_BOUND, with excerpts lifted from the retrieved
       text itself. Statements and qualifiers are preserved byte-for-byte
       from the current rows (the claim-set hash does not move).

   2 · BUILD THE FIRST GOVERNED DOMAIN SHELF. Six reference-independent
       knowledge units — beat rate, jewels, power reserve, rider-tab
       origin, Chronomat line origin, COSC certification — each retrieved
       live from its real source (manufacturer, specialist technical, the
       certifying body itself), bound to the retrieved text, and admitted
       through the class-specific contracts. Applicability rules join each
       unit to the exact reference's own claims; nothing is admitted "from
       memory".

   Writes nothing public. The shelf existing changes no behavior until a
   composition attempt consumes the applicable intersection.
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

const { retrieveSource } = await import("../lib/dossier/sourceRetrieval.ts");
const { admissionFor, evidenceBindingRefusals, normalizeForComparison } =
  await import("../lib/dossier/claimAdmission.ts");
const { domainAdmissionFor } = await import("../lib/dossier/domainKnowledge.ts");
const { createClient } = await import("@supabase/supabase-js");

const REFERENCE_ID = "aa71f4a5-1a5e-4488-b4b2-5f3206c9a411";
const REFERENCE_TEXT = "UB0134101B1U1";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function excerptAround(text, anchor, span = 110) {
  const hay = normalizeForComparison(text);
  const i = hay.toLowerCase().indexOf(normalizeForComparison(anchor).toLowerCase());
  if (i < 0) return null;
  return hay.slice(Math.max(0, i - 15), Math.min(hay.length, i + span)).trim();
}

/* ── 1 · Retrieve the domain sources ───────────────────────────────────── */
const SOURCES = {
  breitling: "https://www.breitling.com/us-en/about/icons/chronomat/",
  monochrome: "https://monochrome-watches.com/technical-perspective-jewel-bearings-watch-movement-rubies/",
  rotate: "https://rotatewatches.com/blogs/blog/how-movement-beat-rates-affect-accuracy-and-power",
  coscFaq: "https://www.cosc.swiss/cosc-faq",
  coscCertified: "https://www.cosc.swiss/certified-chronometer",
};

console.log("── DOMAIN SOURCE RETRIEVAL ────────────────────────────────");
const retrieved = {};
for (const [name, url] of Object.entries(SOURCES)) {
  const r = await retrieveSource(url);
  retrieved[name] = r;
  console.log(r.ok
    ? `  OK      ${name}: HTTP ${r.httpStatus}, ${r.text.length} chars, sha ${r.contentSha256.slice(0, 12)}…`
    : `  REFUSED ${name}: ${r.failure} — ${r.detail}`);
  if (!r.ok) {
    console.error(`STOP: domain source ${name} could not be retrieved; refusing to fabricate around it.`);
    process.exit(1);
  }
}

/* ── 2 · Existing exact-reference retrievals (for the legacy rebinds) ──── */
const { data: storedRows, error: storedError } = await db
  .from("collector_dossier_source_retrievals")
  .select("id, requested_url, host, http_status, content_sha256, evidence_text")
  .in("host", ["topperjewelers.com", "betteridge.com"])
  .eq("lifecycle", "current");
if (storedError || !storedRows || storedRows.length < 2) {
  console.error("STOP: the stored exact-reference retrievals are missing.");
  process.exit(1);
}
const topper = storedRows.find((r) => r.host === "topperjewelers.com");
const betteridge = storedRows.find((r) => r.host === "betteridge.com");

const asBindable = (row) => ({
  id: row.id,
  requestedUrl: row.requested_url,
  resolvedUrl: null,
  host: row.host,
  httpStatus: row.http_status,
  contentSha256: row.content_sha256,
  text: row.evidence_text,
  lifecycle: "current",
});
const storedRetrievals = [asBindable(topper), asBindable(betteridge)];

const src = (row, sourceClass, sourceName, anchor) => {
  const excerpt = excerptAround(row.evidence_text, anchor);
  if (!excerpt) throw new Error(`anchor not found in ${row.host}: ${anchor}`);
  return {
    sourceClass,
    sourceName,
    sourceUrl: row.requested_url,
    sourceExcerpt: excerpt,
    sourceAccessed: new Date().toISOString().slice(0, 10),
    retrievalId: row.id,
    retrievalSha256: row.content_sha256,
  };
};
const TOPPER_NAME = "Topper Fine Jewelers — Breitling Chronomat B01 42 UB0134101B1U1";
const BETT_NAME = "Betteridge — Breitling Chronomat B01 42 UB0134101B1U1";

/* Evidence swaps for the legacy claims — statements/qualifiers are reused
   from the CURRENT rows, untouched. */
const REBIND_EVIDENCE = {
  B03: [src(topper, "DEALER_ARCHIVE", TOPPER_NAME, "Caliber 01")],
  B07: [src(topper, "DEALER_ARCHIVE", TOPPER_NAME, "1/4th")],
  B21: [
    src(topper, "DEALER_ARCHIVE", TOPPER_NAME, "COSC-certified"),
    src(betteridge, "DEALER_ARCHIVE", BETT_NAME, "COSC certified"),
  ],
  D02: [src(betteridge, "SPECIALIST_OBSERVATION", "Observation of retrieved reference documentation", "sub-dial")],
  D03: [
    src(topper, "SPECIALIST_OBSERVATION", "Observation of retrieved reference documentation", "Rouleaux"),
    src(betteridge, "SPECIALIST_OBSERVATION", "Observation of retrieved reference documentation", "Rouleaux"),
  ],
};
/* Class ordering: evidence-backed classes first so D02/D03 can rest on
   freshly-rebound supports. */
const REBIND_ORDER = ["B03", "B07", "B21", "D02", "D03"];

const { data: currentRows } = await db
  .from("collector_dossier_claims")
  .select("*")
  .eq("vault_reference_id", REFERENCE_ID)
  .eq("lifecycle", "current");
const byKey = new Map((currentRows ?? []).map((r) => [r.claim_key, r]));
const admittedKeys = new Set(
  (currentRows ?? []).filter((r) => r.admission === "ADMITTED").map((r) => r.claim_key)
);

console.log("\n── LEGACY CLAIM REBINDS ───────────────────────────────────");
const rebinds = [];
for (const key of REBIND_ORDER) {
  const row = byKey.get(key);
  if (!row) throw new Error(`current row for ${key} not found`);
  const claim = {
    claimKey: row.claim_key,
    claimClass: row.claim_class,
    outcome: row.outcome,
    subject: row.subject,
    statement: row.statement,
    values: Array.isArray(row.values) ? row.values : [],
    qualifier: row.qualifier,
    options: Array.isArray(row.options) ? row.options : [],
    evidence: REBIND_EVIDENCE[key],
    supports: row.supports ?? [],
    moduleHint: row.module_hint,
  };
  const ctx = {
    referenceText: REFERENCE_TEXT,
    admittedKeys: [...admittedKeys],
    retrievals: storedRetrievals,
  };
  const binding = evidenceBindingRefusals(claim, ctx);
  const verdict = admissionFor(claim, ctx);
  if (verdict.admission === "ADMITTED") admittedKeys.add(key);
  const bound = binding.length === 0 ? "RETRIEVAL_BOUND" : "UNBOUND";
  console.log(`  ${key}: ${verdict.admission} · ${bound}${verdict.refusals.length ? ` · ${verdict.refusals.join(",")}` : ""}`);
  rebinds.push({ key, row, claim, verdict, bound });
}

/* ── 3 · The domain shelf units ────────────────────────────────────────── */
const R = retrieved;
const dsrc = (r, sourceClass, sourceName, anchor) => {
  const excerpt = excerptAround(r.text, anchor);
  if (!excerpt) throw new Error(`anchor not found in ${r.host}: ${anchor}`);
  return {
    sourceClass,
    sourceName,
    sourceUrl: r.requestedUrl,
    sourceExcerpt: excerpt,
    sourceAccessed: r.retrievedAt.slice(0, 10),
    retrievalId: null, // filled after persistence; dry run binds by handle
    retrievalSha256: r.contentSha256,
    __handle: r,
  };
};

const UNITS = [
  {
    knowledgeKey: "beat_rate_28800",
    knowledgeClass: "GENERAL_HOROLOGY",
    conceptKey: "beat_rate",
    outcome: "VERIFIED",
    statement:
      "A movement running at 28,800 vibrations per hour beats eight times each second, so the seconds hand advances in steps too small for the eye to separate and its motion reads as a near-continuous sweep; the finer division of each second also helps the movement average out small timing disturbances.",
    values: ["28,800"],
    qualifier: null,
    evidence: [dsrc(R.rotate, "SPECIALIST_TECHNICAL", "Rotate Watches — How movement beat rates affect accuracy and power", "28,800")],
    applicability: [{ kind: "value_match", anyOf: ["28,800"] }],
  },
  {
    knowledgeKey: "movement_jewels",
    knowledgeClass: "GENERAL_HOROLOGY",
    conceptKey: "jewel_bearings",
    outcome: "VERIFIED",
    statement:
      "The jewels in a mechanical movement are synthetic rubies set as bearings at the points where wheels and pinions rotate: the hard, polished stone gives steel pivots a low-friction surface, so the gear train turns freely and wears far more slowly than metal running on metal. The movements of complicated watches tend to require more jewels, so a higher count generally reflects more mechanical work being carried on bearings.",
    values: [],
    qualifier: null,
    evidence: [
      dsrc(R.monochrome, "SPECIALIST_TECHNICAL", "Monochrome Watches — Jewel bearings in a watch movement", "friction"),
      dsrc(R.monochrome, "SPECIALIST_TECHNICAL", "Monochrome Watches — Jewel bearings in a watch movement", "complicated watches tend to require more"),
    ],
    applicability: [{ kind: "subject_match", subjects: ["movement.jewels"] }],
  },
  {
    knowledgeKey: "power_reserve_meaning",
    knowledgeClass: "GENERAL_HOROLOGY",
    conceptKey: "power_reserve",
    outcome: "VERIFIED",
    statement:
      "Power reserve is how long a fully wound movement keeps running once it leaves the wrist, and it is in tension with beat rate: a faster beat draws more energy from the mainspring, so a long reserve at a high frequency means the barrel and gearing are doing genuinely more work.",
    values: [],
    qualifier: null,
    evidence: [dsrc(R.rotate, "SPECIALIST_TECHNICAL", "Rotate Watches — How movement beat rates affect accuracy and power", "power reserve")],
    applicability: [{ kind: "subject_match", subjects: ["movement.power_reserve"] }],
  },
  {
    knowledgeKey: "rider_tabs_origin",
    knowledgeClass: "FEATURE_DESIGN_HISTORY",
    conceptKey: "rider_tabs",
    outcome: "VERIFIED",
    statement:
      "Breitling's rider tabs date to the 1984 Chronomat, developed with the Frecce Tricolori jet squadron: four raised tabs on the rotating bezel that protected the crystal and gave pilots a grip they could find and turn with flight gloves on.",
    values: ["1984"],
    qualifier: null,
    evidence: [dsrc(R.breitling, "MANUFACTURER_SPEC", "Breitling — The Chronomat, brand icons archive", "rider tab")],
    applicability: [{ kind: "statement_term", terms: ["rider tab"] }],
  },
  {
    knowledgeKey: "chronomat_line_origin",
    knowledgeClass: "LINE_BRAND_CONTEXT",
    conceptKey: "chronomat_line",
    outcome: "VERIFIED",
    statement:
      "The Chronomat launched in 1984, Breitling's centenary year, out of work with the Frecce Tricolori aerobatic squadron, and the line has carried its rotating bezel identity through its later generations.",
    values: ["1984"],
    qualifier: null,
    evidence: [dsrc(R.breitling, "MANUFACTURER_SPEC", "Breitling — The Chronomat, brand icons archive", "1984")],
    applicability: [
      { kind: "line_identity", line: "Chronomat" },
      { kind: "value_match", anyOf: ["1984"] },
    ],
  },
  {
    knowledgeKey: "cosc_certification",
    knowledgeClass: "CERTIFICATION_STANDARD_CONTEXT",
    conceptKey: "cosc",
    outcome: "VERIFIED",
    statement:
      "COSC, the Swiss official chronometer testing institute, certifies individual movements rather than finished watches: each movement is tested over roughly two weeks in several positions and at different temperatures, and only a movement holding its daily rate inside a narrow tolerance earns the chronometer title.",
    values: [],
    qualifier: null,
    evidence: [
      dsrc(R.coscFaq, "SPECIALIST_TECHNICAL", "COSC — Official FAQ", "chronometer"),
      dsrc(R.coscCertified, "SPECIALIST_TECHNICAL", "COSC — Certified chronometer", "chronometer"),
    ],
    applicability: [{ kind: "statement_term", terms: ["cosc"] }],
  },
];

console.log("\n── DOMAIN UNIT VERDICTS (dry, bound by handle) ────────────");
const dryRetrievals = Object.values(R).map((r, i) => ({
  id: `h${i}`,
  requestedUrl: r.requestedUrl,
  resolvedUrl: r.resolvedUrl,
  host: r.host,
  httpStatus: r.httpStatus,
  contentSha256: r.contentSha256,
  text: r.text,
  lifecycle: "current",
}));
const handleId = new Map(Object.values(R).map((r, i) => [r, `h${i}`]));

for (const unit of UNITS) {
  const evidence = unit.evidence.map((e) => ({ ...e, retrievalId: handleId.get(e.__handle) }));
  const verdict = domainAdmissionFor({ ...unit, evidence }, { retrievals: dryRetrievals });
  console.log(`  ${unit.knowledgeKey} [${unit.knowledgeClass}]: ${verdict.admission}${verdict.refusals.length ? ` · ${verdict.refusals.join(",")}` : ""}`);
}

if (!APPLY) {
  console.log("\ndry run — pass --apply to persist rebinds, retrievals and the shelf");
  process.exit(0);
}

/* ── 4 · Persist ───────────────────────────────────────────────────────── */
async function persistRetrieval(r) {
  const { data: prior } = await db
    .from("collector_dossier_source_retrievals")
    .select("id, content_sha256")
    .eq("requested_url", r.requestedUrl)
    .eq("lifecycle", "current")
    .maybeSingle();
  if (prior && prior.content_sha256 === r.contentSha256) return prior.id;
  if (prior) {
    await db.from("collector_dossier_source_retrievals").update({ lifecycle: "superseded" }).eq("id", prior.id);
  }
  const { data, error } = await db.from("collector_dossier_source_retrievals").insert({
    requested_url: r.requestedUrl, resolved_url: r.resolvedUrl, host: r.host,
    http_status: r.httpStatus, content_type: r.contentType, source_title: r.sourceTitle,
    evidence_text: r.text, content_sha256: r.contentSha256, content_bytes: r.contentBytes,
    retrieved_at: r.retrievedAt, source_accessed: r.retrievedAt.slice(0, 10),
    provenance: "SERVER_FETCH", lifecycle: "current", supersedes_id: prior?.id ?? null,
  }).select("id").single();
  if (error) throw new Error(`retrieval persist failed: ${error.message}`);
  return data.id;
}

const persistedIds = new Map();
for (const r of Object.values(R)) persistedIds.set(r, await persistRetrieval(r));
console.log(`\nretrievals persisted: ${[...persistedIds.values()].map((id) => id.slice(0, 8)).join(", ")}`);

const realRetrievals = Object.values(R).map((r) => ({
  id: persistedIds.get(r),
  requestedUrl: r.requestedUrl, resolvedUrl: r.resolvedUrl, host: r.host,
  httpStatus: r.httpStatus, contentSha256: r.contentSha256, text: r.text, lifecycle: "current",
}));

// Legacy rebinds: retire + insert with the same governed content, new evidence.
for (const { key, row, claim, verdict, bound } of rebinds) {
  await db.from("collector_dossier_claims").update({ lifecycle: "retired" }).eq("id", row.id);
  const { error } = await db.from("collector_dossier_claims").insert({
    vault_reference_id: REFERENCE_ID,
    claim_key: claim.claimKey, claim_class: claim.claimClass, outcome: claim.outcome,
    admission: verdict.admission, refusals: verdict.refusals,
    subject: claim.subject, statement: claim.statement, values: claim.values,
    qualifier: claim.qualifier, options: claim.options, evidence: claim.evidence,
    supports: claim.supports, module_hint: claim.moduleHint,
    provenance: "MACHINE_RESEARCH", lifecycle: "current", supersedes_id: row.id,
    evidence_binding: bound,
  });
  if (error) throw new Error(`${key} rebind failed: ${error.message}`);
  console.log(`rebound ${key}: ${verdict.admission} · ${bound}`);
}

// Domain shelf.
for (const unit of UNITS) {
  const evidence = unit.evidence.map(({ __handle, ...e }) => ({
    ...e,
    retrievalId: persistedIds.get(__handle),
  }));
  const verdict = domainAdmissionFor({ ...unit, evidence }, { retrievals: realRetrievals });
  const binding = verdict.admission === "ADMITTED" ? "RETRIEVAL_BOUND" : "UNBOUND";

  const { data: prior } = await db
    .from("collector_dossier_domain_knowledge")
    .select("id")
    .eq("knowledge_key", unit.knowledgeKey)
    .eq("lifecycle", "current")
    .maybeSingle();
  if (prior) {
    await db.from("collector_dossier_domain_knowledge").update({ lifecycle: "retired" }).eq("id", prior.id);
  }
  const { error } = await db.from("collector_dossier_domain_knowledge").insert({
    knowledge_key: unit.knowledgeKey,
    knowledge_class: unit.knowledgeClass,
    concept_key: unit.conceptKey,
    outcome: unit.outcome,
    admission: verdict.admission,
    refusals: verdict.refusals,
    statement: unit.statement,
    values: unit.values,
    qualifier: unit.qualifier,
    applicability: unit.applicability,
    evidence,
    evidence_binding: binding,
    provenance: "MACHINE_RESEARCH",
    lifecycle: "current",
    supersedes_id: prior?.id ?? null,
  });
  if (error) throw new Error(`${unit.knowledgeKey} persist failed: ${error.message}`);
  console.log(`shelf ${unit.knowledgeKey}: ${verdict.admission} · ${binding}`);
}

const { data: hash } = await db.rpc("collector_dossier_claim_set_hash", { p_reference_id: REFERENCE_ID });
console.log(`\nclaim-set hash after rebinds: ${hash}`);
