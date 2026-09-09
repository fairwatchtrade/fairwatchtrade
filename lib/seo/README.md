# Route policy, canonicals and the sitemap — `lib/seo/`

**The misconception this file exists to kill:**

> "robots.txt decides what gets indexed, and a page that is not linked is private."

Neither is true. `app/robots.ts` is one site-wide crawler *request* and it is
fully closed pre-launch (`User-Agent: *` / `Disallow: /`). It says nothing
about any individual resource. What decides whether ONE page may be indexed
once robots opens — and which of several URLs is that page's identity — is
the per-resource metadata emitted through this directory. Robots is posture.
This is truth.

The two coexist on purpose: the sitemap and every canonical exist today while
robots stays closed. A sitemap is discovery, not permission.

## What lives where

| Concern | Where the behaviour actually lives |
|---|---|
| Locked titles/descriptions for public static pages | `STATIC_ROUTE_COPY` in `routeMetadata.ts` — pages import, never freehand |
| Which static paths are indexable AND in the sitemap | `PUBLIC_STATIC_PATHS` (same file) — one list feeds both |
| The serving origin for every canonical | `CANONICAL_ORIGIN` — deliberately equal to `SITE_URL` in `lib/discovery/publicDiscovery.ts`; the test pins them together |
| Listing indexability | `INDEXABLE_LISTING_STATUSES` = `["published"]`; everything else is noindex by construction |
| Listing title/description composition | `listingTitle` / `listingDescription` — own fields only, no placeholders, nothing borrowed from the Vault |
| Seller indexability | `dealerProfileMetadata` (dealer row → index) vs `individualSellerMetadata` (no dealer row → noindex, no name in title) |
| Sitemap membership | `buildSitemapEntries` in `sitemap.ts` — pure; `app/sitemap.ts` only performs the reads |
| Homepage title/description | **Not here.** `app/layout.tsx` keeps the governed specialty copy; `app/page.tsx` adds only the canonical |
| Client-component pages that need metadata | A pass-through `layout.tsx` in that segment (`/login`, `/signup`, `/forgot-password`, `/reset-password`), or a route group (`app/sell/(entry)/`) when a plain segment layout would be inherited by noindex children |

## The rules, in one place

- **Canonical is always the clean path** on `https://www.fairwatchtrade.com`.
  `returnTo`, `callbackUrl`, Browse facets, `?dna=`, `?privateThread=` and
  every other query string are navigation state, never identity. The human
  behaviour behind those parameters is untouched — `safeBrowseReturn` still
  honours `returnTo` on the listing page.
- **`/vault/galaxy` declares `/vault` as canonical** and stays out of the
  sitemap. It is not noindexed: a duplicate is consolidated, not hidden. If
  Galaxy ever becomes a distinct destination with its own content, revisit
  this deliberately.
- **A listing is indexable in exactly one lifecycle state: `published`.**
  A published listing that becomes `reserved`, `private_active`, `removed`,
  `draft`, `pending_review` or `rejected` flips to `noindex` on its own page
  AND leaves the sitemap on the next request. Sitemap removal alone is never
  relied on. A non-public row's brand, model and reference never reach
  metadata — only the listing-code fallback title does.
- **Dealer truth is the `dealer_profiles` row and nothing else.** Not a
  business-sounding display name, not imported media, not volume. An
  ordinary individual seller stays reachable at `/sellers/{uuid}` but is
  `noindex`, carries no name in the title, and is never in the sitemap.
  This is a privacy ruling, not a query convenience.
- **Auth doors** (`/login`, `/signup`, `/forgot-password`) are
  `noindex, follow` with a clean canonical. Personal, admin, internal and
  action surfaces are `noindex, nofollow` with no canonical.
- **`lastModified` only where a trigger maintains it.** `listings.updated_at`
  is touched by `listings_touch_updated_at`, so listings carry it.
  `dealer_profiles.updated_at` has no such trigger, so dealer entries carry
  none. Static pages carry none. No invented dates.

## What is deliberately NOT built

- **No robots lift, no partial allowlist, no `Sitemap:` line in robots.txt.**
  Opening robots is a founder ruling for its own flight.
- **No `changeFrequency` or `priority`** in the sitemap. They are hints
  crawlers largely ignore and would be invented.
- **No Open Graph / Twitter card work.** Out of scope for this cluster.
- **No slug migration for seller URLs.** The existing public route identity
  (dealer slug, individual UUID) is the canonical.
- **No new role, flag or seller type.** Dealer-vs-individual is read from
  the existing governed row.

## Verify current state

```bash
# the whole policy, pure functions + source pins
node scripts/robots-readiness-seo-foundation.test.mjs

# every route that declares policy, and which helper it uses
grep -rn "RouteMetadata\|Metadata()" app --include=*.tsx --include=*.ts | grep -v "^app/api"

# production: sitemap is live XML, robots is still closed
curl -s https://www.fairwatchtrade.com/sitemap.xml | head -5
curl -s https://www.fairwatchtrade.com/robots.txt

# production: a page's directive and canonical (signed out)
curl -s https://www.fairwatchtrade.com/browse | grep -o '<meta name="robots"[^>]*>\|<link rel="canonical"[^>]*>'
```

## Traps

- **The root layout must never declare a canonical.** Metadata merges
  shallowly root → segment → page; a root canonical would be inherited by
  every route that forgot its own, silently claiming `/` for admin pages.
  `metadataBase` is set there; `alternates` is not.
- **A segment layout's metadata is inherited by every child route.** That is
  why `/sell` uses a route group: `app/sell/layout.tsx` would have pushed the
  public door's title and canonical into `/sell/mobile` and
  `/sell/continue/[token]`.
- **`generateMetadata` on the listing page reads through the session
  client**, so it sees exactly the rows the page sees under RLS. A seller
  viewing their own draft gets noindex; a stranger gets the neutral noindex
  the 404 gets. Do not switch it to the service client — that would emit
  metadata for rows the viewer cannot see.
- **The sitemap reads through the anonymous client**, never the cookie
  client, so a signed-in seller's drafts can never widen a public document.
- **`STATIC_ROUTE_COPY` throws on an unknown path.** A new public page is a
  policy decision: add it there (and it joins the sitemap automatically),
  do not hand-write a `metadata` object in the page.
