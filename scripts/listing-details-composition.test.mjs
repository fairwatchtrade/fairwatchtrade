/* Listing Details composition contract.
   Run: node scripts/listing-details-composition.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "components/PurchaseRequestForm.tsx"), "utf8");
const start = source.indexOf("{/* B · LISTING DETAILS (read-only seller truth; collapsible) */}");
const end = source.indexOf("{/* C · OFFER PANEL (form or active state) */}");

assert.ok(start >= 0 && end > start, "the real Listing Details block remains bounded before the Offer Panel");
const block = source.slice(start, end);

assert.match(block, /<details\s+open\b/, "Listing Details remains a native disclosure");
assert.match(block, /<summary className="[^"]*\bflex\b[^"]*\bflex-col\b/, "the composed summary cannot strand the native marker above the heading");
assert.match(block, /<h2[^>]*>Listing details<\/h2>/, "Listing details remains a real section heading");
assert.match(block, /data-listing-details-provenance/, "seller source context has its own composition owner");
assert.match(block, />\s*Seller-provided details\s*</, "seller source context uses the governed provenance wording");
assert.doesNotMatch(block, /From the seller(?:&apos;|')s listing/i, "the decorative provenance phrase is retired");

assert.match(block, /data-listing-details-primary/, "Condition has a primary composition owner");
assert.match(block, /\{listing\.condition && \([\s\S]*?data-listing-details-primary/, "an absent Condition does not create a decorative placeholder");
assert.match(block, /data-listing-details-primary[\s\S]*?<dt[^>]*>Condition<\/dt>[\s\S]*?<dd[^>]*>\s*\{listing\.condition\}\s*<\/dd>/, "Condition label and seller value remain semantically paired");
assert.match(block, /data-listing-details-primary[\s\S]*?font-display[^\n]*text-\[24px\]/, "Condition value visibly outranks its label");
assert.match(block, /data-listing-details-primary[\s\S]*?font-display[^\n]*lining-nums/, "the new display value cannot revive old-style numerals");

assert.match(block, /data-listing-details-package/, "Included and Band share one package composition owner");
assert.match(block, /\{listing\.included && \([\s\S]*?<dt[^>]*>Included<\/dt>/, "an absent Included value does not create a decorative placeholder");
assert.match(block, /data-listing-details-package[\s\S]*?<dt[^>]*>Included<\/dt>[\s\S]*?\{listing\.included\}[\s\S]*?<dt[^>]*>Band<\/dt>[\s\S]*?\{listing\.strap\}/, "Included and Band stay together and retain their listing-owned values");
assert.match(block, /data-listing-details-package[^>]*className=\{`[^`]*sm:grid-cols-2/, "the package group uses two columns only when both facts and width permit");

assert.match(block, /data-listing-details-support/, "Fulfillment has a supporting composition owner");
assert.match(block, /data-listing-details-support[\s\S]*?<dt[^>]*>Fulfillment<\/dt>[\s\S]*?Shipping details will be confirmed with the seller\./, "Fulfillment keeps its exact supporting truth");
assert.match(block, /data-listing-details-trust-footer/, "the review instruction has a trust-footer owner");
assert.match(block, /Review these details from the seller before sending your request\./, "the review-before-request instruction remains exact");

assert.doesNotMatch(source, /const truthRows\b/, "seller facts no longer flow through one equal-row array");
assert.doesNotMatch(block, /truthRows\.map/, "the generic four-row visual owner cannot return");
assert.equal(
  (block.match(/(?:^|\s)border-t(?=\s|")/g) ?? []).length,
  2,
  "the block uses one supporting separator and one trust-footer rule, never per-row hairlines",
);
assert.doesNotMatch(block, /\bshadow(?:-|\b)/, "the block introduces no shadow treatment");
assert.doesNotMatch(block, /\brounded(?:-|\b)/, "the block introduces no nested rounded mini-cards");
assert.doesNotMatch(block, /\bfetch\s*\(|\/api\//, "the read-only composition owns no API or data-fetch behavior");

for (const frozen of [
  "usePurchaseRequest",
  "purchaseRequestPresentation.validation.border",
  "purchaseRequestPresentation.validation.text",
  'data-purchase-offer-for={listing.id}',
]) {
  assert.ok(source.includes(frozen), `Purchase Request behavior/validation owner remains: ${frozen}`);
}

console.log("Listing Details composition contract PASS: primary Condition, grouped package facts, supporting Fulfillment, and seller-provided trust context.");
