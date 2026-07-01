# Watch Anatomy Illustration — chapter-responsive blueprint (Phase 2, LOCKED)

## The idea (William's, and it's a headline feature)
A ghost technical illustration of a watch — thin blueprint/patent-drawing line
work, "quartering away" (three-quarter view, ~45° like a ship quartering off the
stern), almost invisible against the dark background. As the seller moves through
the six chapters of Step 3, the illustration LIGHTS UP limb by limb — the part of
the watch being described warms from ghost silver-line to faint gold.

## Chapter → lit region mapping
- I · The Watch Itself   → the whole movement / entire watch glows faint gold
- II · The Case          → case outline, crystal, caseback brighten
- III · The Dial & Hands → the dial face and hands illuminate
- IV · The Wearing       → strap / bracelet / clasp warm to gold
- V · Complications      → subdials / complications highlight
- VI · Provenance & Papers → the whole watch DIMS BACK TO GHOST — "like it's
  being handed over." The watch is no longer lit because it's no longer the
  seller's to describe. It's ready for its next collector. (Mirrors the line
  ReviewStep already ends on.)

## Why it's structural, not decorative
1. FILLS REAL DEAD SPACE: the open area under the listing-strength card is
   currently "dead dead space." This is the right content for that vacancy.
2. AMBIENT PROGRESS without a progress bar: the seller knows where they are
   because that part of the watch is lit — the Battleship grid made visual.
3. It's the Dial Reveal / Moon Principle on the SELLER side: the buyer traverses
   the galaxy to the real object; the seller walks AROUND the object, lighting it
   limb by limb as they describe it. Same soul. Not filling a form — introducing
   the watch, and the watch responds to attention. Ch VI = saying goodbye to it.

## Build reality (do it right, fresh — not a midnight bolt-on)
- Needs a PURPOSE-BUILT SVG of a quartering watch with NAMED, individually-
  addressable layer groups: movement, case, crystal, caseback, dial, hands,
  strap, clasp, subdials.
- Likely path: GPT generates the base technical illustration → hand-tuned into
  clean layered SVG with id'd groups → each chapter lights its group (ghost→gold
  via fill/stroke transition on chapter focus).
- Lives in the dead space under the listing-strength card in Step 3.
- Phase 2. Concept LOCKED. This is the kind of detail that separates
  FairWatchTrade from everything else — nobody's sell form does this.

---

## SCOPE RULING (Ducky 3): this is NOW — it's PART 3 of the sell flow build

Not Phase 2. The dead space below ListingScoreMeter in Step 3's right (quiet-
witness) panel IS the canvas — already there, already the right size, already the
right context. The ghost SVG sits in that space at ~60-70% of panel width,
centered, opacity-[0.06] at rest. As the seller moves through each chapter, the
relevant layer brightens to opacity-[0.35] in gold.

PART 3 BRIEF ADDITION (Ducky 7 — in scope when building the quiet-witness panel):
"Right panel dead space below ListingScoreMeter — chapter-responsive watch
anatomy SVG, quartering view, ghost at rest (opacity-[0.06]), gold layer on
active chapter (opacity-[0.35]). Same chapter state that drives Step 3 drives
which layer is lit. The panel and the illustration are ONE build."

Still needs the purpose-built layered SVG (named groups per chapter region). That
asset can be drafted (GPT) in parallel; the panel is built to receive it.

---

## THE SCROLL VERSION (GPT + William) — this is THE build, Part 3

No buttons. The watch ASSEMBLES ITSELF as the seller scrolls through the chapters.

MECHANISM:
- Right (quiet-witness) panel is position: sticky — already in the Studio spec —
  so the watch stays in view the whole scroll.
- IntersectionObserver watches each chapter section (I–VI). As a chapter crosses
  the viewport threshold, fire setActiveChapter(n) → that chapter's watch layer
  lights gold (opacity-[0.35]), the others dim to ghost (opacity-[0.06]).
- The scroll position IS the input. No clicks. The seller fills out the form and
  the watch responds to wherever their attention is.

THE FEELING (why it matters — it's not a gimmick anymore):
Scroll through Ch I → movement gears glow. Ch II → case rings light, movement
dims. Ch III → dial illuminates. Ch IV → strap brightens. Ch V → subdials emerge.
Ch VI → the whole watch glows faintly as one complete object being handed over.
The seller isn't clicking a toy — they're describing their watch and the watch is
answering. It's the Dial Reveal / Moon Principle: the object responds to being
SEEN. The "useless" space-filler becomes quietly meaningful because it's tied to
the act of description.

BUILD (Part 3, NOT Phase 2 — the sticky panel already exists in scope):
- William's POC (watch.html) = the proven controller + geometry. Convert to a
  React component (e.g. ChapterWatch.tsx) with the same part ids (movement, case,
  dial, wearing, complications, provenance) and ghost→gold logic.
- Replace the POC's buttons with an activeChapter prop.
- IntersectionObserver in the Step 3 container watches the six chapter sections,
  sets activeChapter as each enters the viewport.
- Component lives in the sticky right panel, in the dead space below
  ListingScoreMeter. opacity-[0.06] rest / opacity-[0.35] active, --gold.
- Artwork: flat-tilt (William's POC) is enough to ship — "cool, nice touch" bar
  is already cleared. Exploded-quartering is an optional polish pass later; the
  wiring never changes, so the art can improve in place anytime.

3's mock (POC placed on a real FairWatchTrade page) pending — build to that once
it lands.

---

## DEFINITIVE VERSION — "the companion" (William + GPT). Supersedes all above.

THE REFRAME (William): the dead space should NOT be dead space filled with an
illustration. It should BECOME the watch you're building. Not decorative. Not an
illustration. A COMPANION. The negative space becomes part of the composition
instead of something we're trying to fill.

FORM: unchanged on the left. Listing-strength panel stays. Behind/beside it,
floating in the negative space, a LARGE engineering drawing — Swiss patent /
blueprint style — occupying almost the entire empty right side. 500–600px tall.
8–12% opacity at rest: so faint it almost disappears until the gold arrives.

BEHAVIOR — scroll-driven, no buttons (the page already knows where you are):
- sticky (NOT fixed) right panel — the watch never leaves; the USER moves through
  it, textbook-style.
- As each chapter enters the viewport, its region softly turns gold; everything
  else stays blueprint grey. Soft 250ms fade. No animation, no motion — almost
  subconscious.
  Ch I movement → Ch II case → Ch III dial/hands/crown → Ch IV strap →
  Ch V subdials → Ch VI: everything fades BACK to blueprint EXCEPT one small
  thing — an archival tag / papers / document — quietly turns gold. "The story is
  complete." No celebration. Just finished.

GUARDRAILS (GPT, locked):
- DON'T over-detail. Swiss patent drawing / engineering blueprint, NOT a watch
  advertisement. At a glance: "that's beautiful" → then eyes go straight back to
  the form. It must NEVER compete with the form. If it pulls focus, it failed.
- BIGGER + FAINTER than instinct. Large (500–600px) but so faint it nearly
  vanishes until the gold highlights begin. The negative space IS the composition.

WHY (the philosophy it reinforces): the seller isn't filling out fields — they're
DOCUMENTING a watch, one chapter at a time. An anatomy textbook that lights the
structure you're reading about. The kind of detail people never mention but
remember subconsciously. Part 3. Build to 3's mock.

---

## PUNCH-LIST (logged, not yet fixed)
- CURATION STEP — weak Tab focus indication. When tabbing between fields on the
  Curation step, there's not enough visual signal that focus moved to the next
  field. Needs a clearer :focus / :focus-visible state (e.g. stronger border-gold
  or a subtle ring) so keyboard users can see where they are. Small but real.
- SPELLCHECK on free-text fields. The "Brief provenance note" textarea (Ch VI)
  has no spellcheck — a "ne"/"new" typo went unflagged. Add spellCheck to the
  free-text fields where typos are visible to buyers: provenance note (Ch VI),
  the Step 4 description textarea, and any other prose inputs. One-attribute add
  per field (spellCheck defaults off on some; set explicitly true). Small, safe.
- (Also double-tabbed 3x tonight on Curation — see focus-indication item above;
  it's a recurring friction, worth doing.)

---

## Typo catching — do it via the EXISTING AI pass, not browser spellcheck (logged)
Browser spellCheck proved fragile: depends on browser settings (didn't even
underline), false-flags legit watch terms (Hesalite, tourbillon, guilloché),
and only warns passively (right-click to fix) — doesn't catch context typos
(their/there) or guarantee correction before publish.

BETTER (William's idea, half-joking but real): FairWatchTrade already has an AI
validation call — /api/validate-description checks the description for
generic/copied text. Extend THAT existing pass to also flag obvious typos /
quality issues (it understands Hesalite is real, catches context typos, no new
fragile dependency). Possibly extend the AI pass to the provenance note too
(currently unchecked).

CAUTION: validate-description is load-bearing (the anti-generic gate). Changing
its prompt/scope needs care — response time, false-positive rate, whether it
applies to provenance. This is a DESIGN change (loop 3), not a quick add. Pull or
ignore the weak browser spellcheck; build the AI-pass version deliberately later.

## SQUIGGLE REVERSAL — spellcheck PULLED (everyone hates the squiggles)
Browser spellcheck set to spellCheck={false} on ALL fields. The red squiggles are
ugly, clash with the quiet editorial aesthetic, and false-flag every legit watch
term (Hesalite, tourbillon, guilloché). Explicit false so no browser defaults it
on. Typo catching, if wanted, happens invisibly via the AI pass later — never
squiggles. The focus-visible fix (double-tab) is KEPT — that one's wanted.

---

## PROVENANCE TYPO CHECK — Ducky 3's spec (for posterity + the future build)

3's framing: the provenance note is the one free-text field where the seller
types their own words — where typos live — and going back after Continue is
friction.

3's KEY INSIGHT (the answer to why squiggles are hated): underline suspects in
GOLD, not red. "Red feels like a grade." Gold = assistance, not judgment. This is
the reframe that makes typo-catching fit the brand.

3's RULING — Option B (check on Continue, not on blur):
- Seller hits Continue → spell check runs → if issues, show them inline with a
  "looks good, continue anyway" option. Review at the MOMENT OF COMMITMENT — when
  the seller typed fast and clicked Continue immediately, which is exactly the bug
  scenario. (Option A, check-on-blur, lets a seller who ignores the underlines
  advance with typos anyway.)
- Same pattern as DescriptionStep's AI validation: check before advancing, offer
  fix-or-proceed. Familiar, no surprise.

API CHOICE — use ANTHROPIC (already in the stack), NOT LanguageTool:
- Anthropic already powers /api/evaluate and /api/validate-description; a
  one-sentence provenance note is trivial token cost.
- Crucially, an LLM UNDERSTANDS watch vocabulary — it won't false-flag Hesalite,
  guilloché, tourbillon the way a generic spell API (or browser spellcheck) does.
  The exact failure of browser spellcheck (watch jargon) is why AI wins here.
- One fewer dependency; smarter checking.

BUILD: add to DescriptionStep/provenance flow as a check-on-Continue step, gold
inline suggestions, fix-or-proceed. Deliberate build (loop 3), not a midnight add.
This replaces the pulled browser spellcheck entirely.

---

## PROVENANCE "FINAL REVIEW" — complete spec (3 + GPT, ready to build)

CONSENSUS: AI check on Continue from Step 3, when draft.provenanceNote.trim()
.length > 0. Replaces browser spellcheck entirely. Uses existing Anthropic stack.

NAMING (GPT — don't call it spell check anywhere in UI):
- Call it "Final Review" or "One last look before continuing."
- Quietly covers spelling, grammar, punctuation, obvious capitalization — without
  feeling like Grammarly. Assistance, not policing.

TRIGGER: on Continue click from Step 3 (details/provenance), only if provenance
note is non-empty. Same familiar pattern as DescriptionStep's AI validation —
check at the moment of commitment (the exact bug case: type fast → click Next →
browser spellcheck never helped → typo carried forward, no recourse to edit).

PROMPT (locked — high-confidence only, preserve voice):
"Review this provenance note for obvious spelling, grammar, punctuation, and
readability issues while preserving watch terminology, brand names, reference
numbers, and the seller's writing style. Return only high-confidence suggestions."
Plus: "Preserve the seller's voice. Preserve watch terminology, brand names,
reference numbers, accents, calibres, and model names. Only suggest obvious
spelling, grammar, punctuation, or typo corrections."
NOT rewrites. NOT style edits. NOT marketing improvements. Just near-certain
mistakes. (Avoids the "AI changed my story" failure.)

WHY AI not LanguageTool/browser: generic checkers false-flag the exact words
sellers type daily — guilloché, Hesalite, Glashütte, Parmigiani, Chronomètre,
F.P. Journe, Valjoux, Lemania, El Primero. An LLM understands them.

UI (GPT — no red, no error, no blocking; gold/neutral):
Heading: "One last look"
Body: "We noticed a few possible wording issues in your provenance note. You can
apply the suggestions or continue as written."
Suggestions underlined/marked in GOLD, not red ("red feels like a grade" —3).
Buttons: [Apply suggestions] [Continue as written] [Go back]
Non-destructive: show original + suggested version, seller chooses, NEVER
auto-apply silently.

PHILOSOPHY (GPT): tiny in isolation, but across dozens of interactions these
touches accumulate into a site that feels RESPECTFUL instead of corrective —
what collectors and dealers notice even without articulating why it feels
different. That's the whole brand: respectful, not corrective.

BUILD: DescriptionStep/SellFlow Continue-from-Step-3 flow. Deliberate build, loop
3. Not a midnight add.
