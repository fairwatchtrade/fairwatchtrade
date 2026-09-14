/* ════════════════════════════════════════════════════════════════════════
   LAUNCH POSTURE — /robots.txt is OPEN for governed public resources.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "robots.txt is how a page is kept private, and listing a path here
      stops people reaching it."

   It is a CRAWLER REQUEST, not access control. It stops a well-behaved
   search engine spending requests on a prefix; it does nothing to a person
   who types the URL, and nothing to a crawler that ignores it. /api/,
   /admin/ and /internal/ are protected by authentication — the three lines
   below only keep crawlers out of machinery that has nothing to index.

   WHY NOINDEX ROUTES ARE DELIBERATELY NOT LISTED HERE. Auth doors, account
   and action pages, individual seller profiles and non-public listings are
   all noindex — and they stay crawler-REACHABLE on purpose. A crawler
   blocked from fetching a page can never read the noindex directive that
   page emits, so disallowing them here would preserve, not remove, a stale
   index entry. Blocking and noindexing are opposite instruments; using the
   wrong one is how a page gets indexed with no description instead of not
   at all.

   ROUTE POLICY LIVES ELSEWHERE (Robots Readiness GRS-005/006/007). Which
   pages are indexable, which are noindex, what each page's canonical URL is,
   and what the sitemap lists are decided per resource in
   lib/seo/routeMetadata.ts and lib/seo/sitemap.ts — see lib/seo/README.md.
   Robots is posture. That is per-resource truth. Opening this file widened
   nothing there: every noindex ruling still holds exactly as written.

   The Sitemap line is discovery, not permission — it tells a crawler where
   to look, and each resource's own directive still decides what may be
   indexed. Kept on the serving www host: the apex 308-redirects, and a
   discovery URL that needs a redirect to resolve is not a discovery URL.

   Guarded by scripts/robots-readiness-seo-foundation.test.mjs, which runs on
   the build path and asserts what this EMITS — a comment can never pass for
   a posture.
   ════════════════════════════════════════════════════════════════════════ */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/internal/"],
    },
    /* Literal on purpose: this route stays dependency-free so the contract
       can execute it under plain Node. The test pins it equal to
       CANONICAL_ORIGIN + "/sitemap.xml", so the two identities cannot drift. */
    sitemap: "https://www.fairwatchtrade.com/sitemap.xml",
  };
}
