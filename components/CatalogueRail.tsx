"use client";

import { usePathname } from "next/navigation";
import { RailShell, RailSection, RailItem } from "@/components/rail/railPrimitives";

/* ────────────────────────────────────────────────────────────────────────
   CATALOGUE RAIL — components/CatalogueRail.tsx  (v3.21)

   The Catalogue family's persistent left navigation (Concept A "Painted
   Line"), replacing CatalogueClient's inline nav per the v3
   implementation order §5/§6 — REPLACEMENT, never layered beside the old
   rail (Layout's law). Mounted on /catalogue and /watch-dna; one shared
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

   Seller exits (Seller Workspace, Sell) are a separated grouping — a
   doorway out of the family, never styled as the active family. My
   Catalogue is the only Soon item. Active logic is a plain
   exact-pathname match; every target is unique, so no tie can exist.
   Icons follow the approved v2 renders: ring glyphs, with the squiggle
   for Watch DNA.
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
    <svg viewBox="0 0 24 24">
      <path d="M5 5c4 0 4 4.5 0 4.5S1 14 5 14M12 5c4 0 4 4.5 0 4.5S8 14 12 14" transform="translate(3.5 2.5)" />
    </svg>
  ),
  sellerWorkspace: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  ),
  sell: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12h6M12 9v6" />
    </svg>
  ),
  myCatalogue: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12h7" />
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
      </RailSection>
      <RailSection label="Seller" exit>
        <RailItem icon={ICONS.sellerWorkspace} label="Seller Workspace" href="/account" exit chevron />
        <RailItem icon={ICONS.sell} label="Sell" href="/sell" exit chevron />
      </RailSection>
      <RailSection label="Soon">
        <RailItem icon={ICONS.myCatalogue} label="My Catalogue" soon />
      </RailSection>
    </RailShell>
  );
}
