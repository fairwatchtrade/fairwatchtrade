/* ════════════════════════════════════════════════════════════════════════
   FLIGHT 3 — NETWORK / ORIGIN-GOVERNANCE RUNTIME PROOF (contract v7 §15)

   The §18 items that live in the Node layer rather than the database:
   origin canonicalisation, the private-address blocklist, and the
   pinned-connection fetch's refusal paths (governance, IP literals,
   resolution failure, and — end to end, over real DNS — a hostname that
   resolves to a blocked address being refused BEFORE any connection is
   attempted, which is the rebinding defense's load-bearing step).

   Run:
     node scripts/dealer-flight3-network.test.mjs

   That is the whole invocation, on any platform. It used to be a two-step
   ritual — a manual `tsc` into a directory, then node with an explicit
   condition flag and that directory in an env var — and the ritual did not
   survive Windows: the emitted path arrived as C:\... , which is a path and
   not a URL, so the loader refused it with ERR_UNSUPPORTED_ESM_URL_SCHEME
   before a single assertion ran. A security suite nobody can run is a
   security suite nobody runs. It now prepares itself.

   The compile step is still required, not cosmetic: pinnedFetch.ts uses a
   TypeScript *parameter property* (`constructor(public readonly code: …)`),
   which Node's strip-only type stripping cannot erase, so — unlike the two
   pure modules — it cannot be loaded from source the way
   dealer-flight3-preflight.test.mjs loads them. So the suite transpiles the
   two real files itself, into a temp directory, and loads them through
   pathToFileURL.

   Two things the emitted copy needs, neither of which touches security:

   · relative specifiers gain their `.js` extension, because tsc emits
     `from "./originGovernance"` and Node ESM does not guess extensions;
   · the `import "server-only"` side effect is dropped, because it exists to
     make the Next bundler refuse a client import and has no runtime
     behaviour to exercise. Dropping it is what the --conditions=react-server
     flag used to do by resolving it to an empty stub. The guard is not lost:
     N0 below asserts the SOURCE still carries it, so the suite proves the
     import is present AND exercises the logic behind it.

   Nothing else is stubbed or mocked. The classifier, the governance and the
   fetch under test are the real ones the application ships.
   ════════════════════════════════════════════════════════════════════════ */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SRC_DIR = new URL("../lib/dealer/", import.meta.url);
const SOURCES = ["originGovernance", "pinnedFetch"];
const rawSource = Object.fromEntries(
  SOURCES.map((n) => [n, readFileSync(new URL(`${n}.ts`, SRC_DIR), "utf8")])
);

/* The emitted copy must live INSIDE the repository, not in the OS temp
   directory. pinnedFetch imports undici by bare specifier, and bare
   specifiers resolve by walking parent directories looking for
   node_modules — from C:\Users\…\Temp there is nothing to find, and the
   suite dies on `Cannot find package 'undici'` instead of running. Under
   node_modules/.cache the walk succeeds, and git ignores it already. */
const outDir =
  process.env.F3_MODULES ??
  join(fileURLToPath(new URL("../node_modules/.cache/fwt-flight3/", import.meta.url)));
mkdirSync(outDir, { recursive: true });
if (!process.env.F3_MODULES) {
  for (const name of SOURCES) {
    const { outputText } = ts.transpileModule(rawSource[name], {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      fileName: `${name}.ts`,
    });
    const emitted = outputText
      .replace(/^\s*import\s+["']server-only["'];?\s*$/m, "")
      .replace(/from\s+["']\.\/([A-Za-z0-9_-]+)["']/g, 'from "./$1.js"');
    writeFileSync(join(outDir, `${name}.js`), emitted, "utf8");
  }
}

/* pathToFileURL is the whole Windows repair: an absolute path is not a
   module specifier, and file:///C:/... is. */
const moduleUrl = (name) => pathToFileURL(join(outDir, `${name}.js`)).href;

const { isBlockedAddress, pinnedFetch, PinnedFetchError, isRetryableFailure, MAX_REDIRECTS } =
  await import(moduleUrl("pinnedFetch"));
const { isIpLiteral, canonicalizeUrl, pathPrefixMatches, urlMatchesGovernedOrigin } =
  await import(moduleUrl("originGovernance"));

let passed = 0;
const failures = [];
function eq(name, actual, expected) {
  if (Object.is(actual, expected)) passed++;
  else failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
async function code(name, expected, fn) {
  let got;
  try { await fn(); got = "<NO ERROR>"; }
  catch (e) { got = e instanceof PinnedFetchError ? e.code : `${e?.constructor?.name}: ${e?.message}`; }
  eq(name, got, expected);
}

/* ── N0 · the guard the emitted copy drops is still on the real file ──── */
eq("N0 pinnedFetch source still declares server-only", /import\s+["']server-only["']/.test(rawSource.pinnedFetch), true);

/* ── N1 · blocklist matrix (every range the contract names) ───────────── */
for (const a of [
  "0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.254", "127.0.0.1", "127.1.2.3",
  "100.64.0.1", "100.127.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.254",
  "192.0.0.1", "192.0.2.5", "192.168.1.1", "198.18.0.1", "198.19.255.254",
  "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.1.1.1", "255.255.255.255",
  "::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "ff02::1",
]) eq(`N1 blocked ${a}`, isBlockedAddress(a), true);

for (const a of [
  "1.1.1.1", "8.8.8.8", "9.9.9.9", "100.63.255.255", "100.128.0.1", "169.253.0.1",
  "172.15.255.255", "172.32.0.1", "192.0.1.1", "192.167.255.255", "198.17.255.255",
  "198.20.0.1", "203.0.114.1", "223.255.255.255", "2606:4700::1111", "2001:4860:4860::8888",
]) eq(`N1 allowed ${a}`, isBlockedAddress(a), false);

/* ── N1b · IPv6 by RANGE, not by spelling ──────────────────────────────
   Every case here failed, or could have failed, while the classifier
   compared strings. They are grouped by the way the old test was fooled. */

// The headline hole: fe80::/10 runs to febf, and only "fe80…" was caught.
for (const a of [
  "fe80::1", "fe81::1", "fe8f::1", "fe90::1", "fea0::1", "feb0::1", "febf::1",
  "febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
]) eq(`N1b link-local blocked ${a}`, isBlockedAddress(a), true);

// The boundary must be exact in both directions — fe7f and fec0 are outside
// fe80::/10 and must NOT be blocked by an over-wide fix.
for (const a of ["fe7f::1", "fec0::1", "ff00::1"]) {
  const expected = a.startsWith("ff"); // ff00::/8 is multicast, still blocked
  eq(`N1b link-local boundary ${a}`, isBlockedAddress(a), expected);
}

// One destination, many legal spellings — all must decide identically.
for (const a of [
  "::1", "0:0:0:0:0:0:0:1", "0000:0000:0000:0000:0000:0000:0000:0001", "::0.0.0.1",
]) eq(`N1b loopback spelling blocked ${a}`, isBlockedAddress(a), true);

for (const a of [
  "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:127.0.0.1",
  "0000:0000:0000:0000:0000:ffff:7f00:0001", "::FFFF:127.0.0.1",
]) eq(`N1b v4-mapped loopback blocked ${a}`, isBlockedAddress(a), true);

// v4-mapped is refused outright, so a PUBLIC v4 cannot re-enter this way
// either — the stronger half of the existing policy, kept.
for (const a of ["::ffff:8.8.8.8", "::ffff:0808:0808", "::ffff:10.0.0.1", "::ffff:169.254.169.254"]) {
  eq(`N1b v4-mapped refused outright ${a}`, isBlockedAddress(a), true);
}

// Case must not decide anything.
for (const a of ["FE80::1", "Fe90::1", "FC00::1", "FD12:3456::1", "FF02::1"]) {
  eq(`N1b uppercase blocked ${a}`, isBlockedAddress(a), true);
}

// ULA and multicast across their real spans, not their leading characters.
for (const a of [
  "fc00::1", "fcff::1", "fd00::1", "fdff:ffff::1", "ff00::1", "ff02::1", "ff05::2", "ffff::1",
]) eq(`N1b ULA/multicast blocked ${a}`, isBlockedAddress(a), true);

// Transition ranges that carry an IPv4 destination inside an IPv6 address.
// 2002:7f00:0001:: is 6to4 for 127.0.0.1; 64:ff9b::7f00:1 is NAT64 for it.
for (const a of [
  "2002:7f00:1::", "2002:a00:1::", "2002:c0a8:1::",
  "64:ff9b::7f00:1", "64:ff9b::127.0.0.1", "64:ff9b:1::1",
  "2001::1", "2001:0:53aa:64c:8:9:10:11",
]) eq(`N1b transition range blocked ${a}`, isBlockedAddress(a), true);

// Other non-globally-reachable space.
for (const a of ["100::1", "2001:db8::1", "2001:20::1", "2001:10::1", "5f00::1", "::"]) {
  eq(`N1b non-global blocked ${a}`, isBlockedAddress(a), true);
}

// Real public IPv6 must still pass, including addresses that merely LOOK
// close to a blocked range. 2001:4860 is not Teredo; 2606 is not 6to4.
for (const a of [
  "2606:4700::1111", "2001:4860:4860::8888", "2a00:1450:4001:80e::200e",
  "2001:4860::1", "2001:db9::1", "2003::1", "fec1::1", "64:ff9c::1",
]) eq(`N1b public allowed ${a}`, isBlockedAddress(a), false);

// Fail closed: what cannot be parsed cannot be vouched for. The old
// classifier returned false — allowed — for every one of these.
for (const a of [
  "not-an-address", "", "fe80::1%eth0", "12345::1", "1:2:3:4:5:6:7:8:9",
  "::ffff:999.1.1.1", "gggg::1", "1::2::3",
]) eq(`N1b unparseable blocked ${JSON.stringify(a)}`, isBlockedAddress(a), true);

/* ── N2 · origin canonicalisation ─────────────────────────────────────── */
eq("N2 uppercase host lowercased", canonicalizeUrl("https://Fixtures.Fairwatch.Test/a")?.hostname, "fixtures.fairwatch.test");
eq("N2 trailing dot stripped", canonicalizeUrl("https://fixtures.fairwatch.test./a")?.hostname, "fixtures.fairwatch.test");
eq("N2 default port is 443", canonicalizeUrl("https://fixtures.fairwatch.test/a")?.port, 443);
eq("N2 explicit :443 normalises", canonicalizeUrl("https://fixtures.fairwatch.test:443/a")?.port, 443);
eq("N2 http scheme refused", canonicalizeUrl("http://fixtures.fairwatch.test/a"), null);
eq("N2 embedded credentials refused", canonicalizeUrl("https://u:p@fixtures.fairwatch.test/a"), null);
eq("N2 IPv4 literal detected", isIpLiteral("203.0.113.9"), true);
eq("N2 IPv6 literal detected", isIpLiteral("[::1]"), true);
eq("N2 hostname is not a literal", isIpLiteral("fixtures.fairwatch.test"), false);

/* ── N3 · path-prefix matching is segment-wise, never substring ───────── */
eq("N3 exact prefix matches", pathPrefixMatches("/dealer/", "/dealer/manifest.ndjson"), true);
eq("N3 root prefix matches all", pathPrefixMatches("/", "/anything/at/all"), true);
eq("N3 sibling with shared substring does NOT match", pathPrefixMatches("/dealer/", "/dealership/secret"), false);
// Dot segments never reach pathPrefixMatches: canonicalizeUrl removes them
// first, so traversal must be proven at the real gate, not at this helper.
eq("N3 canonicalisation removes dot segments", canonicalizeUrl("https://fixtures.fairwatch.test/dealer/../etc/passwd")?.path, "/etc/passwd");
eq("N3 canonicalisation collapses single dots", canonicalizeUrl("https://fixtures.fairwatch.test/dealer/./m.ndjson")?.path, "/dealer/m.ndjson");

const ORIGINS = [
  { purpose: "manifest", hostname: "fixtures.fairwatch.test", port: 443, pathPrefix: "/dealer/", state: "approved" },
  { purpose: "photographs", hostname: "cdn.fixture.test", port: 443, pathPrefix: "/", state: "approved" },
  { purpose: "manifest", hostname: "revoked.fairwatch.test", port: 443, pathPrefix: "/", state: "revoked" },
];
eq("N3 governed url matches", urlMatchesGovernedOrigin("https://fixtures.fairwatch.test/dealer/m.ndjson", ORIGINS, "manifest"), true);
eq("N3 wrong purpose refused", urlMatchesGovernedOrigin("https://fixtures.fairwatch.test/dealer/m.ndjson", ORIGINS, "photographs"), false);
eq("N3 wrong path prefix refused", urlMatchesGovernedOrigin("https://fixtures.fairwatch.test/other/m.ndjson", ORIGINS, "manifest"), false);
eq("N3 unknown host refused", urlMatchesGovernedOrigin("https://evil.test/dealer/m.ndjson", ORIGINS, "manifest"), false);
eq("N3 revoked origin refused", urlMatchesGovernedOrigin("https://revoked.fairwatch.test/x", ORIGINS, "manifest"), false);
eq("N3 non-default port refused", urlMatchesGovernedOrigin("https://fixtures.fairwatch.test:8443/dealer/m", ORIGINS, "manifest"), false);
eq("N3 traversal out of the prefix refused at the gate", urlMatchesGovernedOrigin("https://fixtures.fairwatch.test/dealer/../etc/passwd", ORIGINS, "manifest"), false);
eq("N3 traversal that stays inside is allowed", urlMatchesGovernedOrigin("https://fixtures.fairwatch.test/dealer/a/../m.ndjson", ORIGINS, "manifest"), true);
eq("N3 encoded traversal refused at the gate", urlMatchesGovernedOrigin("https://fixtures.fairwatch.test/dealer/%2e%2e/etc/passwd", ORIGINS, "manifest"), false);
eq("N3 trailing-dot host still matches after canonicalisation", urlMatchesGovernedOrigin("https://Fixtures.Fairwatch.Test./dealer/m", ORIGINS, "manifest"), true);
eq("N3 explicit :443 still matches", urlMatchesGovernedOrigin("https://fixtures.fairwatch.test:443/dealer/m", ORIGINS, "manifest"), true);

/* ── N4 · pinnedFetch refusal paths, over the real resolver ───────────── */
await code("N4 ungoverned url refused before any network", "url_not_governed",
  () => pinnedFetch("https://evil.test/dealer/m.ndjson", ORIGINS, "manifest"));
await code("N4 revoked origin refused", "url_not_governed",
  () => pinnedFetch("https://revoked.fairwatch.test/x", ORIGINS, "manifest"));
await code("N4 http refused", "url_not_governed",
  () => pinnedFetch("http://fixtures.fairwatch.test/dealer/m.ndjson", ORIGINS, "manifest"));
await code("N4 IP literal refused even if the address were governed", "url_not_governed",
  () => pinnedFetch("https://169.254.169.254/dealer/m.ndjson", ORIGINS, "manifest"));
await code("N4 unresolvable governed host = dns_resolution_failed", "dns_resolution_failed",
  () => pinnedFetch("https://fixtures.fairwatch.test/dealer/m.ndjson", ORIGINS, "manifest"));

// The rebinding defense's load-bearing step, end to end over real DNS:
// a governed hostname that RESOLVES to a blocked address is refused at
// validation time — before any socket is opened to it.
const LOCAL = [{ purpose: "manifest", hostname: "localtest.me", port: 443, pathPrefix: "/", state: "approved" }];
await code("N4 governed host resolving to 127.0.0.1 = destination_blocklisted", "destination_blocklisted",
  () => pinnedFetch("https://localtest.me/dealer/m.ndjson", LOCAL, "manifest"));

/* ── N5 · retryable vs terminal classification ────────────────────────── */
eq("N5 timeout retryable", isRetryableFailure(new PinnedFetchError("timeout")), true);
eq("N5 connect_failed retryable", isRetryableFailure(new PinnedFetchError("connect_failed")), true);
eq("N5 dns_resolution_failed retryable", isRetryableFailure(new PinnedFetchError("dns_resolution_failed")), true);
eq("N5 http 500 retryable", isRetryableFailure(new PinnedFetchError("http_error", 500)), true);
eq("N5 http 503 retryable", isRetryableFailure(new PinnedFetchError("http_error", 503)), true);
eq("N5 http 429 retryable", isRetryableFailure(new PinnedFetchError("http_error", 429)), true);
eq("N5 http 404 TERMINAL", isRetryableFailure(new PinnedFetchError("http_error", 404)), false);
eq("N5 http 403 TERMINAL", isRetryableFailure(new PinnedFetchError("http_error", 403)), false);
eq("N5 destination_blocklisted TERMINAL", isRetryableFailure(new PinnedFetchError("destination_blocklisted")), false);
eq("N5 url_not_governed TERMINAL", isRetryableFailure(new PinnedFetchError("url_not_governed")), false);
eq("N5 redirect_not_governed TERMINAL", isRetryableFailure(new PinnedFetchError("redirect_not_governed")), false);
eq("N5 response_too_large TERMINAL", isRetryableFailure(new PinnedFetchError("response_too_large")), false);
eq("N5 too_many_redirects TERMINAL", isRetryableFailure(new PinnedFetchError("too_many_redirects")), false);
eq("N5 ip_literal_refused TERMINAL", isRetryableFailure(new PinnedFetchError("ip_literal_refused")), false);
eq("N5 redirect budget is 3", MAX_REDIRECTS, 3);

for (const f of failures) console.error("FAIL " + f);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
