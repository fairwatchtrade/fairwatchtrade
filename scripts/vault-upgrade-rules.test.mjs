/* Vault Specification Upgrade — legacy-safe-v1 upgrade-rule tests.
   Run: node scripts/vault-upgrade-rules.test.mjs */
import assert from "node:assert/strict";
import {
  fixtureBytes,
  fixtureJson,
  encode,
  loadEngine,
} from "./vault-upgrade-fixtures/engine-helper.mjs";

const { engine } = await loadEngine();
let pass = 0;
const ok = (name, condition) => {
  assert.ok(condition, name);
  pass++;
};

const run = (name) =>
  engine.analyzeSource({ filename: name, bytes: fixtureBytes(name) });

// Recognized file with only missing empty arrays → STRUCTURAL_UPGRADE_READY.
{
  const r = await run("legacy-empty-structures.json");
  ok("empty-structures → STRUCTURAL_UPGRADE_READY", r.status === "STRUCTURAL_UPGRADE_READY");
  const actions = r.ledger.map((l) => l.action);
  ok(
    "only container adds + canonical serialization",
    actions.every(
      (a) => a === "add-empty-container" || a === "canonical-serialize"
    )
  );
  ok("candidate exists", r.candidate !== null);
  const candidate = JSON.parse(r.candidate.text);
  ok("added Brand.search_aliases is empty", Array.isArray(candidate.search_aliases) && candidate.search_aliases.length === 0);
  const variant = candidate.Collections[0].Families[0].Variants[0];
  ok("added Variant.references is empty", Array.isArray(variant.references) && variant.references.length === 0);
  const source = fixtureJson("legacy-empty-structures.json");
  ok(
    "prose preserved exactly",
    candidate.description === source.description &&
      variant.description ===
        source.Collections[0].Families[0].Variants[0].description &&
      variant.notes === source.Collections[0].Families[0].Variants[0].notes
  );
  ok(
    "optional containers were NOT added",
    !("search_aliases" in candidate.Collections[0]) &&
      !("search_aliases" in candidate.Collections[0].Families[0])
  );
}

// Exact Reference strings convert only to { "reference": "<exact string>" }.
{
  const r = await run("legacy-reference-strings.json");
  ok("reference-strings → STRUCTURAL_UPGRADE_READY", r.status === "STRUCTURAL_UPGRADE_READY");
  const candidate = JSON.parse(r.candidate.text);
  const refs = candidate.Collections[0].Families[0].Variants[0].references;
  ok("both strings converted", refs.length === 2);
  ok(
    "conversion is exact and minimal",
    JSON.stringify(refs[0]) === '{"reference":"FH-100-BL"}' &&
      JSON.stringify(refs[1]) === '{"reference":"FH-100-SL"}'
  );
  ok(
    "each conversion is in the ledger",
    r.ledger.filter((l) => l.action === "convert-reference-string").length === 2
  );
}

// Missing factual fields → RESEARCH_REQUIRED, every unresolved path listed.
{
  const r = await run("legacy-lowercase-research-gaps.json");
  ok("research-gaps → RESEARCH_REQUIRED", r.status === "RESEARCH_REQUIRED");
  ok(
    "detected as SUPPORTED_LEGACY_CONTRACT",
    r.detection.sourceContract === "SUPPORTED_LEGACY_CONTRACT" &&
      r.detection.mappingSelected.includes("legacy-lowercase")
  );
  const paths = r.issues.map((i) => i.path);
  for (const required of [
    "/description",
    "/country_of_origin",
    "/region",
    "/independent_status",
    "/revival_status",
    "/cluster",
    "/cluster_rationale",
    "/Collections/0/Families/0/Variants/0/description",
    "/Collections/0/Families/0/Variants/0/notes",
  ]) {
    ok(`unresolved path listed: ${required}`, paths.includes(required));
  }
  ok("no candidate fabricated for unresolved file", r.candidate === null);
  ok(
    "legacy renames still recorded",
    r.ledger.some((l) => l.action === "rename-key" && l.after === "Brand")
  );
}

// Legacy lifecycle value moves exactly; ownership is never guessed.
{
  const doc = fixtureJson("current-v3.2.json");
  doc.independent_status = "defunct";
  delete doc.revival_status;
  const r = await engine.analyzeSource({
    filename: "defunct.json",
    bytes: encode(doc),
  });
  ok("defunct file detected as legacy (EXPLICIT)", r.detection.certaintyClass === "EXPLICIT");
  const move = r.ledger.find((l) => l.action === "move-value");
  ok(
    "defunct → revival_status discontinued via registered rule",
    move?.after === "discontinued" && move?.rule === "LSV1-MOVE-LIFECYCLE-DEFUNCT"
  );
  ok("ownership left unresolved, never guessed", r.status === "RESEARCH_REQUIRED" &&
    r.issues.some((i) => i.path === "/independent_status" && i.code === "MISSING_REQUIRED_FACT"));
}

// Conflicting lifecycle mappings → DECISION_REQUIRED, no move applied.
{
  const r = await run("lifecycle-conflict.json");
  ok("lifecycle conflict → DECISION_REQUIRED", r.status === "DECISION_REQUIRED");
  ok(
    "conflict reported, not resolved",
    r.issues.some((i) => i.code === "LIFECYCLE_CONFLICT")
  );
  ok("no move applied on conflict", !r.ledger.some((l) => l.action === "move-value"));
}

// Structurally ambiguous input → AMBIGUOUS_SOURCE_FORMAT, no guessing.
{
  const r = await run("ambiguous-format.json");
  ok("mixed markers → AMBIGUOUS_SOURCE_FORMAT", r.status === "AMBIGUOUS_SOURCE_FORMAT");
  ok("no transforms attempted", r.ledger.length === 0);
  ok("no candidate", r.candidate === null);
}

// A legacy root id has a disposition the specification itself decides: v3.2
// permits "id" only on a Variant, so the field is omitted from the candidate
// rather than stopping the upgrade — and the exact value it carried survives
// in the ledger, so the change report still accounts for it.
{
  const r = await run("legacy-lowercase-with-id.json");
  ok("legacy root id no longer blocks", r.status !== "BLOCKED");
  ok(
    "no unsupported-field finding remains for the disposed id",
    !r.issues.some((i) => i.path === "/id")
  );
  const row = r.ledger.find((l) => l.path === "/id");
  ok(
    "disposition recorded with the exact removed value",
    row?.action === "omit-legacy-field" &&
      row?.before === "fixture-horlogerie" &&
      row?.rule === "LSV2-DISPOSE-BRAND-ID"
  );
  ok(
    "the governing specification clause is stated in the reason",
    typeof row?.reason === "string" && row.reason.includes("v3.2 §4")
  );
}

// The disposition registry is an allowlist, never "drop what I don't know".
// An unregistered unknown field still stops the upgrade for a human.
{
  const r = await run("unsupported-fields.json");
  ok(
    "unregistered unknown fields still block",
    r.issues.some((i) => i.code === "UNSUPPORTED_SCHEMA_FIELD")
  );
  ok(
    "nothing unregistered was silently omitted",
    !r.ledger.some(
      (l) => l.action === "omit-legacy-field" && !String(l.rule).startsWith("LSV2-DISPOSE-")
    )
  );
}

// Variant.id is explicitly allowed by v3.2 §7 and must survive untouched.
{
  const r = await run("legacy-lowercase-with-id.json");
  ok(
    "no disposition was applied at variant level",
    !r.ledger.some(
      (l) => l.action === "omit-legacy-field" && String(l.path).includes("/Variants/")
    )
  );
}

// Dangerous Reference-like numbers are never promoted.
{
  const r = await run("reference-false-positive.json");
  ok(
    "false-positive fixture is current spec, untouched",
    r.status === "CURRENT_SPEC_NO_CHANGE"
  );
  ok("no reference conversion invented", !r.ledger.some((l) => l.action === "convert-reference-string"));
  ok("no issues fabricated from notes numbers", r.issues.length === 0);
}

// No generated descriptions, no guessed lifecycle values anywhere: every
// analysis of the research-gap fixture leaves gaps as gaps.
{
  const r = await run("legacy-lowercase-research-gaps.json");
  ok(
    "no description text was generated",
    !r.ledger.some((l) => String(l.path).endsWith("/description"))
  );
  ok(
    "no lifecycle value was invented",
    !r.ledger.some((l) => l.path === "/revival_status")
  );
}

// No silent field deletion: a blocked unknown field keeps its exact value in
// the record; nothing in any ledger deletes content.
{
  const r = await run("unsupported-fields.json");
  ok(
    "no ledger row deletes anything",
    r.ledger.every((l) =>
      ["rename-key", "move-value", "add-empty-container", "convert-reference-string", "canonical-serialize"].includes(l.action)
    )
  );
}

// ── v3.2 §12/§13: material and dial never create hierarchy ───────────────
// The closed schema cannot express this rule, so it is checked separately.
// The fixture carries one example of every branch the detector has.
{
  const r = await run("taxonomy-material-split.json");
  const taxonomy = r.issues.filter(
    (i) => i.code === "TAXONOMY_HIERARCHY_VIOLATION"
  );
  const flagged = new Set(taxonomy.map((i) => i.path));
  const V = (f, v) => `/Collections/0/Families/${f}/Variants/${v}/name`;

  ok(
    "a material/dial split is a decision, not a research gap",
    r.status === "DECISION_REQUIRED"
  );
  ok("the taxonomy finding holds the candidate", r.candidate === null);
  ok("exactly the three violating Variants are raised", taxonomy.length === 3);

  // Siblings separated by nothing but case material and dial colour.
  ok("sibling split on material/dial is raised", flagged.has(V(0, 0)));
  ok("both sides of a sibling split are raised", flagged.has(V(0, 1)));

  // An only child has no sibling to define it, so it is read against its
  // parent Family. This also proves diacritics fold: the Family is spelled
  // "Reserve" and the Variant "Réserve", and they must compare as equal.
  ok("only-child falls back to the parent Family", flagged.has(V(1, 0)));

  // The three that must survive — each for a different reason.
  ok(
    "a collector identity beside a material word survives",
    !flagged.has(V(2, 0))
  );
  ok("a model designation beside a material word survives", !flagged.has(V(3, 0)));
  ok("a Variant that claims nothing extra is left alone", !flagged.has(V(4, 0)));

  // The point of the rule: the presence of a material word proves nothing.
  // Both Variants that survive on identity carry one anyway, so neither was
  // spared by a word-level scan finding nothing to object to.
  const fam = fixtureJson("taxonomy-material-split.json").Collections[0].Families;
  const survivorsWithMaterial = [fam[2].Variants[0].name, fam[3].Variants[0].name];
  ok(
    "surviving Variants were not spared for lacking a material word",
    survivorsWithMaterial.every((n) => /Honeygold|Platinum/.test(n))
  );

  ok(
    "the finding cites the governing specification clause",
    taxonomy.every((i) => i.reason.includes("§13") && i.reason.includes("§12"))
  );
  ok(
    "the finding names the exact distinction it objected to",
    taxonomy.some((i) => /steel|black/.test(i.reason))
  );

  // The detector reports; it never rewrites what it found.
  ok(
    "no hierarchy was restructured by the detector",
    !r.ledger.some(
      (l) => l.action === "move-value" || String(l.path).includes("/Variants/")
    )
  );
}

// A file whose Variants carry real identity raises nothing at all.
{
  const r = await run("current-v3.2.json");
  ok(
    "a clean current-spec file stays clean under the taxonomy rule",
    r.status === "CURRENT_SPEC_NO_CHANGE" && r.issues.length === 0
  );
}

console.log(`vault-upgrade-rules: ${pass} assertions PASS`);
