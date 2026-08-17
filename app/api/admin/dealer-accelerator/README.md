# Dealer Accelerator — how inventory actually gets in

**The misconception this file exists to kill:**

> "The dealer path is the part that isn't built."

It is built, as of v5.49. A dealer signs in, opens **Dealer Accelerator** from
the Seller Workspace rail, types their own website, authorizes the source
themselves, and starts a real preparation run that continues after they close
the tab. No founder, no SQL, no hidden route.

**This file previously said the opposite**, at length and on purpose: "There is
no such page, and that is not an oversight… What a dealer sees is a doorway
that sends an email." That was true for months and is now false. If you are
reading a comment anywhere in this codebase that says dealer intake is
deliberately absent, it is stale — check git history for v5.49 before acting on
it.

The full journey — connect, authorize, prepare unattended, recover a real
source defect, submit, review, publish, notify — was proven against production
by a real dealer account on 2026-08-17. The step-by-step record is under
[What IS now proven](#what-is-now-proven-the-whole-journey-in-production).

**Where to look first, by symptom:**

| Symptom | Section |
|---|---|
| A run is stuck and nothing advances it | The worker continues; it never initiates |
| A dealer reconnected and work looks duplicated or lost | Source lineage vs authorization episode |
| One watch failed on its photographs | TRY AGAIN — dealer-initiated photograph retry |
| The room shows a run that is not the real one | The room shows the run, not merely the newest row |
| A notification never arrived | Lifecycle notifications (the index is partial) |
| A function suddenly reachable by clients | ⚠ Creating a function in this schema PUBLISHES it |
| Someone proposes six confirmations again | The three confirmations are a server requirement |

---

## Who can start an ingestion

**The dealer, for their own authorized source.** The founder can still do
everything by hand, and the three `admin/` routes here are unchanged — still
gated by a hardcoded founder literal inside each route file, still invoked
manually.

What changed is that a second, dealer-facing entrance now exists beside them:

| Route | Who | Gate |
|---|---|---|
| `app/api/admin/dealer-accelerator/{manifest-run,materialize,import}` | founder only | hardcoded UID literal per file |
| `app/api/dealer-accelerator/{check-website,connect,start,state}` | any authenticated seller, scoped to their own rows | session + ownership re-proven from the stored row |
| `app/api/dealer-accelerator/retry-item` | the item's own dealer | ownership enforced **in the database**, dealer-only by construction |
| `app/api/dealer-accelerator/worker` | the database's scheduler | bearer token validated *inside* Postgres |

**The founder gate was never in the database.** `dealer_accelerator_authorize_source`
and the batch/item RPCs have always accepted any dealer and any actor; the
restriction lived only in those three route files. So opening the dealer path
required **no new tables and no RLS change** — the accelerator tables still
grant `service_role` nothing but `SELECT`, and every write still goes through a
`SECURITY DEFINER` function owned by `dealer_accelerator_writer`.

If you are tempted to expose these tables to `authenticated` to save writing a
route: don't. The server-side filter to the caller's own id *is* the security
boundary.

**The scheduler is not an entrance.** It may only *continue* a run a dealer
started — see "The worker continues; it never initiates". Nothing automatic in
this system can bring a batch into existence.

---

## What the dealer actually sees

| Surface | What it is |
|---|---|
| `components/DealerAcceleratorEntry.tsx` | The Overview doorway. Primary action **Open Dealer Accelerator** — real, and it goes somewhere. |
| `components/DealerAcceleratorRoom.tsx` | The room. Three destinations: **Start · Batches · Imported Drafts**. |
| `ImportedDraftsWorkspace` | Now mounted *inside* the room's Imported Drafts tab, not as a rail peer. |

**Navigation is locked.** The rail names the capability — `Dealer Accelerator`.
It previously read `Imported Drafts` while the module id was already
`accelerator`, i.e. it advertised a product's output as the product. Imported
Drafts is a child work state and must never return to the rail as a sibling.

**The room renders once, outside the mobile/desktop split** (the Saved Searches
precedent in `AccountDashboard`). Mounted inside both branches it would get two
lives — two state reads and two polling loops driving one dealer's run. This is
also what gives the mobile account a working Dealer Accelerator; the old
text-only mobile treatment existed because the only destination was a
desktop-scoped workspace, so a button would have been a dead end.

The entry card's only state input is still a real predicate — whether
`listing_media` rows exist with `capture_source = 'dealer_import'` — used
strictly as a boolean. No fabricated counts, progress, timing, or sync status.

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

## Source lineage vs authorization episode

**The misconception this section exists to kill:** that a row in
`dealer_accelerator_sources` is "the dealer's source." It is one **authorization
episode** over a source. The source itself outlives it.

Those two things were conflated in one row, and the conflation was invisible
until an authorization was actually retired:

| | |
|---|---|
| **Lineage** — which governed source this is | `dealer_profile_id` + `source_type` + `source_locator_key` + `adapter_scope`, now derived into the generated column `source_lineage_key` |
| **Authorization** — one episode of permission over it | `authorization_state`, `authorized_by`, `authorized_at`, basis, terms, `revoked_at` |

Source items hang off a `source_id`, and **revocation is terminal** —
`dealer_accelerator_transition_source` allows `authorized → suspended|revoked`
and `suspended → authorized|revoked`, and nothing returns from `revoked`.

So retiring an authorization used to retire the platform's memory of everything
that source had ever materialized. Reconnect the same dealer to the same
website and you got a new source with zero items, every watch looked new, and
materialization would have created a **second listing for every watch that
already existed.** A duplicate-listing defect reached by performing a
retirement exactly as instructed.

### How continuity works now

A later episode still registers **its own** source items — that is correct, they
record what that episode actually observed. What changed is materialization:

```
materializeOneItem
  ├ item already draft_created in THIS episode?      -> ALREADY_MATERIALIZED
  ├ dealer_accelerator_adopt_prior_materialization   <- the continuity seam
  │    same lineage + same source_item_key
  │    + a DIFFERENT source_id + a listing that still exists and is still owned
  │    -> link this item to that listing, status draft_created, NO new listing
  └ otherwise: assess evidence, rehost photographs, create the draft
```

Three properties that are load-bearing:

- **`batch_items.listing_id` has no unique constraint.** That is what permits
  two episodes to truthfully point at one listing. `listing_truth_check` is
  satisfied because the adopting item genuinely does have a draft.
- **Adoption runs BEFORE eligibility assessment.** An item legitimately
  materialized once should not have to re-clear the evidence bar to be
  recognized, and its current-episode evidence may differ — a photograph that
  has started 404ing, a price the dealer edited — without any of that making
  the existing listing untrue. Assessment governs what may become a *new*
  draft; adoption governs what already *is* one.
- **A blocked item cannot adopt.** Only `discovered` / `ready`. A blocked item
  must be re-assessed on its own evidence rather than quietly satisfied by an
  earlier episode's success.

Adoption writes its own event type, `item_materialization_adopted`, rather than
borrowing `item_draft_created` — which would claim a draft was created when
none was. Its metadata names the adopted listing and the episode it came from,
so the chain stays reconstructible.

`forecastPreparation` reads the same lineage, which is why the confirmation
screen's arithmetic and the run's behaviour cannot disagree. It counts distinct
source item **keys**, not source item rows — each episode registers a row per
key, so counting rows would report one watch twice and push "already prepared"
past the number found.

```sql
-- Which items will be ADOPTED on the next run, and which are genuinely new.
-- Read-only, and it predicts the run exactly.
with lineage as (
  select id from public.dealer_accelerator_sources
   where source_lineage_key = (
     select source_lineage_key from public.dealer_accelerator_sources
      where id = '<any episode of the source>'
   )
)
select distinct si.source_item_key
  from public.dealer_accelerator_batch_items bi
  join public.dealer_accelerator_source_items si on si.id = bi.source_item_id
  join lineage s on s.id = bi.source_id
 where bi.listing_id is not null;
```

**Do not "fix" this by rewriting historical `source_id` values** to reattach old
items to a new episode. That falsifies the evidence log, which is the one thing
that table exists to prevent. And do not make revocation reversible — its
terminality is deliberate.

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

The metadata carries the fingerprint rather than the ceremony checkbox
states. The fingerprint is falsifiable: it must equal the listing's stored
one. It also carries `attested_acts` — see the next section, which is where
the checkbox story ends up somewhere other than where it started.

```sql
-- every dealer submission, with its evidence checked against the listing
select e.created_at, l.public_code, e.prior_state, e.resulting_state,
       e.actor_kind, e.metadata->>'availability' as availability,
       e.metadata->>'fingerprint_version' as fp_version,
       e.metadata->'attested_acts' as attested_acts,
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

## The three confirmations are a server requirement, not a UI habit

> **⚠ THREE IS THE ANSWER. DO NOT "RESTORE" SIX.**
>
> Founder ruling, 2026-08-17, recorded here because it has already been
> proposed backwards once: a build order for the dealer path asked to
> "preserve all six" confirmations and listed "six-part dealer confirmation"
> as a non-regression item. That order was written from stale information.
> Six was cut to three deliberately in v5.11, and v5.12 made the three
> **server-enforced**. Restoring six would regress a considered decision AND
> break the server contract, because `submit_listing_for_review(uuid, jsonb)`
> refuses an imported transition unless exactly those three arrive asserted.
>
> If a future document, order, or comment tells you there should be six:
> it is wrong, and this paragraph is why.

**The misconception this section exists to kill:** that the confirmation
checkboxes in the Imported Drafts workspace are decoration. They were, until
v5.12, and older comments in that component said so.

The history is worth keeping because it is the whole argument. Submission
originally asked for six identical confirmations, and the RPC read none of
them — they gated the React button and nothing else. v5.11 cut them to three
on the finding that the count added nothing to what was captured, and that
six identical ticks is the textbook way to train click-through. The three
kept are the facts the platform cannot determine for itself and the dealer
uniquely can: **photographs, price, condition**.

v5.12 made those three real. `submit_listing_for_review(uuid, jsonb)` now
refuses an imported transition unless all three arrive asserted, naming the
missing ones in the exception, and records the act set on the row as
`dealer_attested_acts`.

Three things about that are load-bearing:

- **The acts sit beside the fingerprint, never inside it.** No canonical
  frame moved. Every fingerprint minted before v5.12 verifies against the
  same `lib/attestation.ts` it always did. The alternative — folding the
  acts into a v3 frame — would mean a third canonical version mirrored
  byte-for-byte in TypeScript and retyping machinery already proven through
  a real dealer account. Do not do it without a specific reason this fails.
- **The function was DROPped and recreated, not replaced.** `CREATE OR
  REPLACE` cannot add a parameter, and an overload would have left the
  one-argument form alive as an unattested door into the same transition.
  DROP discards grants; the migration re-issues them. If `EXECUTE` on this
  function ever appears missing, that is the first place to look.
- **Ordinary sellers are untouched.** `p_attested_acts` defaults to NULL and
  is read only on the imported path. `AccountDashboard` sends no body at all
  and submits manual drafts exactly as before.

The visible consequence, and it is intended: an **imported** draft submitted
from the ordinary Listings tab now fails with `attestation_incomplete`
rather than quietly succeeding, because that surface has no confirmations to
make. The route answers with where to go instead of what is missing when all
three are absent, since naming all three there would be true and useless.

What this can and cannot establish: the server can prove the act was
performed, by this caller, against this exact listing state — the acts are
written in the same transaction as the fingerprint that binds the payload.
It cannot prove the claim is true. Nothing can. That the photographs show
the actual watch is a fact only the dealer holds; what is recorded is that
they were asked, and answered, about this specific submission.

```sql
-- what each imported listing's current attestation asked of its dealer
select public_code, dealer_attested_at, dealer_attested_acts
from public.listings
where dealer_attested_fingerprint is not null
order by dealer_attested_at desc;
```

A NULL `dealer_attested_acts` on a row attested before v5.12 is the
truthful record, not a gap: that submission genuinely was not asked.

---

## What "it has run" does and does not prove

The chain has genuinely executed, repeatedly, and produced real listings. Do
not read that as evidence the dealer path works.

**Every source on record was founder-authorized.** Check `authorized_by` on
`dealer_accelerator_sources`: it is the founder on all of them. One source's
`dealer_profile_id` is the founder's own id — the founder importing to
himself — and that id has no `dealer_profiles` row behind it at all. The
other names a real dealer profile, but the founder still authorized it.

That was written when entry was founder-only, and the sentence that followed it
here — "No external dealer has ever started, or could start, an import" — is
**no longer true**. A dealer can now authorize their own source and start their
own run (v5.49).

What the historical rows still do and do not prove:

- the machinery is **proven** — evidence discovery, materialization, the
  atomic import RPC, and lifecycle logging have all done real work;
- but every source row *predating v5.49* was founder-authorized, so those rows
  are not evidence that the dealer entrance works. Check `authorized_by`
  against `dealer_profile_id`: where they match a real dealer, the dealer
  authorized it themselves; where `authorized_by` is the founder, it did not.

The legacy TCI dealer source was **retired on 2026-08-17** as a controlled,
append-only test reset, specifically so the acceptance walk exercises the real
dealer attestation path rather than inheriting a founder-authorized row.
`authorization_state` went to `revoked` and a `source_revoked` event was
written; nothing was deleted. All 12 listings, 12 source items, 24 photographs
and 24 `dealer_import` provenance rows survive, because every FK in this chain
is `ON DELETE RESTRICT` and a state change structurally cannot remove them.

### What IS now proven: the whole journey, in production

The **porch proof** (2026-08-15) proved the dealer's second half — opening an
imported draft, setting availability, attesting, submitting. It left one
sentence standing: *a dealer cannot start an import.* That sentence died on
2026-08-17.

`DEALER_ACCELERATOR_PORCH_END_TO_END_PROVEN`
`DEALER_ACCELERATOR_FULL_DEALER_JOURNEY_PROVEN` — 2026-08-17

Every seam below was exercised by a real dealer account against production,
in one continuous session. It is recorded step by step because the *shape* of
the walk is the specification: each line is a thing that can regress.

| # | Step | Durable proof |
|---|---|---|
| 1 | Dealer opens **Dealer Accelerator** from the rail | — |
| 2 | Types their own website, no manifest URL | discovery document resolved |
| 3 | Attests, authorizes their **own** source | `source_authorized` · `authorized_by = dealer` |
| 4 | Confirmation screen counts | 13 found · 12 already prepared · 1 to prepare |
| 5 | Starts preparation, **closes the tab** | worker advanced it unattended |
| 6 | 12 recognized, not re-created | 12 × `item_materialization_adopted` |
| 7 | 1 watch genuinely fails | both photographs 404 → `retrieval_terminal` |
| 8 | Blocked truthfully, nothing invented | `photograph_evidence_incomplete` |
| 9 | Dealer fixes their website, presses **Try Again** | `photograph_retry_requested:dealer` |
| 10 | Photographs retrieved, draft created | `item_draft_created` — 2s later |
| 11 | Confirms, presses **Submit once** (no Save) | edits persisted, then validated |
| 12 | Attestation stamped | fingerprint `1248f02f…`, 3 acts, `fingerprint_matches = true` |
| 13 | Appears in founder review queue | `/admin/dealer-accelerator` |
| 14 | Founder approves → published | `approved · pending_review → published` |
| 15 | Dealer told in-app | `listing_published`, `da_decision:17` |
| 16 | Listing is publicly live | `/listings/<id>` returns 200 |

Final state: **13 listings, zero duplicates, 5 batches** — no batch, source, or
authorization episode created by anything other than a deliberate human act.

**No SQL, no hidden route, no manual backend step appears anywhere in the
dealer's path.** That is the completion boundary, and it is met.

What that does *not* mean: the historical rows predating v5.49 are still
founder-authorized and still prove nothing about the entrance. Check
`authorized_by` against `dealer_profile_id` before citing any row as evidence
of dealer self-service.

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

Has any dealer authorized their own source, or is every row still
founder-authorized? This is the one query that distinguishes "the machinery
ran" from "the dealer entrance works":

```sql
select s.id, s.authorization_state,
       (s.authorized_by = s.dealer_profile_id) as self_authorized,
       s.source_lineage_key
from dealer_accelerator_sources s
order by s.created_at;
```

Which runs may the worker still advance? (Empty means nothing is in flight —
the normal resting state.)

```sql
select * from dealer_accelerator_advanceable_batches(10);
```

*(No counts are written into this file on purpose — they are true for a day
and misleading afterwards. Run the queries.)*

---

## What is deliberately NOT built

Four of the five entries that used to live here were closed by v5.49 and have
been removed rather than left to mislead: dealer-facing start, the admin
attention surface, self-serve intake, and a real source adapter all now exist.

What genuinely remains unbuilt:

- **No publication from the spine.** It stops at drafts and hands them to the
  normal listing lifecycle. "Import once. Enrich forever."
- **No cross-origin photographs.** A discovery document may only point at
  inventory and photographs on **its own origin**. A dealer using a CDN on a
  different hostname cannot be prepared yet. This is the boundary that stops
  one dealer claiming another's photographs by publishing one file on a domain
  they happen to own; widening it needs a real design, not a relaxed check.
- **No watch selection before discovery.** The Design Gate draws a "choose the
  watches to prepare" screen *before* the run. Brand and reference are not
  known at that point — they come from governed extraction, which happens
  during discovery. Building that screen earlier would mean a second parser
  reading the manifest, which §2 of the build order forbids. Founder ruling
  2026-08-17: selection belongs at the first truthful point *after* discovery.
  Not yet built.
- **No CSV source.** `source_type` allows `static_csv_manifest`; nothing
  implements it.
- **No imported availability.** Traced end to end on 2026-08-17 and worth
  recording, because it looks like a data-preservation defect and is not. The
  manifest convention defines **no availability field**, the TCI source supplies
  none, preflight would carry an unknown property through as unread payload
  bytes, extraction reads only brand/reference/photograph categories, and no
  function in the `dealer_%` family mentions availability at all. So nothing is
  discarded — there is nothing to discard, and the dealer is correctly required
  to assert it. The governing rule (*explicit source availability → preserve it;
  missing or ambiguous → require dealer input; never infer it merely because a
  watch appears on a dealer website*) is honoured, with its first clause
  currently **unimplementable rather than unimplemented**. Making it real means
  growing the manifest convention with a declared availability vocabulary and
  mapping it onto the locked two-value product vocabulary — and that interacts
  with attestation design, since availability is deliberately one of the facts
  only the dealer may assert.
- **No replay/backfill of missed notifications.** `emit_listing_removal_…` and
  `emit_listing_deletion_…` are idempotent emitters keyed off durable event ids,
  but they cover purchase requests and removals — there is no equivalent for
  submissions or decisions. One notice was genuinely lost on 2026-08-17 (see
  Lifecycle notifications). It was deliberately **not** backfilled: fabricating a
  notice for an event already past would write a false "we told you" into the
  record. Delivery was proven instead on the next genuine action.

Before "finishing" any of these, find out which flight sealed it and why.

---

## How a website becomes a source

`lib/dealer/sourceDiscovery.ts`. A dealer types a website; they never paste a
manifest URL.

Resolution is a **published convention**, not page-scraping:

```
https://theirdomain.com/.well-known/fairwatchtrade-inventory.json
```

```json
{
  "fairwatchtrade_inventory": 1,
  "inventory": {
    "format": "ndjson",
    "url": "/inventory/current.ndjson",
    "version": "2026-08-17",
    "photographs_path": "/photographs"
  }
}
```

**Why a fixed path rather than guessing.** Inferring a manifest from arbitrary
HTML is not deterministic, and "we found something that looked like inventory"
is not a promise this platform can keep. Either the document is there and says
exactly where the inventory is, or the answer is an honest refusal.

**The property that earns its keep:** publishing a file at a fixed path on an
origin is only possible for someone who administers that origin. So the same
document that *resolves* the source also *evidences control of the domain*.
That is what makes self-service defensible — one mechanism satisfies both "no
hidden manifest URL for the dealer" and "no founder in the normal loop."
Attestation records intent; the document evidences control. Both are kept.
Neither substitutes for the other.

`version` is the dealer's own snapshot label and feeds the adapter's
idempotency key. An unchanged version converges on the existing batch instead
of duplicating work — which is exactly why the confirmation screen can honestly
say "13 found · 12 already prepared · 1 to prepare."

**The check step writes nothing.** It fetches through the same pinned-connection
layer with an *ephemeral* governed-origin list derived from the typed domain, so
the full SSRF boundary applies before any source row exists, and it validates
the manifest with the **same byte-exact preflight** a real run uses. A dealer
learns their file is malformed before committing to a run, with the same reason
code. There is no second parser.

---

## Unattended preparation

"You can leave this page" is a promise in the product, and it is kept by a
scheduled worker, not by the dealer's browser.

```
cron.job 'dealer-accelerator-worker'  every 2 minutes
  └ public.dealer_accelerator_worker_tick()
      └ (only if a batch is queued/running/cancel_requested)
          net.http_post -> /api/dealer-accelerator/worker
```

Three things about this are deliberate:

- **The tick checks for work first.** An idle platform makes no outbound
  requests at all.
- **The credential never leaves the database.** The route does not read a
  secret; it asks `dealer_accelerator_worker_token_valid(token)` and gets back
  a boolean. So there is no environment variable for anyone to set, nothing in
  a build, and nothing in application memory. This is why unattended
  preparation works as soon as the code deploys.
- **One preparation path, three drivers.** The dealer's Start button, the
  `after()` continuation, and this worker all call the same
  `advancePreparation`. Every call is idempotent and converges. If they ever
  diverge, the divergence is the bug.

If the schedule is ever removed, weaken the progress copy in
`DealerAcceleratorRoom.tsx` in the same change. A standing promise the system
no longer keeps is worse than the weaker wording it replaced.

```sql
-- is the heartbeat alive?
select jobname, schedule, active from cron.job
 where jobname = 'dealer-accelerator-worker';

-- did the ticks reach the route?
select status_code, timed_out, error_msg, created
  from net._http_response order by created desc limit 10;
```

---

## ⚠ Creating a function in this schema PUBLISHES it

The single most expensive lesson of v5.49, hit **three times in one session**.

Supabase ships `ALTER DEFAULT PRIVILEGES` granting `EXECUTE` on newly created
public-schema functions to `anon` **and** `authenticated`. So:

- `CREATE FUNCTION` in `public` is an act of publishing an API endpoint at
  `/rest/v1/rpc/<name>`, unless the same migration revokes those roles.
- **`revoke all ... from public` does NOT do it.** `anon` and `authenticated`
  are real roles, not the `PUBLIC` pseudo-role. A revoke from PUBLIC looks
  complete and is not.
- `CREATE OR REPLACE` on an existing function *preserves* its ACL. Only a
  `DROP` and recreate re-inherits the defaults. That is what bit
  `dealer_accelerator_authorize_source`: it had to be dropped to add two
  parameters, and came back exposed.

Why it mattered there specifically: the function is `SECURITY DEFINER` and takes
`p_dealer_profile_id` / `p_authorized_by` as **parameters** rather than deriving
them from the session. Any signed-in client could have recorded a source
authorization against another account, bypassing RLS.

After any `DROP`/recreate in this schema, run this. It must return zero rows:

```sql
select p.oid::regprocedure::text, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'dealer_accelerator%'
  and (p.proacl::text like '%anon=%' or p.proacl::text like '%authenticated=%');
```

**Also check the owner.** These functions are owned by
`dealer_accelerator_writer`, not `postgres`. They are `SECURITY DEFINER`, so
the owner *is* the privilege they execute with. Recreating one without
`ALTER FUNCTION ... OWNER TO dealer_accelerator_writer` silently escalates it.

### Security closure record — 2026-08-17

The exposure above was found on verification and closed. For the record, so
nobody has to re-derive it:

- **Window:** 79 seconds — `2026-08-17 13:55:52Z` (migration `20260817135552`)
  to `13:57:11Z` (migration `20260817135711`). Both bounds come from the
  migration ledger, not from memory.
- **Observed invocations: none.** Zero `/rpc/` calls appear in `edge_logs`,
  `postgrest_logs` or `postgres_logs` across a two-hour window. The only two log
  entries mentioning the function are the two migrations themselves.
- **Side effects: none.** Zero sources, zero source origins and zero lifecycle
  events were created in the window plus five minutes. The newest source row
  predates it by nine days.
- **Independent confirmation:** Supabase's own
  `anon_security_definer_function_executable` advisor reports **no**
  `dealer_accelerator_*` function. (It does flag eight *other*, pre-existing
  functions with the same defect — separate work, not this chain.)

---

## Lifecycle notifications

Five moments, all derived from committed durable state, all **exactly once** by
construction — `notifications.dedupe_key` carries a unique index and every
insert conflicts against a key derived from the fact itself. Replay and retry
cannot spam a dealer.

> **⚠ THE INDEX IS PARTIAL. THE INFERENCE CLAUSE MUST SAY SO.**
>
> ```sql
> CREATE UNIQUE INDEX notifications_dedupe_key_uniq ON public.notifications
>   (dedupe_key) WHERE (dedupe_key IS NOT NULL)
> ```
>
> Every insert must therefore read:
>
> ```sql
> ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
> ```
>
> A bare `ON CONFLICT (dedupe_key)` raises **42P10** — *"there is no unique or
> exclusion constraint matching the ON CONFLICT specification"* — and the
> fail-open handler below turns that into silence. All three triggers shipped
> with the bare form in v5.50, so for twelve days **not one of these five
> messages could be delivered at all**, and nothing said so. It surfaced only
> when a real dealer submitted a real watch and no notice arrived.
>
> `emit_listing_removal_notifications` and `emit_listing_deletion_notifications`
> already had the correct form. The house pattern existed; the defect was not
> following it.

| Moment | Source of truth | Dedupe key |
|---|---|---|
| Preparation complete | `dealer_accelerator_batches` → settled | `da_prep_complete:<batch_id>` |
| Submitted for review | `listings` → `pending_review` | `da_submitted:<listing_id>:<attested epoch>` |
| Clarification / rejected / published | `listing_decision_events` insert | `da_decision:<event_id>` |

Two properties worth not breaking:

- **Every trigger fails OPEN, but no longer in silence.** The bodies are
  wrapped so a fault loses the notification, never the event it describes — a
  dealer who cannot be told their listing was published must still have it
  published, the same reasoning as `log_dealer_submission_event`. Since v5.62
  each handler `RAISE WARNING`s before swallowing. A warning aborts nothing and
  lands in the Postgres logs, so a broken notification path cannot hide for
  twelve days again:

  ```sql
  select timestamp, event_message from logs
   where source = 'postgres_logs'
     and event_message like '%dealer_accelerator notification skipped%'
   order by timestamp desc;
  ```

  Beware one false positive: the v5.62 migration's own SQL text contains that
  phrase inside a string literal, so a statement log can match it. A real fault
  also carries `sqlstate=`.
- **Imported listings only.** Ordinary sellers' notification behaviour is
  deliberately unchanged. Extending these to every seller is a reasonable
  improvement and a separate product decision.

The submitted key includes the attestation instant on purpose: a genuine
resubmission after a rejection notifies again, while a replay of the same
transition does not.

---

## The worker continues; it never initiates

**The misconception this section exists to kill:** that "this batch has
unfinished items" is the same as "the worker may advance it."

A batch has **two phases**, and its status only describes the first. Discovery
finishing does not mean the run is done — items may still be awaiting
materialization behind a `completed` batch. But the reverse trap is worse: an
idle historical batch also "has unfinished items," and treating that as work
made the worker start *new* preparation nobody asked for.

Both mistakes happened in one evening. The predicate was written in three
places and agreed in two:

```
the room        !settled || stillProcessing > 0        correct
worker_tick()   status in (queued,running,…)           WRONG — missed phase two
worker route    status in (queued,running,…)           WRONG — same
```

pg_cron fired thirteen times, every run succeeded, and twelve items sat
stranded because the tick could not see them. Then, once it could, it was
handed the founder's idle 2026-08-08 batch, re-resolved the *current* discovery
document, and **created a brand-new batch on the founder's source**.

There is now **one definition**, and neither caller restates it:

```sql
select * from public.dealer_accelerator_advanceable_batches(10);
```

Two rules it encodes, both load-bearing:

- **Only a run a DEALER explicitly started may be continued.** The seam already
  existed — `transition_batch` writes `batch_started` with the actor kind.
  `batch_started:dealer` means a dealer asked for the whole run in the room;
  `batch_started:founder` means a founder invoked one bounded slice by hand,
  which is a request for that slice, not standing permission for a background
  process to finish the rest.
- **`cancelled` and `failed` runs are excluded.** Their leftover items are not
  pending work; they are work that was called off.

And the worker passes the candidate **`batch_id` *and* that batch's own
`source_snapshot_key`** into `advancePreparation`. The snapshot key is the pin:
pass the freshly resolved document's version instead and `create_or_get_batch`
mints a new batch whenever the dealer has bumped their inventory. If a slice
ever reports a different batch id than the one pinned, the call refuses with
`continuation_batch_diverged` rather than adopting it.

> ⚠ Do not reintroduce a status filter in the worker route or the tick.
> Ask the function.

### Diagnosing a stalled run, in the order that narrows it

```sql
-- 1. is the schedule alive?
select status, start_time from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname='dealer-accelerator-worker')
 order by start_time desc limit 10;

-- 2. did the tick decide there was work, and did the call land?
select status_code, timed_out, error_msg, left(content,80), created
  from net._http_response order by created desc limit 10;

-- 3. does the shared definition agree there is work?
select * from public.dealer_accelerator_advanceable_batches(10);
```

Successful cron runs with **no** HTTP responses means the tick saw no work. If
(3) returns rows while (2) is empty, the tick and the definition have drifted
apart again — the exact bug this design exists to prevent.

---

## TRY AGAIN — dealer-initiated photograph retry

A watch whose photographs 404 is blocked truthfully and **cannot** be recovered
by re-running: the batch is terminal, the item is `blocked`, the photographs are
`retrieval_terminal`, and a same-content snapshot bump is refused outright by
`observation_hash_conflict` (see below). Before v5.59 the dealer had no path at
all for a single bad photograph.

```
dealer presses Try Again on ONE Needs Attention item
  → dealer_accelerator_retry_item_photographs
      re-arms ONLY that item's failed/terminal photographs → 'declared'
      writes photograph_retry_requested (the prior failure events stay put)
  → retryItemPhotographs  (lib/dealer/manifestAdapter.ts)
      pinned connection · governed origins · magic bytes · create-only archive
      · the SAME retrieval RPCs a worker fetch uses
  → materializeOneItem — the ordinary path
      evidence complete → ready → draft
      still failing     → re-blocked with the new, truthful reason
```

**Terminality is not weakened for machines.** The worker's slice still selects
`declared`/`retrieval_failed` only; nothing automatic will ever touch a terminal
photograph. Terminality exists to stop unattended retry loops, not to forbid the
inventory's owner from saying "I fixed it, look again."

That distinction is **structural, not a promise**: the re-arm function has *no
actor-kind parameter*. It can record a dealer or nobody, it refuses non-owners,
and it refuses items that are not blocked. A worker cannot invoke it by mistake
because it cannot be anyone but the dealer.

The history reads in full afterwards:

```sql
select created_at, event_type, actor_kind, reason_code
  from dealer_accelerator_lifecycle_events
 where batch_item_id = '<item>' order by id;
-- declared → retrieval_failed/terminal → photograph_retry_requested:dealer
--   → photograph_retrieved → item_readied → item_draft_created
```

### ⚠ Why a snapshot bump is NOT the recovery lever

Tempting and wrong. `record_observation` identifies an observation by
`(source_item_id, observation_hash)` and refuses unless `observed_at`,
`adapter_version`, `source_version`, `snapshot_identity` and `continuity_state`
all match. Fixing photographs does not change the manifest, so bumping the
declared version produces *identical content claiming a different snapshot* —
`observation_hash_conflict`, correctly.

Two observations of the same content **can** coexist across different
authorization episodes, because those hang off different `source_item_id`s. They
cannot coexist within one source. If the content did not change, it is the same
observation, and the label claiming otherwise is the lie.

---

## The room shows the run, not merely the newest row

`buildDealerAcceleratorState` picks the newest batch that is **not cancelled**,
and computes `advanceable` with the same rule as
`dealer_accelerator_advanceable_batches`.

Both halves were once wrong together, and the result was convincing fiction: a
dealer's cancelled batch (1 item, dead) shadowed the real run holding 12 drafts
and one Needs Attention item, while its leftover `discovered` item counted as
live work — so the room rendered **"Preparing… 1 watch"** and polled a run that
nothing would ever advance. The Try Again button was in the deployed bundle the
whole time; the panel containing it was never rendered.

`failed` is deliberately **not** skipped — a fatal error is exactly what a dealer
must see. A cancelled batch surfaces only when the dealer has nothing else,
where "stopped, nothing published" is the truthful screen.

---

## Submit saves what the dealer is looking at

There is **no save-before-submit ceremony**. Submit persists the current
editable values and then runs the authoritative validation against exactly what
it persisted. Save Draft is optional and exists only for keeping unfinished work
to come back to.

The save is **unconditional**, and that is the point. It used to run
`if (dirty)`, which made correctness depend on a client-side flag noticing every
change. Any edit the flag missed — a nested photos mutation, a path that forgot
to call `edit()` — and the server would validate, transition, and **stamp the
fingerprint over a row the dealer was not looking at**: an attestation that
verifies perfectly and describes values nobody saw. That is the one failure this
whole attestation design exists to prevent, reachable through a UI bookkeeping
bug. The write is idempotent, so a submit with nothing changed simply rewrites
what is already there.

Ordering, and why each step is where it is:

- values persist **before** validation, so the server never judges a stale row;
- a failed save aborts the submit with its own message; the edits stay in the
  form; nothing is lost;
- a failed submit leaves the listing in `draft` with the just-saved edits
  durable, shows the server's sentence, **and** marks every outstanding item in
  place;
- the three confirmations live in React state and are untouched by the save, so
  ticks made before the automatic save survive it.

---

## The founder attention doorway

`app/admin/dealer-accelerator` — imported drafts in `pending_review`, oldest
first, linked from `/admin`.

It **adjudicates nothing**. Every row opens the existing governed review at
`/admin/listings/[id]`, which remains the sole decision authority. If a
decision control ever appears on that page, that is the mistake its header
comment exists to prevent. It exists because a dealer who submits and hears
nothing cannot tell "under review" from "lost", and the only way to find a
submission used to be remembering to hunt the global listing explorer.
