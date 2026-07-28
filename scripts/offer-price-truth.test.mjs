/* v2.85 Buyer Price Truth — Bug 2 regression contract.
   The historical-offer slot's amount comes from offerPrice(), and offerPrice
   must return ONLY the snapshotted offer amount. It must never fall back to
   the asking-price snapshot or any live listing value — by construction its
   signature cannot even receive a listing.
   Run: node scripts/offer-price-truth.test.mjs */
import assert from "node:assert/strict";
import { offerPrice } from "../lib/offerPresentation.ts";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); pass++; };

// The real snapshot is the one and only source.
ok("returns the snapshotted offer amount", offerPrice({ proposed_purchase_price: 8990 }) === 8990);
ok("zero is a legitimate value, not absence", offerPrice({ proposed_purchase_price: 0 }) === 0);

// Absence stays absent — no reconstruction from anything.
ok("null snapshot -> null (honest absence)", offerPrice({ proposed_purchase_price: null }) === null);

// Structural guarantee: even a row carrying asking-price/listing data cannot
// leak it into the offer slot — offerPrice reads exactly one field.
const poisoned = {
  proposed_purchase_price: null,
  listing_price: 11111.11,
  listing: { asking_price: 99999 },
};
ok("asking-price snapshot never substitutes", offerPrice(poisoned) === null);
ok("live listing price never substitutes", offerPrice(poisoned) !== 99999 && offerPrice(poisoned) !== 11111.11);

// And the function's arity itself is part of the contract: one argument.
ok("offerPrice takes the offer alone (no listing parameter)", offerPrice.length === 1);

console.log(`offer-price-truth: ${pass} assertions PASS`);
