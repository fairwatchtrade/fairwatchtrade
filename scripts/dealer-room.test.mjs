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

test("empty rail dimensions collapse into one truthful sentence, not a diagnostic panel", () => {
  // Buyer-facing polish (2026-08-13 §12): per-group "Unavailable" rows are
  // retired. Populated dimensions render normally; empty ones are summarized
  // once, quietly, in readable muted text — and the dimension set itself
  // stays the normal Browse architecture, ready to return when populated.
  assert.doesNotMatch(browse, />\s*Unavailable\s*<\/span>/);
  assert.match(browse, /Not represented in current inventory:/);
  assert.match(browse, /dim\.facets\.length === 0/);
  assert.match(browse, /const dealerDimensions/);
  for (const dim of ["Case Material", "Dial Color", "Box & Papers", "Condition", "Case Size", "Movement", "Beat Rate", "Power Reserve"]) {
    assert.ok(browse.includes(`title: "${dim}"`), `dimension ${dim} must remain in the dealer rail architecture`);
  }
  assert.match(browse, /text-\[11px\] leading-\[1\.6\] text-\[var\(--muted\)\]/);
  assert.match(browse, /absolute inset-y-0 left-0 w-\[250px\]/);
});

test("Dealer Room functional text uses the readable UI floor", () => {
  assert.match(browse, /dealerLegibility/);
  assert.match(browse, /legibilityMode\s+dealerRoomMode/);
  assert.match(browse, /dealerScope \? "text-\[11px\]" : "text-\[9px\]"/);
  assert.match(browse, /Dealer inventory[\s\S]*text-\[14px\]/);
  assert.match(search, /legibilityMode[\s\S]*text-\[11px\].*text-\[var\(--slate\)\]/);
  assert.match(search, /legibilityMode[\s\S]*text-\[13px\] text-\[var\(--slate\)\]/);
});

test("Dealer Room follows the authoritative storefront composition", () => {
  assert.match(search, /Search This Dealer/);
  assert.match(search, /dealerRoomMode[\s\S]*>\s*Go\s*<\/button>/);
  assert.match(search, /\(!dealerRoomMode \|\| chips\.length > 0\)/);
  assert.match(browse, /relative -mx-6/);
  assert.match(browse, /grid-cols-1[\s\S]*sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(browse, /sm:truncate/);
  assert.match(browse, /md:ml-\[250px\]/);
  assert.match(browse, /md:w-\[calc\(100%-250px\)\]/);
  assert.match(browse, /defaultViewMode:[^=]*= dealerScope \? "collector" : "gallery"/);
  assert.match(browse, /\{ key: "collector", label: "Collector" \}[\s\S]*\{ key: "gallery", label: "Gallery" \}/);
  assert.ok(
    browse.indexOf("dealerRoomMode") <
      browse.indexOf("{dealerScope.businessName} Inventory"),
    "dealer-local search must precede the inventory heading",
  );
});

/* ── Buyer-facing polish (2026-08-13) ─────────────────────────────────── */

const actions = read("components/DealerRoomActions.tsx");
const correspondence = read("components/ListingCorrespondence.tsx");
const gallery = read("components/ListingGallery.tsx");
const stageFaq = read("components/ListingStageFaq.tsx");
const specs = read("components/ListingSpecs.tsx");

test("Contact Dealer is the room's primary action and enters the existing messaging flow", () => {
  assert.match(browse, /<DealerContactPanel/);
  assert.match(browse, /businessName=\{dealerScope\.businessName\}/);
  // The panel walks the buyer into the LISTING conversation — never a
  // parallel channel. No fetch, no thread creation, no new API.
  assert.match(actions, /Contact Dealer/);
  assert.match(actions, /\/listings\/\$\{item\.id\}\?contact=1/);
  assert.doesNotMatch(actions, /fetch\(|\/api\/messages|createClient/);
  // Correspondence honors the arrival with its existing openHome().
  assert.match(correspondence, /params\.get\("contact"\) === "1"/);
  assert.match(correspondence, /if \(params\.get\("contact"\) === "1"\) openHome\(\)/);
  // Room identity is dealer-specific: never "Contact Seller" here.
  assert.doesNotMatch(actions, /Contact Seller/);
  // Full-width on a phone, readable size, real touch target.
  assert.match(actions, /min-h-\[44px\] w-full[\s\S]*sm:w-auto/);
  assert.match(actions, /text-\[12px\] uppercase tracking-\[2px\] text-\[var\(--gold\)\]/);
});

test("dealer trust mark says what FairWatchTrade actually does — nothing more", () => {
  assert.match(browse, /<DealerTrustMark \/>/);
  assert.match(actions, /FairWatchTrade Dealer/);
  assert.match(actions, /review before publication/);
  assert.match(actions, /does not provide\s+independent third-party authentication/);
  assert.match(actions, /payment is arranged\s+directly between buyer and seller/);
  // No invented certifications or guarantees.
  assert.doesNotMatch(actions, /guarantee|certified|authenticated dealer|escrow protection/i);
});

test("listing photography has a dedicated inspection state", () => {
  assert.match(gallery, /Inspect photo/);
  assert.match(gallery, /role="dialog"/);
  assert.match(gallery, /aria-label="Photo inspection"/);
  // Inspection scale, aspect preserved, no decorative crop.
  assert.match(gallery, /max-h-full max-w-full object-contain/);
  // Obvious exit + Escape + body scroll suspended while inspecting.
  assert.match(gallery, /Close ✕/);
  assert.match(gallery, /e\.key === "Escape"\) setInspecting\(false\)/);
  assert.match(gallery, /document\.body\.style\.overflow = "hidden"/);
  // Thumbnail navigation remains available inside the overlay.
  assert.ok(
    gallery.indexOf("View photo", gallery.indexOf('aria-label="Photo inspection"')) > 0,
    "overlay must keep the thumbnail strip"
  );
  // The resting hero photograph stays inert (v1.23 law preserved).
  assert.match(gallery, /The photograph itself carries no click\s*\n?\s*handler/);
});

test("listing-stage FAQ reuses the published copy and links to the full room", () => {
  assert.match(listing, /<ListingStageFaq sellerName=\{sellerName\} \/>/);
  // Curated ids into the generated customer copy — never hand-authored policy.
  assert.match(stageFaq, /from "@\/lib\/faq\/faqContent"/);
  for (const id of ["buying-4", "buying-5", "payments-0", "payments-2", "trust-0", "buying-6"]) {
    assert.ok(stageFaq.includes(`"${id}"`), `listing-stage FAQ must include published ${id}`);
  }
  assert.match(stageFaq, /More questions and answers/);
  assert.match(stageFaq, /href="\/faq"/);
  // The single interface-copy entry describes this page's own controls.
  assert.match(stageFaq, /Ask the seller/);
});

test("clickable collector navigation uses only byte-exact filter dimensions", () => {
  assert.match(specs, /browseLink\("caseMaterial", details\.caseMaterial\)/);
  assert.match(specs, /browseLink\("dialColor", details\.dialColorType\)/);
  assert.match(specs, /browseLink\("movement", details\.movementType\)/);
  assert.match(specs, /browseLink\("docs", details\.documentation\)/);
  // Derived/formatted dimensions must NOT link — a reformatted value could
  // land on an empty filter and masquerade as a real path.
  assert.doesNotMatch(specs, /browseLink\("beatRate"/);
  assert.doesNotMatch(specs, /browseLink\("caseSize"/);
  assert.doesNotMatch(specs, /browseLink\("powerReserve"/);
  assert.match(specs, /encodeURIComponent/);
});
