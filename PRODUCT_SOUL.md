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
- Version numbers: one continuous sequence from v1.8 anchor
- Destination path at bottom of every file delivery, above canary note
- Stop and flag architectural conflicts before writing a single line

---

## The Closing Line

At the bottom of the publish button on the sell flow, in Cormorant Garamond italic, centered:

> *"Your watch is ready for its next collector."*

That's the emotional destination of the entire platform. A seller spent time writing their story, photographing every angle, filling in the specs. And at the end, before they press the gold button, the platform acknowledges what just happened.

It honors the object. It honors the seller. It implies the buyer who's out there waiting.

---

*FairWatchTrade — Built by a collector, for collectors.*
*Sebring, Florida. June 2026.*
