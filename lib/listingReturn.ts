/* Where a listing sends a collector BACK to.

   `returnTo` is request-controlled query input - untrusted - and is used as a
   link target, so it must be validated as a genuine internal FairWatchTrade
   path before it is ever rendered. It lives here rather than inside the page
   so the allowlist can be exercised directly against hostile input instead of
   being asserted by reading the source.

   Two origins can legitimately send a collector to a listing: the global
   catalogue at /browse, and a Dealer Room at /sellers/{slug|uuid}. Only the
   first used to be admitted, so opening a watch from a Dealer Room and coming
   back landed the buyer in global Browse - their dealer, their search, their
   facets, their sort and their page all gone. The href was always built
   correctly; the validator threw it away.

   The allowlist stays strict. It is widened by one exact shape rather than by
   relaxing the rule:
     - the path must be internal and absolute, never protocol-relative
       ("//host" is an external URL wearing a path's clothes);
     - backslashes are rejected outright, because some agents normalise a
       backslash to "/" AFTER a naive check has already approved the string;
     - no traversal segments;
     - the dealer segment must match the SAME shape the database enforces
       (dealer_profiles_slug_shape) or be a UUID - tested raw, never
       percent-decoded, so an encoded payload simply fails to match instead
       of being unwrapped and then trusted.

   A query string survives on an admitted path: that query IS the room state
   this exists to restore, and it cannot change origin. Anything that fails
   falls back to plain /browse - never thrown, never rendered raw. */

const DEALER_SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEALER_UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f\\]/;
const DEALER_PATH = /^\/sellers\/([^/]+)$/;

export type ReturnTarget = { href: string; label: string };

export const BROWSE_RETURN: ReturnTarget = {
  href: "/browse",
  label: "Back to Browse",
};

export function safeBrowseReturn(
  raw: string | string[] | undefined
): ReturnTarget {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return BROWSE_RETURN;
  if (FORBIDDEN_CHARS.test(value)) return BROWSE_RETURN;
  if (!value.startsWith("/") || value.startsWith("//")) return BROWSE_RETURN;

  const path = value.split("?")[0] ?? "";
  if (path.includes("..")) return BROWSE_RETURN;

  if (path === "/browse" || path.startsWith("/browse/")) {
    return { href: value, label: "Back to Browse" };
  }

  const dealerSegment = DEALER_PATH.exec(path)?.[1];
  if (
    dealerSegment &&
    (DEALER_SLUG_SHAPE.test(dealerSegment) || DEALER_UUID_SHAPE.test(dealerSegment))
  ) {
    /* Origin-neutral copy through one small prop - never a second control.
       The room the buyer came from calls itself a Catalogue. */
    return { href: value, label: "Back to Catalogue" };
  }

  return BROWSE_RETURN;
}
