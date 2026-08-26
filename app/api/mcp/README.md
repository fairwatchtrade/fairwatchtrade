# Agent Discovery Bridge — the MCP endpoint

*Written v6.82, the session the bridge was built. Companion to `app/api/discovery/README.md`,
which owns the discovery surface this bridge exposes.*

---

## The misconception this file exists to kill

**This is not a search implementation, and editing it cannot change what FairWatchTrade
publishes.**

`/api/mcp` is a protocol adapter. It translates Model Context Protocol JSON-RPC into requests
against FairWatchTrade's existing governed discovery surface — `/api/discovery/listings` and
`/api/discovery/listings/[code]` — and passes the answers through verbatim. No search rule,
ranking, privacy filter, spec vocabulary, or certainty language lives here:

- **The privacy boundary** is the `public_discovery_listings` read model, in the database.
- **The search semantics** (`results` vs `unconfirmed`, truncation truth, the exact-identifier
  promise) are the discovery routes'.
- **This layer** owns exactly one distinction of its own: *a real answer is not an upstream
  failure* — see below.

If a listing appears wrong, missing, or leaking through an MCP tool, the defect is upstream in
the discovery surface or the read model. Start at `app/api/discovery/README.md`.

## Where the behaviour actually lives

| Concern | Lives in |
|---|---|
| Which listings are visible at all | `public_discovery_listings` view (RLS + admission predicate) |
| Which facts each listing publishes | view whitelist ∩ `SPEC_VOCABULARY` in `lib/discovery/publicDiscovery.ts` |
| Search / unconfirmed / exact-identifier semantics | `app/api/discovery/listings/route.ts` and `[code]/route.ts` |
| HTTP consumption of that contract | `lib/discovery/bridgeClient.ts` |
| MCP protocol framing and the two tools | `app/api/mcp/route.ts` |

**Why the bridge speaks HTTP to its own app instead of importing `search()`/`findExact()`:**
the response *shapes* — `result_count`'s meaning, `unconfirmed_note`, `related_note`, the
exact-match answer slot — are composed in the discovery routes. Rebuilding that composition
here would be a second copy of the contract that silently diverges the day the first one
changes. The bridge pays one HTTP hop so divergence is structurally impossible: an MCP caller
receives the same bytes any OpenAPI-reading agent receives.

`DISCOVERY_BRIDGE_UPSTREAM` (env) overrides the upstream base URL for local development and
failure-path testing. Production never sets it and defaults to the canonical
`https://www.fairwatchtrade.com`.

## The transport

Stateless streamable HTTP. Every POST carries one JSON-RPC message; every response is a single
JSON body. No session is issued, none is required, and JSON-RPC batching is rejected (removed
from the MCP transport as of protocol revision 2025-06-18). GET answers 405 because no
server-initiated stream is offered — inventory truth is pulled per question, never pushed.

Methods served: `initialize`, `ping`, `tools/list`, `tools/call`. Notifications are
acknowledged with 202. Everything else — `resources/*`, `prompts/*`, `logging/*` — is
`-32601 Method not found`, matching the declared capabilities (`tools` only).

## The two tools

| Tool | Maps to | Answer shape |
|---|---|---|
| `search_listings` | `GET /api/discovery/listings?…` | `results` + `unconfirmed`, each with its own note and truncation truth |
| `get_listing` | listing code / UUID → `GET /api/discovery/listings/{id}` · reference → `GET /api/discovery/listings?reference=…` | one listing's current truth, or the governed exact-match / `no_exact_match` / `related` shape |

Both tools carry the **`readOnlyHint` annotation**. The platform on the other end treats an
unannotated tool as a write action and interrupts the user for confirmation on every call — a
read-only bridge without the annotation is read-only in code and mislabelled in product.

**Tool descriptions state what is searchable, never what is returned.** A listing result
carries specification fields (case size, materials, movement, and more) that *cannot be
searched on*. Naming them in a description teaches the calling model to construct constraints
the discovery API silently ignores — and the collector never learns their constraint was
dropped. The searchable vocabulary is exactly: `text · brand · model · dial · documentation ·
condition · max_price · min_price · currency · in_hand_verified · open_to_trades` (+ `limit`).

**The boolean constraints filter only when `true`.** Passing `false` upstream filters nothing
(recorded defect, deliberately not fixed in the bridge round), so the bridge never sends
`false` and both descriptions say there is no negative filter.

## The one distinction this layer owns

A **real answer** — 200 with inventory, 404 from the single-listing route ("that watch is not
on the public marketplace"), 400 about the request — passes through as a normal tool result.

An **upstream failure** — network failure, timeout, 5xx, unparseable body — returns
`isError: true` with wording that explicitly forbids reading it as an empty catalogue. An
outage must never be relayed as "no watches found."

## The platform contract this was written against

Read **2026-08-26**:

- <https://developers.openai.com/api/docs/guides/developer-mode>
- <https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt>
- <https://help.openai.com/en/articles/11487775-connectors-in-chatgpt>
- <https://github.com/openai/openai-apps-sdk-examples>

What those pages established, as of that date — **platform docs are in flux; re-verify before
trusting this section**:

- Developer mode: **Settings → Security and login → Developer mode**, then **ChatGPT
  Plugins → plus button** to create a developer-mode app for a remote MCP server. (Paths via
  *Settings → Apps* / *Settings → Connectors* found in search results are stale; *Workspace
  Settings → Apps → Create* is the org-publishing flow, a different product.)
- Available on Pro, Plus, Business, Enterprise, Education — **web only**.
- Supported transports: SSE and streaming HTTP. Authentication: OAuth, **No Authentication**
  (this server), or Mixed.
- `search`/`fetch` tool naming is *not* required for developer mode; custom names work.
- `readOnlyHint` is respected; tools without it are treated as write actions.

### The door as actually walked — the guide mislabels it

Registration was completed on 2026-08-26 in a real account, and the working path does not
match the guide above. This subsection exists because someone hit the wall; the guide's
wording sends the next walker down two wrong branches:

- **Desktop app only.** Not chatgpt.com in a browser — despite the guide's "on the web" —
  and not the mobile app, where the feature is simply **absent**. Absence on mobile reads as
  a Business/Enterprise plan gate; it is not one. Hunt from a phone and you will wrongly
  conclude the account is ineligible.
- The registration control is **Add ⌄**, which offers three options: *Create plugin* ·
  *Add a marketplace* · **Add MCP server**. The correct choice is **Add MCP server**. The
  guide's phrase "create a developer-mode app" reads as *Create plugin* — that is the wrong
  branch.
- What it asks for, for this server: URL `https://www.fairwatchtrade.com/api/mcp`,
  authentication **No Authentication**.

## What is deliberately NOT built

- **No `get_discovery_capabilities` tool** — cut from V1 by ruling.
- **No authentication** — anonymous read-only public data, same as the discovery surface.
- **No sessions, no SSE stream** — stateless; nothing to push.
- **No output schemas** — the discovery contract is the contract; declaring a parallel schema
  here would be a second copy that drifts.
- **No case size / case material / year constraints** — the discovery API does not accept
  them; adding them is a discovery-contract round, not a bridge round.
- **No mutation of anything** — no Wanted records, messages, purchase requests, trade offers,
  or any other write. The bridge holds no Supabase client and no credentials of its own.
- **No public directory submission.** Developer-mode use on the founder's own account only,
  until the corpus ruling clears publication. The live corpus contains test rows; a public
  listing of this app would let ChatGPT speak partial fiction about FairWatchTrade to
  strangers.
- **robots.txt is untouched** — `Disallow: /` stands; direct fetches (which is how MCP
  operates) are unaffected.

## Verify current state

```bash
curl -s -X POST https://www.fairwatchtrade.com/api/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

```bash
curl -s -X POST https://www.fairwatchtrade.com/api/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

```bash
curl -s -X POST https://www.fairwatchtrade.com/api/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_listings","arguments":{"max_price":12000,"documentation":"Papers Only"}}}'
```

The third call is the canonical three-state proof: against a corpus with papers-confirmed,
papers-unknown, explicitly-no-papers and over-budget rows, the confirmed rows arrive in
`results`, the unknowns in `unconfirmed` with `unconfirmed_constraints`, and the explicit no
and the over-budget rows in neither.
