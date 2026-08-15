# Dealer Accelerator — how inventory actually gets in

**The misconception this file exists to kill:**

> "The Dealer Accelerator looks unbuilt — there's no page where a dealer
> starts an import."

There is no such page, and that is not an oversight. The machinery behind it
is real, has run end-to-end in production, and is **deliberately
founder-invoked**. What a dealer sees is a doorway that sends an email.

---

## Who can start an ingestion

**Nobody but the founder.** All three routes here are gated by a hardcoded
founder literal *inside each route file* — not a shared constant, not a role
lookup, not a UI condition. The comment in the spine says why: "a non-founder
is rejected regardless of any UI."

Two consequences worth stating plainly:

- A dealer cannot start, queue, or trigger an import. There is no self-serve
  intake, and no table for one — search `information_schema` for `%intake%`
  and you will find nothing.
- **Nothing in the application calls these routes.** Grep `app/` and
  `components/` for `dealer-accelerator` — the only hits are the route files
  themselves. They are invoked by hand. There is no admin page for the
  Accelerator (`app/admin/` has auctions, listings, vault-enrichment,
  vault-review, vault-upgrade — and no accelerator).

---

## What the dealer actually sees

| Surface | What it is | What it is not |
|---|---|---|
| `components/DealerAcceleratorEntry.tsx` | A card on the dealer's Overview. Its primary action is a **`mailto:`** with the Accelerator intent in the subject. | An intake form. Its own header: "an assisted doorway, not a software integration widget… No new intake system behind it." |
| `/account?module=accelerator` → `ImportedDraftsWorkspace` | Review of drafts that **already exist** from a completed import. | A place to begin one. |

The entry card's only state input is a real predicate — whether
`listing_media` rows exist with `capture_source = 'dealer_import'` — used
strictly as a boolean to distinguish a first-time dealer from a returning
one. No fabricated counts, progress, timing, or sync status. On mobile the
returning state renders text only: no button, no tap handler.

---

## The chain, in order

Evidence is discovered and normalised long before any listing exists.

```
dealer_accelerator_sources        a dealer's source of inventory
  └ source_items                  one prospective watch each
      └ observations              what was actually read from the source
          └ observation_extractions / payloads
      └ photographs               (later rehosted → photograph_rehosts)
dealer_accelerator_batches        a bounded run over items
  └ batch_items
dealer_accelerator_manifest_lines the manifest a run works through
  └ manifest_captures / manifest_preflight_results
dealer_accelerator_lifecycle_events   append-only history of all of it
```

Then the three routes, each a thin ignition over a module that owns the laws:

| Route | Stage | Notes |
|---|---|---|
| `manifest-run/` | Discovery slice | Calls `lib/dealer/manifestAdapter`. Bounded invocation; supports truthful `cancel` by `batch_id`; idempotent — repeated requests converge. |
| `materialize/` | Evidence → draft | Calls `lib/dealer/materializationBridge`. **One item per call, always** — no batch, limit, or "all" flag. "A broad run is twelve deliberate calls, not one careless flag." Has an `assess` mode that moves no bytes and creates no draft. |
| `import/` | The import spine | Creates dealer-owned **draft** listings, then stops. Does not publish, does not enrich, does not certify. |

Both `materialize` and `manifest-run` are pinned to the Node runtime, never
edge. No service-role credential ever enters a client bundle.

---

## The integrity property that must not be broken

Each listing is created by **one** call to the `SECURITY DEFINER` RPC
`public.dealer_import_one_listing(p_dealer_profile_id, p_listing, p_photos)`.

The listings row, its photos payload, and **every** declared `dealer_import`
`listing_media` row commit together or not at all. This closes a confirmed
bypass: an imported listing can never survive without its `dealer_import`
provenance, so it can never be quietly reclassified as a manual listing and
skip imported-listing review.

If you are tempted to write listings and media in separate statements for any
reason — that is the bypass. Use the RPC.

---

## Check current state yourself

Has the chain ever run, and how far?

```sql
select 'sources' t, count(*) n from dealer_accelerator_sources
union all select 'source_items',      count(*) from dealer_accelerator_source_items
union all select 'batches',           count(*) from dealer_accelerator_batches
union all select 'batch_items',       count(*) from dealer_accelerator_batch_items
union all select 'observations',      count(*) from dealer_accelerator_observations
union all select 'photographs',       count(*) from dealer_accelerator_photographs
union all select 'manifest_lines',    count(*) from dealer_accelerator_manifest_lines
union all select 'lifecycle_events',  count(*) from dealer_accelerator_lifecycle_events
order by t;
```

What actually reached the marketplace as imported inventory:

```sql
select count(*) as imported_media,
       count(distinct listing_id) as listings_from_import
from listing_media where capture_source = 'dealer_import';
```

Is a self-serve intake seam present yet? (Expect zero until one is built.)

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name like '%intake%';
```

*(No counts are written into this file on purpose — they are true for a day
and misleading afterwards. Run the queries.)*

---

## What is deliberately NOT built

- **No dealer-facing start.** By design. The doorway is assisted, not
  automated.
- **No admin UI.** The routes are invoked by hand.
- **No intake tables, bucket, or real source adapter.** The discovery end of
  the chain is still sealed.
- **No publication.** The spine stops at drafts and hands them to the normal
  listing lifecycle. "Import once. Enrich forever."

None of these are TODOs discovered by accident — each was a bounded decision.
Before "finishing" any of them, find out which flight sealed it and why.
