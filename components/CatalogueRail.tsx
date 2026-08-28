"use client";

import { usePathname } from "next/navigation";
import { RailShell, RailSection, RailItem } from "@/components/rail/railPrimitives";

/* ────────────────────────────────────────────────────────────────────────
   CATALOGUE RAIL — components/CatalogueRail.tsx  (v3.21)

   The Catalogue family's persistent left navigation (Concept A "Painted
   Line"), replacing CatalogueClient's inline nav per the v3
   implementation order §5/§6 — REPLACEMENT, never layered beside the old
   rail (the replacement law). Mounted on /catalogue and /watch-dna; one shared
   collapse state (fwt-rail-catalogue) so it is the same physical object
   across the family.

   Discover order (v3 correction 4, no other reordering permitted):
   Browse → Catalogue → Watch DNA. New Arrivals is REMOVED — Jason's
   approval recorded in the order: /browse has no sort/arrivals state and
   already defaults newest-first, so the two items were two doors to one
   identical room. The slot returns when a real arrivals destination
   exists.

   Watch DNA is LIVE — the door the permanent law requires ("a working
   user-facing module may not remain unreachable or be visually
   misrepresented as Soon"). Full states, never ghosted.

   THE SELLER GROUP IS GONE — and must not come back. Seller Workspace and
   Sell used to sit here, in the middle of the buyer's own navigation,
   between Discover and the collector's collection. This is the collector's
   room; the seller building has its own front doors and keeps them: Sell is
   in the global top nav on every page, and Sell, Account and the seller
   workspace are all in the mobile drawer below its divider. Nothing became
   unreachable — a doorway simply stopped being furniture in the wrong room.

   Every row here now answers "what do I, the collector, have or want":
   My Catalogue (the watches saved), Saved Searches (the standing
   instructions), My Offers (what is in flight). Each resolves to a section
   that already exists on /catalogue — the rail addresses real destinations,
   it does not mint them, and it holds no state of its own.

   NOT here, deliberately:
   · Saved Watches as its own row — My Catalogue already resolves there
     (#saved-watches). Two doors, one room, is the mistake New Arrivals was
     removed for.
   · Recent Activity — it is a Phase-2 shell whose body is the hardcoded
     words "No recent activity." A nav door to a placeholder is a promise
     the product cannot keep. It earns a row when it earns data.

   Active logic for full-page destinations is a plain exact-pathname match.
   The hash rows are not "active": they are places on the page the Catalogue
   row already marks.

   Icons: Browse, Catalogue, Watch DNA and Wanted keep their approved
   renders untouched. The collector rows carry watch-native glyphs so the
   rail reads as a collector's instrument before anyone reads the heading —
   a real watch (case, hands, lugs) rather than the old circle-and-bar,
   which read as a disabled minus.
   ──────────────────────────────────────────────────────────────────────── */

const ICONS = {
  browse: (
    <svg viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L20 20" />
    </svg>
  ),
  catalogue: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  watchDna: (
    // v3.21a — the double helix (Jason's call during the live pass): two
    // crossing strands + four rungs, tuned to stay legible at 20px/1.5.
    <svg viewBox="0 0 24 24">
      <path d="M8 3c0 4.5 8 4.5 8 9s-8 4.5-8 9" />
      <path d="M16 3c0 4.5-8 4.5-8 9s8 4.5 8 9" />
      <path d="M9 5.5h6M10 8h4M10 16h4M9 18.5h6" />
    </svg>
  ),
  /* Wanted — a crosshair. The collector has named a specific watch and is
     waiting for it to appear, which is a different act from browsing. Not a
     loupe: a loupe is for examining what is in front of you. */
  wanted: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  ),
  /* My Catalogue — an actual wristwatch: case, hands, lugs. The rail's one
     literal object, and the fastest way to say "collector" without a word.
     It replaces a circle crossed by a bar, which at 20px read as a minus
     sign — the collection row looked disabled. */
  myCatalogue: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="6.4" />
      <path d="M12 9v3l2 1.4" />
      <path d="M9.6 5.7 9.9 3h4.2l.3 2.7M9.6 18.3l.3 2.7h4.2l.3-2.7" />
    </svg>
  ),
  /* Saved Searches — a funnel. A saved search IS kept criteria, and the
     funnel says criteria at a glance without borrowing Browse's loupe. */
  savedSearches: (
    <svg viewBox="0 0 24 24">
      <path d="M4 5h16l-6.2 7.2V20l-3.6-2.2v-5.6z" />
    </svg>
  ),
  /* My Offers — a record sheet. A purchase request is the system of record,
     not a conversation, and the glyph should not suggest a message. */
  myOffers: (
    <svg viewBox="0 0 24 24">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6M9 16.5h4" />
    </svg>
  ),
} as const;

export default function CatalogueRail() {
  const pathname = usePathname();

  return (
    <RailShell
      family="catalogue"
      kicker="Catalogue"
      title="Collector Navigation"
      ariaLabel="Catalogue navigation"
    >
      <RailSection label="Discover">
        <RailItem icon={ICONS.browse} label="Browse" href="/browse" chevron />
        <RailItem
          icon={ICONS.catalogue}
          label="Catalogue"
          href="/catalogue"
          active={pathname === "/catalogue"}
          ariaCurrent={pathname === "/catalogue" ? "page" : undefined}
          chevron
        />
        <RailItem
          icon={ICONS.watchDna}
          label="Watch DNA"
          href="/watch-dna"
          active={pathname === "/watch-dna"}
          ariaCurrent={pathname === "/watch-dna" ? "page" : undefined}
          chevron
        />
        {/* Wanted joins Discover because it starts where the Catalogue does
            — with collector watch identity. New Arrivals was REMOVED by
            founder ruling and must never return as its neighbour. */}
        <RailItem
          icon={ICONS.wanted}
          label="Wanted"
          href="/wanted"
          active={pathname === "/wanted"}
          ariaCurrent={pathname === "/wanted" ? "page" : undefined}
          chevron
        />
      </RailSection>
      {/* "Yours" rather than the old "Collection": the group now holds
          standing searches and offers in flight alongside the saved watches,
          and only one of those three is a collection. The label has to stay
          true to what is under it.

          All three are hash destinations on /catalogue. From /watch-dna they
          navigate to the page and land on the section; from /catalogue they
          simply move down the page. None of them is marked active — the
          Catalogue row above already says where you are. */}
      <RailSection label="Yours">
        <RailItem
          icon={ICONS.myCatalogue}
          label="My Catalogue"
          href="/catalogue#saved-watches"
          chevron
        />
        <RailItem
          icon={ICONS.savedSearches}
          label="Saved Searches"
          href="/catalogue#saved-searches"
          chevron
        />
        <RailItem
          icon={ICONS.myOffers}
          label="My Offers"
          href="/catalogue#my-offers"
          chevron
        />
      </RailSection>
    </RailShell>
  );
}
