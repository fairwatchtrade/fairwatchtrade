/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — PLANTED-DRIFT REGRESSION, PRODUCTION VERIFIER PATH

   Run: node scripts/dossier-composition-replay.mjs            (deterministic)
        node scripts/dossier-composition-replay.mjs --semantic (adds model calls)

   The v4.44 replay proved a verifier catches drift; THIS replay proves the
   production claim-scoped verifier still does. Same answer key (the
   hash-bound, human-approved Breguet 5967 article, read verbatim from the
   repo module), same seven planted drift classes — but now every paragraph
   carries explicit claim linkage, and verification runs through
   lib/dossier/fidelityVerification.ts and the production verifier prompts,
   exactly as a real composition attempt would.

   THE BREGUET REMAINS A REGRESSION / STYLE REFERENCE, NOT PRODUCTION
   IDENTITY: it is not bound to a canonical Vault reference and no Vault
   identity is created to make this test convenient. Nothing here touches a
   database or production state.

   CLOSURE BAR: zero planted-drift escapes across both layers, and the
   clean control passes with a complete claim packet.
   ════════════════════════════════════════════════════════════════════════ */

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const RUN_SEMANTIC = process.argv.includes("--semantic");

const { deterministicFidelityCheck } = await import(
  "../lib/dossier/fidelityVerification.ts"
);
const { verifierSystemPrompt, verifierUserPrompt, parseVerifierOutput } =
  await import("../lib/dossier/composition.ts");
const { callDossierRole } = await import("../lib/dossier/providerRoles.ts");

/* ── Answer key: the approved article, read from the repo module ──────── */
const seedSrc = readFileSync(join(here, "..", "lib/dossier/breguet5967CanarySeed.ts"), "utf8");
const vmSrc = readFileSync(join(here, "..", "lib/dossier/collectorDossierViewModel.ts"), "utf8");
const vmNoImport = vmSrc.replace(
  /import\s*\{[\s\S]*?\}\s*from\s*"\.\/breguet5967CanarySeed";/,
  "/* import inlined by the replay harness */"
);
const tmpDir = mkdtempSync(join(tmpdir(), "fwt-replay-"));
const tmpModule = join(tmpDir, "answerKey.ts");
writeFileSync(tmpModule, `${seedSrc}\n${vmNoImport}\n`, "utf8");
const { buildBreguet5967CanaryViewModel } = await import(
  `file:///${tmpModule.replace(/\\/g, "/")}`
);
rmSync(tmpDir, { recursive: true, force: true });
const known = buildBreguet5967CanaryViewModel();

const IDENTITY = {
  brand: "Breguet",
  collection: "Classique",
  model: "Classique 5967",
  reference: "5967BB/11/9W6",
};

/* ── Claim packet, production shape ────────────────────────────────────
   The same governed content as the v4.44 replay packet, expressed in the
   production three-class vocabulary. Statements carry their attributions
   in the text, as the corpus stores them. */
const c = (claimKey, claimClass, statement, values = [], qualifier = null, supports = []) => ({
  claimKey, claimClass,
  admission: "ADMITTED",
  evidenceBinding: "RETRIEVAL_BOUND",
  subject: claimKey,
  statement, values, qualifier, supports,
  moduleHint: null,
});

const CLAIMS = [
  c("C01", "OBJECTIVE_FACT", "Reference 5967BB/11/9W6 is the documented 18K white-gold configuration of the Breguet Classique 5967.", ["5967BB/11/9W6", "18K", "5967"]),
  c("C02", "OBJECTIVE_FACT", "The case measures 41 mm in diameter.", ["41 mm"]),
  c("C03", "OBJECTIVE_FACT", "Specialist records report a thickness of 6.95 mm; some exact-reference dealer archives round the figure to 7 mm.", ["6.95 mm", "7 mm"]),
  c("C04", "OBJECTIVE_FACT", "When new, the model was specified for 30 metres (3 bar) of water resistance.", ["30 metres", "3 bar"],
    "describes the original model specification, not the present condition of an individual watch"),
  c("C05", "OBJECTIVE_FACT", "A sapphire crystal covers the dial and a sapphire exhibition back covers the movement.", []),
  c("C06", "DESIGN_DESCRIPTION", "The two-hand layout leaves a broad, largely uninterrupted field for the Damier Art Déco guilloché, whose geometry can read as three-dimensional cubes, with much of the visual depth coming from the surface itself rather than from additional indications.", [], null, ["C02"]),
  c("C07", "CONTEXTUAL_FACT", "Sotheby's identifies reference 5967 as Breguet's first use of the Damier Art Déco guilloché, placing familiar Breguet case, hand and numeral vocabulary against a distinctly geometric dial treatment.", ["5967"]),
  c("C08", "OBJECTIVE_FACT", "The 18K gold dial has a silvered finish and is hand-guilloché.", ["18K"]),
  c("C09", "CONTEXTUAL_FACT", "Contemporary technical reporting names the motif “Damier Art Déco”.", []),
  c("C10", "DESIGN_DESCRIPTION", "Blued steel open-tipped Breguet hands indicate hours and minutes against a Roman-numeral chapter ring, together forming a distinct reading layer above the guilloché geometry.", [], null, ["C08"]),
  c("C11", "OBJECTIVE_FACT", "The dial is individually numbered.", [],
    "the number's exact placement should be checked on the subject watch"),
  c("C12", "CONTEXTUAL_FACT", "Qualified auction records place the two secret signatures between XI–XII and XII–I.", ["XI–XII", "XII–I"]),
  c("C13", "OBJECTIVE_FACT", "The movement is the manually wound Breguet calibre 506.2.", ["506.2"]),
  c("C14", "OBJECTIVE_FACT", "The movement measures 15¾ lignes, approximately 35.5 mm by standard conversion.", ["15¾ lignes", "35.5 mm"]),
  c("C15", "OBJECTIVE_FACT", "The calibre has 20 jewels, runs at 3 Hz, offers approximately 40 hours of power reserve and was specified as adjusted in five positions.", ["20 jewels", "3 Hz", "40 hours", "five positions"]),
  c("C16", "DESIGN_DESCRIPTION", "Through the sapphire back the signed and numbered movement is presented with Geneva-striped bridges.", [], null, ["C05"]),
  c("C17", "DESIGN_DESCRIPTION", "From the back, the large movement occupies a broad portion of the display view.", [], null, ["C14"]),
  c("C18", "CONTEXTUAL_FACT", "Sotheby's and specialist horological sources identify calibre 506.2 with Frédéric Piguet 151 architecture, describing it as a large Lépine/pocket-watch calibre.", ["506.2", "151"]),
  c("C19", "CONTEXTUAL_FACT", "Qualified auction catalogues describe the 5967's sapphire exhibition back as snap-on.", ["5967"]),
  c("C20", "CONTEXTUAL_FACT", "A documented 18K yellow-gold sibling is reference 5967BA/11/9W6.", ["5967BA/11/9W6", "18K"]),
  c("C21", "OBJECTIVE_FACT", "Exact-reference auction records and full-set dealer records document 5967BB/11/9W6 with a black Breguet alligator strap and an 18K white-gold pin buckle.", ["5967BB/11/9W6", "18K"],
    "a documented configuration, not a determination that the strap or buckle on an individual watch is original"),
  c("C22", "CONTEXTUAL_FACT", "Breguet dates its adoption of guilloché in watchmaking to 1786, and the modern manufacture continues hand engine-turning on traditional lathes.", ["1786"]),
  c("C23", "CONTEXTUAL_FACT", "The blued open-tipped hands continue a form the house traces to about 1783.", ["1783"]),
  c("C24", "CONTEXTUAL_FACT", "Secret signatures and individual numbers are established elements of Breguet's identification vocabulary.", [],
    "not, by themselves, a complete authenticity determination"),
  c("C25", "CONTEXTUAL_FACT", "Breguet introduced the Classique 5967 in 2009.", ["2009", "5967"]),
  c("C26", "CONTEXTUAL_FACT", "My-WatchSite marks the model as no longer commercialized, and the 5967 is absent from Breguet's current Classique product collection.", ["5967"]),
  c("C27", "CONTEXTUAL_FACT", "No numbered-edition statement was located in the material reviewed.", [],
    "does not establish that no special configuration ever existed"),
];

/* ── Per-paragraph claim linkage for the approved article ──────────────
   Hand-authored from the manuscript's own lineage: which claims permit
   each approved paragraph to exist. The opening identity line is modelled
   as a linked paragraph here because the approved opening carries claim
   content (18K white gold) beyond bare identity — C01 is its warrant. */
const LINKAGE = {
  EXACT_IDENTITY: [["C01"]],
  AT_A_GLANCE: [["C02", "C03"], ["C04"], ["C05"]],
  WHY_REFERENCE_MATTERS: [["C06", "C02"], ["C07"]],
  DAMIER_ART_DECO_DIAL: [["C08", "C09"], ["C10", "C06"], ["C11", "C12"]],
  MOVEMENT_AND_THINNESS: [["C13"], ["C14"], ["C15"], ["C16"], ["C17"], ["C18"], ["C19"]],
  HOW_REFERENCE_DIFFERS: [["C20"], ["C21"]],
  BREGUET_CRAFT_TRADITIONS: [["C22", "C23"], ["C24"]],
  CURRENT_HISTORICAL_BOUNDARY: [["C25", "C26"]],
  SOURCES_EVIDENCE_PREPARATION: [["C27"]],
};

function linkedSectionsFromAnswerKey() {
  const sections = [
    {
      moduleId: "EXACT_IDENTITY",
      heading: "Exact Identity",
      paragraphs: [{ text: known.openingIdentity, claimIds: LINKAGE.EXACT_IDENTITY[0] }],
    },
  ];
  for (const s of known.sections) {
    const map = LINKAGE[s.moduleId];
    if (!map || map.length !== s.paragraphs.length) {
      throw new Error(`linkage map out of step with ${s.moduleId} (${s.paragraphs.length} paragraphs)`);
    }
    sections.push({
      moduleId: s.moduleId,
      heading: s.heading,
      paragraphs: s.paragraphs.map((text, i) => ({ text, claimIds: map[i] })),
    });
  }
  return sections;
}

const KNOWN_GOOD = linkedSectionsFromAnswerKey();

/* ── Planted drift — one change per case, on the linked structure ─────── */
function corrupt(base, find, replace) {
  let hit = false;
  const out = base.map((s) => ({
    ...s,
    paragraphs: s.paragraphs.map((p) => {
      if (!hit && p.text.includes(find)) {
        hit = true;
        return { ...p, text: p.text.replace(find, replace) };
      }
      return p;
    }),
  }));
  if (!hit) throw new Error(`corruption anchor not found: ${find.slice(0, 60)}`);
  return out;
}

const CASES = [
  { id: "CLEAN", planted: "none — the approved article, unmodified", sections: KNOWN_GOOD },
  { id: "D1_ALTERED_MEASUREMENT", planted: "case thickness 6.95 mm changed to 7.5 mm",
    sections: corrupt(KNOWN_GOOD, "thickness of 6.95 mm", "thickness of 7.5 mm") },
  { id: "D2_FABRICATED_ATTRIBUTION", planted: "Sotheby's attribution swapped to Christie's",
    sections: corrupt(KNOWN_GOOD, "Sotheby’s identifies reference 5967", "Christie’s identifies reference 5967") },
  { id: "D3_INVENTED_CAUSALITY", planted: "causal/intent explanation invented for the two-hand layout",
    sections: corrupt(KNOWN_GOOD,
      "The two-hand layout leaves a broad",
      "Because Breguet wanted the guilloché to carry the whole composition, the two-hand layout leaves a broad") },
  { id: "D4_SIBLING_CONFLATION", planted: "strap/buckle configuration reassigned to the yellow-gold sibling",
    sections: corrupt(KNOWN_GOOD,
      "document 5967BB/11/9W6 with a black Breguet alligator strap",
      "document 5967BA/11/9W6 with a black Breguet alligator strap") },
  { id: "D5_UNSUPPORTED_SIGNIFICANCE", planted: "collectibility claim with no admitted claim behind it",
    sections: corrupt(KNOWN_GOOD,
      "Breguet introduced the Classique 5967 in 2009.",
      "Breguet introduced the Classique 5967 in 2009, and it has since become one of the most sought-after modern Breguets among serious collectors.") },
  { id: "D6_CHRONOLOGY_DRIFT", planted: "invented temporal relation between guilloché adoption and the model",
    sections: corrupt(KNOWN_GOOD,
      "Breguet dates its adoption of guilloché in watchmaking to 1786",
      "Breguet adopted guilloché in watchmaking in 1786, more than two centuries before the 5967 revived it") },
  { id: "D7_OMITTED_QUALIFIER", planted: "the dial-numbering recheck qualifier removed",
    sections: corrupt(KNOWN_GOOD,
      "The dial is individually numbered, although the number’s exact placement should be checked on the subject watch.",
      "The dial is individually numbered.") },
];

/* ── Run ───────────────────────────────────────────────────────────────── */
function loadEnv() {
  try {
    const file = readFileSync(join(here, "..", ".env.local"), "utf8");
    for (const line of file.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();
if (RUN_SEMANTIC && !process.env.ANTHROPIC_API_KEY) {
  console.error("STOP: --semantic requires ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}

console.log(`Answer key: ${KNOWN_GOOD.length} sections, ${CLAIMS.length} claims, per-paragraph linkage`);
console.log(`Manuscript sha256 (canary metadata): ${known.canary.editorialManuscriptSha256}`);
console.log(`Semantic pass: ${RUN_SEMANTIC ? "ON (production verifier prompts)" : "off"}\n`);

const table = [];
let escapes = 0;
let totalIn = 0, totalOut = 0;

for (const cse of CASES) {
  const det = deterministicFidelityCheck(cse.sections, CLAIMS, IDENTITY);
  let sem = null, semError = null;
  if (RUN_SEMANTIC) {
    try {
      const r = await callDossierRole("dossier_verifier", {
        system: verifierSystemPrompt(),
        user: verifierUserPrompt(
          IDENTITY,
          "Reference 5967BB/11/9W6 resolves to the Breguet Classique 5967.",
          cse.sections,
          CLAIMS
        ),
        maxTokens: 2000,
      });
      totalIn += r.usage.inputTokens;
      totalOut += r.usage.outputTokens;
      const verdict = parseVerifierOutput(r.text);
      if (verdict.refusals === null) semError = verdict.error;
      else sem = verdict.refusals;
    } catch (e) {
      semError = e instanceof Error ? e.message : String(e);
    }
  }

  const isClean = cse.id === "CLEAN";
  const detCaught = det.length > 0;
  const semCaught = (sem ?? []).length > 0;
  const escaped = !isClean && !detCaught && (RUN_SEMANTIC ? !semCaught : true);
  if (escaped) escapes += 1;

  console.log(`── ${cse.id}`);
  console.log(`   planted: ${cse.planted}`);
  console.log(`   DETERMINISTIC: ${det.length === 0 ? "no refusals" : `${det.length} refusal(s)`}`);
  for (const r of det) console.log(`      ${r.code} [${r.moduleId}#${r.paragraphIndex}] — ${r.detail}`);
  if (RUN_SEMANTIC) {
    if (semError) console.log(`   SEMANTIC: ERROR — ${semError}`);
    else {
      console.log(`   SEMANTIC: ${sem.length === 0 ? "no refusals" : `${sem.length} refusal(s)`}`);
      for (const r of sem) console.log(`      ${r.code} [${r.moduleId}#${r.paragraphIndex}] — "${String(r.quote).slice(0, 70)}" — ${r.why}`);
    }
  }
  console.log("");

  table.push({
    case: cse.id,
    deterministic: det.length,
    detCodes: [...new Set(det.map((r) => r.code))].join(",") || "-",
    semantic: sem ? sem.length : semError ? "ERR" : "-",
    semCodes: sem ? [...new Set(sem.map((r) => r.code))].join(",") || "-" : "-",
    verdict: isClean
      ? (detCaught || semCaught ? "FALSE POSITIVE" : "clean pass")
      : (detCaught ? "caught: deterministic" : semCaught ? "caught: semantic" : "ESCAPE"),
  });
}

console.log("── SUMMARY ────────────────────────────────────────────────");
console.table(table);
if (RUN_SEMANTIC) console.log(`model tokens: ${totalIn} in / ${totalOut} out`);

const cleanRow = table.find((r) => r.case === "CLEAN");
const cleanOk = cleanRow?.verdict === "clean pass";
console.log(`\nplanted-drift escapes: ${escapes}  ·  clean control: ${cleanOk ? "PASS" : "FAIL"}`);
process.exit(escapes === 0 && cleanOk ? 0 : 1);
