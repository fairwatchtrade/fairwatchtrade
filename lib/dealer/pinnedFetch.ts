import "server-only";

/* ════════════════════════════════════════════════════════════════════════
   FLIGHT 3 — PINNED-CONNECTION FETCH  (contract v7 §15)

   The named, feasible DNS-rebinding defense: Node.js runtime (never edge),
   undici as a DIRECT dependency (a security control may never ride a
   transitive dependency another package's upgrade could drop), custom
   Agent `connect` callback.

   Strategy, exactly as contracted:
   · resolve the hostname EXACTLY ONCE per attempt;
   · validate the resolved address against the private/loopback/link-local/
     reserved blocklist;
   · connect to that validated address DIRECTLY, passing the original
     hostname as `servername` (TLS SNI) and Host header so certificate
     validation still runs against the hostname;
   · no fallback path may re-resolve; a connect failure is a fetch failure,
     never a silent retry through the default resolver.

   Fetch protections, all mandatory: HTTPS only · no embedded credentials ·
   blocklisted destinations refused · bounded redirects confined to
   approved origins · strict timeout · compressed and decompressed size
   limits · exact content-type policy (the caller's) · image magic-byte
   validation (the caller's).
   ════════════════════════════════════════════════════════════════════════ */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, request } from "undici";
import { canonicalizeUrl, isIpLiteral, urlMatchesGovernedOrigin, type GovernedOrigin } from "./originGovernance";

export const MAX_REDIRECTS = 3;
export const FETCH_TIMEOUT_MS = 30_000;
export const MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;

export type FetchFailure =
  | "url_not_governed"
  | "ip_literal_refused"
  | "dns_resolution_failed"
  | "destination_blocklisted"
  | "connect_failed"
  | "timeout"
  | "too_many_redirects"
  | "redirect_not_governed"
  | "response_too_large"
  | "http_error";

export class PinnedFetchError extends Error {
  constructor(
    public readonly code: FetchFailure,
    public readonly statusCode?: number
  ) {
    super(code);
  }
}

/** Retryable vs terminal classification lives HERE — the fetch layer owns
    fetch-contract conflicts (§13/§15). */
export function isRetryableFailure(e: PinnedFetchError): boolean {
  if (e.code === "timeout" || e.code === "connect_failed" || e.code === "dns_resolution_failed") {
    return true;
  }
  if (e.code === "http_error" && e.statusCode !== undefined) {
    return e.statusCode === 429 || e.statusCode >= 500; // 5xx + 429 retry
  }
  return false; // everything else is terminal at first occurrence
}

/* ── IPv6 classification is BINARY, never textual ───────────────────────
   The previous implementation compared lowercased strings, and a prefix
   string is not a range. `startsWith("fe80")` reads as link-local but
   fe80::/10 spans fe80:: through febf:ffff:…, so fe90::1 and febf::1 were
   accepted as ordinary public destinations. The same class of hole ran
   through the rest of it: `=== "::1"` misses the perfectly legal expanded
   spelling 0:0:0:0:0:0:0:1, and `startsWith("::ffff:")` misses
   0:0:0:0:0:ffff:127.0.0.1 and ::ffff:7f00:1 — three different ways to
   write the same loopback destination, two of which walked straight
   through.

   An address is therefore parsed to its sixteen bytes first, and every
   decision is a masked prefix comparison against that. Textual form stops
   mattering, which is the whole point: the attacker picks the spelling. */

/** Parse any textual IPv6 form to its 16 bytes. Null when it is not a
    valid IPv6 address — callers must treat null as untrustworthy. */
function parseIpv6(input: string): Uint8Array | null {
  if (isIP(input) !== 6) return null;
  let text = input.toLowerCase();

  /* A trailing dotted quad — ::ffff:127.0.0.1 and the deprecated
     ::127.0.0.1 — is rewritten into the two hex groups it denotes, so the
     group parser below sees one uniform shape. */
  if (text.includes(".")) {
    const cut = text.lastIndexOf(":");
    if (cut === -1) return null;
    const quad = text.slice(cut + 1);
    if (isIP(quad) !== 4) return null;
    const q = quad.split(".").map(Number);
    if (q.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((q[0] << 8) | q[1]).toString(16);
    const lo = ((q[2] << 8) | q[3]).toString(16);
    text = `${text.slice(0, cut + 1)}${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    // "::" must stand for at least one omitted group.
    if (head.length + tail.length > 7) return null;
    groups = [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];
  }
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    const g = groups[i];
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const v = Number.parseInt(g, 16);
    bytes[i * 2] = (v >> 8) & 0xff;
    bytes[i * 2 + 1] = v & 0xff;
  }
  return bytes;
}

/** Masked prefix comparison — the only shape a range test may take here. */
function withinCidr6(bytes: Uint8Array, prefix: Uint8Array, bits: number): boolean {
  const whole = bits >> 3;
  for (let i = 0; i < whole; i += 1) if (bytes[i] !== prefix[i]) return false;
  const rem = bits & 7;
  if (rem === 0) return true;
  const mask = (0xff << (8 - rem)) & 0xff;
  return (bytes[whole] & mask) === (prefix[whole] & mask);
}

function cidr6(text: string, bits: number): [Uint8Array, number] {
  const bytes = parseIpv6(text);
  if (!bytes) throw new Error(`unparseable blocklist entry: ${text}`);
  return [bytes, bits];
}

/* The blocked IPv6 space. Every entry is a range, written as one.

   `::/96` deliberately subsumes the unspecified address, loopback, and the
   deprecated IPv4-compatible block in a single range — ::0.0.0.0 through
   ::255.255.255.255 is not a routable destination under any spelling.

   IPv4-mapped is refused OUTRIGHT rather than decoded, preserving the
   decision the previous implementation already made in its own comment.
   That is strictly stronger than requiring the embedded address to clear
   the IPv4 rules, and it means no dotted quad can re-enter through IPv6
   notation regardless of what it points at.

   The four transition ranges at the end embed an IPv4 address inside an
   IPv6 one, which is exactly the shape that turns a public-looking address
   into a private destination: 2002:7f00:1:: is 6to4 for 127.0.0.1, and
   64:ff9b::7f00:1 is NAT64 for the same. They are blocked as ranges. */
const BLOCKED_V6: ReadonlyArray<[Uint8Array, number]> = [
  cidr6("::", 96), // unspecified + loopback + IPv4-compatible (deprecated)
  cidr6("::ffff:0:0", 96), // IPv4-mapped — refused outright
  cidr6("fe80::", 10), // link-local, the FULL range: fe80 – febf
  cidr6("fc00::", 7), // unique local fc00::/7
  cidr6("ff00::", 8), // multicast
  cidr6("100::", 64), // discard-only
  cidr6("2001:db8::", 32), // documentation
  cidr6("2001:20::", 28), // ORCHIDv2
  cidr6("2001:10::", 28), // ORCHID (deprecated)
  cidr6("5f00::", 16), // SRv6 SIDs
  cidr6("64:ff9b::", 96), // NAT64 — embeds IPv4
  cidr6("64:ff9b:1::", 48), // local-use NAT64 — embeds IPv4
  cidr6("2002::", 16), // 6to4 — embeds IPv4
  cidr6("2001::", 32), // Teredo — embeds IPv4
];

/** Private / loopback / link-local / reserved blocklist. */
export function isBlockedAddress(addr: string): boolean {
  if (isIP(addr) === 4) {
    const o = addr.split(".").map(Number);
    return (
      o[0] === 0 || // 0.0.0.0/8
      o[0] === 10 || // 10/8
      o[0] === 127 || // loopback
      (o[0] === 100 && o[1] >= 64 && o[1] <= 127) || // CGNAT 100.64/10
      (o[0] === 169 && o[1] === 254) || // link-local
      (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || // 172.16/12
      (o[0] === 192 && o[1] === 0 && o[2] === 0) || // 192.0.0/24
      (o[0] === 192 && o[1] === 0 && o[2] === 2) || // TEST-NET-1
      (o[0] === 192 && o[1] === 168) || // 192.168/16
      (o[0] === 198 && (o[1] === 18 || o[1] === 19)) || // benchmarking
      (o[0] === 198 && o[1] === 51 && o[2] === 100) || // TEST-NET-2
      (o[0] === 203 && o[1] === 0 && o[2] === 113) || // TEST-NET-3
      o[0] >= 224 // multicast + reserved + broadcast
    );
  }
  const bytes = parseIpv6(addr);
  /* Fail closed. An address this function cannot parse is an address it
     cannot vouch for, and the old textual test returned FALSE — allowed —
     for anything it did not recognise. */
  if (!bytes) return true;
  return BLOCKED_V6.some(([prefix, bits]) => withinCidr6(bytes, prefix, bits));
}

export interface PinnedResponse {
  finalUrl: string;
  statusCode: number;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
  body: Uint8Array;
}

/**
 * Fetch a governed URL with the pinned-connection strategy, following at
 * most MAX_REDIRECTS redirects, each revalidated against the same governed
 * origin list for the same purpose.
 */
export async function pinnedFetch(
  rawUrl: string,
  origins: readonly GovernedOrigin[],
  purpose: GovernedOrigin["purpose"]
): Promise<PinnedResponse> {
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!urlMatchesGovernedOrigin(url, origins, purpose)) {
      throw new PinnedFetchError(hop === 0 ? "url_not_governed" : "redirect_not_governed");
    }
    const canon = canonicalizeUrl(url);
    if (canon === null || isIpLiteral(canon.hostname)) {
      throw new PinnedFetchError("ip_literal_refused");
    }

    // Resolve EXACTLY ONCE per attempt; validate; pin.
    let address: string;
    try {
      const r = await lookup(canon.hostname);
      address = r.address;
    } catch {
      throw new PinnedFetchError("dns_resolution_failed");
    }
    if (isBlockedAddress(address)) {
      throw new PinnedFetchError("destination_blocklisted");
    }

    const agent = new Agent({
      connect: {
        // Connect to the validated address DIRECTLY; the original hostname
        // rides as servername so certificate validation still runs against
        // the hostname. undici keeps the Host header from the request URL.
        lookup: (_hostname, _opts, cb) => cb(null, [{ address, family: isIP(address) as 4 | 6 }]),
        servername: canon.hostname,
        timeout: FETCH_TIMEOUT_MS,
      },
      connections: 1,
    });

    try {
      const res = await request(url, {
        method: "GET",
        dispatcher: agent,
        maxRedirections: 0, // redirects are OURS to validate, hop by hop
        headersTimeout: FETCH_TIMEOUT_MS,
        bodyTimeout: FETCH_TIMEOUT_MS,
      });

      if (res.statusCode >= 300 && res.statusCode < 400) {
        const loc = res.headers["location"];
        await res.body.dump();
        if (typeof loc !== "string" || loc === "") {
          throw new PinnedFetchError("http_error", res.statusCode);
        }
        if (hop === MAX_REDIRECTS) throw new PinnedFetchError("too_many_redirects");
        url = new URL(loc, url).toString();
        continue;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        await res.body.dump();
        throw new PinnedFetchError("http_error", res.statusCode);
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of res.body) {
        const u8 = chunk as Uint8Array;
        total += u8.byteLength;
        if (total > MAX_COMPRESSED_BYTES) {
          throw new PinnedFetchError("response_too_large");
        }
        chunks.push(u8);
      }
      const body = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        body.set(c, off);
        off += c.byteLength;
      }

      const ct = res.headers["content-type"];
      const etag = res.headers["etag"];
      const lm = res.headers["last-modified"];
      return {
        finalUrl: url,
        statusCode: res.statusCode,
        contentType: typeof ct === "string" ? ct : "",
        etag: typeof etag === "string" ? etag : null,
        lastModified: typeof lm === "string" ? lm : null,
        body,
      };
    } catch (e) {
      if (e instanceof PinnedFetchError) throw e;
      const msg = e instanceof Error ? e.message : "";
      if (/timeout/i.test(msg)) throw new PinnedFetchError("timeout");
      // A connect failure is a fetch failure — never a silent retry through
      // the default resolver.
      throw new PinnedFetchError("connect_failed");
    } finally {
      await agent.close().catch(() => {});
    }
  }
  throw new PinnedFetchError("too_many_redirects");
}
