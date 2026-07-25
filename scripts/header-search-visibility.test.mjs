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
ok("catalogue included", headerSearchVisible("/catalogue"));
ok("account included", headerSearchVisible("/account"));
ok("account deep-link keeps pathname", headerSearchVisible("/account")); // query string is not part of pathname
ok("listing detail included", headerSearchVisible("/listings/abc-123"));
ok("listing detail (uuid) included", headerSearchVisible("/listings/9dd35666-e9ea-49b3-89c8-4c9e3f57d142"));
ok("seller profile included", headerSearchVisible("/sellers/xyz"));
ok("trailing slash tolerated", headerSearchVisible("/catalogue/"));

// ── Excluded: canonical Search / Vault / operational / auth / legal / admin ──
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
