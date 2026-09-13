import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* ────────────────────────────────────────────────────────────────────────
   DESKTOP WATCH DETAIL RAIL — founder ruling 2026-09-12.

   The rail reads as one commercial sentence:

     Seller Information → Purchase Request → Ask the Seller → Curation Review

   Curation used to sit between seller identity and the purchase decision,
   holding a permanent review report open in the middle of that sentence.
   It is now LAST, and compact, with its contents behind the governed
   HelpBubble.

   ── WHY THESE ASSERTIONS STRIP COMMENTS FIRST ──────────────────────────
   Three suites in this repo are red right now for the same reason: they
   match raw source text, so a word appearing in a CODE COMMENT counts as a
   usage. `correspondence-instrument` fails because "fw-correspondence" is
   named in a comment explaining the class; the markup is correct.

   Absence claims here are therefore made against comment-stripped source.
   A comment that says "this used to be called Dealer Information" must not
   fail a test asserting the heading is gone — that comment is exactly the
   kind of note this project wants people to write.
   ──────────────────────────────────────────────────────────────────────── */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Source with block and line comments removed, for absence assertions.

    Block comments are stripped FIRST. That also empties every JSX-wrapped
    comment down to a bare pair of braces, which the second pass removes.

    Matching the JSX-wrapped form directly is the trap. A pattern that opens
    on a brace, takes a lazy run, then demands a closing brace LOOKS
    non-greedy but backtracks: when a comment's terminator is not followed by
    a brace, the engine scans forward to a later one that is, and deletes
    everything in between. It silently ate half this component on the first
    run of this file. Strip comments by their own delimiters only, and never
    anchor the pattern on surrounding syntax. */
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "") // every block comment, JSX-wrapped or not
    .replace(/\{\s*\}/g, "") // the empty braces a JSX comment leaves behind
    .replace(/^\s*\/\/.*$/gm, ""); // line

const rail = read("components/ListingActionRail.tsx");
const page = read("app/listings/[id]/page.tsx");
const curation = read("components/CurationReviewCard.tsx");

const railCode = stripComments(rail);
const pageCode = stripComments(page);
const curationCode = stripComments(curation);

/* ── 1 · The seller noun ────────────────────────────────────────────── */

test("the generic rail heading names a seller, never a dealer", () => {
  assert.match(railCode, /Seller Information/, "the generic heading");
  assert.doesNotMatch(
    railCode,
    /Dealer Information/,
    "a dealer is a seller; a seller is not necessarily a dealer, and nothing here proves which",
  );
  /* The link itself is unchanged in wording and destination. */
  assert.match(railCode, /Sold by \{sellerName\} →/);
  assert.match(railCode, /sellerHref \?\? `\/sellers\/\$\{sellerId\}`/);
});

/* ── 2 · Adjacency: nothing may wedge between seller and purchase ───── */

test("Seller Information and Purchase Request are adjacent in the rail owner", () => {
  const seller = railCode.indexOf("Seller Information");
  const purchase = railCode.indexOf('isOwner ? "Your Listing" : "Purchase Request"');
  assert.ok(seller >= 0, "seller block");
  assert.ok(purchase > seller, "purchase follows seller");

  const between = railCode.slice(seller, purchase);
  assert.doesNotMatch(between, /CurationReviewCard/, "curation may not split the commercial sentence");
  assert.doesNotMatch(between, /HelpBubble/, "no help surface wedges in here either");
  /* One <section> opens between them: Purchase Request's own. A second
     would mean a new rail layer had been inserted. */
  assert.equal(
    (between.match(/<section/g) ?? []).length,
    1,
    "exactly one section boundary between seller and purchase — no new rail layer",
  );
});

test("the rail owner no longer renders or receives curation", () => {
  assert.doesNotMatch(railCode, /CurationReviewCard/, "curation is composed by the page now");
  assert.doesNotMatch(railCode, /curation\?:/, "the prop is removed, not carried dead");
  assert.doesNotMatch(railCode, /CurationSummary/, "and its type import with it");
});

/* ── 3 · Page composition order ─────────────────────────────────────── */

test("the page composes rail, then the ask slot, then the curation doorway", () => {
  const aside = pageCode.slice(
    pageCode.indexOf('data-purchase-rail=""'),
    pageCode.indexOf("</aside>"),
  );
  assert.ok(aside.length > 0, "desktop rail aside");

  const railEl = aside.indexOf("<ListingActionRail");
  const askSlot = aside.indexOf('id="rail-ask-slot"');
  const curationEl = aside.indexOf("<CurationReviewCard");

  assert.ok(railEl >= 0, "ListingActionRail");
  assert.ok(askSlot > railEl, "Ask-the-Seller slot follows the rail");
  assert.ok(
    curationEl > askSlot,
    "Curation Review follows the Ask-the-Seller slot — so it travels down when the conversation grows",
  );

  /* Normal flow is the whole point of the position. Absolute or fixed
     positioning would let Curation hold a coordinate and overlap the
     composer it is supposed to yield to. */
  const curationBlock = aside.slice(curationEl);
  assert.doesNotMatch(curationBlock, /absolute|fixed/, "curation stays in normal document flow");
});

test("the curation doorway is inside the desktop-only aside", () => {
  const asideOpen = pageCode.slice(
    pageCode.indexOf('data-purchase-rail=""'),
    pageCode.indexOf('data-purchase-rail=""') + 400,
  );
  assert.match(asideOpen, /hidden min-\[56rem\]:/, "the aside is desktop-only");
  /* One curation render site in the whole page: the narrow composition
     never receives this doorway. */
  assert.equal(
    (pageCode.match(/<CurationReviewCard/g) ?? []).length,
    1,
    "exactly one curation render site",
  );
});

/* ── 4 · Curation persistence: compact at rest, full when invited ───── */

test("the completed resting surface is compact, and the full report is not permanent", () => {
  const completed = curationCode.slice(
    curationCode.indexOf('if (state === "completed"'),
    curationCode.indexOf('if (state === "pending"'),
  );
  assert.ok(completed.length > 0, "completed branch");

  /* The full report lives inside the bubble. Everything the report is made
     of must appear AFTER the HelpBubble opens and before it closes. */
  const bubbleOpen = completed.indexOf("<HelpBubble");
  const bubbleClose = completed.indexOf("</HelpBubble>");
  assert.ok(bubbleOpen >= 0 && bubbleClose > bubbleOpen, "completed state uses HelpBubble");

  const inside = completed.slice(bubbleOpen, bubbleClose);
  assert.match(inside, /display\.findings\.map/, "findings live in the bubble");
  assert.match(inside, /REVIEW_SCOPE_EXPLANATION/, "locked scope explanation lives in the bubble");
  assert.match(inside, /summary\.updated/, "updated date lives in the bubble");

  const afterBubble = completed.slice(bubbleClose);
  assert.doesNotMatch(afterBubble, /display\.findings\.map/, "findings are not permanent rail content");
  assert.doesNotMatch(afterBubble, /REVIEW_SCOPE_EXPLANATION/, "nor the scope explanation");
  assert.doesNotMatch(afterBubble, /summary\.updated/, "nor the updated date");

  /* The resting line IS the derived lead — not a friendlier second
     vocabulary that would collapse a reservation into reassurance. */
  assert.match(afterBubble, /\{display\.lead\}/, "the derived lead is the resting truth");
});

test("completed truth is still derived, and summary.comments never regains authority", () => {
  assert.match(curationCode, /curationDisplay\(summary\)/, "derived at read time from stored verdicts");
  assert.doesNotMatch(curationCode, /summary\.comments/, "GRS-010: the frozen sentence stays unprinted");
});

test("pending stays requester-only and keeps its existing wording", () => {
  const pending = curationCode.slice(
    curationCode.indexOf('if (state === "pending"'),
    curationCode.lastIndexOf("return ("),
  );
  assert.match(pending, /Review requested/, "the existing visible state");
  assert.match(pending, /post the result here when the review is complete/, "the existing explanation");
  assert.match(pending, /<HelpBubble/, "pending gets the same doorway");
});

test("the none state keeps one request owner and all of its behaviour", () => {
  /* Exactly one request function and one POST — a second would be a second
     curation state owner, which this refactor is forbidden to create. */
  assert.equal((curationCode.match(/async function request\(/g) ?? []).length, 1);
  assert.equal((curationCode.match(/curation-request/g) ?? []).length, 1);

  assert.match(curationCode, /Double-check this listing/, "existing action wording");
  assert.match(curationCode, /re-check this listing/, "existing explanatory copy");
  assert.match(curationCode, /login\?callbackUrl=/, "existing auth return");
  assert.match(curationCode, /busy \? "Requesting…"/, "existing busy state");
  assert.match(curationCode, /\{error && /, "existing error state");

  /* The absence of a review is not evidence about a watch: the resting
     none-state carries no sentence at all. */
  const none = curationCode.slice(curationCode.lastIndexOf("return ("));
  const bubbleOpen = none.indexOf("<HelpBubble");
  const bubbleClose = none.indexOf("</HelpBubble>");
  const insideBubble = none.slice(bubbleOpen, bubbleClose);
  assert.match(insideBubble, /Double-check this listing/, "the invitation is inside the bubble");
  assert.doesNotMatch(
    none.slice(bubbleClose),
    /<p/,
    "no resting sentence in the none state — absence is not a verdict",
  );
});

/* ── 5 · Help Bubble Law: the governed owner, not a new popover ─────── */

test("curation reuses the governed HelpBubble and forks none of it", () => {
  assert.match(curationCode, /import HelpBubble from "@\/components\/HelpBubble"/);

  /* No second popover implementation: the dismissal, focus-return, history
     and clamp behaviour all belong to the shared component. */
  assert.doesNotMatch(curationCode, /useLayoutEffect|addEventListener|popstate|Escape/,
    "no forked dismissal, focus or placement logic");
  assert.doesNotMatch(curationCode, /onPointerEnter|onMouseEnter/, "no hover-only dependency of its own");

  /* All three states are doorways — none is left as a permanent card. */
  assert.equal((curationCode.match(/<HelpBubble/g) ?? []).length, 3, "one doorway per state");

  /* Accessible name for the ? and the dialog, and a stable history key. */
  /* Not `aria-label` — the sections carry that too, and a loose match
     counts them as bubble triggers. */
  assert.equal((curationCode.match(/(?<!aria-)label="Curation Review"/g) ?? []).length, 3);
  assert.equal((curationCode.match(/title="Curation Review"/g) ?? []).length, 3);
  assert.equal((curationCode.match(/historyKey="curation-review"/g) ?? []).length, 3);

  /* Long-help card treatment: the governed rounded exception, sized to the
     established family, and clamped so it can never exceed the viewport. */
  assert.match(curationCode, /rounded-2xl/, "long-help rounded card");
  assert.match(curationCode, /w-\[min\(390px,calc\(100vw-24px\)\)\]/, "established width, viewport-safe");
  assert.match(curationCode, /caretTracksTrigger/, "caret is measured, not a fixed offset");

  /* No inline expansion: the rail must not reflow when help opens. */
  /* ELEMENTS, not words. `details` appears in this component's own copy
     ("re-check this listing's details, photographs and reference"), and a
     loose match reads product prose as markup. */
  assert.doesNotMatch(curationCode, /<details\b|<summary\b/i, "no accordion or inline disclosure");
});

test("the trigger's touch target is preserved while the card stays compact", () => {
  /* Negative margins reclaim the LAYOUT box only. If the trigger were given
     a smaller hit area instead, the Help Bubble Law's requirement for
     invisible interaction territory around a delicate ? would be broken. */
  assert.match(curationCode, /const TRIGGER = "-my-3 -mr-2"/);
  assert.doesNotMatch(curationCode, /h-\[?\d+px\]?\s+w-\[?\d+px\]?.*HelpBubble/s);
});

/* ── 6 · Frozen neighbours ──────────────────────────────────────────── */

test("the narrow composition and the sticky bar are untouched by this flight", () => {
  /* v8.72–v8.75 narrow work still stands. */
  assert.match(railCode, /data-decision-cluster=""/, "narrow decision cluster");
  assert.match(railCode, /\{`Sold by \$\{sellerName\} →`\}/, "narrow seller line, one text child");
  assert.match(railCode, /Make an Offer/, "narrow commerce doorway");

  /* The bar variant still exists and still renders only the offer action. */
  assert.match(railCode, /if \(variant === "bar"\)/);

  /* Purchase Request state machine untouched. */
  assert.match(
    railCode,
    /const ctaState: "owner" \| "reserved" \| "superseded" \| "pending" \| "accepted" \| "open"/,
  );

  /* Correspondence ownership untouched — the page still portals the composer
     into the slot rather than rebuilding it. */
  assert.match(pageCode, /id="rail-ask-slot"/);
});
