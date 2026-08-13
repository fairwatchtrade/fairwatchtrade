/* Collector Dossier — retrieval-bound evidence behaviour.
   Run: node scripts/dossier-retrieval-binding.test.mjs

   A citation is not evidence merely because its URL looks plausible.
   These test the binding behaviour, not that a table exists. Network
   retrieval itself is proven by the production canary, not mocked here. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const { evidenceBindingRefusals, admissionFor, REFUSAL_CODES } =
  await import("../lib/dossier/claimAdmission.ts");
const { htmlToText, retrieveSource } = await import("../lib/dossier/sourceRetrieval.ts");

let n = 0;
const ok = (name, cond) => {
  assert.ok(cond, name);
  console.log(`  PASS ${++n}  ${name}`);
};
const has = (list, code) => list.includes(code);

/* A retrieved page, as the store holds it. */
const PAGE = {
  id: "ret-1",
  requestedUrl: "https://topperjewelers.com/products/x",
  resolvedUrl: "https://topperjewelers.com/products/x",
  host: "topperjewelers.com",
  httpStatus: 200,
  contentSha256: "a".repeat(64),
  text: 'Case Diameter: 42.00 mm. Water Resistance: 200 m (660 ft). Power Reserve: approx. 70 hrs. Frequency: 28,800 v.p.h. Jewels: 47 jewels. Dial: Grey. The bezel’s four rider tabs — a Chronomat signature since 1984.',
  lifecycle: "current",
};
const ctx = (retrievals = [PAGE]) => ({ referenceText: "UB0134101B1U1", retrievals });

const ev = (over = {}) => ({
  sourceClass: "DEALER_ARCHIVE",
  sourceName: "Topper Fine Jewelers — Chronomat B01 42",
  sourceUrl: "https://topperjewelers.com/products/x",
  sourceExcerpt: "Case Diameter: 42.00 mm.",
  sourceAccessed: "2026-08-13",
  retrievalId: "ret-1",
  retrievalSha256: "a".repeat(64),
  ...over,
});
const claim = (over = {}) => ({ outcome: "VERIFIED", values: ["42 mm"], evidence: [ev()], ...over });

/* ── The vocabulary exists and carries no confidence notion ───────────── */
for (const code of [
  "SOURCE_NOT_RETRIEVED", "SOURCE_RETRIEVAL_FAILED", "SOURCE_HOST_MISMATCH",
  "EVIDENCE_NOT_FOUND_IN_RETRIEVED_CONTENT", "CLAIM_VALUE_NOT_SUPPORTED_BY_EVIDENCE",
  "EVIDENCE_CONTENT_CHANGED",
]) {
  assert.ok(REFUSAL_CODES.includes(code), `${code} must be a named refusal`);
}
ok("retrieval/binding refusals are named, and none is a confidence threshold",
  !REFUSAL_CODES.some((c) => /CONFIDENCE|UNSURE|SCORE|LIKELY/i.test(c)));

/* ── Binding: the core gap this flight closes ─────────────────────────── */
ok("a claim bound to real retrieved material passes binding",
  evidenceBindingRefusals(claim(), ctx()).length === 0);

ok("caller-authored evidence with NO retrieval cannot bind",
  has(evidenceBindingRefusals(claim({ evidence: [ev({ retrievalId: null })] }), ctx()),
    "SOURCE_NOT_RETRIEVED"));

ok("a retrieval id nothing retrieved cannot bind",
  has(evidenceBindingRefusals(claim({ evidence: [ev({ retrievalId: "ret-imaginary" })] }), ctx()),
    "SOURCE_NOT_RETRIEVED"));

ok("a fabricated excerpt absent from the retrieved page is refused",
  has(evidenceBindingRefusals(
    claim({ evidence: [ev({ sourceExcerpt: "Produced in a limited run of 500 pieces." })] }), ctx()),
    "EVIDENCE_NOT_FOUND_IN_RETRIEVED_CONTENT"));

ok("a claimed value the retrieved material does not support is refused",
  has(evidenceBindingRefusals(claim({ values: ["44 mm"] }), ctx()),
    "CLAIM_VALUE_NOT_SUPPORTED_BY_EVIDENCE"));

ok("a cited host different from the retrieved host is refused",
  has(evidenceBindingRefusals(
    claim({ evidence: [ev({ sourceUrl: "https://another-shop.com/x" })] }), ctx()),
    "SOURCE_HOST_MISMATCH"));

ok("a source whose content changed after binding is refused, not silently reused",
  has(evidenceBindingRefusals(claim({ evidence: [ev({ retrievalSha256: "b".repeat(64) })] }), ctx()),
    "EVIDENCE_CONTENT_CHANGED"));

ok("a superseded retrieval cannot support a current claim",
  has(evidenceBindingRefusals(claim(), ctx([{ ...PAGE, lifecycle: "superseded" }])),
    "SOURCE_RETRIEVAL_FAILED"));

ok("an error-status retrieval cannot support a claim",
  has(evidenceBindingRefusals(claim(), ctx([{ ...PAGE, httpStatus: 404 }])),
    "SOURCE_RETRIEVAL_FAILED"));

/* ── Normalize presentation noise; preserve factual distinctions ───────── */
ok("same quantity rendered differently still binds (42 mm ↔ 42.00 mm)",
  evidenceBindingRefusals(claim({ values: ["42 mm"] }), ctx()).length === 0);

ok("thousands separators are folded for the numeric comparison (28,800)",
  evidenceBindingRefusals(claim({ values: ["28,800"], evidence: [ev({ sourceExcerpt: "Frequency: 28,800 v.p.h." })] }), ctx()).length === 0);

ok("a genuinely different number is NOT normalized away (43 mm)",
  has(evidenceBindingRefusals(claim({ values: ["43 mm"] }), ctx()),
    "CLAIM_VALUE_NOT_SUPPORTED_BY_EVIDENCE"));

ok("curly typography in the retrieved page does not cause a false refusal",
  evidenceBindingRefusals(
    claim({ values: [], evidence: [ev({ sourceExcerpt: "The bezel's four rider tabs - a Chronomat signature since 1984." })] }),
    ctx()).length === 0);

/* ── Findings that assert no value of their own ───────────────────────── */
ok("an UNRESOLVED finding is not refused for unsupported values it never asserts",
  !has(evidenceBindingRefusals(claim({ outcome: "UNRESOLVED", values: [] }), ctx()),
    "CLAIM_VALUE_NOT_SUPPORTED_BY_EVIDENCE"));

/* ── Binding runs BEFORE class contracts get a say ────────────────────── */
{
  const unretrieved = {
    claimKey: "T1", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED",
    subject: "case.diameter_mm", statement: "The case measures 42 mm in diameter.",
    values: ["42 mm"], evidence: [ev({ retrievalId: null })],
  };
  const v = admissionFor(unretrieved, ctx());
  ok("a perfectly shaped but unretrieved source cannot produce an admitted claim",
    v.admission === "REFUSED" && has(v.refusals, "SOURCE_NOT_RETRIEVED"));
}

/* ── Retrieval itself refuses before any network call ─────────────────── */
{
  const invalid = await retrieveSource("not-a-url");
  ok("an unparseable URL is refused without a fetch",
    !invalid.ok && invalid.failure === "SOURCE_URL_INVALID");

  const placeholder = await retrieveSource("https://example.com/watch");
  ok("a placeholder host is refused without a fetch",
    !placeholder.ok && placeholder.failure === "SOURCE_HOST_FORBIDDEN");

  const internal = await retrieveSource("http://127.0.0.1/admin");
  ok("a private/internal host is refused (no SSRF surface)",
    !internal.ok && internal.failure === "SOURCE_HOST_FORBIDDEN");

  const ftp = await retrieveSource("ftp://files.example.org/spec.pdf");
  ok("a non-http(s) scheme is refused",
    !ftp.ok && ftp.failure === "SOURCE_URL_INVALID");
}

/* ── Retrieved documents become comparable text ───────────────────────── */
ok("scripts, styles and markup are stripped; entities decoded",
  (() => {
    const t = htmlToText('<html><head><style>a{}</style><script>var x=1;</script></head><body><p>Case&nbsp;Diameter: 42.00&#8239;mm</p></body></html>');
    return !t.includes("var x") && !t.includes("<p>") && t.includes("42.00") && t.includes("Case");
  })());

/* ── Storage contracts ────────────────────────────────────────────────── */
{
  const sql = read("supabase/migrations/20260813190000_collector_dossier_source_retrievals.sql");
  ok("a retrieval row can only exist for something that actually came back",
    /cdsr_real_retrieval[\s\S]*http_status >= 200 and http_status < 400[\s\S]*length\(evidence_text\) > 0/.test(sql));
  ok("no client role can write a retrieval it did not perform",
    /revoke all on public\.collector_dossier_source_retrievals from public, anon, authenticated/.test(sql));
  ok("changed sources supersede rather than mutate, keeping claims auditable",
    /supersedes_id/.test(sql) && /lifecycle in \('current', 'superseded'\)/.test(sql) &&
    /cdsr_current_per_url[\s\S]*where lifecycle = 'current'/.test(sql));
  ok("legacy claims stay honestly distinguishable rather than falsified",
    /evidence_binding[\s\S]*'UNBOUND', 'RETRIEVAL_BOUND'/.test(sql) && /honest legacy/.test(sql));
  ok("the retrieval layer never couples to listings or publication",
    !/public\.listings/.test(sql) &&
    !/from\("listings"\)/.test(read("lib/dossier/sourceRetrieval.ts")));
  const down = read("supabase/rollbacks/20260813190000_collector_dossier_source_retrievals.down.sql");
  ok("rollback refuses while retrieval-bound claims exist",
    /retrieval-bound claims exist/.test(down));
}

console.log(`\n  dossier-retrieval-binding: ${n} assertions PASS`);
