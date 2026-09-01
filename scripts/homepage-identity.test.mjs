/* Homepage identity — shared source, exact approved copy, no drift
   (Hero-copy ruling 2026-08-06 · supersedes the single-line form)

   Run: node --experimental-strip-types scripts/homepage-identity.test.mjs

   Guards:
     · the retired absolute claim can never return to the homepage;
     · the homepage consumes the TWO governed constants from the one shared
       identity source, and hardcodes neither;
     · the primary eyebrow and secondary clarification carry the exact
       approved wording — "select", never "selected";
     · the retired single-line form is gone;
     · the italic paragraph carries only the fee promise;
     · no Rolex/Tudor branding or acquisition language was added.

   ── WHY THIS FILE NOW GUARDS ONE PAGE AND NOT TWO (v7.80) ──────────────

   It used to assert against `app/marketplace-preview/page.tsx` as well, under
   the name "future homepage". That page was DELETED, and the name was the
   problem: it was an old prototype carrying three fictional watches, it was
   publicly routable, and — because it kept receiving copy and legibility work
   while the real staged homepage sat untouched at the repo root — every
   signal said it was the live one. It was not.

   The real staged future homepage is `marketplace/page.tsx` (root, outside
   `app/`, therefore not routed) rendering `components/HomepageClient.tsx`.

   ⚠ It carries NO identity copy at all — no eyebrow, no clarification, no
   shared constants. So nothing here guards it, because there is nothing there
   to guard yet. When that page gains its identity block, add it to the loop
   below. Until then the flip would silently drop the identity statement, and
   this comment is the only thing that says so. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MARKETPLACE_IDENTITY_EYEBROW,
  MARKETPLACE_IDENTITY_CLARIFICATION,
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES,
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE,
} from "../lib/marketplaceIdentity.ts";

let pass = 0;
const ok = (name, c) => { assert.ok(c, name); pass++; };

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const home = read("../app/page.tsx");

/* ── the exact approved copy, from the one durable source ── */
ok("primary eyebrow is exact",
  MARKETPLACE_IDENTITY_EYEBROW === "FOR INDEPENDENT & BOUTIQUE WATCHMAKERS");
ok("secondary clarification is exact",
  MARKETPLACE_IDENTITY_CLARIFICATION ===
    "and select references whose collector importance deserves the same care.");
ok('the clarification says "select", never "selected"',
  /\bselect references\b/.test(MARKETPLACE_IDENTITY_CLARIFICATION) &&
    !/selected/.test(MARKETPLACE_IDENTITY_CLARIFICATION));

/* ── the governed two-line composition (approved visual reference) ── */
ok("the clarification is exactly two lines",
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES.length === 2);
ok("line one breaks after 'collector importance'",
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES[0] ===
    "and select references whose collector importance");
ok("line two is 'deserves the same care.'",
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES[1] === "deserves the same care.");
ok("the two lines rejoin into the exact approved sentence",
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES.join(" ") ===
    MARKETPLACE_IDENTITY_CLARIFICATION);

/* ── the governed PHONE composition (XCover ruling 2026-08-06)
      The wide break stranded the single word "importance" on a third line at
      360px. The phone takes its own break at full size — it is never solved
      by shrinking the type, and it is never left to viewport wrapping. ── */
ok("the phone clarification is exactly two lines",
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE.length === 2);
ok("phone line one breaks after 'and select references whose'",
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE[0] ===
    "and select references whose");
ok("phone line two is 'collector importance deserves the same care.'",
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE[1] ===
    "collector importance deserves the same care.");
ok("the phone lines rejoin into the exact same approved sentence",
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE.join(" ") ===
    MARKETPLACE_IDENTITY_CLARIFICATION);
ok("the phone composition turns at a different point than the wide one",
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE[0] !==
    MARKETPLACE_IDENTITY_CLARIFICATION_LINES[0]);
ok('"importance" is never stranded alone on a phone line',
  !MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE.includes("importance"));

/* ── the homepage consumes both governed constants ── */
for (const [name, src] of [["current homepage", home]]) {
  ok(`${name} no longer claims "Watchmakers Only"`, !/watchmakers only/i.test(src));
  ok(`${name} imports the shared identity source`,
    src.includes("from '@/lib/marketplaceIdentity'"));
  ok(`${name} renders the primary eyebrow constant`,
    src.includes("MARKETPLACE_IDENTITY_EYEBROW"));
  ok(`${name} renders the governed two-line clarification constant`,
    src.includes("MARKETPLACE_IDENTITY_CLARIFICATION_LINES"));
  ok(`${name} renders the governed PHONE clarification constant`,
    src.includes("MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE"));
  ok(`${name} keeps the phone clarification at full 15px (never shrunk)`,
    /text-\[15px\][^"]*sm:hidden/.test(src));
  ok(`${name} shows the wide composition only from sm up`,
    /hidden[^"]*sm:block[^"]*sm:text-\[18px\]/.test(src));
  ok(`${name} renders the clarification in the brighter gold, not gold-dim`,
    src.includes("text-[var(--gold)]") && !src.includes("text-[var(--gold-dim)]"));
  ok(`${name} does not hardcode the eyebrow (single source of truth)`,
    !src.includes("FOR INDEPENDENT & BOUTIQUE WATCHMAKERS"));
  ok(`${name} does not hardcode the clarification (single source of truth)`,
    !src.includes("select references whose collector importance"));
  ok(`${name} no longer carries the retired single-line form`,
    !src.includes("Built for independent and boutique watchmaking"));
  ok(`${name} italic paragraph carries only the fee promise`,
    src.includes("One flat fee. No hidden costs. No compromises."));
  ok(`${name} adds no Rolex branding`, !/rolex/i.test(src));
  ok(`${name} adds no Tudor branding`, !/tudor/i.test(src));
}

/* ── current homepage structure unchanged (waitlist remains the page) ── */
ok("current homepage keeps the waitlist", home.includes("Notify Me"));
ok("current homepage keeps the buyer/seller choice", home.includes("I want to buy"));
ok("current homepage keeps the hero headline",
  home.includes("A marketplace") && home.includes("of the watches within it."));

console.log(`homepage-identity: ${pass} assertions PASS`);
