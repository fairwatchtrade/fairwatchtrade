import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const gallery = read("components/ListingGallery.tsx");
const drawer = read("components/MobileCollectorsDrawer.tsx");
const market = read("components/MarketBar.tsx");
const page = read("app/listings/[id]/page.tsx");
const specs = read("components/ListingSpecs.tsx");

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
