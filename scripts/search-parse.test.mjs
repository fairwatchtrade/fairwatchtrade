/* Search Flight 1 — parser + matcher verification.
   Runs the §11 interpretation and exact-identity cases against the REAL
   lib/search/parse.ts (compiled on the fly via tsx-style import of the
   transpiled build is overkill here — we import the TS source through a
   lightweight strip, since the file is dependency-free).

   Run: node scripts/search-parse.test.mjs
*/
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "..", "lib", "search", "parse.ts"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const { parseSearch, matchesSearch, normalizeListingCode } = mod;

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL  ${name}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual  : ${JSON.stringify(actual)}`);
  }
}
const labels = (s) => s.meanings.map((m) => m.label);

/* ── Interpretation ── */
let s = parseSearch("parmigiani kalpa -gold");
check("parmigiani kalpa -gold", labels(s), [
  "Brand: Parmigiani Fleurier",
  "Collection: Kalpa",
  "Exclude Case Material: Gold",
]);

s = parseSearch('"small seconds"');
check('"small seconds"', labels(s), ["Complication: Small Seconds"]);

s = parseSearch(">=28800vph");
check(">=28800vph", labels(s), ["Beat rate: 28,800 vph or higher"]);

s = parseSearch("manual wind power reserve >5d");
check("collector syntax", labels(s).sort(), [
  "Movement: Manual Wind",
  "Power Reserve: More than 5 days",
]);

s = parseSearch("manual wind with more than 5 days of power reserve");
check("ordinary language equivalent", labels(s).sort(), [
  "Movement: Manual Wind",
  "Power Reserve: More than 5 days",
]);

s = parseSearch("power reserve");
check("plain power reserve", labels(s), ["Power Reserve: Present"]);

s = parseSearch("gold-ish maybe sporty?");
check("ambiguous fallback stays text", labels(s), ["Search text: gold-ish maybe sporty?"]);
check("fallback creates no exclusions", s.meanings.every((m) => m.kind === "text"), true);

s = parseSearch("manual wind blue dial power reserve under 40mm full set independent maker");
/* v3.17 (Smart Search dial color, shipped + device-verified) taught the
   parser "blue dial" — this expectation predated that flight and had been
   failing against the ruled, shipped behavior ever since. The Search
   Completion Flight corrects the EXPECTATION: the recognized dial family is
   a meaning, and only the genuinely unknown words remain text. */
check("long query keeps unknown words as text", labels(s).sort(), [
  "Case size: under 40 mm",
  "Dial Color: Blue",
  "Movement: Manual Wind",
  "Power Reserve: Present",
  "Search text: full set independent maker",
].sort());

s = parseSearch("automatic chronograph with date");
check("automatic + chronograph + with date", labels(s), [
  "Complication: Date",
  "Movement: Automatic",
  "Complication: Chronograph",
]);

/* -gold must not touch dials or ordinary text */
const goldDial = {
  brand: "Omega",
  model: "De Ville",
  reference: "111",
  details: { caseMaterial: "Steel", dialColorType: "Gold" },
};
const goldCase = {
  brand: "Omega",
  model: "De Ville",
  reference: "112",
  details: { caseMaterial: "Gold" },
};
s = parseSearch("-gold");
check("-gold keeps gold DIAL", matchesSearch(goldDial, s), true);
check("-gold excludes gold CASE", matchesSearch(goldCase, s), false);

/* ── Exact identity ── */
check("q15932", normalizeListingCode("q15932"), "q15932");
check("Q15932", normalizeListingCode("Q15932"), "q15932");
check("q-15932", normalizeListingCode("q-15932"), "q15932");
check("not a code", normalizeListingCode("q1593"), null);
check("not a code 2", normalizeListingCode("qq15932"), null);

const withCode = { brand: "X", model: null, reference: "AB1", public_code: "q15932" };
const withoutCode = { brand: "X", model: null, reference: "AB2", public_code: "z00001" };
s = parseSearch("Q-15932".toLowerCase());
check("code matches its listing", matchesSearch(withCode, s), true);
check("code rejects others", matchesSearch(withoutCode, s), false);

s = parseSearch("SBGH201", { knownReferences: ["SBGH201", "166.0209"] });
check("exact reference resolves", s.reference, "SBGH201");
check(
  "reference is identity, not keyword",
  matchesSearch({ brand: "Grand Seiko", model: "SBGH201 tribute homage", reference: "OTHER" }, s),
  false
);
check(
  "reference matches its listing",
  matchesSearch({ brand: "Grand Seiko", model: "Heritage", reference: "SBGH201" }, s),
  true
);

s = parseSearch("SBGH201");
/* Exact Identifier Search Law (Search Completion Flight) — SUPERSEDES the
   old fall-back-to-text behavior this case used to assert. An
   identifier-shaped query stays an exact request even when unknown: it
   becomes state.reference verbatim (never substring text luck), the live
   result is the honest no-match state, and the saved-Search watcher matches
   the day a listing carrying exactly this reference arrives. */
check("unknown identifier stays an exact request", s.reference, "SBGH201");
check("unknown identifier produces no loose meanings", s.meanings.length, 0);

/* ── Matching semantics ── */
const kalpa = {
  brand: "Parmigiani Fleurier",
  model: "Kalpa Hebdomadaire",
  reference: "PFC101",
  details: {
    caseMaterial: "Steel",
    movementType: "Manual Wind",
    powerReserve: "192", // hours = 8 days
    caseSizeMm: "37",
    complications: ["Small Seconds", "Power Reserve Indicator"],
    movementFrequency: "21600",
  },
};
check("full stack matches", matchesSearch(kalpa, parseSearch("parmigiani kalpa -gold")), true);
check("pr>5d matches 8-day watch", matchesSearch(kalpa, parseSearch("power reserve >5d")), true);
check(
  "pr>8d rejects 8-day watch (strictly more)",
  matchesSearch(kalpa, parseSearch("power reserve >8d")),
  false
);
check("small seconds quoted", matchesSearch(kalpa, parseSearch('"small seconds"')), true);
check("beat floor rejects 21600", matchesSearch(kalpa, parseSearch(">=28800vph")), false);
check("under 40mm matches 37", matchesSearch(kalpa, parseSearch("under 40mm")), true);
check("under 37mm rejects 37 (strict)", matchesSearch(kalpa, parseSearch("under 37mm")), false);

/* ── Removal rewrites the visible text (rev-2 correction) ── */
const { removeMeaningFromQuery } = mod;
const rq = (text, pick) => {
  const st = parseSearch(text);
  const m = st.meanings.find((x) => x.label === pick);
  return m ? removeMeaningFromQuery(text, m) : `MEANING NOT FOUND: ${pick}`;
};
check(
  "remove kalpa from 'parmigiani kalpa -gold'",
  rq("parmigiani kalpa -gold", "Collection: Kalpa"),
  "parmigiani -gold"
);
check(
  "remove -gold keeps the rest",
  rq("parmigiani kalpa -gold", "Exclude Case Material: Gold"),
  "parmigiani kalpa"
);
check(
  "remove brand keeps the rest",
  rq("parmigiani kalpa -gold", "Brand: Parmigiani Fleurier"),
  "kalpa -gold"
);
check(
  "remove quoted phrase",
  rq('parmigiani "small seconds"', "Complication: Small Seconds"),
  "parmigiani"
);
check(
  "remove measured pr from collector syntax",
  rq("manual wind power reserve >5d", "Power Reserve: More than 5 days"),
  "manual wind"
);
check(
  "remove movement from ordinary language",
  rq("manual wind with more than 5 days of power reserve", "Movement: Manual Wind"),
  "with more than 5 days of power reserve"
);
check(
  "remove vph comparison",
  rq("kalpa >=28800vph", "Beat rate: 28,800 vph or higher"),
  "kalpa"
);
check(
  "remove text fallback words",
  rq("kalpa gold-ish maybe", "Search text: gold-ish maybe"),
  "kalpa"
);
// '-gold' removal must not eat the word 'gold' inside other tokens
check(
  "removing -gold never touches 'golden' text",
  rq("golden -gold", "Exclude Case Material: Gold"),
  "golden"
);
// re-parse after removal yields exactly the remaining meanings
{
  const after = parseSearch(rq("parmigiani kalpa -gold", "Collection: Kalpa"));
  check(
    "post-removal reparse state",
    after.meanings.map((x) => x.label).sort(),
    ["Brand: Parmigiani Fleurier", "Exclude Case Material: Gold"]
  );
}

/* ── Unmatched-quote tolerance (pre-commit correction) ── */
s = parseSearch('"Omega');
check('"Omega → text Omega', labels(s), ["Search text: omega"]);
s = parseSearch('Omega"');
check('Omega" → text Omega', labels(s), ["Search text: omega"]);
s = parseSearch("“Omega");
check("curly-open Omega → text Omega", labels(s), ["Search text: omega"]);
s = parseSearch("Omega”");
check("curly-close Omega → text Omega", labels(s), ["Search text: omega"]);
s = parseSearch('"Omega -gold');
check('"Omega -gold → text + exclusion', labels(s).sort(), [
  "Exclude Case Material: Gold",
  "Search text: omega",
]);
s = parseSearch('"Omega"');
check('"Omega" balanced stays quoted phrase', labels(s), ["Search text: omega"]);
check('"Omega" quoted source keeps quotes', s.meanings[0].source, ['"omega"']);
s = parseSearch('"Omega Seamaster"');
check('"Omega Seamaster" balanced phrase', labels(s), ["Search text: omega seamaster"]);
s = parseSearch("“Omega Seamaster”");
check("balanced CURLY phrase behaves like straight", labels(s), [
  "Search text: omega seamaster",
]);
s = parseSearch('"small seconds"');
check("balanced quoted operator phrase still resolves", labels(s), [
  "Complication: Small Seconds",
]);

/* unmatched quote must actually MATCH the Omega listing */
const omegaListing = {
  brand: "Omega",
  model: "Seamaster",
  reference: "166.0209",
  details: { caseMaterial: "Steel" },
};
const goldOmega = {
  brand: "Omega",
  model: "De Ville",
  reference: "167.0000",
  details: { caseMaterial: "Gold" },
};
check('"Omega finds the Omega listing', matchesSearch(omegaListing, parseSearch('"Omega')), true);
check(
  '"Omega -gold keeps steel Omega',
  matchesSearch(omegaListing, parseSearch('"Omega -gold')),
  true
);
check(
  '"Omega -gold drops gold Omega',
  matchesSearch(goldOmega, parseSearch('"Omega -gold')),
  false
);

/* removal still rewrites text when the collector typed a curly quote */
{
  const st = parseSearch("“Omega Seamaster” -gold");
  const phrase = st.meanings.find((x) => x.label === "Search text: omega seamaster");
  check(
    "removing curly-quoted phrase excises it",
    removeMeaningFromQuery("“Omega Seamaster” -gold", phrase),
    "-gold"
  );
}

/* ── Multiword case-material meaning (pre-commit correction) ── */
s = parseSearch("omega gold filled");
check("omega gold filled", labels(s).sort(), [
  "Case Material: Gold Filled",
  "Search text: omega",
]);
s = parseSearch("omega -gold filled");
check("omega -gold filled", labels(s).sort(), [
  "Exclude Case Material: Gold Filled",
  "Search text: omega",
]);
s = parseSearch('"Omega -gold filled');
check('"Omega -gold filled (unmatched quote)', labels(s).sort(), [
  "Exclude Case Material: Gold Filled",
  "Search text: omega",
]);
s = parseSearch("omega gold");
check("omega gold → positive Gold", labels(s).sort(), [
  "Case Material: Gold",
  "Search text: omega",
]);
s = parseSearch("omega -gold");
check("omega -gold → exclude Gold", labels(s).sort(), [
  "Exclude Case Material: Gold",
  "Search text: omega",
]);

const goldFilledOmega = {
  brand: "Omega",
  model: "Seamaster",
  reference: "166.0209",
  details: { caseMaterial: "Gold Filled" },
};
const solidGoldOmega = {
  brand: "Omega",
  model: "Constellation",
  reference: "168.005",
  details: { caseMaterial: "Gold" },
};
check(
  "gold filled MATCHES the Gold Filled Omega",
  matchesSearch(goldFilledOmega, parseSearch("omega gold filled")),
  true
);
check(
  "-gold filled EXCLUDES the Gold Filled Omega",
  matchesSearch(goldFilledOmega, parseSearch("omega -gold filled")),
  false
);
check(
  '"Omega -gold filled excludes it too',
  matchesSearch(goldFilledOmega, parseSearch('"Omega -gold filled')),
  false
);
check(
  "positive gold does NOT match Gold Filled",
  matchesSearch(goldFilledOmega, parseSearch("omega gold")),
  false
);
check(
  "positive gold DOES match solid Gold",
  matchesSearch(solidGoldOmega, parseSearch("omega gold")),
  true
);
check(
  "-gold keeps Gold Filled (exact exclusion only)",
  matchesSearch(goldFilledOmega, parseSearch("omega -gold")),
  true
);
check(
  "-gold filled keeps solid Gold",
  matchesSearch(solidGoldOmega, parseSearch("omega -gold filled")),
  true
);

/* removal still rewrites the visible query */
check(
  "remove Gold Filled exclusion from text",
  rq("omega -gold filled", "Exclude Case Material: Gold Filled"),
  "omega"
);
check(
  "remove positive Gold Filled from text",
  rq("omega gold filled", "Case Material: Gold Filled"),
  "omega"
);
/* prior single-word behavior unregressed */
check(
  "kalpa flow unchanged: -gold still excludes only Gold",
  rq("parmigiani kalpa -gold", "Exclude Case Material: Gold"),
  "parmigiani kalpa"
);

/* ══ Exact Identifier Search Law — Search Completion Flight ═══════════════
   An exact identifier search is a promise. Related never masquerades as
   found. Fixtures mirror real production shapes (a Parmigiani reference and
   lowercase no-hyphen listing codes). */

const lawRefs = ["PFC274-0000600-HC3142", "166.0209", "1210", "SBGH201"];
const lawPfc = {
  brand: "Parmigiani Fleurier",
  model: "Tonda GT",
  reference: "PFC274-0000600-HC3142",
  public_code: "o96825",
  details: {},
};
const lawOmega = {
  brand: "Omega",
  model: "Seamaster Cosmic",
  reference: "166.0209",
  public_code: "k26573",
  details: {},
};
const lawSeiko = {
  brand: "Grand Seiko",
  model: "Heritage",
  reference: "SBGH201",
  public_code: "b11111",
  details: {},
};
const lawFixtures = [lawPfc, lawOmega, lawSeiko];
const lawOpts = { knownReferences: lawRefs };
const matchCount = (state) => lawFixtures.filter((l) => matchesSearch(l, state)).length;

/* exact listing code — as stored, case difference, optional hyphen */
s = parseSearch("o96825");
check("exact code resolves", s.code, "o96825");
check("exact code returns exactly its listing", matchesSearch(lawPfc, s), true);
check("exact code excludes every other listing", matchCount(s), 1);
s = parseSearch("O96825");
check("code case difference normalizes", s.code, "o96825");
s = parseSearch("O-96825");
check("optional code hyphen normalizes", s.code, "o96825");
check("hyphenated code still returns its listing", matchesSearch(lawPfc, s), true);

/* code-shaped query with no owner → clear exact no-match, never a neighbor */
s = parseSearch("q15932");
check("unknown code stays an exact request", s.code, "q15932");
check("unknown code matches nothing", matchCount(s), 0);
s = parseSearch("o96826"); // one character from a real code
check("near-miss code never substitutes", matchCount(s), 0);

/* exact manufacturer reference — as stored + case difference */
s = parseSearch("PFC274-0000600-HC3142", lawOpts);
check("exact reference resolves", s.reference, "PFC274-0000600-HC3142");
check("exact reference returns exactly its listing", matchesSearch(lawPfc, s), true);
check("exact reference excludes every other listing", matchCount(s), 1);
s = parseSearch("pfc274-0000600-hc3142", lawOpts);
check("reference case difference resolves to canonical", s.reference, "PFC274-0000600-HC3142");
check("case-different reference still returns its listing", matchesSearch(lawPfc, s), true);

/* governed punctuation: digit-only and dotted references resolve through
   the known-reference identity path (the bare-number law is untouched) */
s = parseSearch("166.0209", lawOpts);
check("dotted reference resolves exactly", s.reference, "166.0209");
check("dotted reference returns its listing", matchesSearch(lawOmega, s), true);

/* the no-substitution family — every corruption is a different watch */
s = parseSearch("PFC274-0000600-HC3143", lawOpts); // one-character substitution
check("one-character substitution stays exact", s.reference, "PFC274-0000600-HC3143");
check("one-character substitution matches nothing", matchCount(s), 0);
s = parseSearch("PFC274-000600-HC3142", lawOpts); // omitted character
check("omitted character matches nothing", matchCount(s), 0);
s = parseSearch("PFC274-0000600", lawOpts); // missing suffix — the substring hazard
check("missing suffix stays an exact request", s.reference, "PFC274-0000600");
check("missing suffix never substring-returns the full reference", matchesSearch(lawPfc, s), false);
s = parseSearch("PFC274-0000600-HC3142X", lawOpts); // added suffix
check("added suffix matches nothing", matchCount(s), 0);
s = parseSearch("SBGH200", lawOpts); // unknown closely resembling a known
check("lookalike identifier stays exact", s.reference, "SBGH200");
check("lookalike identifier never returns its neighbor", matchesSearch(lawSeiko, s), false);

/* exact no-match state shape: identifier set, zero meanings, zero results */
s = parseSearch("UB0134101B1U9", lawOpts);
check("no-match state carries the identifier", s.reference, "UB0134101B1U9");
check("no-match state carries no meanings", s.meanings.length, 0);
check("no-match state returns nothing", matchCount(s), 0);

/* identifier-shape boundaries — the conservative edges stay ordinary text */
s = parseSearch("5711", lawOpts); // pure digits: bare-number law holds
check("pure digits stay text, never a guessed identifier", s.reference, null);
s = parseSearch("gmt2", lawOpts); // under the five-character floor
check("short mixed token stays text", s.reference, null);
s = parseSearch("omega PFC274-0000600", lawOpts); // identifier inside a sentence
check("multi-word query is never an exact-identifier claim", s.reference, null);

/* unmatched quotation recovery — the order's exact production example */
s = parseSearch('"omega -gold filled');
check("unmatched quote + minus material recovers", labels(s).sort(), [
  "Exclude Case Material: Gold Filled",
  "Search text: omega",
].sort());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
