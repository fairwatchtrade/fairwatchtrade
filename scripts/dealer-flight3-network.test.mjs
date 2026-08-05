/* ════════════════════════════════════════════════════════════════════════
   FLIGHT 3 — NETWORK / ORIGIN-GOVERNANCE RUNTIME PROOF (contract v7 §15)

   The §18 items that live in the Node layer rather than the database:
   origin canonicalisation, the private-address blocklist, and the
   pinned-connection fetch's refusal paths (governance, IP literals,
   resolution failure, and — end to end, over real DNS — a hostname that
   resolves to a blocked address being refused BEFORE any connection is
   attempted, which is the rebinding defense's load-bearing step).

   Run:
     tsc lib/dealer/pinnedFetch.ts lib/dealer/originGovernance.ts \
       --outDir <dir> --module esnext --target es2022 \
       --moduleResolution bundler --skipLibCheck
     F3_MODULES=<dir> node --conditions=react-server \
       scripts/dealer-flight3-network.test.mjs

   The compile step is required, not cosmetic: pinnedFetch.ts uses a
   TypeScript *parameter property* (`constructor(public readonly code: …)`),
   which Node's strip-only type stripping cannot erase, so — unlike the two
   pure modules — it cannot be loaded from source the way
   dealer-flight3-preflight.test.mjs loads them. The react-server condition
   resolves `server-only` to its empty stub. Nothing is stubbed or mocked:
   these are the real modules, compiled exactly as the app compiles them.
   ════════════════════════════════════════════════════════════════════════ */

const BASE = process.env.F3_MODULES ?? "../lib/dealer";
const { isBlockedAddress, pinnedFetch, PinnedFetchError, isRetryableFailure, MAX_REDIRECTS } =
  await import(`${BASE}/pinnedFetch.js`);
const { isIpLiteral, canonicalizeUrl, pathPrefixMatches, urlMatchesGovernedOrigin } =
  await import(`${BASE}/originGovernance.js`);

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
