/* ════════════════════════════════════════════════════════════════════════
   PRE-LAUNCH: block ALL search-engine indexing while the site is mid-build.

   This generates /robots.txt with "Disallow: /" for EVERY crawler — no page
   is indexable. That includes the Coming Soon placeholder, /sell, /vault,
   /watch-dna, and any test routes. Nothing gets crawled or indexed by
   well-behaved search engines while we build.

   IMPORTANT: robots.txt is a CRAWLER REQUEST, not access control. It stops
   indexing; it does NOT stop a person who types a URL directly. For that you
   need real auth / password protection.

   ▶ AT LAUNCH (and ONLY at launch): swap to the open version — allow indexing
     of public pages, keep /api/, /admin/, /sell disallowed, add the sitemap.
     Until then this file MUST stay fully closed.
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
