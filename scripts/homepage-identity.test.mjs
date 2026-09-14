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
/* Robots Readiness GRS-005/006 (v8.32): the homepage body moved verbatim to
   components/CurrentHomepage.tsx so app/page.tsx could become a server
   wrapper that declares the canonical. The identity guards below now read
   the body where it lives; the route file is pinned to render it. */
const home = read("../components/CurrentHomepage.tsx");
const homeRoute = read("../app/page.tsx");

ok("the / route renders the current homepage body",
  homeRoute.includes('from "@/components/CurrentHomepage"') &&
    homeRoute.includes("<CurrentHomepage />"));
ok("the / route declares its clean canonical through the route policy",
  homeRoute.includes("homeMetadata()"));

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

/* ── the identity block has LEFT the homepage position (v8.98) ────────────

   The homepage body is now the search-led pre-inventory runway: it opens on
   the discovery method, not on a statement of what the marketplace admits.
   The identity eyebrow and its two-line clarification are no longer rendered
   there, and the narrower "independent & boutique" framing is deliberately
   not restored in this position.

   ⚠ The STRINGS ARE NOT RETIRED. lib/marketplaceIdentity.ts is untouched and
   every assertion above still proves its exact approved wording, both
   governed break points, and the "select"/"selected" rule. What changed is
   which surface renders them — today, none. A future surface that carries
   the identity statement imports the same constants and joins the loop
   below; it must never hardcode the wording, which is what these absence
   assertions keep honest. */
for (const [name, src] of [["current homepage", home]]) {
  ok(`${name} no longer claims "Watchmakers Only"`, !/watchmakers only/i.test(src));
  ok(`${name} no longer imports the shared identity source`,
    !src.includes("@/lib/marketplaceIdentity"));
  ok(`${name} no longer renders the primary eyebrow constant`,
    !src.includes("MARKETPLACE_IDENTITY_EYEBROW"));
  ok(`${name} no longer renders the governed clarification constants`,
    !src.includes("MARKETPLACE_IDENTITY_CLARIFICATION"));
  ok(`${name} does not hardcode the eyebrow (the wording never leaks back as literal text)`,
    !src.includes("FOR INDEPENDENT & BOUTIQUE WATCHMAKERS"));
  ok(`${name} does not hardcode the clarification`,
    !src.includes("select references whose collector importance"));
  ok(`${name} no longer carries the retired single-line form`,
    !src.includes("Built for independent and boutique watchmaking"));
  ok(`${name} does not restore the narrower makers framing in this position`,
    !/independent\s*&\s*boutique/i.test(src));
  ok(`${name} adds no Rolex branding`, !/rolex/i.test(src));
  ok(`${name} adds no Tudor branding`, !/tudor/i.test(src));
}

/* ── the shared source survives the homepage that used to render it ── */
ok("the shared identity source still exports the governed eyebrow",
  typeof MARKETPLACE_IDENTITY_EYEBROW === "string" && MARKETPLACE_IDENTITY_EYEBROW.length > 0);
ok("the shared identity source still exports both governed compositions",
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES.length === 2 &&
    MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE.length === 2);

/* ── current homepage structure — the pre-inventory runway (v8.98) ────────
   The homepage leads with the METHOD because there is not yet enough
   published inventory to let watches carry the front door. These pin the
   composition that replaced the Browse-entrance zone, and the absences that
   make it honest: no inventory promise, no fake watches, no second shell.
   Pinned on code tokens and exact public copy, so a comment recording the
   history can neither satisfy nor trip them. */
ok("homepage headline promises the method, not marketplace depth",
  home.includes("Search the way") && home.includes("you think"));
ok("homepage does not promise inventory it may not have",
  !/probably already here/i.test(home) && !/a collector thinks/i.test(home));
ok("homepage search reuses the one governed submit seam",
  home.includes("buildBrowseSearchHref") && home.includes("@/lib/nav/headerSearch"));
/* Code tokens only. An earlier form of this assertion matched the bare
   string "/browse?q=", which the file's own explanatory comment contains —
   prose must never be able to trip a structural guard. What actually matters
   is that the page never BUILDS that URL itself or reads query state. */
ok("homepage builds no second search parser or results overlay",
  !/`\/browse\?q=\$\{/.test(home) && !home.includes("useSearchParams"));
ok("homepage carries the buyer-facing curation line",
  home.includes("Every watch on FairWatchTrade is curated for you — the buyer."));
ok("homepage carries the three compact principles",
  home.includes("Mechanical timepieces only") &&
    home.includes("Watches chosen for merit") &&
    home.includes("Original photography"));
ok("homepage carries the runway statement", home.includes("Built for the watch nobody else recognizes"));
ok("homepage keeps the closing quote", home.includes("We think in dials and VPH, not dropdowns."));
/* The literal absolute is false against the product: authentication, session
   and the appearance preference all set cookies, and /privacy says so. This
   pins the shipped string form, not prose about it. */
ok("homepage ships the defensible cookie promise, never the literal absolute",
  home.includes("'No tracking cookies'") && !/['"`>]No cookies['"`<]/.test(home));
ok("homepage clock still reads real local time and ticks",
  home.includes("new Date()") && home.includes("setInterval"));
ok("homepage clock is not downgraded to static decorative hands",
  home.includes("hands.hour") && home.includes("hands.minute") && home.includes("hands.second"));
ok("homepage runway takes the approved room colour", home.includes("#F2F0E9"));
ok("homepage runway height stays content-driven (no fixed landing strip)",
  !/min-h-\[10\d\dpx\]/.test(home) && !home.includes("minHeight: '1020px'"));
ok("homepage mounts no second shell chrome",
  !home.includes("<NavBar") && !home.includes("<MarketBar") && !home.includes("<SiteFooter"));
ok("homepage adds no inventory cards or featured rail",
  !/featured this week/i.test(home) && !home.includes("selectFeaturedListings"));
ok("homepage no longer posts to the waitlist", !home.includes("fetch('/api/waitlist'"));
ok("homepage no longer carries the waitlist handler", !home.includes("handleWaitlist"));
ok("the retired scaffolding closing never reached public copy",
  !/a marketplace, quietly different/i.test(home) &&
    !/until the watches fill this room/i.test(home));

console.log(`homepage-identity: ${pass} assertions PASS`);
