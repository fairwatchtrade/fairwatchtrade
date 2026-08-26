# Agent-Native Public Discovery

*The AI Search Moment — first truthful vertical slice. Written v6.44, the session the architecture was built.*

---

## The misconception this file exists to kill

**This is not FairWatchTrade's search, and it is not an AI chatbot.**

It is the surface by which the assistant a collector *already uses* — running somewhere else
entirely, while they sit on a couch and ask out loud — can discover that FairWatchTrade has
the watch, and send that collector to the real listing.

Two different products that both involve searching:

| | Direction | Lives in |
|---|---|---|
| **Internal discovery** | Makes collector intent legible to FairWatchTrade | Browse, Smart Search, Wanted, Saved Search, WatchDNA |
| **This** | Makes FairWatchTrade inventory legible to machines | `/api/discovery/*`, `public_discovery_listings` |

They may share taxonomy and identity. They are not one product. Do not merge them because
both have a query string.

**Wanted is also not this.** Wanted is an internal demand primitive — the collector declares
what they are looking for *inside* FairWatchTrade. This is an external discovery channel —
the collector expresses demand outside FairWatchTrade, through the assistant they chose.

---

## Where the behaviour actually lives

This is the part that costs hours if you go looking in the wrong place.

**The privacy boundary is not in these routes.** It is in the database, in
`public_discovery_listings` — see
`supabase/migrations/20260824010000_agent_native_public_discovery_v1.sql`.

The routes cannot see a private listing in order to exclude one. By the time any TypeScript
runs, the row set has already been admitted. That is deliberate: a filter written in a route
is a promise, a filter written in the read model is a property. Editing these routes cannot
produce a leak.

**Two independent locks, in this order:**

1. **RLS on `listings`.** The view is `security_invoker = true`, so it is evaluated *as the
   caller*. The discovery client is deliberately anonymous — not the SSR cookie client — and
   `listings_select_public_or_own` returns only `status = 'published'` to a caller with no
   `auth.uid()`. Delete every line of the view's `WHERE` clause and a private listing still
   cannot leave.
2. **The admission predicate in the view**, which is stricter than RLS and states the
   external-discovery boundary in its own right: published, no private buyer, not removed,
   not marked unavailable.

Both must pass.

**Field-level admission is a separate lock again.** `details` is never serialized wholesale —
it carries `admission`, the component-originality findings and manufacturer style number
gathered for the Rolex identity gate, which is internal review evidence and not a public spec.
`specs` is built by intersecting stored keys with an explicit whitelist in the view, and then
intersected *again* with `SPEC_VOCABULARY` in `lib/discovery/publicDiscovery.ts`. A key added
to `details` next year publishes externally only when somebody adds it to both lists on
purpose.

**Sensitive identifiers are a category this surface must never gain.** Serial, case,
movement and certificate numbers — and the keyed equality tokens derived from them — live in
`physical_watch_identifier_observations`, a table with RLS on, zero policies, and no grant to
`anon` or `authenticated`. Nothing joins it here, and nothing may. The prohibition covers the
token as firmly as the value: a token is sensitive infrastructure, not public metadata, and
publishing one would hand an outside party an oracle for testing guessed serials. Not in
`specs`, not in `description`, not in JSON-LD, not in a feed, not in a future export. See
`lib/identity/README.md` Part 3.

**Scores are absent by construction.** `significance_score`, `score_state`, `combined_score`
and `completeness_score` are not filtered out of the view — they were never selected.

---

## The pieces

| Path | What it is |
|---|---|
| `supabase/migrations/2026*_agent_native_public_discovery_v1.sql` | The governed read model. The whole privacy boundary. |
| `lib/discovery/publicDiscovery.ts` | Anonymous client, published field vocabulary, exact-identifier logic, search. |
| `app/api/discovery/route.ts` | The descriptor an agent reads first: scope, rules, endpoints. Also served at `/.well-known/fwt-discovery.json` via a rewrite in `next.config.ts`. |
| `app/api/discovery/openapi.json/route.ts` | OpenAPI 3.1. What makes provider neutrality mechanical rather than aspirational. |
| `app/api/discovery/listings/route.ts` | Search, and the exact-identifier promise. |
| `app/api/discovery/listings/[code]/route.ts` | One listing's current truth. A 404 here is a real answer. |
| `components/ListingStructuredData.tsx` | The canonical page made legible to an agent that already has the URL. Published listings only. |

---

## The exact-identifier promise

Inherited from the Exact Identifier Search Law, and the reason the response has two shapes
rather than one list.

When `code`, `reference`, or a `q` shaped like an identifier arrives, the response carries
`exact_match` (the object, or `null`), `no_exact_match`, and a plain `message`. Nearby
identifiers appear **only** under `related`, alongside `related_note` telling the agent what
they are.

A near miss is never promoted into the answer slot — not even when it is the only row that
came back. One changed character can be a different case material, dial, movement, generation,
market or watch entirely.

`additional_exact_matches` exists because two public listings can genuinely carry the same
manufacturer reference — two examples of the same watch. All of them are exact. None of them
is *related*.

## Unknowns are preserved, not admitted

> **A constraint query returns only watches that affirmatively satisfy it.**

Shipped v6.77 (`f6f9fbb`). Before it, a query for `documentation=Papers Only` silently dropped
every watch whose documentation FairWatchTrade had not recorded — at the database, in the
`ilike`, where NULL never survives a comparison. A watch that may well have papers, whose
seller simply left a field blank, was invisible to the exact collector who wanted it, and
nobody was ever told it happened.

Three states, and the middle one is the whole point:

| state | where it goes |
|---|---|
| **satisfied** — the row has the field and it meets the constraint | `results[]` |
| **unknown** — the row's field is NULL; FairWatchTrade does not know | `unconfirmed`, **never counted** |
| **not_satisfied** — the row has the field and it is not what was asked | **excluded entirely** |

**This is not partial-match admission, and the distinction is architectural.** No unconfirmed
row enters `results[]`, inflates `result_count`, or is presented as satisfying the constraint.
Uncertainty is never substituted for a match — and never silently discarded either. Both are
failures; only one of them was visible before v6.77.

**Explicitly-no is not unknown.** A watch recorded as `No Box or Papers` fails a `Papers Only`
query on its merits. There is nothing for the collector to adjudicate, so it appears in neither
collection. Without this line `unconfirmed` becomes a junk drawer for everything that failed to
match, and the vocabulary collapses.

**Three constraints can never be unconfirmed, by schema rather than by convention.**
`brand`, `in_hand_verified` and `open_to_trades` are `NOT NULL` on `listings`. There is no null
to admit and no hole to fix — do not wrap them in `.or()`, and do not write a migration to
"correct" a gap that does not exist.

### How it works

`unknownConstraintsFor()` decides, per row, **which** constraints are unconfirmed — an array,
not a boolean. A query can supply four constraints and a row can be unknown on two of them.

Retrieval runs **two bounded fetches**, not one:

- the **strict** fetch is unchanged from before v6.77 and produces `results[]`;
- the **admitting** fetch substitutes `.or("<field>.ilike.%X%,<field>.is.null")` per
  unknown-capable constraint, and its rows *minus* the strict rows become `unconfirmed`.

Successive `.or()` calls AND together, so each constraint independently admits
*(matches OR unknown)* while a row must still clear every supplied constraint.

**A `not_satisfied` row fails both branches and never returns.** The exclusion rule falls out
of retrieval rather than needing separate enforcement — which is why this lives in the query
and not in a post-pass.

**Two fetches rather than one shared ceiling**, because `DISCOVERY_FETCH_CEILING` would
otherwise hold both classes. On a sparsely-populated field — the ordinary case for
`documentation` — unconfirmed rows can crowd the collector's actual matches out of the sweep,
and `truncated: true` would then be honest about the fetch and **wrong about the results**.
Each collection reports its own truncation for the same reason: one shared boolean cannot say
which ceiling was hit.

**The second fetch is skipped** when a query supplies only structurally-excluded constraints.
The admitting query would be byte-identical to the strict one and buy nothing.

**`dial` partitions in memory, in one direction only.** It resolves through
`specs.dialColorType`, not a column. A row with no `dialColorType` key is unconfirmed; a row
that has one which does not match is `not_satisfied` and appears in neither collection. Without
that second half, `dial` alone would quietly make `unconfirmed` the junk drawer.

`unconfirmed_note` warns an agent not to present these as satisfying the constraint, and
discloses the collection's own cap.

---

## What is deliberately NOT built

- **No parallel inventory database.** The read model is a view. There is no sync job, no
  cached copy, and nothing that can go stale against the listing it describes. One canonical
  listing, one truth, multiple discovery entrances.
- **No transaction path.** An agent can say "here's the watch." The collector then enters the
  real listing and FairWatchTrade's own governed purchase, offer and trade machinery. Any
  future agentic transaction uses those existing controls, never a parallel checkout.
- **No AI orb, no mascot, no "Ask AI" bubble.** Nothing was added to the FairWatchTrade
  interface. Externally the collector is already inside the assistant they chose; internally
  FairWatchTrade remains FairWatchTrade.
- **No vendor manifest.** No assistant-vendor plugin file, no per-assistant integration. An
  OpenAPI document and a well-known descriptor, which any agent framework can consume.
- **No Market Intel or auction evidence.** Listing discovery and evidence publication are
  separate gates with separate rules. Auction evidence additionally answers to settled
  public-use scope, provenance, and field-level semantics quarantine. Nothing from that corpus
  reaches this surface, and adding it is a separate decision, not an extension of this one.
- **No SEO pass.** No meta tags, titles, descriptions or canonical link elements were touched.
  `ListingStructuredData` adds one script element carrying facts the page already displays.
- **No partial-match admission.** The `unconfirmed` collection is not a near-match tier. No
  score, no percentage, no compliance badge, no ranking against the primary set — a flat
  factual category the collector may choose to look at. If a future round wants partial
  matching, that is a product decision made deliberately, not an extension of this one.

---

## The open seam: `robots.txt` is still fully closed

`app/robots.ts` returns `Disallow: /` for every crawler, by design, until launch.

That file is untouched here, because opening the site to crawlers is a founder publication
decision and not part of building this surface. The consequence, stated plainly:

- **Direct fetches work.** Any agent that requests these URLs — which is how an OpenAPI tool,
  an MCP server, or a fetch-capable assistant actually operates — gets current inventory now.
- **Well-behaved crawlers will not discover the site on their own** while `Disallow: /`
  stands. An assistant that finds sites by crawling will not find FairWatchTrade.

Whenever that is opened, the minimum is `Allow: /api/discovery` plus the listing pages, and a
sitemap. Until then this surface is live and reachable, and simply not advertised.

---

## Verify current state

```bash
curl -s https://fairwatchtrade.com/api/discovery | head -40
```

```bash
curl -s "https://fairwatchtrade.com/api/discovery/listings?brand=parmigiani&max_price=10000"
```

```bash
curl -s "https://fairwatchtrade.com/api/discovery/listings?reference=PFC274-0000600-B33002"
```

Prove the boundary holds — every query below must return zero rows, forever:

```sql
select count(*) as must_be_zero
from public.public_discovery_listings d
join public.listings l on l.id = d.id
where l.status <> 'published' or l.private_buyer_id is not null or l.removed_at is not null;
```

Prove no internal field reached the surface:

```sql
select count(*) as must_be_zero
from public.public_discovery_listings
where specs ? 'admission';
```

Confirm the view still evaluates as the caller rather than its owner:

```sql
select c.relname, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'public_discovery_listings';
-- reloptions must contain security_invoker=true
```

---

## Bounds worth knowing before you trust a result

- `DISCOVERY_FETCH_CEILING` (200) is a fetch bound, **not** pagination. Free-text and dial
  refinement run in memory over that bounded set, so the ceiling is also the honest limit of
  those two filters. When inventory crosses it the response says `truncated: true` rather than
  quietly serving a partial catalogue — the same discipline Browse adopted. Real pagination is
  a later decision.
- `Cache-Control` is 60 seconds. Short enough that a state change is visible almost
  immediately, long enough to absorb a burst of agent traffic.
- Availability is derived from marketplace **status**, never from a stored label, so it cannot
  drift away from what decides whether the listing is on Browse.
