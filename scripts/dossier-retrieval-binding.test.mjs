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
const {
  htmlToText, retrieveSource, retrievalTargetRefusal,
  addressRefusal, resolveDestination, pinnedLookup, unwrapMappedIPv4,
} = await import("../lib/dossier/sourceRetrieval.ts");
const { createServer } = await import("node:http");

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

/* ── SSRF through redirect: the seam closed in v4.47 ──────────────────
   Validating only the first hop and then following redirects lets a
   public-looking host answer 302 with a private destination. A live server
   proves the redirect is refused rather than chased; the target validator
   proves the destination it pointed at would itself be refused. Together:
   no hop after the first can ever be requested. */
{
  const server = createServer((req, res) => {
    if (req.url === "/redirect-to-internal") {
      // The classic SSRF target — cloud instance metadata.
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body>" + "internal secret ".repeat(40) + "</body></html>");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  /* The loopback guard fires first here, which is itself correct — but it
     means this case alone does not prove the redirect branch. Both layers
     are asserted: the target guard below, and the redirect branch proven
     against a real public redirect in the live check that follows. */
  const viaRedirect = await retrieveSource(`http://127.0.0.1:${port}/redirect-to-internal`);
  ok("a loopback source is refused outright, redirect or not",
    !viaRedirect.ok && viaRedirect.failure === "SOURCE_HOST_FORBIDDEN");

  /* v4.47's redirect proof used `localtest.me` to clear the first-hop
     string guard. Since v4.48 that hostname is refused earlier, at its
     RESOLVED address — which is the stronger guard working, and it means a
     local integration test for the redirect branch can no longer be
     constructed: there is no address a test server may bind to that the
     address policy permits. That is the correct outcome, not a gap. The
     redirect branch is therefore proven below against a real public
     redirect, through the real transport. */

  ok("the private destination that redirect pointed at is itself a refused target",
    retrievalTargetRefusal("http://169.254.169.254/latest/meta-data/")?.failure === "SOURCE_HOST_FORBIDDEN");

  for (const internal of [
    "http://127.0.0.1/admin", "http://10.0.0.5/secret", "http://192.168.1.1/",
    "http://172.16.0.1/", "http://169.254.169.254/", "http://0.0.0.0/",
  ]) {
    assert.equal(retrievalTargetRefusal(internal)?.failure, "SOURCE_HOST_FORBIDDEN",
      `${internal} must be refused as a retrieval target`);
  }
  ok("every private/link-local range is refused as a retrieval target", true);

  await new Promise((r) => server.close(r));
}

/* ── DNS-resolution SSRF: the address we validate is the address we
   connect to (v4.48) ──────────────────────────────────────────────────
   A hostname guard cannot enforce this — `localtest.me` is not a private
   string and resolves to loopback. The boundary is the resolved address,
   and the validated address is pinned into the socket. */
{
  // IPv4 forbidden space, by real range arithmetic rather than prefixes.
  for (const [addr, what] of [
    ["127.0.0.1", "loopback"], ["10.1.2.3", "RFC1918 10/8"],
    ["172.16.5.4", "RFC1918 172.16/12"], ["172.31.255.254", "RFC1918 upper bound"],
    ["192.168.1.1", "RFC1918 192.168/16"], ["169.254.169.254", "cloud metadata"],
    ["100.64.0.1", "CGNAT"], ["0.0.0.0", "unspecified"],
    ["224.0.0.1", "multicast"], ["255.255.255.255", "broadcast"],
    ["198.18.0.1", "benchmarking"],
  ]) {
    assert.equal(addressRefusal(addr)?.failure, "SOURCE_FORBIDDEN_ADDRESS", `${addr} (${what}) must refuse`);
  }
  ok("every forbidden IPv4 range refuses by range arithmetic, not string prefix", true);

  for (const [addr, what] of [
    ["::1", "IPv6 loopback"], ["::", "IPv6 unspecified"],
    ["fc00::1", "unique-local"], ["fd12:3456::1", "unique-local fd"],
    ["fe80::1", "link-local"], ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
  ]) {
    assert.equal(addressRefusal(addr)?.failure, "SOURCE_FORBIDDEN_ADDRESS", `${addr} (${what}) must refuse`);
  }
  ok("forbidden IPv6 ranges refuse (loopback, unspecified, ULA, link-local, multicast)", true);

  ok("an IPv4-mapped IPv6 address cannot smuggle a forbidden IPv4 through",
    unwrapMappedIPv4("::ffff:127.0.0.1") === "127.0.0.1" &&
    addressRefusal("::ffff:127.0.0.1")?.failure === "SOURCE_FORBIDDEN_ADDRESS" &&
    addressRefusal("::ffff:169.254.169.254")?.failure === "SOURCE_FORBIDDEN_ADDRESS");

  ok("ordinary public addresses are permitted",
    addressRefusal("93.184.216.34") === null && addressRefusal("2606:2800:220:1::1") === null);

  // Resolution refuses on the ANSWER, whatever the hostname text says.
  const resolvesTo = (addresses) => async () =>
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

  ok("a public-LOOKING hostname resolving to loopback refuses before any connection",
    (await resolveDestination("totally-public-looking.example-cdn.net", resolvesTo(["127.0.0.1"])))
      .failure === "SOURCE_FORBIDDEN_ADDRESS");

  ok("a hostname resolving to cloud metadata refuses",
    (await resolveDestination("metadata-mirror.net", resolvesTo(["169.254.169.254"])))
      .failure === "SOURCE_FORBIDDEN_ADDRESS");

  ok("round-robin cannot smuggle a private address alongside a public one",
    (await resolveDestination("mixed.example-cdn.net", resolvesTo(["93.184.216.34", "10.0.0.7"])))
      .failure === "SOURCE_FORBIDDEN_ADDRESS");

  ok("a genuinely public resolution is permitted and returns the address to pin",
    (await resolveDestination("cdn.example-public.net", resolvesTo(["93.184.216.34"])))
      .destination.address === "93.184.216.34");

  ok("a DNS failure is named, not silently treated as unreachable",
    (await resolveDestination("nope.invalid", async () => { throw new Error("ENOTFOUND"); }))
      .failure === "SOURCE_DNS_RESOLUTION_FAILED");

  /* THE LOAD-BEARING REGRESSION. Validation happened against one address;
     the socket must be unable to obtain any other. The pinned lookup is
     what the connector calls, so driving it directly proves the pin: a
     second resolution simply cannot influence the connection. */
  {
    const validated = { address: "93.184.216.34", family: 4 };
    const lookup = pinnedLookup("rebind.example-cdn.net", validated);
    const answer = await new Promise((resolve, reject) =>
      lookup("rebind.example-cdn.net", {}, (err, addr, fam) => (err ? reject(err) : resolve({ addr, fam }))));
    const answerAll = await new Promise((resolve, reject) =>
      lookup("rebind.example-cdn.net", { all: true }, (err, addr) => (err ? reject(err) : resolve(addr))));
    ok("the socket can only ever be given the already-validated address (no second lookup)",
      answer.addr === "93.184.216.34" && answer.fam === 4 &&
      Array.isArray(answerAll) && answerAll.length === 1 && answerAll[0].address === "93.184.216.34");

    const wrongHost = await new Promise((resolve) =>
      lookup("attacker-controlled.net", {}, (err) => resolve(err)));
    ok("the pinned lookup refuses any host it did not validate",
      wrongHost instanceof Error && /unvalidated host/.test(wrongHost.message));
  }

  // End to end through the real transport, with a resolver that lies.
  const rebound = await retrieveSource(
    "https://looks-legit.example-cdn.net/spec",
    resolvesTo(["127.0.0.1"])
  );
  ok("the whole transport refuses a hostname whose resolution is forbidden",
    !rebound.ok && rebound.failure === "SOURCE_FORBIDDEN_ADDRESS");
}

ok("retrieval never follows redirects — the no-follow posture is structural",
  (() => {
    const src = read("lib/dossier/sourceRetrieval.ts");
    return !/redirect:\s*"follow"/.test(src) && /redirect:\s*"manual"/.test(src) &&
      /status >= 300 && response\.status < 400/.test(src);
  })());

/* ── Live transport proofs (network) ──────────────────────────────────
   The order requires exercising the actual transport, not only inspecting
   it. These two run the full path — resolve, classify, pin, connect. */
if (process.env.FWT_SKIP_NETWORK_TESTS !== "1") {
  const redirecting = await retrieveSource(
    "http://topperjewelers.com/products/breitling-chronomat-b01-42-ub0134101b1u1"
  );
  ok("a real public redirect is refused and its destination named (v4.47 posture intact)",
    !redirecting.ok && redirecting.failure === "SOURCE_REDIRECT_REFUSED" &&
    /https:\/\/topperjewelers\.com/.test(redirecting.detail));

  const canary = await retrieveSource(
    "https://topperjewelers.com/products/breitling-chronomat-b01-42-ub0134101b1u1"
  );
  ok("the public canary source still retrieves through the pinned transport",
    canary.ok && canary.httpStatus === 200 && canary.text.includes("42.00 mm"));
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
