import type { Metadata } from "next";

/* ════════════════════════════════════════════════════════════════════════
   ROUTE METADATA — lib/seo/routeMetadata.ts   (Robots Readiness GRS-005/006)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "A page is indexable because robots.txt says so, and a page is private
      because it is not linked."

   Neither is true. app/robots.ts is a site-wide crawler REQUEST and stays
   fully closed pre-launch. What decides whether ONE resource may be indexed
   once that opens is the page-level directive emitted here, and what decides
   which of several URLs is the resource's identity is the canonical emitted
   here. Robots is posture; this is per-resource truth.

   ONE SOURCE. Every public route's locked title and description, every
   canonical rule, every indexability rule for listings and seller profiles
   lives in this file and nowhere else. Pages import; they never freehand.
   The sitemap (lib/seo/sitemap.ts) reads the same route list, so a route
   cannot be in the sitemap while noindexed, or indexable while absent.

   PURE. No database, no request, no framework runtime. `import type` only,
   so the governed strings and rules are executable under plain Node in
   scripts/robots-readiness-seo-foundation.test.mjs.

   Read lib/seo/README.md before changing a rule here.
   ════════════════════════════════════════════════════════════════════════ */

/* The host that SERVES. The apex answers every request with a 308 to www,
   and a canonical that needs a redirect to resolve is not canonical. This
   deliberately equals SITE_URL in lib/discovery/publicDiscovery.ts — the
   test pins the two together; this file stays dependency-free on purpose. */
export const CANONICAL_ORIGIN = "https://www.fairwatchtrade.com";

export const SITE_NAME = "FairWatchTrade";

/** Absolute canonical for a clean internal path. Query strings and
    fragments are navigation state, never identity, and are stripped. */
export function canonicalUrl(path: string): string {
  const clean = path.split("#")[0].split("?")[0];
  if (!clean.startsWith("/")) {
    throw new Error(`canonicalUrl: path must be absolute and internal, got "${path}"`);
  }
  return clean === "/" ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}${clean.replace(/\/+$/, "")}`;
}

/* ── Indexability vocabularies ──────────────────────────────────────────── */

export const INDEX_FOLLOW = { index: true, follow: true } as const;
export const NOINDEX = { index: false, follow: false } as const;
/** Auth doors: never indexed, but the links on them may be followed. */
export const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/* ── Static public routes: INDEX + SITEMAP ──────────────────────────────── */

export type StaticRouteCopy = { title: string; description: string };

/** The locked copy for every indexable static destination except "/",
    whose title and specialty description live in app/layout.tsx and are
    preserved there. Order = sitemap order. */
export const STATIC_ROUTE_COPY: Readonly<Record<string, StaticRouteCopy>> = Object.freeze({
  "/browse": {
    title: "Browse Watches | FairWatchTrade",
    description:
      "Browse current FairWatchTrade watch listings with collector-focused search, filters, and reference-aware discovery.",
  },
  "/vault": {
    title: "The Vault | FairWatchTrade",
    description:
      "Explore FairWatchTrade’s collector-structured watch reference library by brand, collection, family, variant, and reference.",
  },
  "/sell": {
    title: "Sell a Watch | FairWatchTrade",
    description:
      "Create a structured FairWatchTrade listing through Curation, Photos, Details, Description, and Review.",
  },
  "/watch-dna": {
    title: "Watch DNA | FairWatchTrade",
    description: "Explore your watch preferences with FairWatchTrade’s Watch DNA experience.",
  },
  "/about": {
    title: "About FairWatchTrade",
    description: "Learn what FairWatchTrade is building for watch collectors, occasional sellers, and dealers.",
  },
  "/faq": {
    title: "FairWatchTrade FAQ",
    description:
      "Answers about browsing, buying, selling, listings, payments, privacy, and how FairWatchTrade works.",
  },
  "/contact": {
    title: "Contact FairWatchTrade",
    description: "Contact FairWatchTrade for support and questions about the marketplace.",
  },
  "/terms": {
    title: "Terms | FairWatchTrade",
    description: "FairWatchTrade marketplace terms and conditions.",
  },
  "/privacy": {
    title: "Privacy | FairWatchTrade",
    description: "FairWatchTrade privacy policy and information about how personal data is handled.",
  },
});

/** Every static path that is indexable AND belongs in the sitemap. "/" is
    first; its copy is inherited from the root layout. */
export const PUBLIC_STATIC_PATHS: readonly string[] = Object.freeze([
  "/",
  ...Object.keys(STATIC_ROUTE_COPY),
]);

/** Metadata for one indexable static destination. Throws on a path that is
    not in the locked list — a new public page is a policy decision, not a
    helper call. */
export function staticRouteMetadata(path: string): Metadata {
  const copy = STATIC_ROUTE_COPY[path];
  if (!copy) throw new Error(`staticRouteMetadata: "${path}" is not a locked public route`);
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: canonicalUrl(path) },
    robots: INDEX_FOLLOW,
  };
}

/** The homepage keeps the governed specialty title/description from the
    root layout and declares only its clean identity. */
export function homeMetadata(): Metadata {
  return { alternates: { canonical: canonicalUrl("/") }, robots: INDEX_FOLLOW };
}

/* ── Canonicalized duplicates: CANONICAL, NOT IN SITEMAP ────────────────── */

/** /vault/galaxy is the same Vault experience through a deeper route, so it
    declares /vault as its identity. It is not noindexed — a duplicate is
    consolidated, not hidden — and it never enters the sitemap. */
export function vaultGalaxyMetadata(): Metadata {
  const vault = STATIC_ROUTE_COPY["/vault"];
  return {
    title: vault.title,
    description: vault.description,
    alternates: { canonical: canonicalUrl("/vault") },
  };
}

/* ── Auth doors: NOINDEX, links followable ──────────────────────────────── */

export const AUTH_ROUTE_TITLES: Readonly<Record<string, string>> = Object.freeze({
  "/login": "Sign In | FairWatchTrade",
  "/signup": "Create an Account | FairWatchTrade",
  "/forgot-password": "Reset Password | FairWatchTrade",
});

export function authRouteMetadata(path: string): Metadata {
  const title = AUTH_ROUTE_TITLES[path];
  if (!title) throw new Error(`authRouteMetadata: "${path}" is not an auth route`);
  /* Descriptions are deliberately omitted rather than invented. The
     canonical is the clean door, so ?callbackUrl= variants collapse to it. */
  return { title, alternates: { canonical: canonicalUrl(path) }, robots: NOINDEX_FOLLOW };
}

/* ── Private / personal / action surfaces: NOINDEX ──────────────────────── */

/** Account modules, admin, internal, action pages, personal workspaces.
    No canonical: these are not public resources with an identity to
    consolidate. A title is optional and is human-facing only. */
export function privateRouteMetadata(title?: string): Metadata {
  return title ? { title, robots: NOINDEX } : { robots: NOINDEX };
}

/* ── Listings ───────────────────────────────────────────────────────────── */

/** The one lifecycle state a listing page may be indexed in. Everything
    else — draft, pending_review, rejected, reserved, removed,
    private_active, or any state added later — is noindex by construction. */
export const INDEXABLE_LISTING_STATUSES: readonly string[] = Object.freeze(["published"]);

export function listingIsIndexable(status: string | null | undefined): boolean {
  return typeof status === "string" && INDEXABLE_LISTING_STATUSES.includes(status);
}

export type ListingMetadataRow = {
  id: string;
  status: string | null;
  brand: string | null;
  model: string | null;
  reference: string | null;
  public_code: string | null;
};

export function listingCanonical(id: string): string {
  return canonicalUrl(`/listings/${id}`);
}

const nonEmpty = (v: string | null | undefined): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
};

/** "{Brand} {Model}" from truthful non-empty fields only; null if neither. */
export function listingBrandModel(row: Pick<ListingMetadataRow, "brand" | "model">): string | null {
  const parts = [nonEmpty(row.brand), nonEmpty(row.model)].filter((p): p is string => p !== null);
  return parts.length ? parts.join(" ") : null;
}

export function listingFallbackTitle(publicCode: string | null | undefined): string {
  const code = nonEmpty(publicCode);
  return code ? `Watch Listing ${code} | ${SITE_NAME}` : `Watch Listing | ${SITE_NAME}`;
}

/** `{Brand} {Model} · Ref. {reference} | FairWatchTrade`. A missing model or
    reference produces no placeholder; missing brand AND model falls back to
    the listing-code title. Nothing is ever borrowed from an adjacent record. */
export function listingTitle(row: ListingMetadataRow): string {
  const brandModel = listingBrandModel(row);
  if (!brandModel) return listingFallbackTitle(row.public_code);
  const reference = nonEmpty(row.reference);
  return `${brandModel}${reference ? ` · Ref. ${reference}` : ""} | ${SITE_NAME}`;
}

export function listingDescription(row: ListingMetadataRow): string {
  const code = nonEmpty(row.public_code);
  const brandModel = listingBrandModel(row);
  const subject = code ? `listing ${code}` : "listing";
  return brandModel
    ? `View ${SITE_NAME} ${subject} for ${brandModel}.`
    : `View ${SITE_NAME} ${subject}.`;
}

/**
 * Metadata for /listings/[id].
 *  - published row      → title, description, clean canonical, INDEX.
 *  - any other row      → listing-code title only, clean canonical, NOINDEX.
 *                         Brand/model/reference of a non-public listing are
 *                         never written into metadata.
 *  - no row (not found or not visible to this viewer) → neutral NOINDEX.
 */
export function listingMetadata(row: ListingMetadataRow | null, requestedId: string): Metadata {
  if (!row) {
    return { title: `Listing | ${SITE_NAME}`, robots: NOINDEX };
  }
  const canonical = listingCanonical(row.id || requestedId);
  if (!listingIsIndexable(row.status)) {
    return {
      title: listingFallbackTitle(row.public_code),
      alternates: { canonical },
      robots: NOINDEX,
    };
  }
  return {
    title: listingTitle(row),
    description: listingDescription(row),
    alternates: { canonical },
    robots: INDEX_FOLLOW,
  };
}

/* ── Seller profiles ────────────────────────────────────────────────────── */

export type DealerIdentity = { slug: string; business_name: string };

export function dealerCanonical(slug: string): string {
  return canonicalUrl(`/sellers/${slug}`);
}

/** A seller backed by a governed dealer_profiles row: indexable, canonical
    on the existing public slug route, sitemap-eligible. */
export function dealerProfileMetadata(dealer: DealerIdentity): Metadata {
  const name = nonEmpty(dealer.business_name) ?? SITE_NAME;
  return {
    title: `${name} | ${SITE_NAME}`,
    description: `View the ${SITE_NAME} seller profile for ${name}.`,
    alternates: { canonical: dealerCanonical(dealer.slug) },
    robots: INDEX_FOLLOW,
  };
}

/** An ordinary individual seller: directly reachable, never indexed, never
    in the sitemap, and no crawler-oriented copy — the title deliberately
    does not carry the person's name. */
export function individualSellerMetadata(id: string): Metadata {
  return {
    title: `Seller Profile | ${SITE_NAME}`,
    alternates: { canonical: canonicalUrl(`/sellers/${id}`) },
    robots: NOINDEX,
  };
}

export function unknownSellerMetadata(): Metadata {
  return { title: `Seller Profile | ${SITE_NAME}`, robots: NOINDEX };
}
