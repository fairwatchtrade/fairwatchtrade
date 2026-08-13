/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — RETRIEVAL-BOUND EVIDENCE CANARY (Breitling)

   Run: node scripts/dossier-retrieval-canary.mjs            (dry)
        node scripts/dossier-retrieval-canary.mjs --apply    (writes production)

   Retrieves the two real Breitling sources, persists the retrieval records,
   rebinds the canary claims to material drawn FROM the retrieved text, and
   proves the three refusals that matter:

     · a fabricated but plausible URL cannot become governed evidence;
     · a fabricated excerpt absent from the retrieved page is refused;
     · a claimed value the retrieved material does not support is refused.

   HONEST PROVENANCE. Claims are only marked RETRIEVAL_BOUND when their
   excerpts are lifted from the retrieved text and their values are found in
   it. Anything that cannot be re-proven keeps its honest UNBOUND legacy
   state rather than being retroactively dressed as retrieval-bound.
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

const REFERENCE_ID = "aa71f4a5-1a5e-4488-b4b2-5f3206c9a411";
const REFERENCE_TEXT = "UB0134101B1U1";
const TOPPER_URL = "https://topperjewelers.com/products/breitling-chronomat-b01-42-ub0134101b1u1";
const BETTERIDGE_URL = "https://www.betteridge.com/Breitling-Chronomat-B01-42-Stainless-Steel-and.-18k-Red-Gold-Watch-UB0134101B1U1/p/17531836";
const FAKE_URL = "https://breitling-reference-archive.com/ub0134101b1u1-specifications";

/* ── 1. Retrieve ───────────────────────────────────────────────────────── */
console.log("── RETRIEVAL ──────────────────────────────────────────────");
const retrievals = {};
for (const [name, url] of [["topper", TOPPER_URL], ["betteridge", BETTERIDGE_URL], ["fabricated", FAKE_URL]]) {
  const r = await retrieveSource(url);
  retrievals[name] = r;
  console.log(r.ok
    ? `  OK      ${name}: HTTP ${r.httpStatus}, ${r.text.length} chars, sha ${r.contentSha256.slice(0, 12)}…`
    : `  REFUSED ${name}: ${r.failure} — ${r.detail}`);
}
console.log("");

if (!retrievals.topper.ok) {
  console.error("STOP: the primary canary source could not be retrieved; refusing to fabricate around it.");
  process.exit(1);
}

/** Lift a real excerpt from retrieved text around an anchor. */
function excerptAround(text, anchor, span = 90) {
  const hay = normalizeForComparison(text);
  const i = hay.toLowerCase().indexOf(normalizeForComparison(anchor).toLowerCase());
  if (i < 0) return null;
  return hay.slice(Math.max(0, i - 12), Math.min(hay.length, i + span)).trim();
}

const T = retrievals.topper;
const B = retrievals.betteridge.ok ? retrievals.betteridge : null;

const src = (retrieval, id, sourceClass, sourceName, anchor) => {
  const excerpt = excerptAround(retrieval.text, anchor);
  return {
    sourceClass, sourceName,
    sourceUrl: retrieval.requestedUrl,
    sourceExcerpt: excerpt,
    sourceAccessed: retrieval.retrievedAt.slice(0, 10),
    retrievalId: id,
    retrievalSha256: retrieval.contentSha256,
  };
};

/* ── 2. Claims, rebound to retrieved material ──────────────────────────── */
function buildClaims(topperId, betteridgeId) {
  const t = (cls, name, anchor) => src(T, topperId, cls, name, anchor);
  const b = (cls, name, anchor) => (B ? src(B, betteridgeId, cls, name, anchor) : null);
  const TOPPER_NAME = "Topper Fine Jewelers — Breitling Chronomat B01 42 UB0134101B1U1";
  const BETT_NAME = "Betteridge — Breitling Chronomat B01 42 UB0134101B1U1";

  const claims = [
    { claimKey: "B01", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "case.diameter_mm",
      statement: "The case measures 42 mm in diameter.", values: ["42 mm"],
      evidence: [t("DEALER_ARCHIVE", TOPPER_NAME, "42.00 mm"), b("DEALER_ARCHIVE", BETT_NAME, "42mm")].filter(Boolean),
      moduleHint: "AT_A_GLANCE" },
    { claimKey: "B02", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "case.water_resistance",
      statement: "The model is specified for 200 m of water resistance.", values: ["200 m"],
      evidence: [t("DEALER_ARCHIVE", TOPPER_NAME, "200 m")].filter(Boolean),
      qualifier: "describes the original model specification, not the present condition of an individual watch",
      moduleHint: "AT_A_GLANCE" },
    { claimKey: "B04", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "movement.power_reserve",
      statement: "The calibre offers approximately 70 hours of power reserve.", values: ["70 hrs"],
      evidence: [t("DEALER_ARCHIVE", TOPPER_NAME, "70 hrs")].filter(Boolean), moduleHint: "MOVEMENT" },
    { claimKey: "B05", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "movement.frequency",
      statement: "The calibre runs at 28,800 vibrations per hour.", values: ["28,800"],
      evidence: [t("DEALER_ARCHIVE", TOPPER_NAME, "28,800")].filter(Boolean), moduleHint: "MOVEMENT" },
    { claimKey: "B06", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "movement.jewels",
      statement: "The calibre carries 47 jewels.", values: ["47 jewels"],
      evidence: [t("DEALER_ARCHIVE", TOPPER_NAME, "47 jewels")].filter(Boolean), moduleHint: "MOVEMENT" },
    { claimKey: "B08", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "dial.colour",
      statement: "The dial is grey.", values: ["Grey"],
      evidence: [t("DEALER_ARCHIVE", TOPPER_NAME, "Grey"), b("DEALER_ARCHIVE", BETT_NAME, "Grey")].filter(Boolean),
      moduleHint: "DIAL" },
    { claimKey: "B20", claimClass: "CONTEXTUAL_FACT", outcome: "VERIFIED", subject: "history.chronomat_line",
      statement: "Retailer documentation ties the Chronomat line to 1984.", values: ["1984"],
      evidence: [t("DEALER_ARCHIVE", TOPPER_NAME, "1984"), b("DEALER_ARCHIVE", BETT_NAME, "1984")].filter(Boolean),
      moduleHint: "HISTORY" },
    { claimKey: "D01", claimClass: "DESIGN_DESCRIPTION", outcome: "VERIFIED", subject: "bezel.rider_tabs",
      statement: "The bezel carries four rider tabs at the quarters.", values: [],
      supports: ["B01"],
      evidence: [t("SPECIALIST_OBSERVATION", "Observation of retrieved reference documentation", "rider tabs")].filter(Boolean),
      moduleHint: "CASE_AND_BEZEL" },

    /* Refusal proofs — each isolates ONE failure so attribution is unambiguous. */
    { claimKey: "X10", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "case.lug_width",
      statement: "The lug width measures 22 mm.", values: ["22 mm"],
      evidence: [{
        sourceClass: "DEALER_ARCHIVE",
        sourceName: "Breitling Reference Archive — UB0134101B1U1 specifications",
        sourceUrl: FAKE_URL, sourceExcerpt: "Lug width: 22 mm.",
        sourceAccessed: T.retrievedAt.slice(0, 10),
        retrievalId: null, retrievalSha256: null,
      }],
      moduleHint: "AT_A_GLANCE" },
    { claimKey: "X11", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "case.limited_run",
      statement: "The reference was produced in a limited run of 500 pieces.", values: [],
      evidence: [{
        ...t("DEALER_ARCHIVE", TOPPER_NAME, "42.00 mm"),
        sourceExcerpt: "Produced in a limited run of 500 pieces for the anniversary year.",
      }],
      moduleHint: "HISTORY" },
    { claimKey: "X12", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED", subject: "case.diameter_wrong",
      statement: "The case measures 44 mm in diameter.", values: ["44 mm"],
      evidence: [t("DEALER_ARCHIVE", TOPPER_NAME, "42.00 mm")].filter(Boolean),
      moduleHint: "AT_A_GLANCE" },
  ];
  return claims;
}

/* ── 3. Dry verdicts ───────────────────────────────────────────────────── */
const dryRetrievals = [
  { id: "topper", requestedUrl: T.requestedUrl, resolvedUrl: T.resolvedUrl, host: T.host,
    httpStatus: T.httpStatus, contentSha256: T.contentSha256, text: T.text, lifecycle: "current" },
  ...(B ? [{ id: "betteridge", requestedUrl: B.requestedUrl, resolvedUrl: B.resolvedUrl, host: B.host,
    httpStatus: B.httpStatus, contentSha256: B.contentSha256, text: B.text, lifecycle: "current" }] : []),
];
const ORDER = { OBJECTIVE_FACT: 0, CONTEXTUAL_FACT: 1, DESIGN_DESCRIPTION: 2 };
const claims = buildClaims("topper", "betteridge").sort((a, b2) => ORDER[a.claimClass] - ORDER[b2.claimClass]);

console.log("── BINDING VERDICTS ───────────────────────────────────────");
const admitted = new Set();
const rows = [];
for (const c of claims) {
  const ctx = { referenceText: REFERENCE_TEXT, admittedKeys: [...admitted], retrievals: dryRetrievals };
  const binding = evidenceBindingRefusals(c, ctx);
  const v = admissionFor(c, ctx);
  if (v.admission === "ADMITTED") admitted.add(c.claimKey);
  rows.push({
    key: c.claimKey, class: c.claimClass, admission: v.admission,
    bound: binding.length === 0 ? "RETRIEVAL_BOUND" : "UNBOUND",
    refusals: v.refusals.join(","),
  });
}
console.table(rows);
console.log("");

if (!APPLY) {
  console.log("dry run — pass --apply to write retrievals and rebind the canary");
  process.exit(0);
}

/* ── 4. Persist ────────────────────────────────────────────────────────── */
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function persistRetrieval(r) {
  const { data: prior } = await db
    .from("collector_dossier_source_retrievals")
    .select("id, content_sha256")
    .eq("requested_url", r.requestedUrl)
    .eq("lifecycle", "current")
    .maybeSingle();
  if (prior && prior.content_sha256 === r.contentSha256) return prior.id; // identical, no churn
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

const topperId = await persistRetrieval(T);
const betteridgeId = B ? await persistRetrieval(B) : null;
console.log(`retrievals persisted: topper=${topperId}${betteridgeId ? ` betteridge=${betteridgeId}` : ""}`);

const realRetrievals = [
  { id: topperId, requestedUrl: T.requestedUrl, resolvedUrl: T.resolvedUrl, host: T.host,
    httpStatus: T.httpStatus, contentSha256: T.contentSha256, text: T.text, lifecycle: "current" },
  ...(B ? [{ id: betteridgeId, requestedUrl: B.requestedUrl, resolvedUrl: B.resolvedUrl, host: B.host,
    httpStatus: B.httpStatus, contentSha256: B.contentSha256, text: B.text, lifecycle: "current" }] : []),
];

const finalClaims = buildClaims(topperId, betteridgeId).sort((a, b2) => ORDER[a.claimClass] - ORDER[b2.claimClass]);
const admitted2 = new Set();
for (const c of finalClaims) {
  const ctx = { referenceText: REFERENCE_TEXT, admittedKeys: [...admitted2], retrievals: realRetrievals };
  const binding = evidenceBindingRefusals(c, ctx);
  const v = admissionFor(c, ctx);

  const { data: prior } = await db.from("collector_dossier_claims")
    .select("id").eq("vault_reference_id", REFERENCE_ID)
    .eq("claim_key", c.claimKey).eq("lifecycle", "current").maybeSingle();
  if (prior) {
    await db.from("collector_dossier_claims").update({ lifecycle: "retired" }).eq("id", prior.id);
  }
  const { error } = await db.from("collector_dossier_claims").insert({
    vault_reference_id: REFERENCE_ID,
    claim_key: c.claimKey, claim_class: c.claimClass, outcome: c.outcome,
    admission: v.admission, refusals: v.refusals,
    subject: c.subject, statement: c.statement, values: c.values,
    qualifier: c.qualifier ?? null, options: c.options ?? [], evidence: c.evidence,
    supports: c.supports ?? [], module_hint: c.moduleHint ?? null,
    provenance: "MACHINE_RESEARCH", lifecycle: "current", supersedes_id: prior?.id ?? null,
    evidence_binding: binding.length === 0 ? "RETRIEVAL_BOUND" : "UNBOUND",
  });
  if (error) throw new Error(`${c.claimKey}: ${error.message}`);
  if (v.admission === "ADMITTED") admitted2.add(c.claimKey);
}

const { data: hash } = await db.rpc("collector_dossier_claim_set_hash", { p_reference_id: REFERENCE_ID });
console.log(`\nrebound. claim-set hash: ${hash}`);
