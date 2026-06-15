import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
