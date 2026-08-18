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
  /* The logo is handed to cardImageSrc() now rather than to the img raw.
     Same stored identity, delivered through the shared card-image pipeline.
     The invariant under test is that the DEALERS OWN stored logo is what
     renders publicly - not the literal attribute shape it renders through. */
  assert.match(browse, /src=\{cardImageSrc\(dealerScope\.logoUrl/);
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

  /* Every dealer link on the page resolves the same way. The action rail
     used to build its own "/sellers/{uuid}", so one page carried a canonical
     dealer URL and a redirecting one side by side. */
  const rail = read("components/ListingActionRail.tsx");
  assert.match(rail, /href=\{sellerHref \?\? `\/sellers\/\$\{sellerId\}`\}/);
  assert.equal((listing.match(/sellerHref=\{sellerHref\}/g) ?? []).length, 2);
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
  /* The conditional itself is gone: 9px was raised to the 11px floor
     everywhere, so readability no longer depends on being in a Dealer Room.
     Asserting the ABSENCE of sub-11px functional type is the stronger form
     of the same law - it cannot be satisfied by a conditional that merely
     happens to favour one branch. */
  assert.doesNotMatch(browse, /text-\[(?:[0-9]|10)px\]/);
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
  /* The heading and the dealer-local search are PEERS on one horizontal row
     now, not two stacked bands, so their relative source order stopped
     carrying meaning. What must stay true is the reading order of the room:
     the catalogue names itself, then the controls that operate on it, then
     the watches. The old assertion is replaced by that stronger three-way
     ordering rather than dropped. */
  const barIdx = browse.indexOf("{dealerScope.businessName} Catalogue");
  const searchIdx = browse.indexOf("dealerRoomMode");
  const controlsIdx = browse.indexOf("Layout controls bar");
  const resultsIdx = browse.indexOf("{paginated.map");
  assert.ok(barIdx > 0, "the dealer catalogue must name itself");
  assert.ok(barIdx < controlsIdx, "the catalogue is named above the controls that order it");
  assert.ok(searchIdx > barIdx && searchIdx < controlsIdx, "dealer-local search rides in the catalogue bar");
  assert.ok(controlsIdx < resultsIdx, "controls precede the results they act on");
  /* One band, not three: the search must no longer close a border of its own,
     and the retired duplicate heading must not come back. */
  assert.doesNotMatch(search, /dealerRoomMode\s*\n\s*\? "border-b/);
  assert.ok(
    !browse.includes("{dealerScope.businessName} Inventory"),
    "the second <h1> repeating the business name must not return",
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

test("trust explanation speaks the ONE help-affordance language", () => {
  // The shared HelpBubble (Layout ruling 2026-08-06) — never a second
  // question-mark design, never a freehand tooltip panel.
  assert.match(actions, /import HelpBubble from "@\/components\/HelpBubble"/);
  assert.match(actions, /<HelpBubble/);
  assert.match(actions, /historyKey="fwtDealerTrustHelp"/);
  // Long-help content carries the rounded-card character (Layout 2026-08-06).
  assert.match(actions, /rounded-2xl/);
  // The freehand vessel is gone: no role="note" panel, no circled-i glyph.
  assert.doesNotMatch(actions, /role="note"/);
  assert.doesNotMatch(actions, /lowercase italic/);
});

test("phone trust bubble cannot expand the mobile viewport", () => {
  // Caught on the real XCover: a fixed-width card anchored to the tiny
  // trigger span overflowed 412px before the clamp could measure, and
  // mobile Chrome expanded the layout viewport to fit (page zoomed out).
  // Below sm the anchor is the full-width identity section and the card
  // spans it edge to edge; the fixed width exists only at sm+.
  assert.match(actions, /inline-flex sm:relative/);
  assert.match(actions, /left-3 right-3[^"]*sm:left-0 sm:right-auto[^"]*sm:w-\[330px\]/);
  // The caret follows the ? via the shared component's tracking extension.
  assert.match(actions, /caretTracksTrigger/);
  const bubble = read("components/HelpBubble.tsx");
  assert.match(bubble, /caretTracksTrigger = false/);
  assert.match(bubble, /caretRef\.current\.style\.left/);
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
  assert.match(listing, /<ListingStageFaq sellerName=\{sellerName\} isOwner=\{isOwner\} \/>/);
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

/* ── Recomposition invariants (Build Order 2026-08-17 §3 · §6 · §11 · §16) ──
   Pinned BEFORE the composition work, so the recomposition is free to move
   the furniture without quietly changing what the room IS. Everything below
   describes the engine under the layout: one server query, one result
   pipeline, one public truth for every viewer. The arrangement may change.
   None of these may. */

/* Commentary explains code; it is not code. A label that exists only inside
   a comment is not something a collector can see, so the private-module
   checks below run against the source with comments stripped. */
const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const browseCode = codeOnly(browse);

const dealerBranch = page.slice(
  page.indexOf("if (dealer) {"),
  page.indexOf("// Existing individual-seller profile")
);

test("the dealer branch makes one server query and mounts one catalogue engine", () => {
  assert.ok(dealerBranch.length > 200, "the dealer branch must remain identifiable");
  assert.equal(
    (dealerBranch.match(/\.from\("listings"\)/g) ?? []).length,
    1,
    "one listings query — a second read is a second truth"
  );
  assert.equal(
    (dealerBranch.match(/<BrowseClient/g) ?? []).length,
    1,
    "one catalogue engine — the room is Browse over a constrained set, not a fork"
  );
  assert.match(dealerBranch, /\.eq\("seller_id", dealer\.seller_id\)/);
  assert.match(dealerBranch, /\.eq\("status", "published"\)/);
  // The individual-seller renderer belongs to the other branch entirely.
  assert.doesNotMatch(dealerBranch, /<SellerProfile/);
});

test("one result pipeline: filtered -> sorted -> paginated, never re-cut", () => {
  for (const decl of [
    "const filtered = useMemo(",
    "const sorted = useMemo(",
    "const paginated =",
  ]) {
    assert.equal(
      browse.split(decl).length - 1,
      1,
      `exactly one \`${decl}\` — a second declaration is a second result set`
    );
  }
  assert.match(
    browse,
    /const sorted = useMemo\(\(\) => sortListings\(filtered, sort\), \[filtered, sort\]\)/
  );
  assert.match(
    browse,
    /const paginated = pageSize === "all" \? sorted : sorted\.slice\(0, pageSize\)/
  );
  assert.ok(
    browse.indexOf("const sorted =") < browse.indexOf("const paginated ="),
    "sort must span the whole filtered set before the page is cut from it"
  );
  assert.doesNotMatch(
    browse,
    /filtered\.slice\(/,
    "the page must never be cut from the unsorted set"
  );
  assert.equal(
    browse.split("paginated.map").length - 1,
    1,
    "one paginated.map feeds Gallery, Collector and Scan alike"
  );

  /* The dealer scope is applied by the SERVER query. If it ever appears
     inside the pipeline it means the room started filtering its own
     membership in the client, which is a second definition of what the
     dealer sells. */
  const pipeline = browse.slice(
    browse.indexOf("const filtered = useMemo("),
    browse.indexOf("const paginated =")
  );
  assert.doesNotMatch(
    pipeline,
    /dealerScope/,
    "membership is the server's constraint, never a client-side branch"
  );
});

test("public total and filtered count are never conflated", () => {
  // The dealer's whole published shelf — identity block and rail total.
  assert.match(browse, /\{listings\.length\} \{listings\.length === 1 \? "watch" : "watches"\}/);
  /* What the query left standing. This states the RELATIONSHIP rather than
     printing a second bare "N watches" that reads identically to the shelf
     total two bands above it — the conflation §17 forbids was previously
     available to any reader who glanced at both. */
  assert.match(browse, /filtered\.length === listings\.length/);
  assert.match(browse, /\$\{filtered\.length\} of \$\{listings\.length\} watches/);
  assert.match(browse, /\{dealerResultStatus\}/);
  // An empty shelf is a fact about the dealer; an empty result is a fact
  // about the query. Only the first may claim "no public watches".
  assert.match(browse, /dealerScope && listings\.length === 0 \?/);
});

test("the public room is composed identically for every viewer", () => {
  /* Viewer identity may be read for the collector's OWN saved set — that is
     a personal action available to any signed-in visitor. It may never
     compose the room. Both reads must stay inside that one seam. */
  assert.doesNotMatch(browseCode, /isOwner/);
  for (const match of browseCode.matchAll(/auth\.getUser\(\)/g)) {
    const preceding = browseCode.slice(Math.max(0, match.index - 400), match.index);
    assert.ok(
      /seedSavedIds|handleAddToCatalogue/.test(preceding),
      "auth may only be read by the saved-watch seam, never to build the room"
    );
  }
  // No composition branch anywhere keys off the viewer rather than the data.
  assert.doesNotMatch(browseCode, /dealerScope && user\b|user && dealerScope/);
});

test("no private or illustrative module reaches the public dealer room", () => {
  /* Design Gate 2026-08-17 rendered these to show composition. They are
     collector-private or have no read model at all, and §8 keeps every one
     of them out of the public room. */
  for (const label of [
    "Good evening",
    "My Offers",
    "Saved Searches",
    "Saved Watches",
    "Watch DNA",
    "Recent Activity",
    "Add a Watch",
    "Match from Catalogue",
  ]) {
    assert.ok(
      !browseCode.includes(label),
      `"${label}" is private or illustrative and must not render publicly`
    );
  }
  // Dealer-local search never becomes global search wearing local copy.
  assert.doesNotMatch(browseCode, /buildBrowseSearchHref/);
  assert.match(browse, /ariaLabel=\{`Search \$\{dealerScope\.businessName\} inventory`\}/);
});
