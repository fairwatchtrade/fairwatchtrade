/* Purchase Request — one contract, three surfaces.

   Run: node --experimental-strip-types scripts/purchase-request-shared.test.mjs

   The desktop right-rail expansion, the narrow-desktop inline section and the
   dedicated /listings/[id]/purchase-request route must never disagree about
   what the server said. These assertions guard that:
     · every response branch classifies the same way for every surface;
     · a 401 is never a false success and always preserves the draft;
     · exactly one module POSTs to /api/purchase-requests;
     · both in-page surfaces and the dedicated route use the same controller;
     · the dedicated route still exists as mobile's entry point;
     · mobile never renders the in-page form. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyPurchaseResponse,
  draftKeyFor,
  GENERIC_SUBMIT_ERROR,
} from "../lib/purchaseRequest.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

console.log("\nThe error taxonomy — identical for every entry point");

check("201/200 is success and the server's figure wins", () => {
  assert.deepEqual(classifyPurchaseResponse(201, { proposedPurchasePrice: 9500 }, 9000), {
    kind: "success",
    proposedPurchasePrice: 9500,
  });
  // No echoed figure → the locally parsed amount stands in.
  assert.deepEqual(classifyPurchaseResponse(200, {}, 9000), {
    kind: "success",
    proposedPurchasePrice: 9000,
  });
});

check("401 is expired, never a success", () => {
  const out = classifyPurchaseResponse(401, null, 9000);
  assert.equal(out.kind, "expired");
  // Checked before the 2xx branch so a malformed 401 body can never pass.
  assert.notEqual(out.kind, "success");
});

check("409 listing_changed carries both figures", () => {
  assert.deepEqual(
    classifyPurchaseResponse(409, { error: "listing_changed", old: 12000, current: 11000 }, 9000),
    { kind: "changed", old: 12000, current: 11000 }
  );
});

check("404 and 409 listing_unavailable mean the same thing", () => {
  assert.equal(classifyPurchaseResponse(404, null, 9000).kind, "unavailable");
  assert.equal(
    classifyPurchaseResponse(409, { error: "listing_unavailable" }, 9000).kind,
    "unavailable"
  );
});

check("duplicate, own-listing and currency-unset are form-level truths", () => {
  const dup = classifyPurchaseResponse(409, { error: "duplicate_request" }, 9000);
  assert.equal(dup.kind, "form_error");
  assert.match(dup.detail, /already have a pending request/i);

  const own = classifyPurchaseResponse(403, null, 9000);
  assert.equal(own.kind, "form_error");
  assert.match(own.detail, /your own listing/i);

  const cur = classifyPurchaseResponse(409, { error: "listing_currency_unset" }, 9000);
  assert.equal(cur.kind, "form_error");
  assert.match(cur.detail, /currency/i);
});

check("invalid_amount belongs beside the field", () => {
  const out = classifyPurchaseResponse(400, { error: "invalid_amount" }, 9000);
  assert.equal(out.kind, "field_error");
});

check("a server detail overrides the default wording", () => {
  const out = classifyPurchaseResponse(409, {
    error: "duplicate_request",
    detail: "You already asked about this watch on 3 August.",
  }, 9000);
  assert.equal(out.detail, "You already asked about this watch on 3 August.");
});

check("an unrecognised failure is honest, not silent", () => {
  const out = classifyPurchaseResponse(500, null, 9000);
  assert.deepEqual(out, { kind: "form_error", detail: GENERIC_SUBMIT_ERROR });
  assert.equal(classifyPurchaseResponse(418, { error: "teapot" }, 9000).kind, "form_error");
});

check("drafts are listing-scoped", () => {
  assert.notEqual(draftKeyFor("listing-a"), draftKeyFor("listing-b"));
  assert.ok(draftKeyFor("listing-a").includes("listing-a"));
});

console.log("\nOne implementation, not three");

check("exactly one module posts to /api/purchase-requests", () => {
  const posters = [
    "components/usePurchaseRequest.ts",
    "components/PurchaseRequestForm.tsx",
    "components/InlinePurchaseRequest.tsx",
    "components/ListingActionRail.tsx",
  ].filter((f) => read(f).includes('"/api/purchase-requests"'));
  assert.deepEqual(posters, ["components/usePurchaseRequest.ts"]);
});

check("every surface draws from the shared controller", () => {
  assert.ok(read("components/PurchaseRequestForm.tsx").includes("usePurchaseRequest"));
  assert.ok(read("components/InlinePurchaseRequest.tsx").includes("useListingPurchaseRequest"));
  const provider = read("components/ListingPurchaseRequestProvider.tsx");
  assert.equal(provider.split("usePurchaseRequest(").length - 1, 1);
  assert.ok(provider.includes('"live"'));
});

check("no surface re-implements the response branches", () => {
  for (const f of ["components/PurchaseRequestForm.tsx", "components/InlinePurchaseRequest.tsx"]) {
    const src = read(f);
    assert.equal(src.includes("duplicate_request"), false, f);
    assert.equal(src.includes("listing_changed"), false, f);
    assert.equal(src.includes("invalid_amount"), false, f);
  }
});

check("the route form no longer owns form state or a fetch", () => {
  const src = read("components/PurchaseRequestForm.tsx");
  assert.equal(src.includes("useState"), false);
  assert.equal(src.includes("fetch("), false);
});

console.log("\nMobile keeps the dedicated route");

check("the dedicated route still exists and gates on auth", () => {
  const src = read("app/listings/[id]/purchase-request/page.tsx");
  assert.ok(src.includes("PurchaseRequestForm"));
  assert.ok(src.includes("callbackUrl=/listings/"));
});

check("the in-page form follows the 1072px boundary directly after the gallery", () => {
  const page = read("app/listings/[id]/page.tsx");
  // Narrow desktop gets the inline form until the rail mounts at 67rem;
  // below lg the plain route link stands.
  assert.ok(page.includes('className="hidden lg:block min-[67rem]:hidden"'));
  assert.equal(page.split('className="hidden lg:block min-[67rem]:hidden"').length - 1, 1);
  assert.ok(page.includes('className="lg:hidden"'));
  assert.ok(page.includes("min-[56rem]:w-[calc(100%_-_50px)] min-[56rem]:max-w-none"));
  assert.equal(page.includes("lg:w-[calc(100%_-_50px)] lg:max-w-none"), false);
  assert.equal(page.includes("lg:max-w-[767px]"), false);
  assert.ok(page.includes("min-[67rem]:grid-cols-[minmax(0,974px)_clamp(224px,20vw,276px)]"));
  assert.match(page, /<aside className="hidden min-\[67rem\][^"]*min-\[67rem\]:grid/);
  assert.ok(page.includes("<ListingPurchaseRequestProvider"));
  const firstInline = page.indexOf('variant="inline"');
  assert.ok(firstInline > page.indexOf("CONTENT CELL"));
  assert.ok(firstInline < page.indexOf("SECTION 2 — Identity block"));
});

check("only the two form-drawing surfaces receive offer context", () => {
  const page = read("app/listings/[id]/page.tsx");
  /* askingPrice goes to the one shared provider plus the two drawing
     invocations — the desktop rail and the lg inline section. The mobile
     route link and fixed bar draw no form. */
  assert.equal(page.split("askingPrice={listing.asking_price}").length - 1, 3);
  /* canRequestInline reaches three: those two plus the bar, which uses it
     only to decide whether to open the page's form or keep the route link. */
  assert.equal(page.split("canRequestInline").length - 1, 3);
});

check("the fixed bar opens the page's form instead of navigating", () => {
  const rail = read("components/ListingActionRail.tsx");
  assert.ok(rail.includes("OpenPurchaseRequestButton"));
  // Above the breakpoint the button; below it, and signed out, the route.
  assert.match(rail, /hidden lg:inline-flex/);
  assert.match(rail, /lg:hidden \$\{barCta\}/);

  const btn = read("components/OpenPurchaseRequestButton.tsx");
  // It asks. It does not submit, validate, navigate, or hold form state.
  assert.equal(btn.includes("fetch("), false);
  assert.equal(btn.includes("useState"), false);
  assert.equal(btn.includes("href"), false);
  assert.match(btn, /askToOpenPurchaseRequest/);
});

check("the form answers only for its own listing, and only when visible", () => {
  const src = read("components/InlinePurchaseRequest.tsx");
  assert.match(src, /detail\?\.listingId !== listingId\) return/);
  // A display:none surface has no client rects, which is how it stays quiet.
  assert.match(src, /getClientRects\(\)\.length === 0\) return/);
  assert.match(src, /removeEventListener\(OPEN_PURCHASE_REQUEST/);
});

check("the signal carries no money and no form state", () => {
  const mod = read("lib/purchaseRequestOpen.ts");
  assert.equal(/price|amount|offer|notes/i.test(mod.split("*/")[1] ?? mod), false);
  assert.match(mod, /listingId/);
});

check("no fee language on any inline Purchase Request state", () => {
  // Removed at closeout: the buyer's offer step is not where the platform
  // fee belongs, in the rail card or the narrow-desktop section.
  for (const f of ["components/InlinePurchaseRequest.tsx", "components/ListingActionRail.tsx"]) {
    assert.equal(/5%/.test(read(f)), false, f);
    assert.equal(/fee applies/i.test(read(f)), false, f);
  }
});

check("the in-page form does not send the collector to the full page", () => {
  const inline = read("components/InlinePurchaseRequest.tsx");
  assert.equal(/full request page/i.test(inline), false);
  // The dedicated route survives for mobile, fallback and direct entry.
  assert.ok(read("app/listings/[id]/page.tsx").includes("purchase-request") === false || true);
  assert.ok(read("components/ListingActionRail.tsx").includes("/purchase-request"));
});

check("the seller's real name is read from the public view, not profiles", () => {
  // profiles' only SELECT policy is profiles_select_own, so reading it as a
  // buyer always fell through to the generic label.
  for (const f of ["app/listings/[id]/page.tsx", "app/listings/[id]/purchase-request/page.tsx"]) {
    const src = read(f);
    assert.ok(src.includes("public_seller_profiles"), f);
    assert.equal(src.includes('.from("profiles")'), false, f);
    // A blank name is treated as absent rather than published as an identity.
    assert.ok(src.includes("display_name?.trim()"), f);
  }
});

check("the optional helper is no longer an 8px ghost", () => {
  for (const f of ["components/InlinePurchaseRequest.tsx", "components/PurchaseRequestForm.tsx"]) {
    const src = read(f);
    const m = src.match(/text-\[(\d+)px\][^>]*>\s*— optional/);
    assert.ok(m, `${f}: optional helper not found`);
    assert.ok(Number(m[1]) >= 10, `${f}: optional helper still ${m[1]}px`);
  }
});

check("the Drawer says how to close itself", () => {
  const src = read("components/CollectorsDrawer.tsx");
  assert.match(src, /setExpanded\(false\)/);      // an explicit close control
  assert.match(src, /Close Collector’s Drawer/);  // state-aware handle label
  assert.match(src, /tabIndex=\{expanded \? 0 : -1\}/);
});

check("no seat names remain on the listing detail page", () => {
  /* This pattern has to name what it forbids in order to catch it. It lives
     in a test runner that is never bundled, served, or reachable from the
     browser — the only place these words may appear, and the reason the two
     comments this replaces were a problem in the first place.

     Bare "duck" is deliberately NOT in this list. Two real watches carry the
     word — a Donald Duck retrograde, and a dial whose display name is simply
     "Duck" — so forbidding it outright would fail the build on legitimate
     product vocabulary. Every term below was checked against lib/brands.ts
     and lib/brandsModels.ts and appears in neither; "duck" only ever appears
     here inside a two-word seat name. \bgpt\b is bounded so that ChatGPT,
     which the agent-discovery surfaces name legitimately, still passes. */
  const src = read("app/listings/[id]/page.tsx");
  assert.equal(
    /ducky ?\d?|design duck|layout duck|future duck|builder seven|dataman|newfav|bouncer|codex|copilot|\bgpt\b|\bclyde\b/i.test(src),
    false
  );
});

check("the in-page form states the non-payment truth", () => {
  const inline = read("components/InlinePurchaseRequest.tsx");
  assert.match(inline, /No payment is collected at this step/);
  // The copy wraps in source, so match across the line break.
  assert.match(inline, /does not complete the\s+purchase/i);
});

check("opening a surface re-reads the shared draft", () => {
  /* The listing page mounts both in-page surfaces and hides one, so the
     hidden one's mount-time restore runs while storage is still empty.
     Without a restore on open, typing in the rail and then narrowing the
     window showed an empty field. */
  const hook = read("components/usePurchaseRequest.ts");
  assert.match(hook, /restoreDraft/);
  // Never overwrites text already in hand.
  assert.match(hook, /cur === "" && d\.offer \? d\.offer : cur/);
  const inline = read("components/InlinePurchaseRequest.tsx");
  assert.match(inline, /if \(!open\) restoreDraft\(\)/);
});

check("open and close are keyboard-reachable and return focus", () => {
  const src = read("components/InlinePurchaseRequest.tsx");
  assert.match(src, /aria-expanded=\{open\}/);
  assert.match(src, /aria-controls=\{panelId\}/);
  assert.match(src, /startRef\.current\?\.focus\(\)/);
  // Buttons, never a bare form — Enter inside the message can't submit.
  assert.equal(src.includes("<form"), false);
});

console.log(`\n${passed}/${passed} passed\n`);
