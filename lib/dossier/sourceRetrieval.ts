/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — SOURCE RETRIEVAL (server-only)

   A citation is not evidence merely because its URL looks plausible.

   The v4.45 evidence contract proved SHAPE: the URL parses, the host is not
   a known placeholder, the source name is not obvious prose, the date is
   ISO. A fabricated but well-formed source object passes all four. This
   module closes that gap by actually fetching the source and producing a
   durable record of what came back.

   Deliberately bounded — this is not a crawler. One request, redirects
   recorded rather than hidden, HTML reduced to text, the text capped, and a
   hash of the normalized text so a later reader can prove the material
   reviewed is the material retrieved.

   RETRIEVAL PROOF IS NOT TRUTH PROOF. A successful retrieval establishes
   only that the source was obtained. Whether the source is good enough for
   a given claim class remains entirely downstream, with the admission
   contracts.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { createHash } from "node:crypto";
import { BlockList, isIPv4, isIPv6 } from "node:net";
import { lookup as dnsLookupCb } from "node:dns";
import { promisify } from "node:util";
// Explicit extension so this module is importable by the node proof
// harnesses as well as Next — the same convention lib/vault/
// enrichmentAuthoring.ts already uses for exactly that reason.
import { normalizeForComparison } from "./claimAdmission.ts";

/** Bounded retained representation — enough to prove support, not a blob store. */
export const MAX_EVIDENCE_TEXT = 120_000;
const FETCH_TIMEOUT_MS = 20_000;

const FORBIDDEN_HOSTS = ["example.com", "example.org", "example.net", "localhost"];
/** Fast literal-address rejection. NOT the security boundary on its own —
    a hostname string tells you nothing about where DNS will send you. The
    boundary is addressRefusal() over the resolved address, below. */
const PRIVATE_HOST = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.0\.0\.0$)/;

/* ── Destination policy ────────────────────────────────────────────────
   THE ADDRESS WE VALIDATE MUST BE THE ADDRESS WE CONNECT TO.

   A hostname guard cannot enforce that: `localtest.me` is not a private
   string, and resolves to 127.0.0.1. So the real boundary classifies the
   RESOLVED address, and the validated address is then pinned into the
   socket so no second lookup can substitute another one.

   node:net's BlockList does the subnet arithmetic — real IP range logic,
   not string prefixes, and part of the runtime rather than a parallel
   security policy of our own invention. */
const FORBIDDEN_ADDRESSES = (() => {
  const list = new BlockList();
  // IPv4
  list.addSubnet("0.0.0.0", 8, "ipv4");          // this network / unspecified
  list.addSubnet("10.0.0.0", 8, "ipv4");         // RFC1918
  list.addSubnet("100.64.0.0", 10, "ipv4");      // CGNAT
  list.addSubnet("127.0.0.0", 8, "ipv4");        // loopback
  list.addSubnet("169.254.0.0", 16, "ipv4");     // link-local, incl. 169.254.169.254 metadata
  list.addSubnet("172.16.0.0", 12, "ipv4");      // RFC1918
  list.addSubnet("192.0.0.0", 24, "ipv4");       // IETF protocol assignments
  list.addSubnet("192.0.2.0", 24, "ipv4");       // TEST-NET-1
  list.addSubnet("192.168.0.0", 16, "ipv4");     // RFC1918
  list.addSubnet("198.18.0.0", 15, "ipv4");      // benchmarking
  list.addSubnet("198.51.100.0", 24, "ipv4");    // TEST-NET-2
  list.addSubnet("203.0.113.0", 24, "ipv4");     // TEST-NET-3
  list.addSubnet("224.0.0.0", 4, "ipv4");        // multicast
  list.addSubnet("240.0.0.0", 4, "ipv4");        // reserved, incl. broadcast
  // IPv6
  list.addAddress("::", "ipv6");                 // unspecified
  list.addAddress("::1", "ipv6");                // loopback
  list.addSubnet("fc00::", 7, "ipv6");           // unique-local
  list.addSubnet("fe80::", 10, "ipv6");          // link-local
  list.addSubnet("ff00::", 8, "ipv6");           // multicast
  list.addSubnet("2001:db8::", 32, "ipv6");      // documentation
  list.addSubnet("64:ff9b::", 96, "ipv6");       // IPv4/IPv6 translation
  return list;
})();

/** `::ffff:127.0.0.1` is 127.0.0.1 wearing a different hat. Unwrap it so a
    forbidden IPv4 cannot enter through an IPv6 representation. */
export function unwrapMappedIPv4(address: string): string {
  const m = address.match(/^::ffff:((?:\d{1,3}\.){3}\d{1,3})$/i);
  if (m && isIPv4(m[1])) return m[1];
  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const a = parseInt(hex[1], 16), b = parseInt(hex[2], 16);
    return `${(a >> 8) & 255}.${a & 255}.${(b >> 8) & 255}.${b & 255}`;
  }
  return address;
}

/** The one destination judgement. Returns a named refusal or null. */
export function addressRefusal(
  address: string
): { failure: RetrievalFailure; detail: string } | null {
  const target = unwrapMappedIPv4(address.replace(/^\[|\]$/g, "").replace(/%.*$/, ""));
  const type = isIPv4(target) ? "ipv4" : isIPv6(target) ? "ipv6" : null;
  if (!type) {
    return { failure: "SOURCE_FORBIDDEN_ADDRESS", detail: `"${address}" is not a usable IP address.` };
  }
  if (FORBIDDEN_ADDRESSES.check(target, type)) {
    return {
      failure: "SOURCE_FORBIDDEN_ADDRESS",
      detail: `Address ${target} is private, loopback, link-local or otherwise not a permitted source destination.`,
    };
  }
  return null;
}

export type ResolvedDestination = { address: string; family: 4 | 6 };

/** Injectable so the regressions can drive resolution deterministically. */
export type HostResolver = (hostname: string) => Promise<ResolvedDestination[]>;

const defaultResolver: HostResolver = async (hostname) => {
  const found = await dnsLookup(hostname, { all: true, verbatim: true });
  return found.map((f) => ({ address: f.address, family: f.family as 4 | 6 }));
};

/**
 * Resolve a hostname and permit it only if EVERY returned address is
 * permitted. Refusing on any forbidden answer — rather than picking a safe
 * one — closes round-robin rebinding, where a host mixes one public address
 * with one private and hopes the connection takes the private one.
 */
export async function resolveDestination(
  hostname: string,
  resolver: HostResolver = defaultResolver
): Promise<
  | { ok: true; destination: ResolvedDestination }
  | { ok: false; failure: RetrievalFailure; detail: string }
> {
  // A literal address needs no lookup — judge it directly.
  const literal = hostname.replace(/^\[|\]$/g, "");
  if (isIPv4(literal) || isIPv6(literal)) {
    const refusal = addressRefusal(literal);
    if (refusal) return { ok: false, ...refusal };
    return { ok: true, destination: { address: literal, family: isIPv4(literal) ? 4 : 6 } };
  }

  let answers: ResolvedDestination[];
  try {
    answers = await resolver(hostname);
  } catch (error) {
    return {
      ok: false, failure: "SOURCE_DNS_RESOLUTION_FAILED",
      detail: error instanceof Error ? error.message.slice(0, 120) : "DNS lookup failed",
    };
  }
  if (answers.length === 0) {
    return { ok: false, failure: "SOURCE_DNS_RESOLUTION_FAILED", detail: `${hostname} resolved to no addresses.` };
  }
  for (const answer of answers) {
    const refusal = addressRefusal(answer.address);
    if (refusal) {
      return {
        ok: false, failure: refusal.failure,
        detail: `${hostname} resolves to ${answer.address}: ${refusal.detail}`,
      };
    }
  }
  return { ok: true, destination: answers[0] };
}

/**
 * A dns.lookup-compatible function that can only ever answer with the
 * address already validated. This is what pins validation to connection:
 * the socket cannot perform its own lookup, so there is no window in which
 * a second DNS answer could substitute a forbidden destination.
 */
type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | { address: string; family: number }[],
  family?: number
) => void;

export function pinnedLookup(expectedHost: string, destination: ResolvedDestination) {
  return (
    hostname: string,
    options: { all?: boolean } | LookupCallback,
    callback?: LookupCallback
  ): void => {
    const cb = (typeof options === "function" ? options : callback) as LookupCallback;
    const wantsAll = typeof options === "object" && options?.all === true;
    if (hostname !== expectedHost) {
      // The transport asked about a host we never validated — refuse rather
      // than resolve it.
      cb(new Error(`retrieval refused an unvalidated host: ${hostname}`), "");
      return;
    }
    if (wantsAll) {
      cb(null, [{ address: destination.address, family: destination.family }]);
      return;
    }
    cb(null, destination.address, destination.family);
  };
}

const dnsLookup = promisify(dnsLookupCb) as (
  hostname: string,
  options: { all: true; verbatim: boolean }
) => Promise<{ address: string; family: number }[]>;

export type RetrievalFailure =
  | "SOURCE_URL_INVALID"
  | "SOURCE_HOST_FORBIDDEN"
  | "SOURCE_UNREACHABLE"
  | "SOURCE_RETRIEVAL_FAILED"
  | "SOURCE_REDIRECT_REFUSED"
  | "SOURCE_CONTENT_UNUSABLE"
  | "SOURCE_DNS_RESOLUTION_FAILED"
  | "SOURCE_FORBIDDEN_ADDRESS";

/**
 * Is this URL a permissible retrieval target? Validating the FIRST hop is
 * not enough on its own — see the redirect posture in retrieveSource.
 */
export function retrievalTargetRefusal(
  url: string
): { failure: RetrievalFailure; detail: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { failure: "SOURCE_URL_INVALID", detail: "URL did not parse." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { failure: "SOURCE_URL_INVALID", detail: "Only http(s) sources are retrievable." };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (
    FORBIDDEN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ||
    PRIVATE_HOST.test(parsed.hostname)
  ) {
    return {
      failure: "SOURCE_HOST_FORBIDDEN",
      detail: `Host "${parsed.hostname}" cannot be a governed source.`,
    };
  }
  return null;
}

export type RetrievalResult =
  | { ok: false; requestedUrl: string; failure: RetrievalFailure; detail: string }
  | {
      ok: true;
      requestedUrl: string;
      resolvedUrl: string;
      host: string;
      httpStatus: number;
      contentType: string | null;
      sourceTitle: string | null;
      /** Bounded, normalized, tag-stripped text of the retrieved document. */
      text: string;
      contentSha256: string;
      contentBytes: number;
      retrievedAt: string;
    };

/** HTML → readable text. Scripts, styles and markup go; entities are decoded. */
export function htmlToText(html: string): string {
  const withoutHead = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const separated = withoutHead
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/td|\/th)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(separated).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(nbsp|amp|quot|apos|lt|gt|mdash|ndash|rsquo|lsquo|ldquo|rdquo);/gi, (_, name) => {
      const map: Record<string, string> = {
        nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
        mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
      };
      return map[name.toLowerCase()] ?? " ";
    });
}

function titleOf(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
  return t.length > 0 ? t.slice(0, 300) : null;
}

/**
 * Fetch one source. Failure is always NAMED and never silently substituted
 * with a similar source — the caller gets a refusal, not a fallback.
 */
export async function retrieveSource(
  requestedUrl: string,
  resolver?: HostResolver
): Promise<RetrievalResult> {
  const targetRefusal = retrievalTargetRefusal(requestedUrl);
  if (targetRefusal) return { ok: false, requestedUrl, ...targetRefusal };
  const parsed = new URL(requestedUrl);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

  /* Resolve and classify BEFORE connecting. The hostname guard above is a
     cheap early exit; this is the security boundary. */
  const resolution = await resolveDestination(parsed.hostname, resolver);
  if (!resolution.ok) {
    return { ok: false, requestedUrl, failure: resolution.failure, detail: resolution.detail };
  }

  /* Pin the validated address into the socket. The dispatcher's connector
     is given a lookup that can only answer with the address just checked,
     so the connection cannot perform a second, uncontrolled DNS resolution
     and land somewhere else. The URL keeps its hostname, so TLS SNI,
     certificate verification and the Host header are all unchanged — the
     pin constrains WHERE we connect, never WHAT we verify. */
  const { Agent, fetch: undiciFetch } = await import("undici");
  const dispatcher = new Agent({
    connect: { lookup: pinnedLookup(parsed.hostname, resolution.destination) },
  });

  let response: Response;
  try {
    /* REDIRECTS ARE NOT FOLLOWED.
       Validating only the first hop and then following redirects would
       leave an SSRF-through-redirect seam: a perfectly public-looking host
       can answer 302 with a private destination, and the guard above would
       never see it. FairWatchTrade already settled this exact question —
       /api/presentation-thumb fetches with redirect: "error" for the same
       reason — so retrieval takes the same no-follow posture.

       "manual" rather than "error" only so the refusal can be NAMED: a
       redirecting source is a URL worth correcting, not a network fault,
       and an operator should be told which it was. Nothing is followed
       either way, so no hop after the first can ever be requested. */
    response = (await undiciFetch(parsed.toString(), {
      redirect: "manual",
      dispatcher,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": "FairWatchTrade reference evidence retriever/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    })) as unknown as Response;
  } catch (error) {
    await dispatcher.close().catch(() => undefined);
    return {
      ok: false, requestedUrl, failure: "SOURCE_UNREACHABLE",
      detail: error instanceof Error ? error.message.slice(0, 160) : "fetch failed",
    };
  }

  // A redirect — including the opaque form — is refused, never chased.
  if ((response.status >= 300 && response.status < 400) || response.type === "opaqueredirect") {
    const location = response.headers.get("location");
    await dispatcher.close().catch(() => undefined);
    return {
      ok: false, requestedUrl, failure: "SOURCE_REDIRECT_REFUSED",
      detail: location
        ? `Source redirected to "${location.slice(0, 120)}"; supply the canonical URL.`
        : "Source redirected; supply the canonical URL.",
    };
  }

  if (!response.ok) {
    await dispatcher.close().catch(() => undefined);
    return {
      ok: false, requestedUrl, failure: "SOURCE_RETRIEVAL_FAILED",
      detail: `HTTP ${response.status}`,
    };
  }

  const contentType = response.headers.get("content-type");
  const body = await response.text();
  await dispatcher.close().catch(() => undefined);
  const text = htmlToText(body).slice(0, MAX_EVIDENCE_TEXT);
  if (normalizeForComparison(text).length < 200) {
    return {
      ok: false, requestedUrl, failure: "SOURCE_CONTENT_UNUSABLE",
      detail: "Retrieved document carried too little text to support evidence.",
    };
  }

  return {
    ok: true,
    requestedUrl,
    resolvedUrl: response.url || parsed.toString(),
    host,
    httpStatus: response.status,
    contentType,
    sourceTitle: titleOf(body),
    text,
    // Hash the NORMALIZED text: presentation churn must not look like a
    // content change, but a factual edit must.
    contentSha256: createHash("sha256").update(normalizeForComparison(text), "utf8").digest("hex"),
    contentBytes: body.length,
    retrievedAt: new Date().toISOString(),
  };
}
