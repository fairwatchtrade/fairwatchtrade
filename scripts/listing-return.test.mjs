/* Dealer Room listing-return allowlist.

   Run: node --experimental-strip-types --test scripts/listing-return.test.mjs

   `returnTo` is request-controlled input used as a link target, so this suite
   exercises the real function against real hostile strings rather than
   asserting the shape of its source. A source-shape test cannot tell you
   whether the allowlist actually holds; these can. */

import assert from "node:assert/strict";
import test from "node:test";
import { safeBrowseReturn } from "../lib/listingReturn.ts";

const DEALER = "/sellers/crash-test-dealer";

test("the global catalogue returns to itself, with its state intact", () => {
  assert.deepEqual(safeBrowseReturn("/browse"), {
    href: "/browse",
    label: "Back to Browse",
  });
  const stateful = "/browse?brand=Omega&sort=priceAsc&pageSize=40&view=collector";
  assert.deepEqual(safeBrowseReturn(stateful), {
    href: stateful,
    label: "Back to Browse",
  });
});

test("a Dealer Room returns to that dealer, with its state intact", () => {
  assert.deepEqual(safeBrowseReturn(DEALER), {
    href: DEALER,
    label: "Back to Catalogue",
  });
  /* The whole point of the repair: search, facets, sort, view and page all
     ride home in the query string. */
  const stateful =
    DEALER + "?q=speedmaster&brand=Omega&caseMaterial=Steel&sort=brandAsc&pageSize=all&view=scan";
  assert.deepEqual(safeBrowseReturn(stateful), {
    href: stateful,
    label: "Back to Catalogue",
  });
});

test("a dealer reached by UUID is admitted too", () => {
  const byUuid = "/sellers/2f1c9b7e-4a55-41d2-9c3a-8b6d0e5f1a72";
  assert.deepEqual(safeBrowseReturn(byUuid), {
    href: byUuid,
    label: "Back to Catalogue",
  });
});

test("missing, empty and repeated values fall back rather than throwing", () => {
  for (const raw of [undefined, "", [], [""]]) {
    assert.deepEqual(safeBrowseReturn(raw), {
      href: "/browse",
      label: "Back to Browse",
    });
  }
  // A repeated ?returnTo= takes the first value, and it is still validated.
  assert.equal(safeBrowseReturn([DEALER, "https://evil.example"]).href, DEALER);
  assert.equal(safeBrowseReturn(["https://evil.example", DEALER]).href, "/browse");
});

test("nothing that could leave the origin is ever admitted", () => {
  const hostile = [
    "https://evil.example/browse",
    "http://evil.example",
    "//evil.example",
    "///evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "browse",
    "/browse@evil.example",
    "/sellers/crash-test-dealer/../../admin",
    "/sellers/../admin",
    "/../browse",
    "/admin",
    "/account/settings",
    "/api/admin/dealer-accelerator/import",
    "/sellers/crash-test-dealer/extra",
    "/sellers/",
    "/sellers",
    "/browse-archive",
    "/browsely?q=x",
    "/sellersfoo",
  ];
  for (const raw of hostile) {
    assert.deepEqual(
      safeBrowseReturn(raw),
      { href: "/browse", label: "Back to Browse" },
      `must not be admitted: ${raw}`
    );
  }
});

test("a backslash cannot smuggle a host past the check", () => {
  /* Some agents normalise a backslash to "/" AFTER validation, so
     "/\\evil.example" would become "//evil.example" - protocol-relative,
     off-origin - if the raw string had been approved. */
  const bs = String.fromCharCode(92);
  for (const raw of [
    "/" + bs + bs + "evil.example",
    "/" + bs + "evil.example",
    "/sellers/" + bs + bs + "evil.example",
    "/browse?next=" + bs + bs + "evil.example",
  ]) {
    assert.equal(safeBrowseReturn(raw).href, "/browse", `must not be admitted: ${raw}`);
  }
});

test("control characters are rejected wherever they hide", () => {
  for (const code of [0, 9, 10, 13, 27, 31, 127]) {
    const raw = "/browse?q=a" + String.fromCharCode(code) + "b";
    assert.equal(
      safeBrowseReturn(raw).href,
      "/browse",
      `control char ${code} must be rejected`
    );
  }
});

test("an encoded payload fails to match rather than being unwrapped", () => {
  /* The dealer segment is tested RAW. Percent-encoding is never decoded and
     then trusted, so these simply do not match the slug shape. */
  for (const raw of [
    "/sellers/%2e%2e%2f%2e%2e%2fadmin",
    "/sellers/%2F%2Fevil.example",
    "/sellers/Crash-Test-Dealer",
    "/sellers/dealer_with_underscore",
    "/sellers/-leading-hyphen",
    "/sellers/trailing-hyphen-",
    "/sellers/double--hyphen",
  ]) {
    assert.equal(safeBrowseReturn(raw).href, "/browse", `must not be admitted: ${raw}`);
  }
});

test("the label always matches the destination it is attached to", () => {
  /* A "Back to Browse" that lands on a dealer room - or the reverse - is the
     exact lie this repair exists to end. */
  for (const raw of ["/browse", "/browse?q=x", "/browse/anything"]) {
    const t = safeBrowseReturn(raw);
    assert.equal(t.label, "Back to Browse");
    assert.ok(t.href.startsWith("/browse"));
  }
  for (const raw of [DEALER, DEALER + "?q=x"]) {
    const t = safeBrowseReturn(raw);
    assert.equal(t.label, "Back to Catalogue");
    assert.ok(t.href.startsWith("/sellers/"));
  }
});
