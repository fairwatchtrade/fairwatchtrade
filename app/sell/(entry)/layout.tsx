import type { Metadata } from "next";
import { staticRouteMetadata } from "@/lib/seo/routeMetadata";

/* /sell — segment layout for the ROUTE GROUP (entry).

   Why a route group: app/sell/(entry)/page.tsx is a client component (the
   listing creation experience reads search params) and cannot export
   metadata. A plain app/sell/layout.tsx would carry the metadata but would
   ALSO be inherited by /sell/mobile and /sell/continue/[token], which are
   noindex working surfaces — the title, description and canonical of the
   public /sell door would leak into them unless every child remembered to
   override. The group scopes this layout to /sell alone; the URL is
   unchanged and the siblings inherit nothing from here.

   /sell is a public informational/entry destination and IS indexable under
   the route policy (Robots Readiness GRS-005/006) — the older robots.ts
   note that launch should keep it disallowed was stale and is withdrawn.
   Query-string doors (?privateThread=, ?wanted=) are navigation, not
   identity; the canonical is the clean /sell. */

export const metadata: Metadata = staticRouteMetadata("/sell");

export default function SellEntryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
