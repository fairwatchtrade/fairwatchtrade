/* ════════════════════════════════════════════════════════════════════════
   PRE-LAUNCH: block ALL search-engine indexing while the site is mid-build.

   This generates /robots.txt with "Disallow: /" for EVERY crawler — no page
   is indexable. That includes the homepage, /sell, /vault, /watch-dna, and
   every other route. Nothing gets crawled or indexed by well-behaved search
   engines while we build.

   IMPORTANT: robots.txt is a CRAWLER REQUEST, not access control. It stops
   indexing; it does NOT stop a person who types a URL directly. For that you
   need real auth / password protection.

   ROUTE POLICY LIVES ELSEWHERE (Robots Readiness GRS-005/006/007). Which
   pages are indexable, which are noindex, what each page's canonical URL is,
   and what the sitemap lists are decided per resource in
   lib/seo/routeMetadata.ts and lib/seo/sitemap.ts — see lib/seo/README.md.
   Under that policy /sell is a public entry destination and IS indexable
   when robots opens; the older note here that launch should keep /sell
   disallowed was stale and is withdrawn. /sitemap.xml already exists and is
   correct while this file stays closed: a sitemap is discovery, not
   permission.

   ▶ AT LAUNCH (and ONLY at launch, by founder ruling): swap to the open
     version — allow public pages, keep /api/, /admin/ and /internal/
     disallowed, and reference the sitemap. Until then this file MUST stay
     fully closed. No partial allowlists.
   ════════════════════════════════════════════════════════════════════════ */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
