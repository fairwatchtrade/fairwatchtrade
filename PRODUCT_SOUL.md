# PRODUCT_SOUL.md
## FairWatchTrade — The Soul Document
*Read this before touching a single file. This is not a style guide. This is why the platform exists.*

---

## The One Line

> "We built this for the watch that nobody else recognizes — and the one person who does."

This line lives on the sign-in page, left panel, in Cormorant Garamond italic. It never moves.

---

## Why This Exists

FairWatchTrade was built because watch collectors pay a Collector's Tax — losing 13% of their capital every time they move from one watch to the next. Chrono24 charges 13%. eBay charges more. Neither was built by someone who actually looks at watches.

The spark: searching for a mother-of-pearl moonphase for a wife's Mother's Day gift. The watch industry's search engines force you to shop by manufacturer, not by artistry. You end up hunting across dozens of tabs. When you chase rare pieces where only five examples exist worldwide, a 23-hour batch-email delay means the watch sold before the alert hit your inbox.

When a collector has to write custom scripts just to search the market efficiently, the system is broken.

FairWatchTrade is the platform that should have existed. Built by a collector, for collectors. 5% flat fee. No games. No ads. No manufactured urgency.

---

## The Three Principles

**I. Capital Efficiency**
Minimize the friction between collections.

**II. Collector-First Discovery**
We match watches to your DNA, not your search history.

**III. Authenticity-First**
If the photo is stock, it doesn't get listed.

---

## What FairWatchTrade Is

A curated peer-to-peer marketplace for independent and boutique watchmakers only. Not a classifieds board. Not an auction house. Not eBay for watches.

The buyer experience is a mirror, not a marketplace. Spec-first. Gallery-first. No ads. No games. No manufactured urgency signals. Ever.

The seller experience is a professional instrument — the Antoine Martin of marketplace dashboards. Quietly extraordinary. Layers of capability that reveal themselves over time. "Look at all the cool shit I can do" — not through clutter, but through thoughtful capability.

---

## Anti-Features (Permanent. Non-negotiable.)

These are things FairWatchTrade will never do, no matter who asks or why:

- **No countdown timers** — "3 people viewing this listing" is a lie told to pressure buyers. We don't lie.
- **No save-count displays on listing cards** — save counts are social proof weaponized as pressure. Comparable-sale data (approved) is not the same as a trend arrow on that data (rejected). Build the figure, never the arrow.
- **No batch-delayed notifications** — the whole platform exists because of 23-hour delays. Instant notifications only.
- **No ads** — ever. Not even from auction houses. Not even if they pay well.
- **No stock photos** — if the photo isn't of the actual watch, the listing doesn't pass.
- **No manufactured urgency** — no "selling fast," no artificial scarcity signals.
- **No scores rendered buyer-facing** — `significance_score`, `score_state`, `combined_score` are private. They power curation silently. They never appear on any buyer-facing surface. Ever.

---

## The Architecture Principles

**"Global navigation changes where you are. Workspace controls change what you're doing."**

**"You're designing rooms, not pages."**
The composition, the surrounding whitespace, the vertical breathing room — these change how content feels even when typography values are identical.

**"The watches are always the stars. The interface quietly supports them."**
The seller dashboard should never have nav labels brighter than watch names. The interface defers to the object.

**"The bar is outdoor sunlight at full brightness — not a dark room."**
Studio prototypes are designed as dark-room art pieces. Production runs on phone screens in Florida sun. Every text token gets lifted one tier before first render. See Readability-Floor-Governance.md.

---

## Motion & Transition

Every animation should feel like architecture responding, never software reacting.

---

## Locked Product Features

### Dial Reveal
On hover over the dial photo only, a thin contrast/brightness slider appears. No zoom. No magnifying glass. Just the detail that was already there. Appears on the third visit. Never announced.

*"Pull left and the MOP depth opens. Pull right and the printing surfaces. The detail was always there. FairWatchTrade just lets you see it."*

Copy: **"Dial Reveal · Hover the dial. Move the slider. No zoom. No magnifying glass. Just the detail that was already there."**

Phase 1. High priority.

### The Collector's Drawer
A smoked glass drawer slides in from the LEFT on the listing detail page on desktop. Bottom sheet on mobile. The hero shot shows through the glass. Contains:
- Back to Browse (filters preserved)
- Around This Watch (same ref / movement / size / dial)
- Add to My Catalogue

Discovered, not announced. Phase 2.

**Naming rule:** Nav Drawer (hamburger, every page, left) ≠ Collector's Drawer (listing-detail, left desktop / bottom mobile). Never call either one just "the drawer."

### The Buyer's Catalogue
Saved searches and listing alerts for buyers. Not "Watchlist." A Catalogue. The notification copy: *"Get notified the moment another Tonda Métrographe appears on FairWatchTrade."* Instant, never batched. Phase 2.

### In Hand Verified 🛡️
Guided mobile capture proves physical possession at listing time. Live camera only — no gallery uploads for mandatory shots. Earns a verified badge. "Item needs to be procured" never passes this gate. This is a fraud prevention system that looks like a trust feature. Chrono24 cannot retrofit this.

Phase 2.

### Dual-Ingestion Mobile Wizard
The five fixed photo positions ARE the script for guided capture. Camera API layer is the only new piece needed. Phase 2.

### The Vault
155+ hand-built manufacturer JSON files. The heart of the platform. A permanent gift to the collecting community. Structure: `{ id, name, search_aliases, collections: [{ families: [{ variants: [{ references }] }] }] }`.

The Vault Galaxy: brands as stars, collections as planets, references as moons. Canvas-based interactive exploration. "What draws you to a watch?" Phase 2 / Phase 3.

### Purchase Request Architecture
Messaging = negotiation. Purchase Request = system of record.

```
purchase_request {
  listing_id, buyer_id, seller_id,
  listing_price, proposed_purchase_price,
  shipping_terms, included_items,
  expiration_time,
  status: pending | accepted | declined | expired | cancelled
}
```

Button: "Start Purchase Request." Direct wire transfer for launch. Escrow.com Phase 2.

### Seller Profile Pages
`/sellers/[id]` — a collector's calling card. Trust leads. Inventory follows. "Private correspondence, public standards." Every listing links to the seller's profile.

---

## The Canary

**PFC274 = 62** in `app/api/evaluate/route.ts`

This value must never change. It is the canary that proves the evaluation engine has not been tampered with. If you ever see a brief that touches `app/api/evaluate/route.ts` — stop. Flag it. Do not proceed.

---

## Technical Invariants

- `significance_score`, `score_state`, `combined_score` — NEVER rendered buyer-facing
- `photoRef.current.uploadFiles()` — load-bearing, never refactor
- `BLOB_READ_WRITE_TOKEN` — never add
- File delivery: always complete files top-to-bottom, never snippets
- Git: always from `C:\Dev\fairwatchtrade` root
- Version numbers: one continuous sequence from v1.8 anchor. **Every commit gets one, no exceptions — including small bundles, polish passes, and single-file fixes.** A commit without a version tag is a permanent gap in the project's own memory of itself; it cannot be added after the fact without rewriting git history. (Logged after a bundle shipped unversioned mid-v2.2 — the sequence continues as if it were versioned, but that actual commit message never will be. This is the cost of skipping the rule once.)
- Destination path at bottom of every file delivery, above canary note
- Stop and flag architectural conflicts before writing a single line

---

## The Moon Principle

> **The moon should have detail like the item it represents.**

The Vault Galaxy is the taxonomy made spatial — and the hierarchy is not flat:

- **Star = Brand** — an entity, a maker, an idea.
- **Planet = Collection** — a category, a product line, an organizing abstraction.
- **Moon = Reference** — **the actual, specific, physical watch.** A real manufacturer reference number, a real dial, a real movement. The one that could be on a wrist right now.

Descending star → planet → moon moves from *abstract* to *concrete*, from *concept* to *object*. The star is "who made it." The planet is "what family it belongs to." The moon is "**this exact watch, the one that exists in the world.**" The moon is the most important object in the galaxy, because it is the only one that is a real thing you can hold. Everything above it is organizational. The moon is real.

**A moon's visual richness is a faithful function of its watch's actual complexity — never inflated, never flattened.** A simple field watch yields a simple moon. A Parmigiani with a hand-guilloché dial, a relief-finished movement, and a complication stack yields a moon with the depth to match. The rule polices both directions: a plain watch rendered as an ornate moon is a *lie* (it inflates what isn't there); a complicated, finely-finished watch rendered as a plain sphere is a *theft* (it hides truth the object actually has). The moon does not *depict* the watch's detail — it **carries** it.

This makes the galaxy honest at the object level. A moon's richness becomes a truthful signal — "this piece has depth" or "this piece is clean and simple" — rendered the way the watch itself would tell you under a loupe. The detail is not a style setting; it is **driven by the reference data.** The spec grammar (movement, finishing, complications, dial treatment, materials, frequency) does not merely populate a card beside the moon — it **generates** the moon. The data becomes the surface. Each moon is a portrait of its specific reference, drawn at exactly the fidelity that reference deserves. Moons are never designed once and reused as generic objects.

This is the object-level expression of the Self-Evident Standard: the moon's surface is *self-evident, not sacred* — it shows the watch's truth rather than asserting it. And it is the destination of every navigation rule. Rule #1 (discovery not exposition), travel-to-proximity, the reveal mechanic — all of it exists to deliver a person to a moon. The star and planet are the *path*. The moon is the *arrival*.

You do not traverse the galaxy to look at a sun. You traverse it to reach **one specific watch** — rendered as truly as the watch itself.

---

## The Engineering Plate

FairWatchTrade has one canonical illustration: a technical engineering drawing of a watch in quartering view. It is not decorative. It is the visual language of the platform.

The same drawing appears across every surface, driven by a single component:

```tsx
<WatchBlueprint
  completed={["movement", "case", "dial"]}
  active="dial"
/>
```

Named layers: `movement · case · dial · hands · crown · lugs · strap · clasp · complications · provenance`

At rest: ghost. `opacity-[0.06]`, platinum line work.  
Active layer: gold. `opacity-[0.55]`, `#C9A84C`, 250ms ease.  
Completed layers: faint gold. `opacity-[0.20]`.

**The appearances:**
- Photo Upload — fills gold as seller tags each category
- Details Step — active layer tracks chapter scroll
- Publish — `completed="all"` quiet and whole in the right panel
- Listing Detail — `completed="all"` faint background, nothing animates
- Buyer Dashboard — partial completion as listing status
- Vault Reference Card — ghosted plate behind specifications
- Empty States — partial blueprint instead of generic illustration

The plate is infrastructure, not artwork. Build it once, exceptionally well. Every page borrows from it.

*"Of course the drawing turns over — how else would you see the caseback?"*

That is the standard every interaction on this component gets measured against before it ships. Inevitable rather than impressive. If it needs to be explained, it failed.

---

## The Closing Line

At the bottom of the publish button on the sell flow, in Cormorant Garamond italic, centered:

> *"Your watch is ready for its next collector."*

That's the emotional destination of the entire platform. A seller spent time writing their story, photographing every angle, filling in the specs. And at the end, before they press the gold button, the platform acknowledges what just happened.

It honors the object. It honors the seller. It implies the buyer who's out there waiting.

---

*FairWatchTrade — Built by a collector, for collectors.*
*Sebring, Florida. June 2026.*

---

## FairWatchTrade Correspondence

**

Most marEvery conversation deserves a home.ketplaces separate conversations from the object they are about. Weeks later, buyers search an inbox trying to remember which watch they were discussing.

FairWatchTrade does the opposite.

Conversations remain attached to their natural home.

A question about a watch belongs with that watch.
A relationship between two dealers belongs with the dealer.

The inbox is not the destination. It is simply a table of contents.

---

### Two Homes

**The Listing**

Every conversation about a specific watch lives on that listing. Questions. Additional photographs. Negotiation. Shipping clarification. Service history.

Months later — the conversation is still there because the watch is still there.

*The listing remembers.*

**The Dealer**

Dealer-to-dealer conversations are different. They are not about one watch. They are about trust. Relationships. Inventory. Future opportunities.

Those conversations belong to the dealer profile itself.

*The dealer remembers.*

---

### Correspondence

Not Messages. Not Chat. Not DMs.

**Correspondence.**

Collectors correspond. Dealers correspond.

The word slows the interaction just enough to feel intentional.

---

### The Inbox

The inbox exists only to answer one question:

*"Where have I been talking?"*

It is never the destination. Every entry simply returns you home. Back to the listing. Back to the dealer. Back to the context.

---

### Commerce With Memory

Dealer A writes: *"Looking for an early Datograph."*

Three months pass.

Dealer B lists one.

FairWatchTrade quietly notices: *"A dealer you've corresponded with recently has listed a watch matching a previous inquiry."*

No AI pretending to be clever. No surveillance. Just the platform remembering the relationships its users created.

The network becomes more valuable because it remembers.

---

### The Governing Rule

> **Conversations belong where the subject lives.**

That sentence governs everything. It tells every future developer where new communication features should go. Not in a generic inbox. Not in a chat silo. Always back to the thing — or the person — they're actually about.

This sits alongside the Vault philosophy and the Self-Evident Standard. Those describe how FairWatchTrade thinks. This describes how FairWatchTrade **remembers**.

That's not a messaging feature. That's the character of the marketplace.

---

### Left Nav Vocabulary

```
Catalogue
Listings
Sales
Correspondence
```

Slower. Intentional. Like letters between collectors.

---
### FairWatchTrade QA Law

Crawler facts first. AI interpretation second.

The crawler gathers evidence: route behavior, redirects, 
visible links, destination status. The triage agent 
separates real defects from suspicious behavior from 
expected auth behavior from unproven shared causes.

Do not let the AI invent certainty the crawl did not establish.


### Schema Principle

`message_threads.listing_id` is nullable. A null listing_id means the conversation belongs to the dealer relationship, not a specific watch. That single nullable field is the architectural expression of the two-home principle.

One schema. Two homes. No generic inbox.

### Collector Impressions 

FairWatchTrade does not collect ordinary reviews. It collects Collector Impressions.
A transaction builds trust.
A Collector Impression builds knowledge.
Dealer photographs answer: "What am I buying?"
Collector Impressions answer: "What is it like to live with?"
The goal is to leave every watch a little better understood than it was before.

Locked vocabulary:
Product UI always says: "Leave Your Collector Impression"
Never: "Leave a Review" — not in buttons, not in emails, not in prompts.
External explanations may use the word "review" only when necessary for clarity to a non-collector audience.

Governing principles:

Collector Impressions belong to verified purchases only. No transaction, no impression.
One genuine wrist shot is more valuable than ten staged photographs.
Never interrogate the collector. The wizard takes one minute.
The Listing Wizard begins a watch's story. The Collector Impression Wizard completes its first chapter.
Collector Impressions are not Yelp reviews. They are collector knowledge.


The Wrist Shot:
Dealer photographs show the watch for sale.
Collector Wrist Shots show the watch being lived with.
That distinction is everything.

Collector Impression Wizard v1.0 spec approved July 9, 2026. Design Gate required before implementation. Payment infrastructure prerequisite.

Drop that at the bottom of PRODUCT_SOUL.md and push:
---

## Build & Workflow Laws

*These govern how FairWatchTrade is built, not just what it builds. Violations have caused real production incidents.*

---

### Law 1 — State Your Identity in Cross-Instance Messages

Every message relayed between AI seats must begin with the sender's identity:

```
newfav:
GPT:
Ducky 5:
Ducky 7:
```

No anonymous messages in the chain. When attribution is missing, the receiving seat must stop and ask before acting. This law exists because "who wrote this" should never be a question that slows the build.

---

### Law 2 — Fix Small Things Immediately

Small fixes discovered during a build get fixed in that session, not queued for later.

"Logged for later" too easily becomes "forgotten entirely" when the fix is small enough to do on the spot. If it takes less than 15 minutes and doesn't require a design gate or architectural decision — fix it now.

---

### Law 3 — Wire It in the Same Flight

A component gets wired into the live application in the same flight it is built. No orphaned `.tsx` files waiting for a future "wiring pass."

This law was named after the Dial Reveal incident: a fully-built, genuinely good feature that sat disconnected and undiscovered for weeks. Wiring is not optional. Wiring is the last step of every build, not the first step of the next one.

---

### Law 4 — Re-Read Before You Edit

Never edit a file from memory across turns. Always re-read the current version before touching it — even within the same session if meaningful time has passed.

Stale-file edits have caused real crashes and real production incidents in this build. The cost of reading the file again is seconds. The cost of editing the wrong version is a session.

---

### Law 5 — Compose at Read Time, Never Fork a Stored Copy

Any feature that displays existing data in a new way should compose it live at read time. Never create a second stored copy of data that already exists elsewhere.

This principle was first applied to Research Reports (compose-on-read preserves the regeneration win), then confirmed as a project-wide pattern when applied to Buyer My Offers. One source of truth. Read it fresh. Never fork it.

---

## Purchase Request Laws

*Locked. Not discussion topics.*

- **Watch is parent. Offers are children.** A seller sees each watch once with all offers grouped beneath it — not a flat list of disconnected offer rows.
- **`superseded` is the correct terminal state.** When a counter-offer is accepted, prior offers become `superseded`, not `declined`. The distinction is meaningful and accurate.
- **Atomic database acceptance.** Accepting an offer and creating the transaction record happen in a single database operation. No window for partial state.
- **Design Gate before engineering.** Rendered concept required before Ducky 7 touches any new UI surface.
- **No orphaned components.** See Law 3.
- **Build the locked design. Don't redesign it.** Once a design is approved through the Design Gate, the brief implements it. The build seat does not redesign.

