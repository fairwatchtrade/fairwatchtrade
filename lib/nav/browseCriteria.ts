/* ════════════════════════════════════════════════════════════════════════
   BROWSE CRITERIA HREFS — the structured seam  (v3.22)

   Browse holds ONE result set narrowed by ONE set of criteria. Those criteria
   live in the URL as repeatable structured params (see BrowseClient's
   FILTER_KEYS / `searchParams.getAll(key)`), and every criterion in the URL
   renders as a removable row in Active Criteria under the existing
   subtraction law. Nothing here is a second filter mechanism — this module
   only builds the URL Browse already understands.

   Why this exists: other surfaces (Watch DNA result pills today; dial-colour
   or material affordances later) need to hand a collector into Browse with a
   criterion ALREADY APPLIED. The wrong way is a loose `?q=<brand>` text
   search, which arrives as an interpreted meaning rather than a structured
   criterion. Where a structured filter exists, it is the only correct link.

   Contrast with `buildBrowseSearchHref` in ./headerSearch — that is the
   free-text submit seam (a collector's own words, parsed by Browse). This is
   the structured seam (a criterion we already know the identity of).
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Browse's structured criterion keys, mirroring BrowseClient's FILTER_KEYS.
 * Kept as a union so a typo can never silently produce a URL param Browse
 * ignores (which would look like "the filter didn't work").
 */
export type BrowseCriterionKey =
  | "brand"
  | "condition"
  | "caseSize"
  | "movement"
  | "beatRate"
  | "powerReserve"
  | "caseMaterial"
  | "dialColor"
  | "docs";

/**
 * Build a /browse href with structured criteria applied on arrival.
 *
 * Values must be the STORED values Browse matches against (e.g. the exact
 * `listings.brand` string), because every criterion is compared by exact
 * string equality — a prettified or re-cased value yields zero results.
 * Repeated keys are supported: Browse reads each with `getAll`.
 */
export function buildBrowseCriteriaHref(
  criteria: Array<[BrowseCriterionKey, string]>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of criteria) {
    const trimmed = value.trim();
    if (trimmed) params.append(key, trimmed);
  }
  const qs = params.toString();
  return qs ? `/browse?${qs}` : "/browse";
}

/**
 * The canonical Brand criterion href. `brand` must be the stored
 * `listings.brand` value.
 */
export function buildBrowseBrandHref(brand: string): string {
  return buildBrowseCriteriaHref([["brand", brand]]);
}
