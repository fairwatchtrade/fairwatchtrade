import type { MetadataRoute } from "next";
import { createDiscoveryClient } from "@/lib/discovery/publicDiscovery";
import {
  SITEMAP_LISTING_CEILING,
  buildSitemapEntries,
  type SitemapDealerRow,
  type SitemapListingRow,
} from "@/lib/seo/sitemap";

/* ════════════════════════════════════════════════════════════════════════
   PRODUCTION SITEMAP — /sitemap.xml   (Robots Readiness GRS-007)

   Discovery, not permission. This file lists the resources FairWatchTrade
   WANTS found once robots opens; app/robots.ts still disallows every
   crawler pre-launch, and the two coexist on purpose. A sitemap tells a
   crawler where to look; the page-level directive on each resource decides
   whether it may be indexed after its lifecycle changes.

   Two reads, on the ANONYMOUS client — never the cookie-bound session
   client, so a signed-in seller's own drafts can never widen a public
   document. Under RLS the anonymous role sees only status='published'
   listings (listings_select_public_or_own) and every dealer_profiles row
   (dealer_profiles_public_read); the explicit filters below restate that
   truth rather than relying on it. Membership itself is decided in
   lib/seo/sitemap.ts, which the test exercises with in-memory rows.

   Always current: force-dynamic, so a listing that leaves 'published'
   leaves the sitemap on the next request. A failed read logs and yields
   the static entries rather than a 500 — an incomplete sitemap is a worse
   outcome than none only if it is silent, and it is not silent.

   Read lib/seo/README.md before changing membership.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let listings: SitemapListingRow[] = [];
  let dealers: SitemapDealerRow[] = [];

  try {
    const db = createDiscoveryClient();
    const [listingRead, dealerRead] = await Promise.all([
      db
        .from("listings")
        .select("id, status, updated_at")
        .eq("status", "published")
        .order("updated_at", { ascending: false })
        .limit(SITEMAP_LISTING_CEILING),
      db.from("dealer_profiles").select("slug").order("slug"),
    ]);
    if (listingRead.error) {
      console.error("[sitemap] listing read failed:", listingRead.error.message);
    } else {
      listings = (listingRead.data ?? []) as SitemapListingRow[];
    }
    if (dealerRead.error) {
      console.error("[sitemap] dealer read failed:", dealerRead.error.message);
    } else {
      dealers = (dealerRead.data ?? []) as SitemapDealerRow[];
    }
  } catch (error) {
    console.error("[sitemap] read failed:", error);
  }

  return buildSitemapEntries({ listings, dealers });
}
