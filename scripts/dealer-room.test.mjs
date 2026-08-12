import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/sellers/[id]/page.tsx");
const browse = read("components/BrowseClient.tsx");
const search = read("components/BrowseSearch.tsx");
const settings = read("components/AccountSettings.tsx");
const api = read("app/api/account/dealer-profile/route.ts");
const listing = read("app/listings/[id]/page.tsx");
const migration = read("supabase/migrations/20260812120000_dealer_room_identity.sql");

test("dealer route reuses BrowseClient with immutable published seller scope", () => {
  assert.match(page, /<BrowseClient/);
  assert.match(page, /\.eq\("seller_id", dealer\.seller_id\)/);
  assert.match(page, /\.eq\("status", "published"\)/);
  assert.doesNotMatch(migration, /create table public\.dealer_(?:listings|inventory)/i);
});

test("slug and UUID resolve through the existing public seller route", () => {
  assert.match(page, /\.eq\("slug", id\.toLowerCase\(\)\)/);
  assert.match(page, /redirect\(`\/sellers\/\$\{dealer\.slug\}`\)/);
  assert.match(page, /if \(!isUuid\(id\)\) notFound\(\)/);
});

test("dealer-local controls keep the current seller pathname", () => {
  assert.match(browse, /usePathname\(\)/);
  assert.match(browse, /router\.replace\(qs \? `\$\{pathname\}\?\$\{qs\}` : pathname/);
  assert.match(browse, /Search \$\{dealerScope\.businessName\} inventory/);
  assert.match(browse, /brandFacets = useMemo\(\(\) => countBy\(listings/);
});

test("public room has no owner-management branch", () => {
  assert.doesNotMatch(page, /auth\.getUser|isOwner|manage|upload/i);
  assert.match(settings, /Dealer Room identity/);
  assert.match(settings, /\/api\/account\/dealer-profile/);
});

test("dealer logo is stored identity data, validated privately, and rendered publicly", () => {
  assert.match(migration, /logo_url text/);
  assert.match(api, /ALLOWED_FORMATS = new Set\(\["png", "jpeg", "webp"\]\)/);
  assert.match(api, /dealer-logos\/\$\{context\.user\.id\}/);
  assert.match(browse, /src=\{dealerScope\.logoUrl\}/);
  assert.doesNotMatch(browse, /The Collector Identity logo|TCI logo/);
});

test("dealer identity is publicly readable and owner-writable only", () => {
  assert.match(migration, /dealer_profiles_public_read/);
  assert.match(migration, /dealer_profiles_owner_insert/);
  assert.match(migration, /dealer_profiles_owner_update/);
  assert.match(migration, /seller_id = auth\.uid\(\)/);
});

test("listing returns to canonical dealer slug when one exists", () => {
  assert.match(listing, /from\("dealer_profiles"\)/);
  assert.match(listing, /const sellerHref = `\/sellers\/\$\{dealerProfile\?\.slug \|\| listing\.seller_id\}`/);
  assert.match(listing, /href=\{sellerHref\}/);
});

test("search copy can become dealer-local without forking search behavior", () => {
  assert.match(search, /ariaLabel = "Search FairWatchTrade"/);
  assert.match(search, /placeholder = "Search watches, references, or listing codes"/);
  assert.match(search, /aria-label=\{ariaLabel\}/);
  assert.match(search, /placeholder=\{placeholder\}/);
});

test("zero inventory preserves the Dealer Room composition", () => {
  assert.doesNotMatch(browse, /if \(dealerScope && listings\.length === 0\) \{\s*return/);
  assert.match(browse, /Inventory Brands/);
  assert.match(browse, /All inventory/);
  assert.match(browse, /Refine This Dealer/);
  assert.match(browse, /dealerScope && listings\.length === 0 \?/);
  assert.match(browse, /No public watches right now\./);
  assert.match(browse, /Published watches from \{dealerScope\.businessName\}/);
});

test("empty Dealer Room rail remains readable and explicitly unavailable", () => {
  assert.match(browse, /aria-label=\{`\$\{title\}: unavailable until public inventory exists`\}/);
  assert.match(browse, />\s*Unavailable\s*<\/span>/);
  assert.match(browse, /text-\[11px\].*text-\[var\(--muted\)\]/);
  assert.match(browse, /text-\[9px\] tracking-\[0\.8px\] text-\[var\(--muted\)\]/);
  assert.doesNotMatch(browse, /text-\[8px\].*text-\[var\(--muted\)\] opacity-50/);
  assert.match(browse, /w-\[220px\].*xl:w-\[250px\]/);
});

test("Dealer Room functional text uses the readable UI floor", () => {
  assert.match(browse, /dealerLegibility/);
  assert.match(browse, /legibilityMode=\{!!dealerScope\}/);
  assert.match(browse, /dealerScope \? "text-\[11px\]" : "text-\[9px\]"/);
  assert.match(browse, /Dealer inventory[\s\S]*text-\[14px\]/);
  assert.match(search, /legibilityMode[\s\S]*text-\[11px\].*text-\[var\(--slate\)\]/);
  assert.match(search, /legibilityMode[\s\S]*text-\[13px\] text-\[var\(--slate\)\]/);
});
