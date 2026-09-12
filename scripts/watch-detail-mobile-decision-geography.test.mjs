import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const gallery = read("components/ListingGallery.tsx");
const drawer = read("components/MobileCollectorsDrawer.tsx");
const market = read("components/MarketBar.tsx");
const page = read("app/listings/[id]/page.tsx");
const specs = read("components/ListingSpecs.tsx");
const rail = read("components/ListingActionRail.tsx");
const inlineForm = read("components/InlinePurchaseRequest.tsx");

test("Watch Detail alone suppresses the metals ribbon below the 56rem handoff", () => {
  assert.match(market, /import \{ usePathname \} from "next\/navigation"/);
  assert.ok(
    market.includes('const isWatchDetail = /^\\/listings\\/[^/]+\\/?$/.test(pathname);'),
    "the route gate is limited to a concrete listing detail path",
  );
  assert.match(market, /data-market-bar=""/);
  assert.match(market, /isWatchDetail \? "hidden min-\[56rem\]:block" : ""/);
  assert.match(market, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 30000\)/);
});

test("the resting gallery uses mobile swipe and keeps desktop arrows", () => {
  assert.match(gallery, /import \{ gallerySwipeDirection \} from "@\/lib\/media\/gallerySwipe"/);
  assert.match(gallery, /data-listing-stage=""[^>]*onPointerDown=\{onStagePointerDown\}[^>]*onPointerUp=\{onStagePointerUp\}[^>]*onPointerCancel=\{onStagePointerCancel\}/s);
  assert.match(gallery, /\[touch-action:pan-y\][^"\n]*min-\[56rem\]:\[touch-action:auto\]/);
  assert.match(gallery, /const stageArrowClass =\s*"absolute[^"\n]*hidden[^"\n]*min-\[56rem\]:flex/);
  assert.equal((gallery.match(/aria-label="Previous photo"/g) ?? []).length, 2);
  assert.equal((gallery.match(/aria-label="Next photo"/g) ?? []).length, 2);
});

test("the dial photograph can swipe while Dial Reveal controls keep their gestures", () => {
  assert.doesNotMatch(
    gallery,
    /event\.target\.closest\([\s\S]*?\[data-dial-reveal\][\s\S]*?\)/,
    "the Dial Reveal wrapper covers the whole initial photograph",
  );
  assert.match(gallery, /button, a, input, label, select, textarea, \[role="button"\]/);
});

test("mobile gets an in-image position cue and no persistent resting thumbnails", () => {
  const count = /<div\s+data-mobile-photo-count=""\s+className="([^"]+)"[^>]*>[\s\S]*?\{active \+ 1\}[\s\S]*?\{photos\.length\}[\s\S]*?<\/div>/.exec(gallery);
  assert.ok(count, "mobile photo count");
  assert.match(count[1], /min-\[56rem\]:hidden/);
  assert.match(count[1], /absolute/);
  assert.match(count[1], /left-3 top-3/, "the count must stay clear of the right-edge Dial Reveal fader");
  assert.doesNotMatch(count[1], /right-3/);

  /* Founder/design correction 2026-09-12: the cue is smoke on the
     photograph, not a security-camera plate. A bordered near-black chip
     pulled the eye to the corner before the watch. */
  assert.doesNotMatch(count[1], /\bborder\b/, "no border — an edge makes it a plate");
  assert.doesNotMatch(count[1], /shadow-/, "no shadow — it does not float above the image");
  assert.doesNotMatch(count[1], /rounded-full/, "not a pill: a pill reads as a pressable button");
  assert.match(count[1], /rounded-lg/, "same corner the photograph itself carries");
  assert.match(count[1], /bg-\[var\(--on-photo-scrim-soft\)\]/, "the soft scrim, never the panel scrim");
  assert.doesNotMatch(count[1], /bg-\[var\(--on-photo-scrim\)\]/);
  assert.match(count[1], /backdrop-blur-/, "smoke reads as haze over the image, not a flat chip");
  assert.match(count[1], /text-\[var\(--on-photo-text\)\]/, "light text on the photograph");

  const rail = /<div\s+data-resting-thumbnail-rail=""\s+className="([^"]+)"/.exec(gallery);
  assert.ok(rail, "resting thumbnail rail");
  assert.match(rail[1], /hidden/);
  assert.match(rail[1], /min-\[56rem\]:flex/);

  assert.match(gallery, /aria-label="Inspect photo"/);
  assert.match(gallery, /<InspectionPhotoRail/);
});

/* Founder narrow target, 2026-09-12. The named tab this test used to pin —
   64px wide, bordered, shadowed, carrying the visible word "Drawer" — read
   as a floating mini-card competing with the identity block beneath it. The
   target returns the doorway to a mark. The word does not disappear from the
   product, it moves entirely into the accessible name, which is why the
   aria-label assertion below is now load-bearing rather than incidental. */
test("the mobile Drawer pull is a quiet mark whose name survives for assistive users", () => {
  const opener = /<button\s+type="button"\s+data-mobile-drawer-opener=""[\s\S]*?<\/button>/.exec(drawer)?.[0];
  assert.ok(opener, "mobile Drawer opener");
  assert.match(opener, /h-\[44px\] w-\[38px\]/);
  assert.match(opener, /bottom-0/, "the 44px tab must occupy the gallery's 44px control lane");
  assert.doesNotMatch(opener, /top-\[calc\(/, "viewport arithmetic must not detach the tab from the rendered stage");
  assert.doesNotMatch(
    opener,
    />\s*Drawer\s*<\/span>/,
    "the visible noun is gone: the blade alone carries the doorway on narrow",
  );
  assert.match(
    opener,
    /border-0 bg-transparent/,
    "no border, fill or shadow — a card here competes with the identity block below",
  );
  assert.doesNotMatch(opener, /shadow-\[/, "the tab must not cast a floating-panel shadow");
  assert.match(opener, /h-\[34px\] w-\[17px\] shrink-0/, "the watch-hand mark must not flex-shrink");
  assert.match(
    opener,
    /aria-label=\{expanded \? "Close Collector's Drawer" : "Open Collector's Drawer"\}/,
    "with no visible label this is the ONLY name the control has — never remove it",
  );
  assert.doesNotMatch(opener, /top-\[calc\(71%\+40px\)\]|h-\[90px\]|h-\[96px\]/);
});

test("mobile decision order is identity, the existing price/action owner, then specifications", () => {
  const identity = page.indexOf('data-listing-identity=""');
  const inline = page.indexOf('data-purchase-inline=""');
  const specifications = page.indexOf("<ListingSpecs");
  assert.ok(identity >= 0, "identity anchor");
  assert.ok(identity < inline && inline < specifications, "mobile price/action must precede specifications");
  assert.equal(page.split('data-purchase-inline=""').length - 1, 1, "one inline commerce surface");
  assert.match(page, /data-purchase-inline="" className="min-\[56rem\]:hidden"/);
  assert.match(page, /variant="inline"[\s\S]*?requestStatus=\{myLatestRequest\?\.status \?\? null\}[\s\S]*?listingStatus=\{listing\.status\}/);
});

/* ── Narrow decision cluster, founder target 2026-09-12 ──────────────────
   Price, seller relation and the commerce doorway are ONE decision. These
   pins exist because the previous composition was not wrong in content
   order — it was wrong in composition, and content-order assertions alone
   passed straight through it. */
test("price, seller and the doorway compose one cluster rather than stacked sections", () => {
  const cluster = /data-decision-cluster=""[\s\S]*?\{purchaseBlock\}/.exec(rail)?.[0];
  assert.ok(cluster, "narrow decision cluster");

  /* The monument and its rule are gone: a price that opens its own section
     is the defect this target was drawn to kill. */
  assert.doesNotMatch(cluster, /mt-10/, "the cluster must not reopen a section above the price");
  assert.doesNotMatch(cluster, /border-t/, "no rule may separate price from the provenance above it");
  assert.doesNotMatch(cluster, /text-\[36px\]/, "the 36px monument does not return to narrow");
  assert.match(cluster, /text-\[26px\]/);

  /* The visible label leaves; the meaning stays for a non-visual reader. */
  assert.match(cluster, /<span className="sr-only">Asking price <\/span>/);
  assert.doesNotMatch(cluster, /tracking-\[1\.6px\]\S*>\s*Asking Price/);

  /* Seller and action share ONE row. */
  const row = /flex flex-wrap items-baseline[\s\S]*?<\/div>/.exec(cluster)?.[0];
  assert.ok(row, "seller/action row");
  assert.match(row, /Sold by \$\{sellerName\}/);
  assert.match(row, /Make an Offer/);
  assert.ok(
    row.indexOf("Sold by") < row.indexOf("Make an Offer"),
    "seller relation leads, the action follows it on the same row",
  );
  /* The seller line is ONE text child composed in JS. As JSX children this
     row renders "Mynatt→" with the separating space trimmed away — proven in
     production against a line byte-identical to the desktop rail's, which
     does not lose it. Neither a literal glyph nor an entity survives here;
     a template literal has no child list to trim. */
  assert.match(row, /\{`Sold by \$\{sellerName\} →`\}/);
  assert.doesNotMatch(row, /&rarr;/);

  /* The doorway is drawn ONLY for the open state — never invented for a
     reserved, pending, accepted, superseded or owner view. */
  assert.match(row, /\{ctaState === "open" &&/);
});

test("the narrow doorway is drawn once and opens the one form", () => {
  /* Signed in it asks the in-page form to open through the same event the
     fixed bar uses; signed out it links to the route whose own auth gate
     decides identity. Two dressings, one state machine. */
  assert.match(rail, /<OpenPurchaseRequestButton[\s\S]*?label="Make an Offer"/);
  assert.match(rail, /canComposeInline \? \([\s\S]*?OpenPurchaseRequestButton/);

  /* The block below must NOT draw the guest's link a second time: that is
     the duplicate commerce CTA the target forbids. */
  assert.match(
    rail,
    /\) : variant === "inline" \? \([\s\S]*?null/,
    "the inline block must yield the guest doorway to the cluster",
  );

  /* The form's own start button draws only while the form is open, where it
     is the close control — otherwise it is a second trigger for one action. */
  assert.match(inlineForm, /\{\(isRail \|\| open\) && startButton\}/);
});

test("mobile has one normal specification flow while desktop keeps its established two-section view", () => {
  const mobileStart = specs.indexOf('data-mobile-specifications=""');
  const desktopStart = specs.indexOf('data-desktop-specifications=""');
  assert.ok(mobileStart >= 0 && desktopStart > mobileStart, "complementary specification branches");

  const mobile = specs.slice(mobileStart, desktopStart);
  /* Narrow target 2026-09-12: specifications follow the decision cluster on
     one modest transition, so the narrow top margin tightened while desktop
     keeps its original mt-8 at `sm`. */
  assert.match(mobile, /className="mt-4 min-\[56rem\]:hidden sm:mt-8"/);
  assert.match(mobile, /<SectionHeading>Technical Specifications<\/SectionHeading>/);
  assert.match(mobile, /<Units units=\{mobileUnits\}/);
  assert.doesNotMatch(mobile, /Collector Snapshot/);

  const desktop = specs.slice(desktopStart);
  assert.match(desktop, /className="hidden min-\[56rem\]:contents"/, "the desktop wrapper must not become a new layout box");
  assert.match(desktop, /<SectionHeading>Collector Snapshot<\/SectionHeading>/);
  assert.match(desktop, /<SectionHeading>Technical Specifications<\/SectionHeading>/);
  assert.match(specs, /const mobileUnits: Unit\[\] = \[\.\.\.snapshotUnits, \.\.\.technicalUnits\]/);
});
