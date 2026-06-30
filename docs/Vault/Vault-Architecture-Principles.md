# Vault Architecture Principles
**Permanent. Non-negotiable. These are PHILOSOPHY, not features. Forgetting one
is not "we missed a feature" — it is "we forgot what the product IS." Read
before any Vault flight. Logged after Rule #1 was nearly lost: it lived only in
GPT's head, never reached the brief, and the first galaxy render exposed the
whole database — the opposite of the intended experience.**

## The principles

1. **The Vault is free.** A permanent gift to the collecting community. Never gated, never monetized.

2. **Canonical identity is immutable.** The Vault's record of a watch's true identity does not change.

3. **Products are stored as manufacturers build them — presented as collectors recognize them.** The data is canonical; the presentation speaks the collector's language.

4. **RULE #1 — The collector can NEVER see the entire universe at once.**
   Not for performance. For philosophy. The Vault is about **discovery, not
   exposition.** Like the real night sky, only a portion of the universe is
   ever visible from where you stand. As the collector moves, rotates, or
   changes their curiosity, new constellations emerge while others fade into
   the distance. **The unseen universe is what creates wonder.**

   The first view must NEVER communicate "Here are 193 brands."
   It must communicate "Here is one small part of a much larger universe."

   - Search, interests, and exploration determine which constellations become visible.
   - Discovery happens through **curiosity, not exposure.**
   - The galaxy must feel **infinite** even though the database is finite.
   - This is a core ARCHITECTURAL principle, not a rendering optimization.

5. **RULE #2 — The separation between points is MEANINGFUL. Distance is distinction.**
   The void between brands is not empty space to be minimized — it is the
   reverence. Each house commands its own space because proximity implies
   equivalence, and the Vault refuses to flatten watchmaking into equal rows
   in a table. Distance encodes character and kinship:
   - **Kin drift near** — houses that share a soul (independents, architectural
     makers, Japanese artisans) cluster loosely, near each other because they
     are alike.
   - **The unalike are flung across voids** — crossing from one cluster to
     another should feel like crossing between civilizations, because
     horologically it is.
   - **The emptiness is authored, not accidental.** The distance between two
     brands MEANS something about how alike they are. The `cluster` column is
     a statement of kinship, not a layout hint.
   - **The separation is what makes each brand itself.** Things crammed
     together read as interchangeable; things flung far across dark read as
     singular. The galaxy is a map of horological character expressed as
     distance — you learn who is kin to whom by how far you fly.
   - Together with Rule #1: if points are separated ENOUGH, zooming out to
     frame the whole makes each star invisible dust — the overview becomes
     meaningless, not a database. Distance makes the god's-eye view pointless,
     which is better than merely forbidding it.

## The hinge — why Rule #1 and Rule #2 belong together

Rule #1 says: you never see the whole universe.
Rule #2 says: the part you DO see has meaning.

Without clusters, the galaxy is just pretty (random) dots. With clusters,
every journey starts somewhere, and that somewhere feels intentional rather
than random. The cluster is the hinge between the two rules: it is what makes
"the part you see" meaningful instead of arbitrary. Search reveals a
NEIGHBORHOOD of an already-existing universe — you are never generating a
galaxy, only illuminating a region of one that was always there.

## The cluster rule (data law)

- `cluster` = **required, SINGLE value.** Every star has exactly ONE
  gravitational home. NOT an array. A brand that could belong to six
  neighborhoods still lives in one — because every star needs an anchor.
- Overlap is fine and expected. Clusters are **neighborhoods, not search
  filters.** Parmigiani could be Independent / Dress / Architectural / Haute
  Horlogerie — for the galaxy it gets ONE home; the rest is what search,
  tags, and a future similarity graph are for.
- `search_aliases` = many. future `tags` = many. future similarity graph =
  many. But the STAR lives in one constellation. One home keeps the universe
  understandable.

## First-pass clusters (intentionally broad — spatial kinship, not taxonomy)

Independent · Heritage Swiss · Japanese · German · British · American ·
Tool Watches · Dress & Classic · High Complication · Contemporary Independent ·
Military / Pilot · Dive & Sports

These are NEIGHBORHOODS, not a historian's classification. The goal is that
every star has an anchor neighborhood that feels intentional — not perfect
categorization. Refine later; one home each now.

## What Rules #1 and #2 demand (implementation implications)

- **Camera** must always be WITHIN the field — open inside it, never an
  overhead overview, never a zoom-out that frames the whole. You see only
  what is "ahead"; behind / far-left / far-right exist but are unseen.
  (First pass shipped: wide spread, open-inside, depth parallax, no overview.)
- **Visibility is earned, not given.** The deeper expression of the rule:
  brands you have not moved toward or searched for should not all be lit. The
  default state is mostly dark — a near handful of stars — and CURIOSITY
  (search, interests, exploration) calls regions of the universe into being.
  The relevance/brightness system becomes the primary REVEAL mechanic, not a
  search nicety. [Status: DESIGN PENDING — larger than the camera pass; specify
  with GPT + 3 + 6 before building. Do not consider Rule #1 fully satisfied by
  camera tuning alone.]
- **Parallax / depth** sells "inside a volume." Near stars sweep faster than
  far stars as you move. (Shipped.)

## Why this is logged here

Rule #1 was GPT's #1 hard rule. It existed only in his understanding, never
made it into Ducky 6's brief, so Ducky 7 built faithfully to the brief and the
POC — both of which exposed the whole field. No duck erred; the rule fell into
the GAP between ducks. That gap is exactly what this document closes. A rule
that lives in one duck's head is fragile; written here, it binds every future
Vault flight and survives any single duck being out of the loop.

## RULE #3 — Travel is to PROXIMITY, never to LOCATION (the navigation law)

The universe is navigated by curiosity about the distant. A faraway star may
be only a pixel of light — too far to name — and clicking it must let you
TRAVEL there to find out what it is. This is the gesture that makes the galaxy
feel infinite: the unseen, faint, distant point is a DESTINATION, not décor.

But the critical distinction, the one that separates a living galaxy from a
teleport-menu:

**A travel-click flies you to the star's PROXIMITY, not its LOCATION.**

- **Location** (WRONG): slams the camera onto the star, dead center, filling the
  frame. You arrive ON TOP of it, isolated, the void and the neighbors gone.
  That is teleportation to a fact — exposition, a database row with a spotlight.
  The universe vanishes. You became a cursor.
- **Proximity** (RIGHT): the camera JOURNEYS across the dark and arrives in the
  star's NEIGHBORHOOD — the star ahead of you, its kin resolving around you, the
  void still off the edges. That is ARRIVAL, not teleportation. You crossed real
  distance and now stand in its region, a traveler, the universe intact. A
  second, separate, deliberate act approaches/enters the star itself.

Why proximity is non-negotiable:
- It preserves Rule #1 — you still only see a part; arriving near does not frame
  the whole.
- It pays off Rule #2 — the JOURNEY reveals the neighborhood. As you approach,
  the kin you didn't know were there fade in; you discover WHO the star lives
  among by traveling to it. The crossing has content. You learn the map by
  moving through it.
- It keeps agency — you travel to the region, then YOU choose to approach. The
  traveler stays a traveler, never a cursor.

Two distinct gestures, never collapsed into one:
1. **Travel-to-proximity** — click a (possibly distant, possibly pixel-faint)
   star → camera journeys across the void → neighborhood resolves on approach →
   arrive NEAR it, among its cluster, void still beyond.
2. **Enter** — a second click approaches and drills into the brand
   (collections → variants → reference).

Implementation notes:
- Distant/faint stars must be CLICKABLE even at pixel size (hit target generous
  even when visually tiny) and must read as REACHABLE destinations, not as the
  non-interactive decorative starfield twinkle. Distinguish "distant star you
  can go to" from "background dust."
- Travel-click ≠ drill-click. They are different interactions and must not be
  conflated.
- This feature WANTS clusters populated first — arriving at a distant star is
  magic only if you land in a MEANINGFUL neighborhood. Travel to a random-scatter
  star is just a long pan. Sequence: clusters → travel-to-proximity navigation →
  rich destinations (Selene-relief moons + spec card).

The word is PROXIMITY. If a future duck builds travel-to-location, it has killed
the feature with one word. Proximity keeps you a traveler in a universe.
Location makes you a cursor at a fact.
