import type { Metadata } from "next";
import WhatFairWatchTradeCanDo from "@/components/WhatFairWatchTradeCanDo";
import { staticRouteMetadata } from "@/lib/seo/routeMetadata";

/* ────────────────────────────────────────────────────────────────────────
   WHAT CAN FAIRWATCHTRADE DO FOR ME? — /what-fairwatchtrade-can-do
   (public, no authentication)

   One page, four reasons for visiting. A visitor chooses why they came and
   sees what FairWatchTrade actually helps with today, where it deliberately
   stops, and what is not available yet. The copy is the governed public
   statement in lib/whatFairWatchTradeCanDo/content.ts; the room is
   components/WhatFairWatchTradeCanDo.tsx.

   Shell: the root layout supplies the navbar, market strips and footer, so
   this route inherits the real site chrome unchanged. The standalone
   prototype's own header and footer were visual context only and are not
   reproduced here.

   Metadata comes from the one route-policy source (lib/seo/routeMetadata.ts),
   which also places the page in the sitemap. Robots stays closed site-wide.
   ──────────────────────────────────────────────────────────────────────── */

export const metadata: Metadata = staticRouteMetadata("/what-fairwatchtrade-can-do");

export default function WhatFairWatchTradeCanDoPage() {
  return (
    <main className="min-h-screen bg-[var(--ink)]">
      <WhatFairWatchTradeCanDo />
    </main>
  );
}
