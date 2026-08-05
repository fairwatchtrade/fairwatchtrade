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
  const a = addr.toLowerCase();
  return (
    a === "::" ||
    a === "::1" || // loopback
    a.startsWith("fe80") || // link-local
    a.startsWith("fc") || // ULA fc00::/7
    a.startsWith("fd") ||
    a.startsWith("::ffff:") || // v4-mapped: refuse outright
    a.startsWith("ff") // multicast
  );
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
