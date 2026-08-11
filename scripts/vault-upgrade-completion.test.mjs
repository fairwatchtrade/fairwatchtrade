/* Vault Specification Upgrade — completion-pass tests.

   Proves the behaviours that turn the room from a diagnostic into an
   updater: bounded requests, evidence-gated application, the dedicated
   reference pass, retry, cancel, per-file isolation, the acceptance gate,
   and the no-mutation boundary.

   The research transport is injected, so every assertion here runs offline
   against the real engine, the real schema companion, and the real
   verified contract. */

import { readFileSync } from "node:fs";
import { loadEngine, fixtureBytes } from "./vault-upgrade-fixtures/engine-helper.mjs";

let passed = 0;
const failures = [];
function ok(label, condition) {
  if (condition) passed++;
  else failures.push(label);
}

const { engine, contract, schema } = await loadEngine();
const { completeUpgrade, CompletionCancelled } = await import(
  "../lib/vault-upgrade/complete.ts"
);
const { validateResearchPayload, MAX_REQUESTS_PER_CALL, extractJsonObject } =
  await import("../lib/vault-upgrade/research.ts");
const { buildCompletionReport, serializeCompletionReport } = await import(
  "../lib/vault-upgrade/reports.ts"
);

const SOURCE = "https://example.org/manufacturer/history";
const src = (n = 1) =>
  Array.from({ length: n }, (_, i) => ({
    title: `Reference source ${i + 1}`,
    publisher: "Example Horological Press",
    url: `${SOURCE}#${i}`,
  }));

/* Deterministic, contract-legal answers for the fixture's gaps. */
const ANSWERS = {
  description:
    "Independent Swiss workshop producing mechanical wristwatches in small annual series, known among collectors for hand-finished movements and a restrained house style maintained since its founding.",
  country_of_origin: "Switzerland",
  region: "Europe",
  independent_status: "independent",
  revival_status: "active",
  cluster: "Contemporary Independent",
  cluster_rationale:
    "Small independent maker whose collectors follow contemporary independent watchmaking rather than heritage Swiss houses.",
};

const VARIANT_DESCRIPTION =
  "Time-only model recognised by its lacquered blue dial and slim case, produced in limited annual numbers and valued by collectors for its hand-finished movement and legible layout.";
const VARIANT_NOTES = "38mm steel case; manual-wind; 42h power reserve.";

/** The answer a well-sourced transport gives for one request. */
function answerFor(r) {
  if (r.kind === "variant-references") return [{ reference: "FH-100-BL" }];
  if (r.kind === "variant-description") return VARIANT_DESCRIPTION;
  if (r.kind === "variant-notes") return VARIANT_NOTES;
  return ANSWERS[r.field];
}

/** A transport that answers every question with well-sourced values. */
function goodTransport(log) {
  return async ({ requests, pass }) => {
    log?.push({ pass, paths: requests.map((r) => r.path) });
    return {
      ok: true,
      unanswered: [],
      results: requests.map((r) => ({
        path: r.path,
        outcome: "VERIFIED",
        value: answerFor(r),
        sources: src(),
        evidence: "Established by the cited source.",
        confidence: "high",
      })),
    };
  };
}

const GAPS = "legacy-lowercase-research-gaps.json";

async function complete(fixture, transport, extra = {}) {
  return completeUpgrade({
    engine,
    schema,
    contract,
    filename: fixture,
    bytes: fixtureBytes(fixture),
    transport,
    ...extra,
  });
}

/* ── 1. The whole point: a legacy file comes out finished ─────────────── */
{
  const log = [];
  const r = await complete(GAPS, goodTransport(log));

  ok("researchable legacy file completes", r.status === "CANDIDATE_READY");
  ok("a candidate was frozen", r.candidate !== null);
  ok("no contract findings remain", r.issues.length === 0);
  ok("nothing was left for a human", r.decisions.length === 0);

  const parsed = JSON.parse(r.candidate.text);
  ok("candidate is strict-valid JSON", typeof parsed === "object");
  ok("candidate hash recorded", /^[0-9a-f]{64}$/.test(r.candidate.sha256));
  ok("ledger hash recorded", /^[0-9a-f]{64}$/.test(r.candidate.ledgerSha256));
  ok(
    "active specification identity captured",
    r.specificationSha256 === contract.identity.specificationSha256 &&
      r.contractId === contract.identity.contractId
  );

  /* Prior facts the file already asserted survive untouched. */
  const original = JSON.parse(fixtureBytes(GAPS).toString("utf8"));
  ok("prior brand name preserved", parsed.Brand === original.name);
  ok(
    "prior aliases preserved exactly",
    JSON.stringify(parsed.search_aliases) ===
      JSON.stringify(original.search_aliases)
  );
  ok(
    "prior hierarchy preserved",
    parsed.Collections[0].Families[0].Variants[0].name ===
      original.collections[0].families[0].variants[0].name
  );

  /* Researched facts landed where they belong. */
  ok("brand description applied", parsed.description === ANSWERS.description);
  ok("closed vocabulary respected", parsed.cluster === ANSWERS.cluster);
  ok(
    "variant description applied",
    parsed.Collections[0].Families[0].Variants[0].description ===
      VARIANT_DESCRIPTION
  );

  /* Provenance exists for every researched change, and lives outside the
     candidate — the specification closes every object in the file. */
  ok(
    "every applied fact has provenance with a source",
    r.provenance
      .filter((p) => p.outcome === "VERIFIED")
      .every((p) => p.sources.length > 0 && p.sources[0].url.startsWith("http"))
  );
  ok(
    "provenance never leaks into the candidate",
    !r.candidate.text.includes("example.org")
  );
  ok("research was counted", r.counts.completedByResearch > 0);

  /* This fixture's variant already asserts a reference, so the reference
     pass correctly leaves it alone rather than second-guessing the source. */
  const passes = log.map((l) => l.pass);
  ok(
    "an existing reference is never re-litigated",
    !passes.includes("reference")
  );
  ok(
    "the source's own reference survives verbatim",
    parsed.Collections[0].Families[0].Variants[0].references[0].reference ===
      original.collections[0].families[0].variants[0].references[0]
  );

  /* Requests are bounded by the file's own unresolved paths. */
  const asked = log.flatMap((l) => l.paths);
  ok(
    "no question was asked outside the file's hierarchy",
    asked.every((p) => p === "/" + p.split("/")[1] || p.startsWith("/Collections/"))
  );
  ok(
    "no batch exceeded the call bound",
    log.every((l) => l.paths.length <= MAX_REQUESTS_PER_CALL)
  );
  ok("no path was asked about twice", new Set(asked).size === asked.length);

  /* The completion report is the artifact that carries all of this. */
  const report = buildCompletionReport(
    contract.identity,
    { filename: GAPS, sha256: r.sourceSha256, byteLength: 1 },
    r
  );
  const text = serializeCompletionReport(report);
  ok("report serializes", JSON.parse(text).completion.provenance.length > 0);
  ok(
    "report carries the candidate hashes",
    JSON.parse(text).candidate.sha256 === r.candidate.sha256
  );
}

/* ── 2. Original bytes and hash are never touched ─────────────────────── */
{
  const before = fixtureBytes(GAPS);
  const beforeCopy = Buffer.from(before);
  const r = await complete(GAPS, goodTransport());
  const after = fixtureBytes(GAPS);
  ok("original bytes unchanged on disk", Buffer.compare(beforeCopy, after) === 0);

  const fresh = await engine.analyzeSource({ filename: GAPS, bytes: after });
  ok("original source hash unchanged", fresh.sourceSha256 === r.sourceSha256);
  ok(
    "candidate is a separate artifact, never the original filename",
    r.candidate.filename !== GAPS
  );
}

/* ── 3. Evidence gate: an uncited claim never reaches the candidate ───── */
{
  const uncited = async ({ requests }) => ({
    ok: true,
    unanswered: [],
    results: requests.map((r) => ({
      path: r.path,
      outcome: "VERIFIED",
      value: r.kind === "variant-references" ? [{ reference: "FH-999" }] : answerFor(r),
      sources: [], // no retrievable source
      evidence: "Asserted without a source.",
      confidence: "high",
    })),
  });

  const r = await complete(GAPS, uncited);
  ok("uncited claims produce no candidate", r.candidate === null);
  ok("uncited run needs a human", r.status === "HUMAN_DECISION_REQUIRED");
  ok(
    "no uncited claim was written into the document",
    !r.ledger.some(
      (l) =>
        l.action === "apply-researched-fact" &&
        l.rule !== "RESEARCH-NOTES-EMPTY-PERMITTED"
    )
  );
  ok(
    "the only thing applied was the contract's own permitted empty value",
    r.ledger
      .filter((l) => l.action === "apply-researched-fact")
      .every((l) => l.after === "")
  );
  ok(
    "the rejection is explained in provenance",
    r.provenance.some(
      (p) => p.outcome === "UNSUPPORTED" && /no retrievable source/i.test(p.evidence)
    )
  );
}

/* ── 4. Contract validation of provider output ────────────────────────── */
{
  const requests = [
    {
      path: "/cluster",
      field: "cluster",
      kind: "brand-fact",
      allowedValues: ["Japanese", "Contemporary Independent"],
      context: {},
    },
    {
      path: "/description",
      field: "description",
      kind: "brand-fact",
      wordRange: [20, 50],
      context: {},
    },
  ];

  const unknownPath = validateResearchPayload(
    { results: [{ path: "/not_requested", outcome: "VERIFIED", value: "x" }] },
    requests
  );
  ok("a path nobody asked about is rejected outright", unknownPath.ok === false);

  const notJson = validateResearchPayload("nonsense", requests);
  ok("a non-conforming payload is rejected", notJson.ok === false);

  const dup = validateResearchPayload(
    {
      results: [
        { path: "/cluster", outcome: "UNSUPPORTED" },
        { path: "/cluster", outcome: "UNSUPPORTED" },
      ],
    },
    requests
  );
  ok("duplicate answers are rejected", dup.ok === false);

  const offVocab = validateResearchPayload(
    {
      results: [
        {
          path: "/cluster",
          outcome: "VERIFIED",
          value: "Steampunk",
          sources: src(),
        },
      ],
    },
    requests
  );
  ok(
    "a value outside the closed vocabulary is refused",
    offVocab.ok && offVocab.results[0].outcome === "UNSUPPORTED"
  );

  const tooShort = validateResearchPayload(
    {
      results: [
        {
          path: "/description",
          outcome: "VERIFIED",
          value: "Too short.",
          sources: src(),
        },
      ],
    },
    requests
  );
  ok(
    "prose outside the contract's word range is refused",
    tooShort.ok && tooShort.results[0].outcome === "UNSUPPORTED"
  );

  const unsourced = validateResearchPayload(
    { results: [{ path: "/cluster", outcome: "VERIFIED", value: "Japanese" }] },
    requests
  );
  ok(
    "verified-without-sources is downgraded, never applied",
    unsourced.ok && unsourced.results[0].outcome === "UNSUPPORTED"
  );

  const badUrl = validateResearchPayload(
    {
      results: [
        {
          path: "/cluster",
          outcome: "VERIFIED",
          value: "Japanese",
          sources: [{ title: "t", url: "not-a-url" }],
        },
      ],
    },
    requests
  );
  ok(
    "an unretrievable source does not count as a source",
    badUrl.ok && badUrl.results[0].outcome === "UNSUPPORTED"
  );

  const silent = validateResearchPayload({ results: [] }, requests);
  ok(
    "silence is reported as unanswered, never as permission",
    silent.ok && silent.unanswered.length === 2
  );
}

/* ── 4b. A good answer is not thrown away over its wrapping ───────────── */
{
  const want = { results: [{ path: "/cluster", outcome: "UNSUPPORTED" }] };
  const json = JSON.stringify(want);

  ok("bare JSON parses", JSON.stringify(extractJsonObject(json)) === json);
  ok(
    "a fenced answer still parses",
    JSON.stringify(extractJsonObject("```json\n" + json + "\n```")) === json
  );
  ok(
    "a sentence around the answer is tolerated",
    JSON.stringify(
      extractJsonObject("Here are the results:\n" + json + "\nHope that helps.")
    ) === json
  );
  ok(
    "a brace inside a string never ends the object early",
    JSON.stringify(
      extractJsonObject('{"results":[{"path":"/a","evidence":"a } brace"}]}')
    ) === '{"results":[{"path":"/a","evidence":"a } brace"}]}'
  );
  ok("truncated JSON is still a failure", extractJsonObject('{"results":[{') === undefined);
  ok("prose with no object is a failure", extractJsonObject("no json here") === undefined);
}

/* ── 5. References: empty is a correct answer; names are never references */
{
  const noRefs = async ({ requests, pass }) => ({
    ok: true,
    unanswered: [],
    results: requests.map((r) =>
      pass === "reference"
        ? {
            path: r.path,
            outcome: "VERIFIED",
            value: [],
            sources: src(),
            evidence: "No official manufacturer reference is published.",
            confidence: "moderate",
          }
        : {
            path: r.path,
            outcome: "VERIFIED",
            value: answerFor(r),
            sources: src(),
            evidence: "Established by the cited source.",
            confidence: "high",
          }
    ),
  });

  const log = [];
  const noRefsLogged = async (payload) => {
    log.push({ pass: payload.pass, kinds: payload.requests.map((r) => r.kind) });
    return noRefs(payload);
  };

  const r = await complete("legacy-empty-structures.json", noRefsLogged);
  ok(
    "an empty reference list still yields a valid candidate",
    r.status === "CANDIDATE_READY" && r.candidate !== null
  );

  /* The reference pass is its own stage, and it runs after the hierarchy
     work rather than being folded into it. */
  const passes = log.map((l) => l.pass);
  ok("a dedicated reference pass ran", passes.includes("reference"));
  ok(
    "the reference pass runs after the hierarchy work",
    passes.lastIndexOf("hierarchy") < passes.indexOf("reference")
  );
  ok(
    "the reference pass asks only about references",
    log
      .filter((l) => l.pass === "reference")
      .every((l) => l.kinds.every((k) => k === "variant-references"))
  );
  ok(
    "empty reference arrays are counted as a correct outcome",
    r.counts.emptyReferencesRetained > 0
  );
  ok("no reference was invented", r.counts.referencesAdded === 0);

  /* A "reference" that is really the variant's own name is refused. */
  const nameAsRef = async ({ requests, pass }) => ({
    ok: true,
    unanswered: [],
    results: requests.map((r) =>
      pass === "reference"
        ? {
            path: r.path,
            outcome: "VERIFIED",
            value: [{ reference: String(r.context.variant ?? "") }],
            sources: src(),
            evidence: "Catalogue listing.",
            confidence: "high",
          }
        : {
            path: r.path,
            outcome: "VERIFIED",
            value: answerFor(r),
            sources: src(),
            evidence: "Established by the cited source.",
            confidence: "high",
          }
    ),
  });

  const r2 = await complete("legacy-empty-structures.json", nameAsRef);
  ok(
    "a model name returned as a reference is refused",
    r2.counts.referencesAdded === 0
  );
  ok(
    "the refusal is explained",
    r2.provenance.some((p) => /repeating a name/i.test(p.evidence))
  );
}

/* ── 6. Genuine decisions: hold the smallest possible surface ─────────── */
{
  const unresolvedCluster = async ({ requests }) => ({
    ok: true,
    unanswered: [],
    results: requests.map((r) =>
      r.field === "cluster"
        ? {
            path: r.path,
            outcome: "UNRESOLVED",
            sources: src(2),
            evidence: "Two authoritative sources classify the maker differently.",
            confidence: "moderate",
            options: [
              { value: "Contemporary Independent", evidence: "Maker's own framing.", sources: src() },
              { value: "Heritage Swiss", evidence: "Auction house catalogue.", sources: src() },
            ],
          }
        : {
            path: r.path,
            outcome: "VERIFIED",
            value: answerFor(r),
            sources: src(),
            evidence: "Established by the cited source.",
            confidence: "high",
          }
    ),
  });

  const r = await complete(GAPS, unresolvedCluster);
  ok(
    "a required fact left genuinely undecided holds the candidate",
    r.status === "HUMAN_DECISION_REQUIRED" && r.candidate === null
  );
  const decision = r.decisions.find((d) => d.path === "/cluster");
  ok("the exact undecided path is reported", Boolean(decision));
  ok(
    "both plausible answers are shown with their evidence",
    decision.options.length === 2 && decision.options.every((o) => o.sources.length > 0)
  );
  ok(
    "the reason it could not be automatic is stated",
    /could not choose safely|disagree/i.test(decision.whyNotAutomatic)
  );
  ok(
    "one uncertain fact did not stop the rest of the work",
    r.ledger.filter((l) => l.action === "apply-researched-fact").length > 0
  );
  ok(
    "unresolved is not treated as a blanket outcome",
    r.decisions.length === 1
  );
}

/* ── 7. Retry, cancel, and per-file isolation ─────────────────────────── */
{
  let attempt = 0;
  const flaky = async (payload) => {
    attempt++;
    if (attempt === 1) {
      return { ok: false, code: "RETRYABLE", detail: "Provider unreachable." };
    }
    return goodTransport()(payload);
  };

  const first = await complete(GAPS, flaky);
  ok("a transport failure is retryable, not fatal", first.status === "FAILED_RETRYABLE");
  ok("a failed run produces no candidate", first.candidate === null);
  ok("the blocker is stated exactly", typeof first.blocker === "string");

  const second = await complete(GAPS, flaky);
  ok("retrying the same file succeeds", second.status === "CANDIDATE_READY");

  /* Provider authorization is its own exact blocker, not a generic failure. */
  const unauthorized = async () => ({
    ok: false,
    code: "VAULT_UPGRADE_RESEARCH_PROVIDER_AUTHORIZATION_REQUIRED",
    detail: "The research provider credential is not configured.",
  });
  const blocked = await complete(GAPS, unauthorized);
  ok(
    "missing provider authorization is named exactly",
    blocked.status === "BLOCKED_PROVIDER_AUTHORIZATION"
  );

  /* Cancelling stops the run and leaves the source untouched. */
  const signal = { aborted: false };
  const cancelling = async (payload) => {
    signal.aborted = true;
    return goodTransport()(payload);
  };
  let cancelled = false;
  try {
    await complete(GAPS, cancelling, { signal });
  } catch (err) {
    cancelled = err instanceof CompletionCancelled;
  }
  ok("cancel stops the run", cancelled);
  const afterCancel = await engine.analyzeSource({
    filename: GAPS,
    bytes: fixtureBytes(GAPS),
  });
  ok(
    "cancelling corrupted neither the original nor its analysis",
    afterCancel.sourceSha256 === first.sourceSha256
  );

  /* A failure on one file must not touch another file's result. */
  let call = 0;
  const failsFirstFileOnly = async (payload) => {
    call++;
    if (call === 1) return { ok: false, code: "RETRYABLE", detail: "boom" };
    return goodTransport()(payload);
  };
  const a = await complete(GAPS, failsFirstFileOnly);
  const b = await complete("legacy-empty-structures.json", failsFirstFileOnly);
  ok("first file failed", a.status === "FAILED_RETRYABLE");
  ok("sibling file completed unaffected", b.status === "CANDIDATE_READY");
  ok("sibling candidate is intact", b.candidate !== null);
}

/* ── 8. An already-current file is never dressed up as an upgrade ─────── */
{
  let called = false;
  const r = await complete("current-v3.2.json", async () => {
    called = true;
    return { ok: true, results: [], unanswered: [] };
  });
  ok("current v3.2 reports no change", r.status === "CURRENT_V3_2_NO_CHANGE");
  ok("no candidate is manufactured for an unchanged file", r.candidate === null);
  ok("no research is run against an already-current file", called === false);
}

/* ── 9. Determinism of the frozen artifact ────────────────────────────── */
{
  const a = await complete(GAPS, goodTransport());
  const b = await complete(GAPS, goodTransport());
  ok(
    "identical inputs and answers freeze byte-identical candidates",
    a.candidate.sha256 === b.candidate.sha256
  );
  ok(
    "the change ledger hashes identically too",
    a.candidate.ledgerSha256 === b.candidate.ledgerSha256
  );
}

/* ── 10. The machine boundary, proven at the source level ─────────────── */
{
  /* Scan code, not prose — these files describe the boundary in their own
     comments, and a comment saying "no reconciliation" must not read as a
     reconciliation call. */
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const read = (p) =>
    stripComments(readFileSync(new URL(p, import.meta.url), "utf8"));
  const engineSources = [
    "../lib/vault-upgrade/complete.ts",
    "../lib/vault-upgrade/research.ts",
    "../lib/vault-upgrade/researchClient.ts",
    "../lib/vault-upgrade/analyze.ts",
  ].map(read);

  const forbidden =
    /supabase|galaxy_visible|galaxy_publication|vault_brands|vault_collections|vault_families|vault_variants|vault_references|reconcil|controlled_apply/i;
  ok(
    "the completion engine touches no database, taxonomy, or Galaxy surface",
    engineSources.every((s) => !forbidden.test(s))
  );

  const route = read("../app/api/admin/vault-upgrade/research/route.ts");
  ok(
    "the research route performs no Vault taxonomy or Galaxy operation",
    !/vault_brands|vault_collections|vault_families|vault_variants|vault_references|galaxy_visible|galaxy_publication|reconcil|controlled_apply|\.insert\(|\.update\(|\.upsert\(|\.delete\(/i.test(
      route
    )
  );
  ok(
    "the route uses supabase only to identify the founder",
    /auth\.getUser\(\)/.test(route) && !/\.from\(/.test(route)
  );
  ok(
    "the provider credential is read server-side only",
    /process\.env\.ANTHROPIC_API_KEY/.test(route)
  );
  ok(
    "the credential never reaches the browser bundle",
    !engineSources.some((s) => /ANTHROPIC_API_KEY/.test(s))
  );
  /* Provider identity is configuration, not a result. The model identifier
     belongs in the outbound call and nowhere else — a second occurrence means
     it has been put back into a response body the room's browser can read. */
  ok(
    "the model identifier appears only in the outbound provider call",
    (route.match(/model:\s*MODEL/g) ?? []).length === 1
  );
  ok(
    "no message returned to the room names the credential",
    !/"[^"\n]*ANTHROPIC[^"\n]*"/.test(route)
  );
  ok(
    "an unauthenticated caller is refused before any work",
    route.indexOf("NOT_AUTHORIZED") < route.indexOf("ANTHROPIC_API_KEY")
  );
  ok(
    "no request body or provider payload is logged",
    !/console\.(log|info|warn|error)/.test(route)
  );
}

/* ── A held run hands back its work instead of nothing ────────────────────
   One open taxonomy decision used to discard every researched fact with it,
   leaving the operator to rebuild the file by hand. The decision still holds
   finalisation; it no longer withholds the work product. */
{
  const HELD = "taxonomy-with-research-gaps.json";
  const r = await complete(HELD, goodTransport());

  ok("a taxonomy finding still holds the run", r.status === "HUMAN_DECISION_REQUIRED");
  ok("no final candidate is produced", r.candidate === null);
  ok("the accumulated work product is returned anyway", r.provisionalCandidate !== null);

  /* Final and provisional must never be mistakable for one another. */
  ok(
    "the provisional filename says what it is",
    /\.PROVISIONAL\.[0-9a-f]{8}\.json$/.test(r.provisionalCandidate.filename)
  );
  ok(
    "the provisional carries its own hash and ledger linkage",
    /^[0-9a-f]{64}$/.test(r.provisionalCandidate.sha256) &&
      /^[0-9a-f]{64}$/.test(r.provisionalCandidate.ledgerSha256)
  );
  ok(
    "a held run is never reported as ready",
    r.status !== "CANDIDATE_READY" && r.status !== "READY_WITH_HUMAN_DECISIONS"
  );

  /* The finding is not softened to buy the delivery. */
  const taxonomy = r.issues.filter((i) => i.code === "TAXONOMY_HIERARCHY_VIOLATION");
  ok("both taxonomy findings are still raised", taxonomy.length === 2);
  ok(
    "they are still STRUCTURAL decisions",
    r.decisions.filter((d) => d.scope === "STRUCTURAL").length >= 2
  );

  const provisional = JSON.parse(r.provisionalCandidate.text);
  const source = JSON.parse(fixtureBytes(HELD).toString("utf8"));

  /* The work that was nearly thrown away. */
  ok(
    "researched brand facts survive being held",
    provisional.description === ANSWERS.description &&
      provisional.country_of_origin === ANSWERS.country_of_origin &&
      provisional.cluster === ANSWERS.cluster
  );
  ok(
    "researched variant prose survives being held",
    provisional.Collections[0].Families[0].Variants[0].description ===
      VARIANT_DESCRIPTION
  );
  ok("the provenance behind those facts is recorded", r.provenance.length > 0);
  ok(
    "deterministic structural conversion still happened",
    provisional.Brand === source.name && Array.isArray(provisional.Collections)
  );

  /* Nothing was merged, collapsed, or invented to make it passable. */
  const srcFam = source.collections[0].families[0];
  const outFam = provisional.Collections[0].Families[0];
  ok(
    "no Family or Variant was merged away",
    provisional.Collections.length === source.collections.length &&
      outFam.Variants.length === srcFam.variants.length
  );
  ok(
    "the disputed Variant names are preserved exactly",
    outFam.Variants.map((v) => v.name).join("|") ===
      srcFam.variants.map((v) => v.name).join("|")
  );
  ok(
    "the exact references survive untouched",
    outFam.Variants[0].references[0].reference === "FH-200-BK" &&
      outFam.Variants[1].references[0].reference === "FH-200-SA"
  );
}

/* The clean path is unchanged by any of the above. */
{
  const r = await complete(GAPS, goodTransport());
  ok(
    "a clean run still produces a final candidate",
    r.status === "CANDIDATE_READY" && r.candidate !== null
  );
  ok("a clean run carries no provisional artifact", r.provisionalCandidate === null);
}

if (failures.length) {
  console.error("vault-upgrade-completion FAILURES:");
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`vault-upgrade-completion: ${passed} assertions PASS`);
