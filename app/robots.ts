/* ════════════════════════════════════════════════════════════════════════
   PRE-LAUNCH: block ALL search-engine indexing while the site is mid-build.

   This generates /robots.txt with "Disallow: /" for every crawler, so no
   page — including the Coming Soon placeholder, /sell, /watch-dna, and any
   test routes — gets crawled or indexed by well-behaved search engines.

   IMPORTANT: robots.txt is a CRAWLER REQUEST, not access control. It stops
   indexing; it does NOT stop a person who types a URL directly. For that you
   need real auth / password protection (see deployment-protection notes).

   ▶ AT LAUNCH: replace the body with the launch version (allow indexing of
     public pages, keep /sell, /api, and any internal routes disallowed) and
     set a real sitemap URL.
   ════════════════════════════════════════════════════════════════════════ */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/sell"],
    },
    sitemap: "https://fairwatchtrade.com/sitemap.xml",
  };
}