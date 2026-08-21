/* ════════════════════════════════════════════════════════════════════════
   PRE-LAUNCH: block search-engine indexing while the site is mid-build.

   ▶ TEMPORARY REVIEW WINDOW (2026-08-20) — REVERT WHEN THE WINDOW CLOSES.

   Baseline (restore this): a single "Disallow: /" for EVERY agent, so no
   page is indexable — Coming Soon, /sell, /vault, /watch-dna, test routes,
   all of it.

   The window inverts the default so a directed review session can fetch
   pages instead of being turned away by this file, while every search
   engine that could actually make this site DISCOVERABLE stays explicitly
   disallowed by name. Indexing remains suspended: that is the property
   v2.0g was written to protect after an accidental open window, and it is
   preserved here.

   IMPORTANT: robots.txt is a CRAWLER REQUEST, not access control. It grants
   access to nothing. /admin remains gated by its own founder-UID check
   (app/admin/page.tsx), as does every /api/admin/* route — this file cannot
   and does not open them.

   TO RESTORE: replace the whole rules array with the single closed rule:
       rules: { userAgent: "*", disallow: "/" }

   ▶ AT LAUNCH (and ONLY at launch): swap to the open version — allow
     indexing of public pages, keep /api/, /admin/, /sell disallowed, add
     the sitemap. Until then indexers stay disallowed.
   ════════════════════════════════════════════════════════════════════════ */
import type { MetadataRoute } from "next";

/* Every crawler that could put this pre-launch build into a public index.
   These stay fully closed for the duration of the window. */
const INDEXERS = [
  "Googlebot",
  "Googlebot-Image",
  "Googlebot-News",
  "Bingbot",
  "Slurp",
  "DuckDuckBot",
  "Baiduspider",
  "YandexBot",
  "Applebot",
  "facebookexternalhit",
  "Twitterbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...INDEXERS.map((userAgent) => ({ userAgent, disallow: "/" })),
      /* Temporary: directed review access. Restore to "disallow" to close. */
      { userAgent: "*", allow: "/" },
    ],
  };
}
