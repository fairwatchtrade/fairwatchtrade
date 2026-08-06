/* Homepage identity — shared source, exact approved line, no drift
   (Ruling 2026-08-06 · Rolex Admission — homepage identity correction)

   Run: node --experimental-strip-types scripts/homepage-identity.test.mjs

   Guards:
     · the retired absolute claim can never return to either homepage;
     · both homepage implementations consume the ONE shared identity source
       (they cannot silently diverge);
     · the shared source carries the exact approved wording;
     · no Rolex/Tudor branding, cards, or acquisition language was added;
     · the three featured brands and the navigation survive untouched. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARKETPLACE_IDENTITY_LINE } from "../lib/marketplaceIdentity.ts";

let pass = 0;
const ok = (name, c) => { assert.ok(c, name); pass++; };

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const home = read("../app/page.tsx");
const preview = read("../app/marketplace-preview/page.tsx");

/* ── the exact approved line, from the one durable source ── */
ok("shared source carries the exact approved line",
  MARKETPLACE_IDENTITY_LINE ===
    "Built for independent and boutique watchmaking—and for selected references whose collector importance deserves the same care.");

/* ── the retired absolute claim is gone from both implementations ── */
for (const [name, src] of [["current homepage", home], ["future homepage", preview]]) {
  ok(`${name} no longer claims "Watchmakers Only"`,
    !/watchmakers only/i.test(src));
  ok(`${name} imports the shared identity source`,
    src.includes("from '@/lib/marketplaceIdentity'"));
  ok(`${name} renders the shared constant`,
    src.includes("MARKETPLACE_IDENTITY_LINE"));
  ok(`${name} does not hardcode the approved sentence (single source of truth)`,
    !src.includes("Built for independent and boutique watchmaking"));
  ok(`${name} adds no Rolex branding`, !/rolex/i.test(src));
  ok(`${name} adds no Tudor branding`, !/tudor/i.test(src));
}

/* ── independent & boutique watchmaking remains verbally the center ── */
ok("the identity line still leads with independent and boutique watchmaking",
  MARKETPLACE_IDENTITY_LINE.startsWith("Built for independent and boutique watchmaking"));

/* ── featured brands unchanged on the future homepage ── */
for (const brand of ["Parmigiani Fleurier", "F.P. Journe", "H. Moser"]) {
  ok(`future homepage still features ${brand}`, preview.includes(brand));
}
ok("future homepage still features the Tonda Métrographe card",
  preview.includes("Tonda Métrographe") && preview.includes("PFC274"));

/* ── navigation unchanged ── */
ok("future homepage keeps Browse Watches", preview.includes("Browse Watches"));
ok("future homepage keeps List a Watch", preview.includes("List a Watch"));
ok('future homepage keeps its /browse link', preview.includes('href="/browse"'));
ok('future homepage keeps its /sell link', preview.includes('href="/sell"'));

/* ── current homepage structure unchanged (waitlist remains the page) ── */
ok("current homepage keeps the waitlist", home.includes("Notify Me"));
ok("current homepage keeps the buyer/seller choice", home.includes("I want to buy"));
ok("current homepage keeps the hero headline",
  home.includes("A marketplace") && home.includes("of the watches within it."));

console.log(`homepage-identity: ${pass} assertions PASS`);
