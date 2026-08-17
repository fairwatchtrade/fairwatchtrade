import "server-only";

/* ════════════════════════════════════════════════════════════════════════
   INVENTORY SOURCE DISCOVERY  (lib/dealer/sourceDiscovery.ts)

   The seam that lets a dealer type their own website instead of a manifest
   URL. A dealer publishes one small document at a fixed path on their own
   origin; FairWatchTrade reads it and learns where the inventory lives.

   ── Why a published document, and not page-scraping ───────────────────
   Guessing a manifest location from arbitrary HTML is not deterministic,
   and "we found something that looked like inventory" is not a promise
   this platform can keep. A fixed path is deterministic: either the
   document is there and says exactly where the inventory is, or it is not
   there and the answer is an honest "we couldn't connect this source."

   ── The property that earns its keep ──────────────────────────────────
   Publishing a file at a fixed path on an origin is only possible for
   someone who administers that origin. So the same document that resolves
   the source ALSO evidences control of the domain. That is deliberate: it
   means the ordinary dealer path needs no manual authorization step by
   anyone at FairWatchTrade, while still being stronger than an unbacked
   claim of ownership. Attestation records intent; the document evidences
   control. Both are kept — neither substitutes for the other.

   ── Boundaries this module holds ──────────────────────────────────────
   · WRITES NOTHING. It reads, validates, and reports. Every durable
     record is the caller's business.
   · Every fetch goes through the pinned-connection layer with an
     EPHEMERAL governed-origin list derived from the typed domain, so the
     full SSRF boundary (single DNS resolution, address blocklist,
     https-only, no credentials, no IP literals, redirects revalidated
     hop by hop) applies before any source row exists.
   · Same-origin only. The inventory and photographs must live on the
     origin whose control was evidenced. A document may not point at a
     third party's inventory — that would let anyone claim anyone's
     photographs by publishing one file on a domain they do happen to own.
   · The manifest is validated by the existing byte-exact preflight, not a
     second parser. A source that would be refused during a real run is
     refused here too, for the same reason, with the same code.
   ════════════════════════════════════════════════════════════════════════ */

import {
  isAllowedManifestContentType,
  preflightManifest,
  MAX_MANIFEST_BYTES,
} from "./manifestPreflight";
import { canonicalizeUrl, isIpLiteral, type GovernedOrigin } from "./originGovernance";
import { pinnedFetch, PinnedFetchError } from "./pinnedFetch";

/** The fixed, published location of the discovery document. */
export const DISCOVERY_PATH = "/.well-known/fairwatchtrade-inventory.json";

/** A pointer document is small by construction; a large one is a mistake
    or an attempt to make us read something else entirely. */
export const MAX_DISCOVERY_BYTES = 64 * 1024;

/** The only inventory format the current adapter can prepare. Adding a
    format here without adding an adapter for it would be a lie. */
export const SUPPORTED_INVENTORY_FORMAT = "ndjson";

/** The source_type the spine records for an NDJSON manifest. Fixed by the
    existing schema CHECK, not chosen here. */
export const NDJSON_SOURCE_TYPE = "static_json_manifest";

/** Hosts that must never be accepted as a dealer's inventory source: our
    own. A FairWatchTrade page is not an inventory feed, and the order
    calls this out explicitly. */
const SELF_HOSTS = new Set(["fairwatchtrade.com", "www.fairwatchtrade.com"]);

/* ── Failure vocabulary ────────────────────────────────────────────────
   Specific on purpose. The product turns these into dealer sentences; a
   single "something went wrong" would violate the order's §16 and, worse,
   leave a dealer with no idea whether to fix their address or their file. */
export type DiscoveryFailure =
  | "website_blank"
  | "website_unparseable"
  | "website_ip_literal_refused"
  | "website_is_fairwatchtrade"
  | "website_unreachable"
  | "discovery_document_absent"
  | "discovery_document_too_large"
  | "discovery_document_not_json"
  | "discovery_document_invalid"
  | "discovery_version_unsupported"
  | "inventory_declaration_missing"
  | "inventory_format_unsupported"
  | "inventory_url_invalid"
  | "inventory_url_off_origin"
  | "inventory_version_missing"
  | "photographs_path_invalid"
  | "manifest_unreachable"
  | "manifest_content_type_unsupported"
  | "manifest_too_large"
  | "manifest_rejected";

export interface DiscoveryRejection {
  ok: false;
  failure: DiscoveryFailure;
  /** Preflight's own reason code when the manifest itself was refused —
      carried through verbatim rather than flattened into one message. */
  manifestReason?: string;
  manifestLine?: number | null;
  /** Transport detail for the unreachable cases. Never shown raw to a
      dealer; useful in the durable record and in support. */
  detail?: string;
}

export interface ResolvedInventorySource {
  ok: true;
  /** Canonical origin whose control the discovery document evidenced. */
  hostname: string;
  port: number;
  /** Absolute URL of the inventory manifest. */
  manifestUrl: string;
  /** Directory of the manifest — the governed path prefix for fetches. */
  manifestPathPrefix: string;
  /** Governed path prefix for photograph retrieval. */
  photographsPathPrefix: string;
  /** The dealer's own declaration of which snapshot this is. Feeds the
      adapter's idempotency key: an unchanged version converges on the
      existing batch instead of duplicating work. */
  declaredVersion: string;
  /** Matches the established source-row convention: origin + manifest
      directory, never the individual file. */
  sourceLocator: string;
  /** Counts from the real preflight over the real bytes. Not estimates. */
  watchCount: number;
  photographCount: number;
  /** Every declared item id, verbatim and in manifest order. The caller
      compares these against already-materialized source items so the
      confirmation screen can say how many watches are genuinely new
      instead of implying the whole file is about to be prepared again. */
  declaredItemIds: string[];
}

export type DiscoveryResult = ResolvedInventorySource | DiscoveryRejection;

const fail = (
  failure: DiscoveryFailure,
  extra?: Omit<DiscoveryRejection, "ok" | "failure">
): DiscoveryRejection => ({ ok: false, failure, ...extra });

/* ── Website input normalization ───────────────────────────────────────
   A dealer types what a person types: "thecollectoridentity.com",
   "www.thecollectoridentity.com/about", sometimes with http://. None of
   that is an error worth refusing — but the governed space is https-only,
   so the scheme is normalized UP, never down, and the path is discarded
   because the discovery document lives at a fixed path on the origin. */
export interface NormalizedWebsite {
  hostname: string;
  port: number;
  origin: string;
}

export function normalizeWebsiteInput(raw: string): NormalizedWebsite | DiscoveryRejection {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return fail("website_blank");

  // Accept a bare domain by supplying the scheme the governed space
  // requires; upgrade an explicitly typed http:// rather than refusing it.
  let candidate = trimmed;
  if (/^http:\/\//i.test(candidate)) candidate = "https://" + candidate.slice("http://".length);
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = "https://" + candidate;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return fail("website_unparseable");
  }
  // Canonicalize through the shared governance rules so the hostname we
  // compare and store is the same form the origin CHECKs accept.
  const canon = canonicalizeUrl(`${parsed.protocol}//${parsed.host}/`);
  if (canon === null) {
    return isIpLiteral(parsed.hostname.toLowerCase())
      ? fail("website_ip_literal_refused")
      : fail("website_unparseable");
  }
  if (SELF_HOSTS.has(canon.hostname)) return fail("website_is_fairwatchtrade");

  const origin =
    canon.port === 443 ? `https://${canon.hostname}` : `https://${canon.hostname}:${canon.port}`;
  return { hostname: canon.hostname, port: canon.port, origin };
}

/** Ephemeral governed origin — the same shape the durable rows use, built
    for one probe and thrown away. */
function ephemeralOrigin(
  hostname: string,
  port: number,
  pathPrefix: string,
  purpose: GovernedOrigin["purpose"]
): GovernedOrigin {
  return { purpose, hostname, port, pathPrefix, state: "approved" };
}

/** Directory containing a path's final segment. "/inventory/x.ndjson" →
    "/inventory"; a top-level file → "/". */
export function directoryOf(path: string): string {
  const cut = path.lastIndexOf("/");
  if (cut <= 0) return "/";
  return path.slice(0, cut);
}

/* ── The document itself ───────────────────────────────────────────────
   Deliberately tiny. Every field is required except the photographs
   prefix, and unknown properties are ignored so the convention can grow
   without breaking documents already published.

   {
     "fairwatchtrade_inventory": 1,
     "inventory": {
       "format": "ndjson",
       "url": "/inventory/current.ndjson",
       "version": "2026-08-17",
       "photographs_path": "/photographs"
     }
   }
*/
export interface DiscoveryDeclaration {
  manifestPath: string;
  version: string;
  photographsPath: string;
}

/** Pure: validates the document bytes against the convention. No I/O, so
    the whole grammar is unit-testable without a network. */
export function parseDiscoveryDocument(
  bytes: Uint8Array,
  documentUrl: string
): DiscoveryDeclaration | DiscoveryRejection {
  if (bytes.byteLength > MAX_DISCOVERY_BYTES) return fail("discovery_document_too_large");

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("discovery_document_not_json");
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return fail("discovery_document_not_json");
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return fail("discovery_document_invalid");
  }
  const root = doc as Record<string, unknown>;

  // The version gate exists so a future revision can change the grammar
  // without silently misreading documents written against this one.
  if (root["fairwatchtrade_inventory"] !== 1) return fail("discovery_version_unsupported");

  const inv = root["inventory"];
  if (inv === null || typeof inv !== "object" || Array.isArray(inv)) {
    return fail("inventory_declaration_missing");
  }
  const decl = inv as Record<string, unknown>;

  if (decl["format"] !== SUPPORTED_INVENTORY_FORMAT) return fail("inventory_format_unsupported");

  const url = decl["url"];
  if (typeof url !== "string" || url.trim() === "") return fail("inventory_url_invalid");

  const version = decl["version"];
  if (typeof version !== "string" || version.trim() === "") return fail("inventory_version_missing");
  // The adapter stores this and keys idempotency on it; keep it bounded.
  if (version.trim().length > 200) return fail("inventory_version_missing");

  // Resolved against the document's own URL, so a relative path means
  // "on my own site" — the common and safe case.
  let resolved: URL;
  try {
    resolved = new URL(url, documentUrl);
  } catch {
    return fail("inventory_url_invalid");
  }

  const rawPhotos = decl["photographs_path"];
  let photographsPath = "/";
  if (rawPhotos !== undefined && rawPhotos !== null) {
    if (typeof rawPhotos !== "string" || !rawPhotos.startsWith("/")) {
      return fail("photographs_path_invalid");
    }
    photographsPath =
      rawPhotos.length > 1 && rawPhotos.endsWith("/") ? rawPhotos.slice(0, -1) : rawPhotos;
  }

  return {
    manifestPath: resolved.toString(),
    version: version.trim(),
    photographsPath,
  };
}

/* ── The probe ─────────────────────────────────────────────────────────
   Two governed reads and one pure validation. Writes nothing, creates no
   batch, and leaves no trace beyond ordinary request logs — so a dealer
   may check a website as many times as they like before committing to
   anything. */
export async function resolveInventorySource(rawWebsite: string): Promise<DiscoveryResult> {
  const site = normalizeWebsiteInput(rawWebsite);
  if ("ok" in site) return site;

  const { hostname, port } = site;

  // ── 1. The discovery document ──
  const discoveryUrl = `https://${hostname}${port === 443 ? "" : `:${port}`}${DISCOVERY_PATH}`;
  let discoveryBody: Uint8Array;
  let discoveryFinalUrl: string;
  try {
    const res = await pinnedFetch(
      discoveryUrl,
      [ephemeralOrigin(hostname, port, "/.well-known", "manifest")],
      "manifest"
    );
    discoveryBody = res.body;
    discoveryFinalUrl = res.finalUrl;
  } catch (e) {
    if (e instanceof PinnedFetchError) {
      // A 404 here is the ordinary "this site has not published inventory
      // for us" case, and it is the single most likely outcome for any
      // website typed by a person. It is not an error state — it is the
      // answer to the question. Anything else is a transport problem.
      if (e.code === "http_error" && e.statusCode === 404) {
        return fail("discovery_document_absent");
      }
      return fail(e.code === "http_error" ? "discovery_document_absent" : "website_unreachable", {
        detail: `${e.code}${e.statusCode ? `:${e.statusCode}` : ""}`,
      });
    }
    return fail("website_unreachable");
  }

  const decl = parseDiscoveryDocument(discoveryBody, discoveryFinalUrl);
  if ("ok" in decl) return decl;

  // ── 2. Same-origin enforcement ──
  const manifestCanon = canonicalizeUrl(decl.manifestPath);
  if (manifestCanon === null) return fail("inventory_url_invalid");
  if (manifestCanon.hostname !== hostname || manifestCanon.port !== port) {
    return fail("inventory_url_off_origin");
  }

  const manifestPathPrefix = directoryOf(manifestCanon.path);

  // ── 3. The manifest, read exactly as a real run would read it ──
  let manifestBody: Uint8Array;
  let contentType: string;
  try {
    const res = await pinnedFetch(
      decl.manifestPath,
      [ephemeralOrigin(hostname, port, manifestPathPrefix, "manifest")],
      "manifest"
    );
    manifestBody = res.body;
    contentType = res.contentType;
  } catch (e) {
    const detail =
      e instanceof PinnedFetchError
        ? `${e.code}${e.statusCode ? `:${e.statusCode}` : ""}`
        : undefined;
    return fail("manifest_unreachable", { detail });
  }

  if (!isAllowedManifestContentType(contentType)) {
    return fail("manifest_content_type_unsupported", { detail: contentType });
  }
  if (manifestBody.byteLength > MAX_MANIFEST_BYTES) return fail("manifest_too_large");

  // The same byte-exact preflight the governed run uses. Refusing here for
  // the same reason, with the same code, is the point: a dealer learns
  // their file is malformed before committing to a run, not during one.
  const pre = preflightManifest(manifestBody);
  if (pre.disposition === "rejected") {
    return fail("manifest_rejected", { manifestReason: pre.reason, manifestLine: pre.lineNumber });
  }

  const photographCount = pre.items.reduce((n, i) => n + i.photographs.length, 0);
  const originText = port === 443 ? `https://${hostname}` : `https://${hostname}:${port}`;

  return {
    ok: true,
    hostname,
    port,
    manifestUrl: decl.manifestPath,
    manifestPathPrefix,
    photographsPathPrefix: decl.photographsPath,
    declaredVersion: decl.version,
    sourceLocator: `${originText}${manifestPathPrefix}`,
    watchCount: pre.items.length,
    photographCount,
    declaredItemIds: pre.items.map((i) => i.declaredItemId),
  };
}
