import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* B7 Human SEE-it amendment, physical Galaxy XCover, 2026-09-12.
   The listing identity stays expressive, but its narrow title yields enough
   decision-space to the watch facts below it. Desktop remains exactly 48px. */

const page = readFileSync(
  new URL("../app/listings/[id]/page.tsx", import.meta.url),
  "utf8",
);

test("listing title uses the governed 30px narrow scale and preserves desktop", () => {
  const heading = page.match(
    /<h1 className="([^"]+)">\s*\{headingText\}\s*<\/h1>/,
  );

  assert.ok(heading, "listing title owner");
  const classes = heading[1];

  assert.match(classes, /(?:^| )font-display(?: |$)/);
  assert.match(classes, /(?:^| )text-\[30px\](?: |$)/);
  assert.match(classes, /(?:^| )sm:text-\[48px\](?: |$)/);
  assert.match(classes, /(?:^| )font-light(?: |$)/);
  assert.match(classes, /(?:^| )leading-\[1\.03\](?: |$)/);
  assert.match(classes, /(?:^| )sm:leading-\[1\.06\](?: |$)/);
  assert.match(classes, /(?:^| )tracking-\[-0\.018em\](?: |$)/);
  assert.match(classes, /(?:^| )text-\[var\(--platinum\)\](?: |$)/);
  assert.doesNotMatch(classes, /(?:^| )text-\[35px\](?: |$)/);
});

