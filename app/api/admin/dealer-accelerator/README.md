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

## The dealer's submission leaves a history line

`submit_listing_for_review()` has always stamped `dealer_attested_at`,
`dealer_attested_by` and `dealer_attested_fingerprint` on the listing,
atomically with the transition. The fingerprint is a SHA-256 over 14
length-prefixed canonical frames — availability among them — mirrored
byte-for-byte in `lib/attestation.ts`. **The attestation fact was never
missing.**

What was missing is **history**. Those three columns are current state: a
resubmission overwrites them and the earlier attestation is gone. Meanwhile
the accelerator log stopped at `item_draft_created`, and
`listing_decision_events` only ever records reviewer decisions — there is no
`submitted` decision type in it at all. The dealer's own step fell between
two logs that each correctly cover something else.

So a `listing_submitted_for_review` event is now written at that transition.

**It is written by a trigger, not from inside the RPC, and that is
deliberate.** `CREATE OR REPLACE` on `submit_listing_for_review` would mean
retyping its canonical-text builder in order to append an unrelated INSERT,
and one transcribed byte would silently change every fingerprint minted
afterwards. The trigger fires in the same transaction, at the same instant,
and touches none of it.

Two properties that will look odd until you know why:

- **It can skip.** `entity_kind='item'` requires a `batch_item_id`, and some
  imported listings predate batches and have none. One of those is
  `rejected`, which the RPC permits to resubmit — so this path is live. A
  mandatory insert would violate the CHECK and abort the transaction, leaving
  a dealer unable to submit because their audit row could not be shaped.
- **It fails open.** The trigger sits on `public.listings`, where *every*
  seller submission passes — not only dealer imports. The insert is wrapped
  so that any fault loses the history line rather than the sale. A missing
  event is recoverable from the attestation columns; a blocked submission is
  not.

The metadata carries the fingerprint rather than the six ceremony
checkboxes. Those are ephemeral by design, and at a successful submission
they are structurally always all true — recording them would preserve a
constant instead of evidence. The fingerprint is falsifiable: it must equal
the listing's stored one.

```sql
-- every dealer submission, with its evidence checked against the listing
select e.created_at, l.public_code, e.prior_state, e.resulting_state,
       e.actor_kind, e.metadata->>'availability' as availability,
       e.metadata->>'fingerprint_version' as fp_version,
       (e.metadata->>'attestation_fingerprint' = l.dealer_attested_fingerprint)
         as fingerprint_matches
from dealer_accelerator_lifecycle_events e
join public.listings l on l.id = e.listing_id
where e.event_type = 'listing_submitted_for_review'
order by e.created_at desc;
```

**If `fingerprint_matches` is ever false, stop.** That is the whole point of
recording a derivable artifact instead of a decorative flag — it can be
checked, so check it.

A submission with an attestation stamp but no event is not necessarily a bug:
it may be a pre-batch listing, per the skip above. Compare
`dealer_attested_at` against this table before concluding anything.

---

## What "it has run" does and does not prove

The chain has genuinely executed, repeatedly, and produced real listings. Do
not read that as evidence the dealer path works.

**Every source on record was founder-authorized.** Check `authorized_by` on
`dealer_accelerator_sources`: it is the founder on all of them. One source's
`dealer_profile_id` is the founder's own id — the founder importing to
himself — and that id has no `dealer_profiles` row behind it at all. The
other names a real dealer profile, but the founder still authorized it.

So the honest statement is two things at once, and both matter:

- the machinery is **proven** — evidence discovery, materialization, the
  atomic import RPC, and lifecycle logging have all done real work;
- **entry** is still founder-only. No external dealer has ever started, or
  could start, an import.

A reader who takes the first half alone will assume the porch is open. It has
never been opened; the founder walked through his own sealed door.

### What IS now proven: the dealer's own half

The **porch proof** (2026-08-15) closed the question the paragraph above used
to leave open. Working from a dealer account — not the founder's — a real
person opened an imported draft in the UI, set availability, made the
attestation, and submitted it. The listing moved `draft → pending_review`,
nothing auto-approved, nothing published, and every sibling draft kept its
original timestamps.

`DEALER_ACCELERATOR_PORCH_END_TO_END_PROVEN`

So the boundary now sits in one place, precisely: **a dealer cannot start an
import, but a dealer can carry an imported draft the rest of the way
themselves.** Both halves of that sentence are load-bearing; do not collapse
it into either "the dealer path works" or "nothing is proven."

```sql
select s.id, s.dealer_profile_id, s.authorized_by,
       (s.dealer_profile_id = s.authorized_by) as founder_importing_to_self,
       p.business_name
from dealer_accelerator_sources s
left join dealer_profiles p on p.seller_id = s.dealer_profile_id;
```

Note the join key: `dealer_profiles` is keyed by **`seller_id`**, not `id`.
A source may reference a profile id that has no dealer profile row.

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
