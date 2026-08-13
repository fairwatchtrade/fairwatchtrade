/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — SEPARATION-OF-DUTIES REPLAY (experiment, not wiring)

   Run: node scripts/dossier-fidelity-replay.mjs            (deterministic only)
        node scripts/dossier-fidelity-replay.mjs --semantic (adds model calls)

   WHAT THIS IS. A bounded experiment authorized 2026-08-13 to answer one
   question before any composition pipeline is built: WILL A VERIFIER CATCH
   DRIFT? Prose quality is irrelevant if it will not.

   WHY THE BREGUET 5967. It is the only reference carrying a governed,
   hash-bound, externally-researched article that a human already approved
   (manuscript sha256 6897c3d6…, transcribed verbatim into
   lib/dossier/collectorDossierViewModel.ts). That gives this experiment
   something no future reference will have: AN ANSWER KEY.

   THE METHOD. The known-good article is read from the repo module itself —
   never re-typed here, so the answer key cannot drift from production. A
   claim packet is stated below as Machine 1 (Research/Data Builder) would
   have emitted it. Corrupted manuscripts plant specific, named drift. Two
   independent checkers then run over each manuscript:

     · DETERMINISTIC — mechanically comparable facts (measurements, dates,
       reference identifiers, calibre numbers, karats, roman spans,
       attributions, and dropped qualifiers) extracted from prose and
       set-compared against the admitted claim values. No model. No score.
     · SEMANTIC — a model receiving ONLY the claim packet and the finished
       prose (never the composer's reasoning), required to answer with named
       refusals from a fixed vocabulary. No score, no "confidence".

   NO CONFIDENCE FIELD. Per the 2026-08-13 correction: admission is governed
   by named conditions, never by probabilistic authority. Claims carry
   sourceClass / admission / evidence / refusal — deliberately no numeric or
   ordinal confidence. (The research validator's existing `confidence` is
   non-authoritative there too: acceptance turns on outcome === VERIFIED and
   sources.length > 0, never on the band.)

   This file wires nothing into production and is never imported by the app.
   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const RUN_SEMANTIC = process.argv.includes("--semantic");

/* ── The answer key: the real approved article, read from the repo ──────
   The production module imports its seed with an extensionless relative
   specifier (Next resolves it; bare Node ESM does not). Rather than edit
   production code for a test, both sources are concatenated verbatim into
   one temporary module — the ONLY edit is deleting the import statement
   that the concatenation makes redundant. The prose bytes are untouched,
   so the answer key cannot drift from what production serves. */
const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
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
const KNOWN_GOOD = [
  known.openingIdentity,
  ...known.sections.flatMap((s) => s.paragraphs),
];

/* ── The claim packet — Machine 1's output shape ───────────────────────
   Every claim states its class, its source class, its admission status, the
   evidence sentence, mechanically checkable values, and any qualifier the
   prose is REQUIRED to carry (the manuscript's recheck conditions are
   load-bearing; dropping one is drift by omission). */
const CLAIMS = [
  { id: "C01", claimClass: "IDENTITY", sourceClass: "DEALER_ARCHIVE", admission: "ADMITTED",
    statement: "Reference 5967BB/11/9W6 is the documented 18K white-gold configuration of the Breguet Classique 5967.",
    values: ["5967BB/11/9W6", "18K", "5967"] },
  { id: "C02", claimClass: "MEASUREMENT", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    statement: "The case measures 41 mm in diameter.", values: ["41 mm"] },
  { id: "C03", claimClass: "MEASUREMENT", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    statement: "Specialist records report a thickness of 6.95 mm; some exact-reference dealer archives round the figure to 7 mm.",
    values: ["6.95 mm", "7 mm"] },
  { id: "C04", claimClass: "SPECIFICATION", sourceClass: "MANUFACTURER_SPEC", admission: "ADMITTED",
    statement: "When new, the model was specified for 30 metres (3 bar) of water resistance.",
    values: ["30 metres", "3 bar"], qualifier: "describes the original model specification, not the present condition of an individual watch" },
  { id: "C05", claimClass: "SPECIFICATION", sourceClass: "MANUFACTURER_SPEC", admission: "ADMITTED",
    statement: "A sapphire crystal covers the dial and a sapphire exhibition back covers the movement.", values: [] },
  { id: "C06", claimClass: "DESIGN_DESCRIPTION", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    statement: "The two-hand layout leaves a broad, largely uninterrupted field for the Damier Art Déco guilloché, whose geometry can read as three-dimensional cubes.", values: [] },
  { id: "C07", claimClass: "ATTRIBUTED_STATEMENT", sourceClass: "AUCTION_HOUSE", admission: "ADMITTED",
    attribution: "Sotheby's",
    statement: "Sotheby's identifies reference 5967 as Breguet's first use of the Damier Art Déco guilloché.", values: ["5967"] },
  { id: "C08", claimClass: "SPECIFICATION", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    statement: "The 18K gold dial has a silvered finish and is hand-guilloché.", values: ["18K"] },
  { id: "C09", claimClass: "ATTRIBUTED_STATEMENT", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    attribution: "contemporary technical reporting",
    statement: "Contemporary technical reporting names the motif “Damier Art Déco”.", values: [] },
  { id: "C10", claimClass: "DESIGN_DESCRIPTION", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    statement: "Blued steel open-tipped Breguet hands indicate hours and minutes against a Roman-numeral chapter ring.", values: [] },
  { id: "C11", claimClass: "CONFIGURATION", sourceClass: "AUCTION_RECORD", admission: "ADMITTED",
    statement: "The dial is individually numbered.", values: [],
    qualifier: "the number's exact placement should be checked on the subject watch" },
  { id: "C12", claimClass: "ATTRIBUTED_STATEMENT", sourceClass: "AUCTION_RECORD", admission: "ADMITTED",
    attribution: "qualified auction records",
    statement: "Qualified auction records place the two secret signatures between XI–XII and XII–I.",
    values: ["XI–XII", "XII–I"] },
  { id: "C13", claimClass: "SPECIFICATION", sourceClass: "MANUFACTURER_SPEC", admission: "ADMITTED",
    statement: "The movement is the manually wound Breguet calibre 506.2.", values: ["506.2"] },
  { id: "C14", claimClass: "MEASUREMENT", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    statement: "The movement measures 15¾ lignes, approximately 35.5 mm by standard conversion.",
    values: ["15¾ lignes", "35.5 mm"] },
  { id: "C15", claimClass: "SPECIFICATION", sourceClass: "MANUFACTURER_SPEC", admission: "ADMITTED",
    statement: "The calibre has 20 jewels, runs at 3 Hz, offers approximately 40 hours of power reserve and was specified as adjusted in five positions.",
    values: ["20 jewels", "3 Hz", "40 hours", "five positions"] },
  { id: "C16", claimClass: "DESIGN_DESCRIPTION", sourceClass: "AUCTION_RECORD", admission: "ADMITTED",
    statement: "Through the sapphire back the signed and numbered movement is presented with Geneva-striped bridges.", values: [] },
  { id: "C17", claimClass: "DESIGN_DESCRIPTION", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    statement: "From the back, the large movement occupies a broad portion of the display view.", values: [] },
  { id: "C18", claimClass: "ATTRIBUTED_STATEMENT", sourceClass: "AUCTION_HOUSE", admission: "ADMITTED",
    attribution: "Sotheby's and specialist horological sources",
    statement: "Sotheby's and specialist horological sources identify calibre 506.2 with Frédéric Piguet 151 architecture, describing it as a large Lépine/pocket-watch calibre.",
    values: ["506.2", "151"] },
  { id: "C19", claimClass: "ATTRIBUTED_STATEMENT", sourceClass: "AUCTION_RECORD", admission: "ADMITTED",
    attribution: "qualified auction catalogues",
    statement: "Qualified auction catalogues describe the 5967's sapphire exhibition back as snap-on.", values: ["5967"] },
  { id: "C20", claimClass: "SIBLING_REFERENCE", sourceClass: "DEALER_ARCHIVE", admission: "ADMITTED",
    statement: "A documented 18K yellow-gold sibling is reference 5967BA/11/9W6.",
    values: ["5967BA/11/9W6", "18K"] },
  { id: "C21", claimClass: "CONFIGURATION", sourceClass: "AUCTION_RECORD", admission: "ADMITTED",
    statement: "Exact-reference auction records and full-set dealer records document 5967BB/11/9W6 with a black Breguet alligator strap and an 18K white-gold pin buckle.",
    values: ["5967BB/11/9W6", "18K"],
    qualifier: "a documented configuration, not a determination that the strap or buckle on an individual watch is original" },
  { id: "C22", claimClass: "CRAFT_TRADITION", sourceClass: "MANUFACTURER_SPEC", admission: "ADMITTED",
    statement: "Breguet dates its adoption of guilloché in watchmaking to 1786, and the modern manufacture continues hand engine-turning on traditional lathes.",
    values: ["1786"] },
  { id: "C23", claimClass: "CRAFT_TRADITION", sourceClass: "MANUFACTURER_SPEC", admission: "ADMITTED",
    statement: "The blued open-tipped hands continue a form the house traces to about 1783.", values: ["1783"] },
  { id: "C24", claimClass: "CRAFT_TRADITION", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    statement: "Secret signatures and individual numbers are established elements of Breguet's identification vocabulary.", values: [],
    qualifier: "not, by themselves, a complete authenticity determination" },
  { id: "C25", claimClass: "DATE", sourceClass: "MANUFACTURER_SPEC", admission: "ADMITTED",
    statement: "Breguet introduced the Classique 5967 in 2009.", values: ["2009", "5967"] },
  { id: "C26", claimClass: "ATTRIBUTED_STATEMENT", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    attribution: "My-WatchSite",
    statement: "My-WatchSite marks the model as no longer commercialized, and the 5967 is absent from Breguet's current Classique product collection.",
    values: ["5967"] },
  { id: "C27", claimClass: "NEGATIVE_FINDING", sourceClass: "SPECIALIST_TECHNICAL", admission: "ADMITTED",
    statement: "No numbered-edition statement was located in the material reviewed.", values: [],
    qualifier: "does not establish that no special configuration ever existed" },
];

/* ── Deterministic checker ─────────────────────────────────────────────
   Mechanically comparable facts only. Everything it reports is provable by
   set membership — it never guesses and never scores. */

const ATTRIBUTION_NAMES = [
  "Sotheby's", "Sotheby’s", "Christie's", "Christie’s", "Phillips",
  "Bonhams", "Antiquorum", "My-WatchSite", "Breguet",
];

/* Typographic normalisation is LOAD-BEARING, and the first run proved it:
   the approved manuscript writes the dial-numbering qualifier with a CURLY
   apostrophe (this repo deliberately preserves non-ASCII codepoints in
   approved copy — see lib/faq/faqContent.ts), and a claim packet typed with
   a straight apostrophe produced a false OMITTED_QUALIFIER against the
   UNMODIFIED article. A deterministic checker that does not fold quotes,
   dashes and no-break spaces will refuse perfectly faithful prose. */
function norm(t) {
  return t
    .replace(/[\u00a0\u202f\u2060]/g, " ")
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2011]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract every mechanically comparable token from a body of prose. */
function mechanicalTokens(text) {
  const t = norm(text);
  const out = [];
  const push = (kind, value) => out.push({ kind, value: norm(value) });

  // measurements & rated values, incl. the ligne fraction
  for (const m of t.matchAll(/\b\d+(?:[.,]\d+)?\s?(?:mm|metres|meters|bar|Hz|hours?|jewels|lignes)\b/gi)) push("measurement", m[0]);
  for (const m of t.matchAll(/\b\d+¾\s?lignes\b/gi)) push("measurement", m[0]);
  // years
  for (const m of t.matchAll(/\b(?:1[6-9]\d{2}|20\d{2})\b/g)) push("year", m[0]);
  // full reference identifiers, then bare model numbers
  for (const m of t.matchAll(/\b\d{4}[A-Z]{2}\/\d{2}\/\d[A-Z]\d\b/g)) push("reference", m[0]);
  for (const m of t.matchAll(/\b5967\b(?!\s?[A-Z]{2})/g)) push("reference", m[0]);
  // calibre / architecture numbers
  for (const m of t.matchAll(/\b\d{3}\.\d\b/g)) push("calibre", m[0]);
  for (const m of t.matchAll(/Frédéric Piguet\s+(\d+)/g)) push("calibre", m[1]);
  // karats
  for (const m of t.matchAll(/\b\d{1,2}K\b/g)) push("karat", m[0]);
  // roman-numeral spans (secret signature positions)
  for (const m of t.matchAll(/\b[IVX]+–[IVX]+\b/g)) push("roman_span", m[0]);
  // positions adjusted
  for (const m of t.matchAll(/\b(?:five|four|three|six)\s+positions\b/gi)) push("measurement", m[0]);
  // attributions
  for (const name of ATTRIBUTION_NAMES) {
    if (t.includes(name)) push("attribution", name.replace(/’/g, "'"));
  }
  return out;
}

/** Every value the claim packet admits, as a comparable set. */
function admittedValueSet(claims) {
  const set = new Set();
  for (const c of claims) {
    for (const v of c.values ?? []) {
      set.add(norm(v).toLowerCase());
      // a value may legitimately appear without its unit spacing
      set.add(norm(v).toLowerCase().replace(/\s/g, ""));
    }
    if (c.attribution) {
      for (const name of ATTRIBUTION_NAMES) {
        if (c.attribution.includes(name.replace(/’/g, "'")) || c.attribution.includes(name)) {
          set.add(name.replace(/’/g, "'").toLowerCase());
        }
      }
    }
    // the maker's own name is admitted by every claim about this watch
    set.add("breguet");
  }
  return set;
}

function deterministicCheck(prose, claims) {
  const admitted = admittedValueSet(claims);
  const refusals = [];
  const seen = new Set();

  for (const tok of mechanicalTokens(prose.join(" "))) {
    const key = `${tok.kind}:${tok.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const v = tok.value.toLowerCase();
    if (admitted.has(v) || admitted.has(v.replace(/\s/g, ""))) continue;
    refusals.push({
      code: tok.kind === "attribution" ? "ATTRIBUTION_DRIFT" : "ALTERED_OR_ADDED_VALUE",
      detail: `${tok.kind} "${tok.value}" appears in the prose but is not an admitted claim value`,
    });
  }

  // Drift by omission: a required qualifier that vanished from the prose.
  const body = norm(prose.join(" ")).toLowerCase();
  for (const c of claims) {
    if (!c.qualifier) continue;
    const q = norm(c.qualifier).toLowerCase();
    const anchor = q.split(/[,;]/)[0].slice(0, 34);
    if (!body.includes(anchor)) {
      refusals.push({
        code: "OMITTED_QUALIFIER",
        detail: `${c.id} requires the qualifier "${c.qualifier}" and the prose does not carry it`,
      });
    }
  }
  return refusals;
}

/* ── Planted drift ─────────────────────────────────────────────────────
   Each corruption changes exactly one thing, so attribution of a catch is
   unambiguous. Applied to the real approved prose. */
function corrupt(base, find, replace) {
  const out = base.map((p) => (p.includes(find) ? p.replace(find, replace) : p));
  if (JSON.stringify(out) === JSON.stringify(base)) {
    throw new Error(`corruption anchor not found: ${find.slice(0, 60)}`);
  }
  return out;
}

const CASES = [
  { id: "CLEAN", planted: "none — the approved article, unmodified", prose: KNOWN_GOOD },

  { id: "D1_ALTERED_MEASUREMENT", planted: "case thickness 6.95 mm changed to 7.5 mm",
    prose: corrupt(KNOWN_GOOD, "thickness of 6.95 mm", "thickness of 7.5 mm") },

  { id: "D2_FABRICATED_ATTRIBUTION", planted: "Sotheby's attribution swapped to Christie's",
    prose: corrupt(KNOWN_GOOD, "Sotheby’s identifies reference 5967", "Christie’s identifies reference 5967") },

  { id: "D3_INVENTED_CAUSALITY", planted: "causal explanation invented for the two-hand layout",
    prose: corrupt(KNOWN_GOOD,
      "The two-hand layout leaves a broad",
      "Because Breguet wanted the guilloché to carry the whole composition, the two-hand layout leaves a broad") },

  { id: "D4_SIBLING_CONFLATION", planted: "white-gold strap/buckle configuration reassigned to the yellow-gold sibling",
    prose: corrupt(KNOWN_GOOD,
      "document 5967BB/11/9W6 with a black Breguet alligator strap",
      "document 5967BA/11/9W6 with a black Breguet alligator strap") },

  { id: "D5_UNSUPPORTED_SIGNIFICANCE", planted: "collectibility/desirability claim with no admitted claim behind it",
    prose: corrupt(KNOWN_GOOD,
      "Breguet introduced the Classique 5967 in 2009.",
      "Breguet introduced the Classique 5967 in 2009, and it has since become one of the most sought-after modern Breguets among serious collectors.") },

  { id: "D6_CHRONOLOGY_DRIFT", planted: "invented temporal relation between guilloché adoption and the model",
    prose: corrupt(KNOWN_GOOD,
      "Breguet dates its adoption of guilloché in watchmaking to 1786",
      "Breguet adopted guilloché in watchmaking in 1786, more than two centuries before the 5967 revived it") },

  { id: "D7_OMITTED_QUALIFIER", planted: "the dial-numbering recheck qualifier removed",
    prose: corrupt(KNOWN_GOOD,
      "The dial is individually numbered, although the number’s exact placement should be checked on the subject watch.",
      "The dial is individually numbered.") },
];

/* ── Semantic verifier — claims + prose ONLY, named refusals only ─────── */
const REFUSAL_VOCABULARY = [
  "FACTUAL_ADDITION", "ALTERED_VALUE", "ATTRIBUTION_DRIFT", "INVENTED_CAUSALITY",
  "UNSUPPORTED_SIGNIFICANCE", "CHRONOLOGY_DRIFT", "REFERENCE_CONFLATION", "OMITTED_QUALIFIER",
];

const VERIFIER_SYSTEM = `You are a fidelity verifier for a watch reference document.

You receive ADMITTED CLAIMS and FINISHED PROSE. You never receive, and never ask for, the reasoning of whoever wrote the prose.

Your only job: decide whether the prose asserts anything the admitted claims do not support, or drops a qualifier the claims require.

Rules:
- The prose may reorganise, connect and rephrase admitted claims freely. Rewording is NOT drift.
- Any fact, number, date, identifier, attribution, causal relation, temporal relation, or significance judgement that is not supported by an admitted claim IS drift.
- A claim carrying a "qualifier" REQUIRES that qualifier to survive into the prose. Dropping it is drift.
- Do not score. Do not express confidence. Do not rate quality. Report only named refusals.

Answer with JSON only:
{"refusals":[{"code":"<one of ${REFUSAL_VOCABULARY.join("|")}>","quote":"<exact phrase from the prose>","why":"<one sentence>"}]}
An empty refusals array means the prose is faithful.`;

function loadEnv() {
  try {
    const file = readFileSync(join(here, "..", ".env.local"), "utf8");
    for (const line of file.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {}
}

async function semanticCheck(prose) {
  const body = {
    model: "claude-opus-5",
    max_tokens: 1500,
    system: VERIFIER_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          "ADMITTED CLAIMS:\n" +
          JSON.stringify(
            CLAIMS.map((c) => ({
              id: c.id, claimClass: c.claimClass, sourceClass: c.sourceClass,
              admission: c.admission, statement: c.statement,
              ...(c.attribution ? { attribution: c.attribution } : {}),
              ...(c.qualifier ? { qualifier: c.qualifier } : {}),
            })),
            null, 1
          ) +
          "\n\nFINISHED PROSE:\n" + prose.join("\n\n"),
      },
    ],
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`verifier HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("verifier returned no JSON object");
  const parsed = JSON.parse(text.slice(start, end + 1));
  return {
    refusals: Array.isArray(parsed.refusals) ? parsed.refusals : [],
    usage: json.usage ?? null,
  };
}

/* ── Composer — claims ONLY, no access to the approved article ────────── */
const COMPOSER_SYSTEM = `You write one section of a reference document about a wristwatch for experienced collectors.

You receive ADMITTED CLAIMS. They are the only facts you may use.

Rules:
- You may reorganise, connect and rephrase the claims freely, and you should: the result must read as considered prose, not a specification list.
- You may NOT introduce any fact, number, date, identifier, attribution, causal relation, temporal relation, or judgement of importance that is not in the claims.
- Where a claim carries a "qualifier", that qualifier must survive into your prose.
- Write 3 to 5 paragraphs. No headings. No invented detail. No sales language.

Answer with JSON only: {"paragraphs":["...","..."]}`;

async function compose(claims) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-5",
      max_tokens: 2000,
      system: COMPOSER_SYSTEM,
      messages: [{ role: "user", content: "ADMITTED CLAIMS:\n" + JSON.stringify(
        claims.map((c) => ({
          id: c.id, claimClass: c.claimClass, sourceClass: c.sourceClass,
          statement: c.statement,
          ...(c.attribution ? { attribution: c.attribution } : {}),
          ...(c.qualifier ? { qualifier: c.qualifier } : {}),
        })), null, 1) }],
    }),
  });
  if (!res.ok) throw new Error(`composer HTTP ${res.status}`);
  const json = await res.json();
  const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return { paragraphs: parsed.paragraphs ?? [], usage: json.usage ?? null };
}

/* ── Run ───────────────────────────────────────────────────────────────── */
loadEnv();
if (RUN_SEMANTIC && !process.env.ANTHROPIC_API_KEY) {
  console.error("STOP: --semantic requires ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}

console.log(`Answer key: ${KNOWN_GOOD.length} approved paragraphs, ${CLAIMS.length} admitted claims`);
console.log(`Manuscript sha256 (canary metadata): ${known.canary.editorialManuscriptSha256}`);
console.log(`Semantic pass: ${RUN_SEMANTIC ? "ON" : "off (deterministic only)"}\n`);

const table = [];
let totalIn = 0, totalOut = 0;

for (const c of CASES) {
  const det = deterministicCheck(c.prose, CLAIMS);
  let sem = null, semError = null;
  if (RUN_SEMANTIC) {
    try {
      const r = await semanticCheck(c.prose);
      sem = r.refusals;
      totalIn += r.usage?.input_tokens ?? 0;
      totalOut += r.usage?.output_tokens ?? 0;
    } catch (e) {
      semError = e instanceof Error ? e.message : String(e);
    }
  }

  console.log(`── ${c.id}`);
  console.log(`   planted: ${c.planted}`);
  console.log(`   DETERMINISTIC: ${det.length === 0 ? "no refusals" : `${det.length} refusal(s)`}`);
  for (const r of det) console.log(`      ${r.code} — ${r.detail}`);
  if (RUN_SEMANTIC) {
    if (semError) console.log(`   SEMANTIC: ERROR — ${semError}`);
    else {
      console.log(`   SEMANTIC: ${sem.length === 0 ? "no refusals" : `${sem.length} refusal(s)`}`);
      for (const r of sem) console.log(`      ${r.code} — "${String(r.quote).slice(0, 70)}" — ${r.why}`);
    }
  }
  console.log("");

  table.push({
    case: c.id,
    deterministic: det.length,
    detCodes: [...new Set(det.map((r) => r.code))].join(","),
    semantic: sem ? sem.length : "-",
    semCodes: sem ? [...new Set(sem.map((r) => r.code))].join(",") : "-",
  });
}

/* ── Claims-only composition: does a composer given ONLY claims drift? ── */
if (RUN_SEMANTIC && process.argv.includes("--compose")) {
  console.log("── CLAIMS-ONLY COMPOSITION ────────────────────────────────");
  const c = await compose(CLAIMS);
  totalIn += c.usage?.input_tokens ?? 0;
  totalOut += c.usage?.output_tokens ?? 0;
  console.log(`composed ${c.paragraphs.length} paragraphs from claims alone:\n`);
  for (const p of c.paragraphs) console.log(`   ${p}\n`);

  const det = deterministicCheck(c.paragraphs, CLAIMS);
  console.log(`   DETERMINISTIC: ${det.length === 0 ? "no refusals" : `${det.length} refusal(s)`}`);
  for (const r of det) console.log(`      ${r.code} — ${r.detail}`);
  try {
    const s = await semanticCheck(c.paragraphs);
    totalIn += s.usage?.input_tokens ?? 0;
    totalOut += s.usage?.output_tokens ?? 0;
    console.log(`   SEMANTIC: ${s.refusals.length === 0 ? "no refusals" : `${s.refusals.length} refusal(s)`}`);
    for (const r of s.refusals) console.log(`      ${r.code} — "${String(r.quote).slice(0, 70)}" — ${r.why}`);
  } catch (e) {
    console.log(`   SEMANTIC: ERROR — ${e instanceof Error ? e.message : e}`);
  }
  console.log("");
  table.push({ case: "COMPOSED_FROM_CLAIMS", deterministic: det.length, detCodes: [...new Set(det.map((r) => r.code))].join(","), semantic: "see above", semCodes: "" });
}

console.log("── ACCOUNTING ─────────────────────────────────────────────");
console.table(table);
if (RUN_SEMANTIC) {
  console.log(`model tokens: ${totalIn} in / ${totalOut} out`);
}
