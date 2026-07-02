import type { Metadata } from "next";
import MarketBar from "@/components/MarketBar";
import NavBar from "@/components/NavBar";
import SiteFooter from "@/components/SiteFooter";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

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
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authed = !!user;
    if (user) {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      initialUnreadCount = count ?? 0;
    }
  } catch {
    // Fail-safe — no bell rather than a broken layout.
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
        <SiteFooter />
      </body>
    </html>
  );
}
