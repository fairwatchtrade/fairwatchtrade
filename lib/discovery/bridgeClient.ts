import { SITE_URL, looksLikeListingCode } from "@/lib/discovery/publicDiscovery";

/* ════════════════════════════════════════════════════════════════════════
   AGENT DISCOVERY BRIDGE — lib/discovery/bridgeClient.ts  (v6.82)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL: this is not a second search
   implementation. No search rule, privacy rule, exact-identifier rule, or
   response vocabulary lives here. This is a narrow HTTP client for the
   governed public discovery contract — /api/discovery/listings and
   /api/discovery/listings/[code] — so that the MCP bridge consumes the same
   bytes any other agent framework would, and inherits every semantic
   (unconfirmed, truncation truth, the exact-identifier promise) rather than
   reimplementing one of them and drifting.

   WHY HTTP AND NOT AN IMPORT OF search()/findExact(). Those primitives are
   reusable, but the response SHAPES — result_count's meaning, the
   unconfirmed_note wording, related_note, the exact-match answer slot — are
   composed in the discovery routes. Rebuilding that composition here would be
   a second copy of the contract that silently diverges the day the first one
   changes. The bridge pays one in-house HTTP hop to make divergence
   structurally impossible.

   THE ONE DISTINCTION THIS FILE OWNS: a real answer is not an upstream
   failure. 200 is an answer. 404 from the single-listing route is an answer
   ("that watch is not on the public marketplace") and must reach the agent
   as one. 400 is an answer about the request. Network failure, timeout,
   5xx, or unparseable JSON are NOT answers — they are upstream failures and
   are reported as exactly that, never as "no watches found". An empty
   catalogue is a fact; an outage reported as an empty catalogue is a lie.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/* The canonical discovery host — the host that serves, not the one that
   redirects. Overridable so a local session can point the bridge at a dev
   server or, for failure-path proofs, at nothing at all. Production never
   sets the override and always speaks to its own canonical surface. */
function upstreamBase(): string {
  const override = process.env.DISCOVERY_BRIDGE_UPSTREAM;
  if (override && override.trim() !== "") return override.trim().replace(/\/+$/, "");
  return SITE_URL;
}

/** Discovery answered — with inventory truth, or a governed "not found" /
    "bad request" answer. The payload is passed through verbatim. */
export type UpstreamAnswer = {
  ok: true;
  status: number;
  payload: Record<string, unknown>;
};

/** Discovery could not answer. This must never be presented as an empty
    result — no inventory information was retrieved at all. */
export type UpstreamFailure = {
  ok: false;
  detail: string;
};

export type UpstreamResult = UpstreamAnswer | UpstreamFailure;

/* Statuses that are genuine discovery answers rather than failures. The
   single-listing route's 404 is a real answer by design — "the watch is not
   on the public marketplace" — and 400 is a real answer about the request. */
const ANSWER_STATUSES = new Set([200, 400, 404]);

const UPSTREAM_TIMEOUT_MS = 10_000;

async function fetchDiscovery(path: string): Promise<UpstreamResult> {
  const url = `${upstreamBase()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch {
    return {
      ok: false,
      detail: "FairWatchTrade discovery could not be reached.",
    };
  }

  if (!ANSWER_STATUSES.has(response.status)) {
    return {
      ok: false,
      detail: `FairWatchTrade discovery answered with an unexpected status (${response.status}).`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      detail: "FairWatchTrade discovery returned an unreadable response.",
    };
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      ok: false,
      detail: "FairWatchTrade discovery returned an unexpected response shape.",
    };
  }

  return { ok: true, status: response.status, payload: payload as Record<string, unknown> };
}

/* ── Search ────────────────────────────────────────────────────────────── */

/** Exactly the constraint vocabulary the discovery API accepts — nothing
    else. Adding a key here does not create a constraint; the API ignores
    what it does not accept, which is precisely the silent drop the bridge's
    tool schema exists to prevent. */
export type BridgeSearchParams = {
  text?: string;
  brand?: string;
  model?: string;
  dial?: string;
  documentation?: string;
  condition?: string;
  max_price?: number;
  min_price?: number;
  currency?: string;
  in_hand_verified?: boolean;
  open_to_trades?: boolean;
  limit?: number;
};

export async function searchListings(params: BridgeSearchParams): Promise<UpstreamResult> {
  const qs = new URLSearchParams();
  if (params.text) qs.set("q", params.text);
  if (params.brand) qs.set("brand", params.brand);
  if (params.model) qs.set("model", params.model);
  if (params.dial) qs.set("dial", params.dial);
  if (params.documentation) qs.set("documentation", params.documentation);
  if (params.condition) qs.set("condition", params.condition);
  if (params.max_price !== undefined) qs.set("max_price", String(params.max_price));
  if (params.min_price !== undefined) qs.set("min_price", String(params.min_price));
  if (params.currency) qs.set("currency", params.currency);
  /* Only true is ever sent. The discovery API filters these booleans only
     when they are true; sending false would imply a negative filter that
     does not exist. The tool schema says the same thing in words. */
  if (params.in_hand_verified === true) qs.set("in_hand_verified", "true");
  if (params.open_to_trades === true) qs.set("open_to_trades", "true");
  if (params.limit !== undefined) qs.set("limit", String(params.limit));

  const query = qs.toString();
  return fetchDiscovery(`/api/discovery/listings${query ? `?${query}` : ""}`);
}

/* ── Exact lookup ──────────────────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One exact identifier, resolved through the route that owns its promise.
 *
 * A FairWatchTrade listing code (letter + five digits) or a canonical
 * listing id goes to the single-listing route, whose 404 is a real answer.
 * Anything else is treated as a manufacturer reference and asked as an
 * explicit `reference=` exact search, which returns the governed
 * exact-match / no-exact-match / related shape. Both paths keep the Exact
 * Identifier Search Law because both paths ARE the existing surface.
 */
export async function getListing(identifier: string): Promise<UpstreamResult> {
  const trimmed = identifier.trim();
  if (looksLikeListingCode(trimmed) || UUID.test(trimmed)) {
    return fetchDiscovery(`/api/discovery/listings/${encodeURIComponent(trimmed)}`);
  }
  return fetchDiscovery(
    `/api/discovery/listings?${new URLSearchParams({ reference: trimmed }).toString()}`
  );
}
