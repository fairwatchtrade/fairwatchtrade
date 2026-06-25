import type { Metadata } from "next";
import MarketBar from "@/components/MarketBar";
import NavBar from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "FairWatchTrade — Coming Soon",
  description: "A marketplace for independent and boutique watchmakers. One flat 5% fee. No games.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
          <NavBar />
          <MarketBar />
        </header>
        {children}
      </body>
    </html>
  );
}
