"use client";

import { usePathname } from "next/navigation";
import HeaderSearch from "@/components/HeaderSearch";
import { headerSearchVisible } from "@/lib/nav/headerSearch";

/* ────────────────────────────────────────────────────────────────────────
   HEADER SEARCH SLOT — the compact Global Search's shell seam (DD2 v2)

   Device-closure correction A: the compact Search must sit BELOW the
   metals/auction strip, not inside the masthead. The global header stack is:

     1. masthead / navigation (NavBar)
     2. metals / auction strip (MarketBar)
     3. compact Global Search  ← THIS, on allowlisted routes only
     4. page content

   Mounted ONCE here (rendered by app/layout.tsx directly after <MarketBar/>),
   so there is a single shell seam and no route-local duplicate mounts. Route
   availability is the same allowlist as before (lib/nav/headerSearch.ts):
   Browse is suppressed (its canonical full Search is untouched); Vault/Galaxy,
   creation, auth, legal, admin, home show nothing.

   The desktop and mobile fields remain EXACT breakpoint complements
   (hidden lg:flex vs lg:hidden), so exactly one is laid out — and therefore
   in the accessibility tree — at any viewport. Relocating the mount does not
   change that proof; it only changes where the pair lives in the stack.

   v3.23 moved the pair md → xl to stay locked to <NavBar>; v3.25 corrected
   both to lg. The header is one composition: below the breakpoint the
   masthead is wordmark + hamburger, so the search must be the mobile row.
   Left behind it would desync — a desktop right-aligned field sitting under
   a hamburger masthead. This pair must always match <NavBar>.
   ──────────────────────────────────────────────────────────────────────── */

export default function HeaderSearchSlot() {
  const pathname = usePathname();
  if (!headerSearchVisible(pathname)) return null;

  return (
    <div className="w-full border-b border-[var(--border-subtle)] bg-[var(--ink)]">
      {/* RULED: same outer geometry as the masthead - no width cap. It had
          been max-w-6xl (1152px), narrower than both bands above it, so on a
          wide desktop the header stack resolved into three differently
          centred islands.

          The px-4 sm:px-6 gutter is deliberately KEPT: from sm upward it is
          already the masthead's px-6, so the bands align at every width this
          one is verified at, and the mobile step stays exactly where it
          was. */}
      <div className="w-full px-4 sm:px-6">
        {/* Desktop — compact field, right-aligned. hidden below lg. */}
        <div className="hidden justify-end py-2 lg:flex">
          <HeaderSearch variant="inline" />
        </div>
        {/* Mobile — full-width row. Hidden at lg and up. Exact complement of
            the desktop field above, so never both at one width. */}
        <div className="py-2 lg:hidden">
          <HeaderSearch variant="row" />
        </div>
      </div>
    </div>
  );
}
