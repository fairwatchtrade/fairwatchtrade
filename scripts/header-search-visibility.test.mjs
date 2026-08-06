/* Route inclusion/exclusion + submit-seam tests for the compact header Search.
   Run: node scripts/header-search-visibility.test.mjs
   (Node strips the imported .ts types natively.) */
import assert from "node:assert/strict";
import { headerSearchVisible, buildBrowseSearchHref } from "../lib/nav/headerSearch.ts";

let pass = 0;
const ok = (name, cond) => {
  assert.ok(cond, name);
  pass++;
};

// ── Included discovery surfaces → compact Search shown ──
// v3.21b PERMANENT STRUCTURAL LAW (bench ruling 2026-08-02, arbitrated by
// Jason): Painted Line rail pages (/account, /account/settings, /catalogue,
// /watch-dna) carry NO compact search row — the rail begins immediately
// beneath the metals strip. This test previously asserted the pre-v3.21b
// allowlist and had been failing against the ruled law ever since; the
// Search Completion Flight corrects the EXPECTATIONS to repository truth.
ok("listing detail included", headerSearchVisible("/listings/abc-123"));
ok("listing detail (uuid) included", headerSearchVisible("/listings/9dd35666-e9ea-49b3-89c8-4c9e3f57d142"));
ok("seller profile included", headerSearchVisible("/sellers/xyz"));
ok("trailing slash tolerated", headerSearchVisible("/listings/abc-123/"));

// ── Excluded: rail pages (v3.21b) / canonical Search / Vault / operational /
//    auth / legal / admin ──
ok("catalogue excluded (v3.21b Painted Line law)", !headerSearchVisible("/catalogue"));
ok("account excluded (v3.21b Painted Line law)", !headerSearchVisible("/account"));
ok("watch-dna excluded (v3.21b Painted Line law)", !headerSearchVisible("/watch-dna"));
ok("browse excluded (full inline Search is canonical)", !headerSearchVisible("/browse"));
ok("vault excluded", !headerSearchVisible("/vault"));
ok("vault galaxy excluded", !headerSearchVisible("/vault/galaxy"));
ok("home excluded", !headerSearchVisible("/"));
ok("sell excluded", !headerSearchVisible("/sell"));
ok("sell mobile excluded", !headerSearchVisible("/sell/mobile"));
ok("account settings excluded", !headerSearchVisible("/account/settings"));
ok("purchase-request excluded", !headerSearchVisible("/listings/abc-123/purchase-request"));
ok("tracking excluded", !headerSearchVisible("/tracking/abc"));
ok("dashboard excluded", !headerSearchVisible("/dashboard"));
ok("login excluded", !headerSearchVisible("/login"));
ok("signup excluded", !headerSearchVisible("/signup"));
ok("forgot-password excluded", !headerSearchVisible("/forgot-password"));
ok("reset-password excluded", !headerSearchVisible("/reset-password"));
ok("terms excluded", !headerSearchVisible("/terms"));
ok("privacy excluded", !headerSearchVisible("/privacy"));
ok("admin excluded", !headerSearchVisible("/admin"));
ok("admin sub excluded", !headerSearchVisible("/admin/auctions"));
ok("null pathname excluded", !headerSearchVisible(null));

// ── Submit seam: exact query preservation into /browse?q= ──
assert.equal(buildBrowseSearchHref("omega speedmaster"), "/browse?q=omega%20speedmaster"); pass++;
assert.equal(buildBrowseSearchHref("  gold filled  "), "/browse?q=gold%20filled"); pass++;
assert.equal(buildBrowseSearchHref(""), "/browse"); pass++;
assert.equal(buildBrowseSearchHref("   "), "/browse"); pass++;
assert.equal(buildBrowseSearchHref('ref "2998-5" -gold'), "/browse?q=ref%20%222998-5%22%20-gold"); pass++;
assert.equal(buildBrowseSearchHref("k26573"), "/browse?q=k26573"); pass++; // listing code preserved verbatim

console.log(`header-search-visibility: ${pass} assertions PASS`);
