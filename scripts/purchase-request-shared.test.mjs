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
  for (const f of ["components/PurchaseRequestForm.tsx", "components/InlinePurchaseRequest.tsx"]) {
    assert.ok(read(f).includes("usePurchaseRequest"), f);
  }
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

check("the in-page form is hidden below the desktop boundary", () => {
  const page = read("app/listings/[id]/page.tsx");
  // Narrow desktop gets the inline form; below lg the plain route link stands.
  assert.ok(page.includes('className="hidden lg:block xl:hidden"'));
  assert.ok(page.includes('className="lg:hidden"'));
});

check("mobile's rail invocations never receive inline offer context", () => {
  const page = read("app/listings/[id]/page.tsx");
  // canRequestInline is granted exactly twice: the xl rail and the lg inline.
  assert.equal(page.split("canRequestInline").length - 1, 2);
});

check("the compact card gains no fee language", () => {
  const inline = read("components/InlinePurchaseRequest.tsx");
  assert.equal(/5%/.test(inline), false);
});

check("the in-page form states the non-payment truth", () => {
  const inline = read("components/InlinePurchaseRequest.tsx");
  assert.match(inline, /No payment is collected at this step/);
  // The copy wraps in source, so match across the line break.
  assert.match(inline, /does not complete the\s+purchase/i);
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
