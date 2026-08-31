import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import MarketBar from "@/components/MarketBar";
import NavBar from "@/components/NavBar";
import HeaderSearchSlot from "@/components/HeaderSearchSlot";
import SiteFooter from "@/components/SiteFooter";
import VaultNavigationTransition from "@/components/VaultNavigationTransition";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

// Footer session-status — temporary, founder-only pre-launch tooling.
// Reuses the exact founder/admin check already established in
// /admin/vault-review and /admin/auctions — no new auth mechanism.
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const metadata: Metadata = {
  title: "FairWatchTrade — Independent & Boutique Watchmakers",
  description: "A marketplace for independent and boutique watchmakers. One flat 5% fee. No games.",
};

/* Appearance preference — one cookie, readable by the server so the FIRST
   meaningful paint already carries the right appearance (no flash, no
   post-hydration flip, no boot script). Absent cookie = System, which CSS
   resolves via color-scheme + light-dark() and live-updates when the OS
   preference changes. The signed-in account preference (profiles.appearance)
   is read in the same layout auth round-trip below and covers a device that
   has no cookie yet. */
const APPEARANCE_COOKIE = "fwt-appearance";

function explicitAppearance(raw: string | undefined): "light" | "dark" | null {
  return raw === "light" || raw === "dark" ? raw : null;
}

/* v3.24 — the Android browser strip wears house ink.
   app/manifest.ts already declares theme_color, but that value only reaches
   an INSTALLED surface, and the manifest is display:"browser" — no WebAPK is
   ever generated, so Chrome never reads it. Ordinary tab presentation comes
   from <meta name="theme-color">, which was absent entirely: the browser UI
   and the Android app-switcher card rendered in Chrome's default, leaving the
   top edge of the product visibly not ours. This is the boundary of the
   product on Android, not ornament. Manifest and install behaviour untouched.

   v4.58 — the strip follows the resolved appearance: an explicit choice pins
   its color; System hands the browser both arms via media queries so the
   boundary of the product stays coherent with the page it crowns. */
export async function generateViewport(): Promise<Viewport> {
  const jar = await cookies();
  const explicit = explicitAppearance(jar.get(APPEARANCE_COOKIE)?.value);
  if (explicit) {
    return { themeColor: explicit === "light" ? "#F3F0E8" : "#0D0F14" };
  }
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#F3F0E8" },
      { media: "(prefers-color-scheme: dark)", color: "#0D0F14" },
    ],
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server owns the initial unread count so the bell badge never flashes on
  // mount. Wrapped fail-safe: the root layout must never crash the whole site
  // over a notifications hiccup — worst case is simply no bell.
  let authed = false;
  let initialUnreadCount = 0;
  // Footer session-status state — plumbed alongside the existing auth read
  // so there is one auth round-trip, not two. isAdmin is a pure string
  // comparison against user.email and never depends on the profiles query,
  // so it stays correct even if the display_name lookup below fails.
  let footerDisplayName: string | null = null;
  let footerIsAdmin = false;
  /* Appearance resolution order: device cookie → signed-in account
     preference → System (no attribute; CSS resolves it). The cookie wins
     because it is the device's most recent explicit act and it is what the
     first paint was served under. */
  const jar = await cookies();
  let appearance = explicitAppearance(jar.get(APPEARANCE_COOKIE)?.value);
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authed = !!user;
    if (user) {
      footerIsAdmin = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      footerDisplayName = user.email ?? null; // baseline fallback per brief
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, appearance")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.display_name) footerDisplayName = profile.display_name;
        // Account preference covers a signed-in device that has no cookie
        // yet (e.g. a fresh browser); the cookie, once set, wins above.
        if (!appearance) {
          appearance = explicitAppearance(profile?.appearance ?? undefined);
        }
      } catch {
        // display_name is best-effort only — email fallback already set
        // above, so a profile-fetch hiccup never breaks the footer status.
      }

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      initialUnreadCount = count ?? 0;
    }
  } catch {
    // Fail-safe — no bell, no footer status, rather than a broken layout.
  }

  return (
    /* data-theme is rendered by the server, so an explicit appearance is
       correct at first meaningful paint and hydration has nothing to flip.
       No attribute = System: CSS color-scheme resolves it and live-updates
       with the OS preference. */
    <html lang="en" data-theme={appearance ?? undefined}>
      <body>
        <VaultNavigationTransition />
        {/*
          Sticky site header. The real navigation bar (logo, browse, sell,
          search, login) will go INSIDE this header, ABOVE <MarketBar />,
          when it's built. The whole header sticks as one stacked unit, so
          nav stays on top and the market strip stays visible beneath it.
          The market strip does NOT own top-0 itself — the header does.
        */}
        <header className="sticky top-0 z-50">
          {/* v2.5 — NavBar now also receives displayName/isAdmin, reusing the
              exact same values already computed above for SiteFooter. Still
              one auth round-trip — nothing new fetched. */}
          <NavBar
            authed={authed}
            initialUnreadCount={initialUnreadCount}
            displayName={footerDisplayName}
            isAdmin={footerIsAdmin}
          />
          <MarketBar />
          {/* Correction A — compact Global Search sits BELOW the metals strip,
              part of the header stack but visually distinct from the masthead.
              Route-gated inside the slot; renders nothing off-allowlist. */}
          <HeaderSearchSlot />
        </header>
        {children}
        <SiteFooter
          authed={authed}
          displayName={footerDisplayName}
          isAdmin={footerIsAdmin}
        />
      </body>
    </html>
  );
}
