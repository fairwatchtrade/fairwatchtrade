import { NextResponse, type NextRequest } from "next/server";
import {
  getListing,
  searchListings,
  type BridgeSearchParams,
  type UpstreamResult,
} from "@/lib/discovery/bridgeClient";

/* ════════════════════════════════════════════════════════════════════════
   /api/mcp — the Agent Discovery Bridge  (v6.82)

   A collector asks the assistant they already use — ChatGPT, or anything
   else that speaks the Model Context Protocol — for a watch that may exist
   on FairWatchTrade. That assistant calls this endpoint, this endpoint asks
   FairWatchTrade's own governed public discovery surface, and the answer
   travels back byte-faithful: matching listings, explicitly-unconfirmed
   listings, canonical URLs, and nothing invented.

   THIS FILE IS A PROTOCOL ADAPTER, NOT A SEARCH ENGINE. It translates MCP
   JSON-RPC into requests against /api/discovery/listings and hands the
   governed response through verbatim. No search rule, ranking, privacy
   filter, or certainty upgrade happens here. The privacy boundary is the
   `public_discovery_listings` read model; the search semantics are the
   discovery routes'. Editing this file cannot widen either.

   THE TRANSPORT is stateless streamable HTTP: every POST carries one
   JSON-RPC message and receives one JSON response. No session is issued and
   none is required. GET returns 405 because this server opens no
   server-initiated stream — there is nothing to push; inventory truth is
   pulled per question.

   READ-ONLY IS DECLARED, NOT JUST TRUE. Both tools carry the
   `readOnlyHint` annotation because the platform on the other end treats an
   unannotated tool as a write action and interrupts the collector for
   confirmation on every call. A read-only bridge that gets confirmed like a
   write is read-only in the code and mislabelled in the product.

   TWO ANSWERS ARE NEVER BLENDED. `results` are watches that affirmatively
   satisfy every constraint. `unconfirmed` are watches FairWatchTrade cannot
   answer the named constraints for. `related` are near an identifier that
   was asked for exactly. Each arrives under its own key with its own note,
   exactly as discovery serves them — an agent reading only `results`
   is structurally unable to relay uncertainty as a match.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* MCP responses are RPC answers, never cacheable documents. CORS is open
   for the same reason the discovery surface's is: the data is public and
   the boundary that matters was decided in the read model. */
const MCP_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-protocol-version, mcp-session-id",
  "Cache-Control": "no-store",
};

/* Protocol revisions this server understands. Negotiation per spec: echo
   the client's requested version when supported, otherwise answer with the
   latest this server speaks and let the client decide. */
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_PROTOCOL_VERSION = "2025-06-18";

const SERVER_INFO = {
  name: "fairwatchtrade-discovery",
  title: "FairWatchTrade Discovery",
  version: "1.0.0",
};

/* Read by the calling model once, at initialize — the standing behavioural
   contract that individual tool results then repeat in their own notes. */
const SERVER_INSTRUCTIONS =
  "FairWatchTrade is a curated collector-watch marketplace. These tools read live public inventory. " +
  "Search responses separate `results` (watches that affirmatively satisfy every constraint) from " +
  "`unconfirmed` (watches FairWatchTrade cannot answer the named constraints for). Never present an " +
  "unconfirmed watch as a match — say plainly that FairWatchTrade does not know. Exact-identifier " +
  "lookups return the exact watch or say `no_exact_match`; entries under `related` are nearby " +
  "alternatives and must never be presented as the requested watch. Always link the collector to the " +
  "canonical `url` on each listing.";

/* ── The tool surface ──────────────────────────────────────────────────── */

/* The input schema states what is SEARCHABLE, never what is returned. A
   listing result carries specification fields (case size, materials, and
   more) that cannot be searched on; naming them here would teach the model
   to construct constraints discovery silently ignores — and the collector
   would never learn their constraint was dropped. */
const SEARCH_LISTINGS_TOOL = {
  name: "search_listings",
  title: "Search FairWatchTrade listings",
  description:
    "Search live public collector-watch listings on FairWatchTrade. Use when the user is looking for " +
    "a watch for sale by brand, model, dial colour, condition, documentation status, price range, " +
    "currency, or trade availability. The response separates `results` (watches that affirmatively " +
    "satisfy every constraint) from `unconfirmed` (watches FairWatchTrade cannot answer the named " +
    "constraints for — never present these as matches). If free text is shaped like an exact listing " +
    "code or manufacturer reference, the exact-identifier answer shape is returned instead.",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description:
          "Free text matched against brand, model, reference, listing code and seller description.",
      },
      brand: { type: "string", description: "Watchmaker name, e.g. \"Rolex\", \"Breitling\"." },
      model: { type: "string", description: "Model or collection name, e.g. \"Datejust\"." },
      dial: { type: "string", description: "Dial colour, e.g. \"champagne\", \"blue\"." },
      documentation: {
        type: "string",
        description:
          "Documentation status the watch must have, e.g. \"Papers Only\", \"No Box or Papers\".",
      },
      condition: { type: "string", description: "Condition the watch must have, e.g. \"Very Good\", \"Excellent\"." },
      max_price: { type: "number", description: "Highest acceptable asking price." },
      min_price: { type: "number", description: "Lowest acceptable asking price." },
      currency: { type: "string", description: "Currency the asking price must be in, e.g. \"USD\"." },
      in_hand_verified: {
        type: "boolean",
        description:
          "Set true to require listings FairWatchTrade has verified in hand. There is no negative filter — omit this otherwise.",
      },
      open_to_trades: {
        type: "boolean",
        description:
          "Set true to require sellers open to trades. There is no negative filter — omit this otherwise.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        description: "Most listings to return per collection (default 20).",
      },
    },
    additionalProperties: false,
  },
  annotations: {
    title: "Search FairWatchTrade listings",
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const GET_LISTING_TOOL = {
  name: "get_listing",
  title: "Get one FairWatchTrade listing",
  description:
    "Retrieve one exact public FairWatchTrade listing by its FairWatchTrade listing code (a letter " +
    "followed by five digits) or an exact manufacturer reference number. Returns the listing's " +
    "current truth — price, condition, documentation, photographs, canonical URL. If the exact " +
    "identifier is not on the public marketplace, the answer says so plainly; a similar watch is " +
    "never substituted. Entries under `related`, when present, are nearby alternatives and are NOT " +
    "the requested watch.",
  inputSchema: {
    type: "object",
    properties: {
      identifier: {
        type: "string",
        description:
          "A FairWatchTrade listing code (letter + five digits) or an exact manufacturer reference number.",
      },
    },
    required: ["identifier"],
    additionalProperties: false,
  },
  annotations: {
    title: "Get one FairWatchTrade listing",
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/* ── JSON-RPC plumbing ─────────────────────────────────────────────────── */

type JsonRpcId = string | number | null;

function rpcResult(id: JsonRpcId, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: MCP_HEADERS });
}

function rpcError(id: JsonRpcId, code: number, message: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { headers: MCP_HEADERS }
  );
}

/* A tool-level failure travels INSIDE a successful JSON-RPC response, as
   `isError: true` content, so the calling model can read it and tell the
   collector what actually happened. Reserved for the upstream-failure case:
   the wording must never be mistakable for an empty catalogue. */
function toolFailure(detail: string) {
  const text =
    `${detail} This is an upstream failure, not an inventory answer — no information about ` +
    "FairWatchTrade listings could be retrieved. Do not tell the user no watches were found; " +
    "tell them FairWatchTrade discovery is temporarily unreachable and to try again shortly.";
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

/** A governed discovery answer, passed through verbatim as the tool result. */
function toolAnswer(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function fromUpstream(result: UpstreamResult) {
  return result.ok ? toolAnswer(result.payload) : toolFailure(result.detail);
}

/* ── Argument reading — lenient in, honest out ─────────────────────────── */

const optionalString = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed.slice(0, 120);
};

const optionalMoney = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
};

function readSearchParams(args: Record<string, unknown>): BridgeSearchParams {
  const params: BridgeSearchParams = {};
  const text = optionalString(args.text);
  if (text) params.text = text;
  const brand = optionalString(args.brand);
  if (brand) params.brand = brand;
  const model = optionalString(args.model);
  if (model) params.model = model;
  const dial = optionalString(args.dial);
  if (dial) params.dial = dial;
  const documentation = optionalString(args.documentation);
  if (documentation) params.documentation = documentation;
  const condition = optionalString(args.condition);
  if (condition) params.condition = condition;
  const maxPrice = optionalMoney(args.max_price);
  if (maxPrice !== undefined) params.max_price = maxPrice;
  const minPrice = optionalMoney(args.min_price);
  if (minPrice !== undefined) params.min_price = minPrice;
  const currency = optionalString(args.currency);
  if (currency) params.currency = currency;
  if (args.in_hand_verified === true) params.in_hand_verified = true;
  if (args.open_to_trades === true) params.open_to_trades = true;
  const limit = optionalMoney(args.limit);
  if (limit !== undefined) params.limit = Math.min(Math.max(Math.floor(limit), 1), 50);
  return params;
}

/* ── Method dispatch ───────────────────────────────────────────────────── */

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "search_listings") {
    return fromUpstream(await searchListings(readSearchParams(args)));
  }
  if (name === "get_listing") {
    const identifier = optionalString(args.identifier);
    if (!identifier) {
      return {
        content: [
          {
            type: "text",
            text:
              "get_listing requires `identifier`: a FairWatchTrade listing code (letter + five digits) " +
              "or an exact manufacturer reference number.",
          },
        ],
        isError: true,
      };
    }
    return fromUpstream(await getListing(identifier));
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MCP_HEADERS });
}

/* This server opens no server-initiated stream and issues no session, so a
   GET (SSE subscription) and a DELETE (session teardown) both answer 405 —
   an allowed, spec-anticipated answer for a stateless server. */
export async function GET() {
  return NextResponse.json(
    {
      error: "method_not_allowed",
      message:
        "This is FairWatchTrade's MCP endpoint. Send MCP JSON-RPC messages via POST; no server-initiated stream is offered.",
    },
    { status: 405, headers: { ...MCP_HEADERS, Allow: "POST, OPTIONS" } }
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "method_not_allowed",
      message: "This MCP server is stateless; there is no session to delete.",
    },
    { status: 405, headers: { ...MCP_HEADERS, Allow: "POST, OPTIONS" } }
  );
}

export async function POST(request: NextRequest) {
  let message: unknown;
  try {
    message = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error: the request body is not valid JSON.");
  }

  /* JSON-RPC batching was removed from the MCP transport; one message per
     POST is the contract this server speaks. */
  if (Array.isArray(message)) {
    return rpcError(null, -32600, "Batch requests are not supported; send one message per request.");
  }
  if (typeof message !== "object" || message === null) {
    return rpcError(null, -32600, "Invalid request: expected a JSON-RPC message object.");
  }

  const { id, method, params } = message as {
    id?: JsonRpcId;
    method?: unknown;
    params?: unknown;
  };
  const rpcId: JsonRpcId = id === undefined ? null : id;

  if (typeof method !== "string") {
    return rpcError(rpcId, -32600, "Invalid request: `method` must be a string.");
  }

  /* Notifications expect no response body. 202 acknowledges receipt. */
  if (id === undefined) {
    return new NextResponse(null, { status: 202, headers: MCP_HEADERS });
  }

  const p = (typeof params === "object" && params !== null ? params : {}) as Record<
    string,
    unknown
  >;

  switch (method) {
    case "initialize": {
      const requested = typeof p.protocolVersion === "string" ? p.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : LATEST_PROTOCOL_VERSION;
      return rpcResult(rpcId, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    }

    case "ping":
      return rpcResult(rpcId, {});

    case "tools/list":
      return rpcResult(rpcId, { tools: [SEARCH_LISTINGS_TOOL, GET_LISTING_TOOL] });

    case "tools/call": {
      const name = typeof p.name === "string" ? p.name : "";
      const args = (typeof p.arguments === "object" && p.arguments !== null
        ? p.arguments
        : {}) as Record<string, unknown>;
      try {
        const result = await callTool(name, args);
        if (result === null) {
          return rpcError(rpcId, -32602, `Unknown tool: ${name || "(none named)"}.`);
        }
        return rpcResult(rpcId, result);
      } catch (err) {
        console.error("[mcp] tool call failed", err);
        return rpcResult(
          rpcId,
          toolFailure("FairWatchTrade discovery could not complete that call.")
        );
      }
    }

    default:
      /* resources/*, prompts/*, logging/* — capabilities this server does
         not declare and therefore does not serve. */
      return rpcError(rpcId, -32601, `Method not found: ${method}.`);
  }
}
