# Listing lifecycle events

*The machinery: `20260824110000_listing_lifecycle_events_round17.sql`.
Rollback beside it. Guards: `scripts/listing-lifecycle-events.test.sql`.*

---

## The misconception this file exists to kill

> **"`listing_decision_events` is the listing's lifecycle history."**

It is not, and it never claimed to be. That table records **adjudication** —
what a reviewer decided about a listing's merit. Its vocabulary is
`approved / rejected / clarification_requested / returned_to_draft`, every
adverse row is required to carry a seller-visible sentence, and it is
deliberately readable by the seller so `app/account/page.tsx` can render
"what happened, why, what next".

`listing_lifecycle_events` records **movement** — what state the listing
object actually entered, and when. Three types only:

| type | meaning |
|---|---|
| `BECAME_PUBLIC` | entered `published` |
| `BECAME_PRIVATE` | entered `private_active` — a visibility mode, **not** removal |
| `REMOVED` | the governed removal operation executed |

The direction of a visibility change is carried by `prior_status`, so
`BECAME_PRIVATE` with `prior_status = 'published'` **is** the public→private
proof, and `BECAME_PUBLIC` with `prior_status = 'private_active'` is the
private→public one. There is no separate event type for a direction.

A decision table can never be complete about state, because a state can move
without an adjudication. That is the gap this closes, and it is why the two
tables were not merged.

---

## Where the behaviour actually lives

**Nothing in the application ever writes this table.** Not the founder status
route, not the triage service, not `remove_listing()`, not the private
creation path, not Marketplace Control. Grepping the repository for the table
name finds this README and the test file and **no producer**. That is
correct, and it is the single fact most likely to cost someone an hour.

The producer is a database trigger on `listings.status`:

```
listings_lifecycle_event
  AFTER INSERT OR UPDATE OF status ON public.listings
  WHEN (NEW.status IN ('published','private_active','removed'))
  EXECUTE FUNCTION public.record_listing_lifecycle_event()
```

That placement is the whole design. `listings.status` has at least five
distinct writers today, reached through three privilege channels. A sixth
writer added next year inherits the history for free and cannot forget to
record it, and the event commits in the same transaction as the transition it
describes — so history and state can never disagree.

`INSERT` is in there because the conversation-led private path **creates** a
listing already in `private_active`. Without it, the most common way a
listing becomes private would leave no history at all.

---

## Properties that are load-bearing

**It fails closed.** `log_dealer_submission_event()` on this same table
swallows its own exceptions, and that is right for an optional audit line
that needs a batch context two real listings do not have. This one is the
opposite case: a silently dropped event reproduces the exact defect the round
exists to close, invisibly. A lifecycle transition whose history cannot be
recorded does not happen.

**It has no foreign key.** Measured, not assumed — in production
`listing_decision_events` also carries none on `listing_id`, which is why the
Stage 8 purge lists it among the "fully durable" tables. *Why did this watch
leave the market* must outlive the row it is about:
`delete_listing_permanently()` physically deletes the listing, and a CASCADE
would erase the removal reason at the exact moment it becomes unrecoverable.
A RESTRICT would be worse — it would break the governed purge.

**Append-only is enforced, not intended.** `UPDATE` and `DELETE` both raise
`listing_lifecycle_history_is_append_only`, for every role including the
owner. Blocking `DELETE` is only safe *because* there is no foreign key —
nothing cascades in, so the purge never issues a delete here. Those two
decisions are one decision.

**History is produced, never authored.** `service_role` holds `SELECT` and
nothing else; there is no `INSERT` grant for anybody. The definer trigger is
the only writer that exists.

**`actor_source` is a channel, not a role.** `auth.uid()` is NULL for the
founder route and the triage service — both write through the service client,
which carries no end-user identity into the database. So the column says
`service_role` / `seller_session` / `other_session`, which is what the
database can establish first-hand. *Who decided* is
`listing_decision_events`' job, not this table's.

**The removal reason has no CHECK of its own.** `remove_listing()` remains
the taxonomy authority. Duplicating the vocabulary here would mean that
widening it later silently broke removals against a stale copy.

---

## Deliberately not built

- **No API, no route, no UI, no view.** RLS is on with zero policies. This is
  source truth; the first consumer is a separate job.
- **No backfill — not one row.** Every pre-existing publication is already
  durable in `listing_decision_events`; copying it would manufacture a second
  authority for a fact that already has one. The legacy `private_active` and
  `removed` rows have no durable source at all, and their history could only
  be reconstructed from `status`, `removed_at` or `updated_at` — the exact
  inference that is forbidden. They stay honestly unknown.
- **No new transition.** `published → private_active` and `private_active →
  published` are **not reachable product paths today**: the publication gate
  requires `prior_status = 'pending_review'`. The producer records them
  structurally if a governed path is ever built. Do not read the presence of
  the event type as evidence the path exists.
- **No `became_reserved` / `returned_to_draft` type.** Those movements are
  already durable in `listing_decision_events` or in the accept RPC's own
  transaction record.
- **Passport was not changed.** `lib/passport/watchPassport.ts` still reads
  `listing_decision_events`. Adopting this table is a future consumer's job.

---

## Verify current state

```sql
-- Is the producer attached, and what does it fire on?
select pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where c.relname = 'listings' and t.tgname = 'listings_lifecycle_event';

-- What lifecycle history exists, by shape?
select event_type, prior_status, resulting_status, actor_source,
       removal_reason_code, count(*)
  from public.listing_lifecycle_events
 group by 1,2,3,4,5 order by 6 desc;

-- Listings in a tracked state with NO governed lifecycle event.
-- Every legacy row appears here by design; a row created AFTER the
-- producer landed appearing here is a real defect.
select l.public_code, l.status, l.created_at
  from public.listings l
 where l.status in ('published','private_active','removed')
   and not exists (select 1 from public.listing_lifecycle_events e
                    where e.listing_id = l.id)
 order by l.created_at desc;

-- Removal history that outlived its listing (expected, not a leak).
select e.listing_id, e.removal_reason_code, e.occurred_at
  from public.listing_lifecycle_events e
 where e.event_type = 'REMOVED'
   and not exists (select 1 from public.listings l where l.id = e.listing_id);
```

## Behavioural proof

The shape guards in `scripts/listing-lifecycle-events.test.sql` are read-only
and safe against production. The behavioural proofs — became public, public to
private, private to public, governed removal carrying `listing_mistake`,
append-only refusal of `UPDATE` and `DELETE`, survival of the permanent
purge, and the re-save that records nothing — are exercised against a
disposable listing inside a transaction that is **rolled back**. No real
listing's provenance may be contaminated to demonstrate machinery, and the
history cannot be deleted afterwards to tidy up.
