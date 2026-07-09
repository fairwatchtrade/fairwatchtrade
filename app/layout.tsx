import type { Metadata } from "next";
import MarketBar from "@/components/MarketBar";
import NavBar from "@/components/NavBar";
import SiteFooter from "@/components/SiteFooter";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

// Footer session-status — temporary, founder-only pre-launch tooling.
// Reuses the exact founder/admin check already established in
// /admin/vault-review and /admin/auctions — no new auth mechanism.
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const metadata: Metadata = {
  title: "FairWatchTrade — Coming Soon",
  description: "A marketplace for independent and boutique watchmakers. One flat 5% fee. No games.",
};

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
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.display_name) footerDisplayName = profile.display_name;
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
    <html lang="en">
      <body>
        {/*
          Sticky site header. The real navigation bar (logo, browse, sell,
          search, login) will go INSIDE this header, ABOVE <MarketBar />,
          when it's built. The whole header sticks as one stacked unit, so
          nav stays on top and the market strip stays visible beneath it.
          The market strip does NOT own top-0 itself — the header does.
        */}
        <header className="sticky top-0 z-50">
          <NavBar authed={authed} initialUnreadCount={initialUnreadCount} />
          <MarketBar />
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
