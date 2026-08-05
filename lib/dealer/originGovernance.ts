/* ════════════════════════════════════════════════════════════════════════
   FLIGHT 3 — ORIGIN CANONICALIZATION AND MATCHING  (contract v7 §15)

   PURE module (see manifestPreflight.ts header): the server-only boundary
   lives on the fetch layer and the adapter, this file's only callers.

   The SSRF / source-governance boundary's comparison rules, as pure,
   deterministic, unit-testable functions. Governed origin rows store the
   ALREADY-CANONICAL form (the database CHECKs refuse anything else);
   incoming URLs are canonicalized here before comparison.

   · hostname: lowercase; IDNA/punycode-encoded; exactly one optional
     trailing dot stripped before comparison; no wildcards, ever
   · IP literals (v4 and v6): rejected at governance time AND at fetch time
   · port: absent → 443; explicit :443 equals absent; any other port must
     match the governed port exactly
   · path prefix: percent-decoding of UNRESERVED characters only,
     dot-segment removal per RFC 3986, then segment-boundary prefix match
     ("/inventory" matches "/inventory/x", never "/inventoryx")
   · scheme: https only
   ════════════════════════════════════════════════════════════════════════ */

import { domainToASCII } from "node:url";

export interface GovernedOrigin {
  purpose: "manifest" | "photographs";
  hostname: string; // stored canonical: lowercase punycode, no trailing dot
  port: number;
  pathPrefix: string;
  state: "approved" | "revoked";
}

export interface CanonicalUrl {
  hostname: string;
  port: number;
  path: string;
}

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** IP-literal test on the (bracket-stripped) hostname. */
export function isIpLiteral(hostname: string): boolean {
  const h = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (IPV4_RE.test(h)) return true;
  if (h.includes(":")) return true; // IPv6 literal
  return false;
}

/** Percent-decode UNRESERVED characters only (RFC 3986 §2.3); every other
    escape is left exactly as written. */
function decodeUnreservedOnly(path: string): string {
  return path.replace(/%([0-9a-fA-F]{2})/g, (whole, hex: string) => {
    const code = parseInt(hex, 16);
    const ch = String.fromCharCode(code);
    if (/[A-Za-z0-9\-._~]/.test(ch)) return ch;
    return whole;
  });
}

/** RFC 3986 §5.2.4 remove_dot_segments. */
function removeDotSegments(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return "/" + out.join("/") + (path.endsWith("/") && out.length > 0 ? "/" : "");
}

/**
 * Canonicalize an absolute https URL for governed comparison.
 * Returns null (never a guess) when the URL is outside the governable
 * space: non-https, credentials embedded, IP literal, wildcard, or
 * unparseable.
 */
export function canonicalizeUrl(raw: string): CanonicalUrl | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username !== "" || u.password !== "") return null; // no embedded credentials

  let host = u.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1); // exactly one trailing dot
  if (host === "" || host.includes("*")) return null;
  if (isIpLiteral(host)) return null;

  const ascii = domainToASCII(host); // IDNA/punycode before comparison
  if (ascii === "") return null;

  const port = u.port === "" ? 443 : Number(u.port); // absent → 443; :443 ≡ absent

  const path = removeDotSegments(decodeUnreservedOnly(u.pathname || "/"));

  return { hostname: ascii, port, path };
}

/** Segment-boundary prefix match: "/inventory" matches "/inventory" and
    "/inventory/x", never "/inventoryx". "/" matches everything. */
export function pathPrefixMatches(prefix: string, path: string): boolean {
  const p = prefix.endsWith("/") && prefix !== "/" ? prefix.slice(0, -1) : prefix;
  if (p === "/") return true;
  if (path === p) return true;
  return path.startsWith(p + "/");
}

/**
 * Does this URL fall inside an APPROVED governed origin for the purpose?
 * Every redirect target is revalidated through this same gate.
 */
export function urlMatchesGovernedOrigin(
  raw: string,
  origins: readonly GovernedOrigin[],
  purpose: GovernedOrigin["purpose"]
): boolean {
  const c = canonicalizeUrl(raw);
  if (c === null) return false;
  return origins.some(
    (o) =>
      o.state === "approved" &&
      o.purpose === purpose &&
      o.hostname === c.hostname &&
      o.port === c.port &&
      pathPrefixMatches(o.pathPrefix, c.path)
  );
}
