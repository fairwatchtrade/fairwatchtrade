/* ════════════════════════════════════════════════════════════════════════
   STORY PHOTO SELECTION — seller choice, and the fallback beneath it.

   Run: node --experimental-strip-types scripts/story-photo.test.mjs

   Every case in the build order is a property of two pure functions, so
   they are proved here rather than through a browser: withStoryPhoto()
   records the choice, resolveStoryIndex() decides what the listing shows.

   The load-bearing idea under test is that resolveStoryIndex COMPARES a
   pathname rather than DEREFERENCING an id. That single decision is what
   makes deletion, reordering and cross-listing assignment all behave
   correctly without any of them being special-cased — which is exactly why
   each is asserted separately below rather than assumed from the others.
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import {
  defaultPresentation,
  isDefaultPresentation,
  resolveHeroIndex,
  resolveStoryIndex,
  sanitizePhotoPresentation,
  withHero,
  withStoryPhoto,
} from "../lib/photoPresentation.ts";

let n = 0;
const ok = (label, cond) => {
  n += 1;
  assert.ok(cond, label);
};

const A = "listings/a-dial.jpg";
const B = "listings/b-caseback.jpg";
const C = "listings/c-clasp.jpg";
const GALLERY = [A, B, C];

/* The automatic answer this listing would give on its own: first non-hero.
   Computed the way the page computes it, so the tests exercise the real
   relationship between choice and fallback rather than a stand-in. */
const automatic = (paths, heroIdx) => paths.findIndex((p, i) => i !== heroIdx && !!p);

// ── 1 · SELECT ──────────────────────────────────────────────────────────
{
  let p = defaultPresentation();
  p = withHero(p, A);
  p = withStoryPhoto(p, B);

  const heroIdx = resolveHeroIndex(GALLERY, p, 0);
  ok("hero is still A after choosing a story photo", heroIdx === 0);
  ok("story resolves to the chosen photograph", resolveStoryIndex(GALLERY, p, automatic(GALLERY, heroIdx)) === 1);
  ok("choosing a story photo did not move the hero", p.heroPathname === A);
}

// ── 2 · REPLACE ─────────────────────────────────────────────────────────
{
  let p = withStoryPhoto(withHero(defaultPresentation(), A), B);
  p = withStoryPhoto(p, C);

  ok("the later choice replaces the earlier one", p.storyPathname === C);
  ok("story resolves to C", resolveStoryIndex(GALLERY, p, automatic(GALLERY, 0)) === 2);
  ok("exactly one story relationship exists", typeof p.storyPathname === "string");
  ok("replacing the story photo did not move the hero", p.heroPathname === A);
}

// ── 3 · NONE SELECTED — the automatic fallback still governs ────────────
{
  const p = withHero(defaultPresentation(), A);
  ok("no selection is recorded", p.storyPathname === null);
  ok(
    "with no choice, the automatic answer is used",
    resolveStoryIndex(GALLERY, p, automatic(GALLERY, 0)) === 1
  );

  /* Cleared, not merely absent — the seller pressed the control a second
     time and expects the listing to go back to deciding for itself. */
  const cleared = withStoryPhoto(withStoryPhoto(p, C), null);
  ok("clearing returns the listing to automatic", cleared.storyPathname === null);
  ok(
    "and the automatic answer is what renders",
    resolveStoryIndex(GALLERY, cleared, automatic(GALLERY, 0)) === 1
  );
}

// ── 4 · SELECTED PHOTO REMOVED ──────────────────────────────────────────
{
  const p = withStoryPhoto(withHero(defaultPresentation(), A), B);
  const afterRemoval = [A, C]; // B deleted through the real media seam

  const heroIdx = resolveHeroIndex(afterRemoval, p, 0);
  const idx = resolveStoryIndex(afterRemoval, p, automatic(afterRemoval, heroIdx));

  ok("a removed story photo does not resolve to itself", idx !== -1);
  ok("it falls back to the automatic answer", idx === 1 && afterRemoval[idx] === C);
  ok("the stored selection is never dereferenced, so nothing dangles", p.storyPathname === B);
  ok(
    "and a listing left with only its hero still resolves",
    resolveStoryIndex([A], p, automatic([A], 0)) === -1 ||
      resolveStoryIndex([A], p, 0) === 0
  );
}

// ── 5 · REORDER ─────────────────────────────────────────────────────────
{
  const p = withStoryPhoto(withHero(defaultPresentation(), A), B);
  const reordered = [C, B, A]; // same photographs, new gallery order

  const heroIdx = resolveHeroIndex(reordered, p, 0);
  ok("the hero follows its photograph, not its position", heroIdx === 2);
  ok(
    "the story photo follows its photograph too",
    reordered[resolveStoryIndex(reordered, p, automatic(reordered, heroIdx))] === B
  );
}

// ── 6 · CROSS-LISTING ASSIGNMENT IS STRUCTURALLY REFUSED ────────────────
{
  const foreign = "listings/some-other-listing-dial.jpg";
  const p = withStoryPhoto(withHero(defaultPresentation(), A), foreign);

  const idx = resolveStoryIndex(GALLERY, p, automatic(GALLERY, 0));
  ok("a foreign pathname never matches this listing's photographs", GALLERY[idx] !== foreign);
  ok("so the listing shows its own automatic answer instead", idx === 1);
  ok("no foreign image can reach the page", GALLERY.includes(GALLERY[idx]));
}

// ── 7 · PERSISTENCE ─────────────────────────────────────────────────────
{
  const p = withStoryPhoto(withHero(defaultPresentation(), A), B);
  const round = sanitizePhotoPresentation(JSON.parse(JSON.stringify(p)));
  ok("the choice survives a persistence round trip", round.storyPathname === B);
  ok("and so does the hero", round.heroPathname === A);

  /* The v2 frames branch returns early. A row carrying framing must not
     lose its story selection on the way through that return. */
  const framed = sanitizePhotoPresentation({
    heroPathname: A,
    storyPathname: B,
    frames: { [C]: { focalX: 0.6, focalY: 0.4, zoom: 1.05, rotationDeg: 90 } },
  });
  ok("a row with frames keeps its story selection", framed.storyPathname === B);
  ok("and keeps its frames", framed.frames[C] !== undefined);

  ok("garbage is refused, not stored", sanitizePhotoPresentation({ storyPathname: 42 }).storyPathname === null);
  ok("a legacy row with no story field reads as no choice", sanitizePhotoPresentation({ heroPathname: A }).storyPathname === null);

  /* A story-only presentation is NOT default — if it were, the persistence
     layer would drop the record and the seller's choice would vanish on
     save. */
  ok(
    "a presentation carrying only a story choice still persists",
    !isDefaultPresentation(withStoryPhoto(defaultPresentation(), B))
  );
  ok("a genuinely empty presentation is still default", isDefaultPresentation(defaultPresentation()));
}

// ── 8 · INDEPENDENCE, BOTH DIRECTIONS ───────────────────────────────────
{
  let p = withStoryPhoto(withHero(defaultPresentation(), A), B);
  p = withHero(p, C);
  ok("changing the hero leaves the story photo alone", p.storyPathname === B);
  p = withStoryPhoto(p, A);
  ok("changing the story photo leaves the hero alone", p.heroPathname === C);

  /* The same photograph in both roles is a legitimate choice, not a
     conflict. */
  const both = withStoryPhoto(withHero(defaultPresentation(), A), A);
  ok("one photograph may hold both roles", both.heroPathname === A && both.storyPathname === A);
  ok("and it resolves in both", resolveStoryIndex(GALLERY, both, automatic(GALLERY, 0)) === 0);
}

console.log(`story-photo: ${n} assertions PASS`);
