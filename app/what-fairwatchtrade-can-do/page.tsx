import type { Metadata } from "next";
import WhatFairWatchTradeCanDo from "@/components/WhatFairWatchTradeCanDo";
import { staticRouteMetadata } from "@/lib/seo/routeMetadata";
import { createClient } from "@/lib/supabase/server";

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

export default async function WhatFairWatchTradeCanDoPage() {
  /* Whether the visitor is signed in decides only which fields the contact
     composer shows: a known account needs no reply-address field. Read on
     the server from the session (the root layout already reads it for the
     masthead); the contact route re-derives identity itself and never
     trusts this flag or the browser. */
  let signedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user?.email;
  } catch {
    signedIn = false;
  }

  return (
    <main className="min-h-screen bg-[var(--ink)]">
      <WhatFairWatchTradeCanDo signedIn={signedIn} />
    </main>
  );
}
