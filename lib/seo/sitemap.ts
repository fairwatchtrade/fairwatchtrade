import type { MetadataRoute } from "next";
import {
  PUBLIC_STATIC_PATHS,
  canonicalUrl,
  dealerCanonical,
  listingCanonical,
  listingIsIndexable,
} from "./routeMetadata.ts";

/* ════════════════════════════════════════════════════════════════════════
   SITEMAP COMPOSITION — lib/seo/sitemap.ts   (Robots Readiness GRS-007)

   Pure. app/sitemap.ts performs the two database reads and hands the rows
   here; this file decides membership and never talks to a database, so the
   membership rules run under plain Node in the test.

   MEMBERSHIP IS THE SAME RULE AS INDEXABILITY. A listing enters only when
   listingIsIndexable(status) — the exact predicate its own page uses to
   decide index/noindex — so a row can never be in the sitemap while its
   page says noindex. A seller enters only as a governed dealer slug; an
   individual seller never does, whatever URL they are reachable at.

   Entries are the canonical URLs and nothing else: no /vault/galaxy, no
   query-string variants, no auth, account, admin, internal, API or action
   routes. lastModified is emitted only where a trigger-maintained timestamp
   exists (listings.updated_at via listings_touch_updated_at); static pages
   and dealer profiles carry none rather than an invented date.
   ════════════════════════════════════════════════════════════════════════ */

export type SitemapListingRow = { id: string; status: string | null; updated_at: string | null };
export type SitemapDealerRow = { slug: string | null };

/** Sitemap protocol ceiling is 50,000 URLs per file; this stays well under
    it and makes the failure mode at scale a deliberate truncation. */
export const SITEMAP_LISTING_CEILING = 5000;

const validDate = (iso: string | null): Date | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export function buildSitemapEntries(input: {
  listings: readonly SitemapListingRow[];
  dealers: readonly SitemapDealerRow[];
}): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = PUBLIC_STATIC_PATHS.map((path) => ({
    url: canonicalUrl(path),
  }));

  for (const row of input.listings) {
    if (!row.id || !listingIsIndexable(row.status)) continue;
    const lastModified = validDate(row.updated_at);
    entries.push(
      lastModified ? { url: listingCanonical(row.id), lastModified } : { url: listingCanonical(row.id) }
    );
  }

  const seen = new Set<string>();
  for (const dealer of input.dealers) {
    const slug = typeof dealer.slug === "string" ? dealer.slug.trim() : "";
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    entries.push({ url: dealerCanonical(slug) });
  }

  return entries;
}
