# Public Watch Index — internal projection (Phase 1 + P7 + P6)

**Governing authority:** [`docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md`](../../docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md), adopted v2, locked 2026-09-09. Section numbers below refer to it. The law governs; this README explains the machinery and records what will age.

---

## The misconception this file exists to kill

> "The four answers are four buckets, so one of them is the record's status."

They are not buckets. They are **four independent assertions** about one canonical reference, and none stands in for another (§3):

1. **Approved public reference knowledge** — is there reference information approved for public representation?
2. **Public listing history** — is a qualifying public publication episode durably evidenced and permitted?
3. **Available now** — is there a qualifying public offering right now?
4. **Market Evidence** — does a reference-linked record pass the existing governed public Market Evidence gate?

All four can be true at once. Collapsing them into one status is the failure the contract was written to prevent. A related trap: **evidence from an auction is not an FWT listing, and a listing is not proof of a sale.**

## The second misconception

> "The index is a table, so building it means writing rows."

Nothing in `lib/publicWatchIndex/` writes. It is a *derived* representation recomputed from governed sources on every call (§12), which is also why a suppression can never be outrun by a rebuild. There is no history ledger, no cache, and no backfill. The one write anywhere in this seam is a database trigger that freezes the reference at the publication boundary — see the history section below.

## Where the behaviour actually lives

| Concern | Where |
|---|---|
| The four assertion vocabularies and every rule that decides them | `projection.ts` — pure, no database, executable under plain Node |
| Which client reads what, and why | `projectionSource.ts` |
| Suppression enforcement against every client role | the database: RLS enabled with **zero policies**, writers `service_role`-only |
| Founder authority for suppression | `app/api/admin/public-watch-index/suppressions/route.ts` — carries authority, does not enforce |
| Admission into current availability | the `public_discovery_listings` view — never re-derived here |
| Market Evidence admission | `market_evidence_for_reference(uuid)` — consumed, never reimplemented |
| The reference spine | `vault_references.id`, reached through `vault_galaxy_references` |
| Durable publication episodes | `listing_lifecycle_events` (`BECAME_PUBLIC`) — not written here |
| Episode → reference association | `public_watch_index_episode_reference`, bound by a trigger at the publication boundary |
| Authority to state knowledge publicly | `public_watch_index_reference_knowledge_approval` — the knowledge content is never read |
| Founder authority for approval | `app/api/admin/public-watch-index/reference-knowledge/route.ts` |

## Three-valued, always

Every assertion distinguishes an affirmative fact, a successful complete check that did not establish it, and a check that could not be completed (§3). That is why nothing returns a bare boolean. Two consequences people get backwards:

- **An incomplete retrieval that returned nothing is not a negative** (§4). An empty partial page reports `availability_unavailable`, not "none".
- **`not_established_within_coverage` never means "FWT has never listed this reference."** It means a complete evaluation of the approved public coverage found no qualifying record.

## Approved public reference knowledge — closed by P6

*(This section described a missing authority until P6, v8.37. It now describes the authority.)*

> **The misconception:** "There is a `reference_knowledge` row for this reference, so FairWatchTrade has public reference knowledge about it."

Possessing knowledge and being permitted to state it publicly are different facts. §3 admits only information *approved for public representation* and says plainly that a knowledge row alone does not qualify. Galaxy visibility does not qualify either — it is a brand-boundary presentation decision the Galaxy Publication Law forbids reading downward.

**The authority is a satellite, not a column.** `public_watch_index_reference_knowledge_approval` is keyed to the canonical reference and holds the approving actor, the time, an internal reason, an optional approved destination, and the revocation history. Bolting `approved = true` onto the generated content would have made content possession equal publication permission — the same conflation, rebuilt in a column.

**`reference_knowledge` is still never read here, and that is the point.** Because the reader cannot observe the knowledge content at all, its answer is identical whether internal knowledge exists or not. Hidden existence cannot leak through a positive, a special negative, a distinctive error, coverage wording or metadata, because no code path can see it.

**A destination is optional** (§7, "approved destination when one exists"). Approval alone is the authority; no URL is ever invented to complete one.

### Revocation and no resurrection

Approval is publication authority, not immutable fact. A revoked approval is **retired, never deleted**, and the positive assertion disappears on the projection's next read because the assertion is resolved from the authority every time.

Nothing can resurrect it: there is **no automatic producer of an approval anywhere** — no trigger, no derivation, no compile step. A knowledge row that still exists cannot bring one back. The only way an approval returns is another explicit founder act, and the test pins the absence of any trigger in that migration.

Internal knowledge is untouched by revocation and remains under its own rules.

### Exposure hardening performed in P6

`reference_knowledge` carried a policy literally named **"readable by anyone"** with `USING (true)`, plus `SELECT` and `INSERT` grants to `anon` and `authenticated`. Any client could read every row, so an unapproved row would have become public merely by existing — and its existence would have been observable.

Verified before narrowing: **nothing in the product reads that table.** Its only writer is `lib/research/compileReferenceKnowledge.ts`, which holds the service client and bypasses RLS. The policy and the client grants are gone; RLS stays enabled with zero policies. No legitimate internal use was destroyed.

### Public listing history — closed by P7 for future publications

*(This section described a missing mechanism until P7, v8.36. It now describes the mechanism.)*

Two proofs, never one:

- **§5 condition 2 — genuine publication.** `listing_lifecycle_events` records a `BECAME_PUBLIC` row per genuine publication, append-only, written by `record_listing_lifecycle_event()`. That trigger is the **sole producer** of a public episode and emits one only when `listings.status` becomes `published`, so every publishing path passes through it and `BECAME_PRIVATE` / `REMOVED` can never masquerade as one.
- **§5 condition 3 — reference association.** `public_watch_index_episode_reference` binds that episode to a canonical reference, written by a trigger on the episode itself.

**The temporal distinction is the whole design, and it is the thing to get right.**

> At the publication moment, `listings.vault_reference_id` **is** the governed server-side resolution for that publication, and capturing it then is evidence. After that moment it is only mutable current state, and nothing may ever re-derive a historical association from it again.

So the reader's episode set comes **entirely** from the association table and never from `listings`. Change a listing's reference today and its old episode does not move — proven on production.

**Unresolved is a real answer.** If the reference cannot be resolved at publication time the binder records nothing, guesses nothing, and — critically — **refuses nothing**: an otherwise valid marketplace publication is never blocked because the index cannot establish historical identity.

**Not backfilled.** Thirteen episodes predate the binder. They carry no association and were deliberately left alone; only a governed correction can resolve one, with evidence.

### Correction, withdrawal, and the thing they are not

Corrections are **append/supersede**. A correction retires the prior row as `superseded` and appends the new one with a `supersedes_id` link; the original publication evidence is never rewritten and the superseded association stays auditable forever.

**Withdrawal is not suppression, and confusing them loses the distinction the law is built on:**

| | Withdrawal | Suppression |
|---|---|---|
| Says | we no longer defensibly know *which reference* this episode belonged to | we are not *permitted to publish* this contribution |
| Kind of statement | evidence | permission |
| Lives in | `public_watch_index_episode_reference` | `public_watch_index_suppressions` |
| Undone by | a governed correction re-establishing an association | an explicit authorized reversal plus a live eligibility check |

Withdrawal is what §2 demands when a correction *cannot* be defensibly tied to the episode: the exact-reference contribution goes away rather than moving to today's row value.

### The mistake gate

An episode whose **very next** lifecycle event ended it as `REMOVED` with `removal_reason_code = 'listing_mistake'` is not provenance (§5 condition 5). Derived at read time rather than stored, so a later correction to the reason code is honoured immediately. A brief genuine publication is not automatically a mistake, and a long-lived test is not automatically real — evidence and governed reason codes decide.

## Suppression and no-resurrection (§8)

Four rules, made mechanical:

1. **Founder only, server side.** No client role may touch the table. The founder gate is in the route; the writers are `service_role`-only. Same split as v8.31 dealer admission.
2. **No resurrection by refresh.** A live suppression is publication authority. The projection reads it on every call. Re-reading the original source is not reinstatement.
3. **Reassociation cannot evade it.** A contribution-scoped suppression is keyed on the **contribution**, and the reader fetches contribution-scoped rows for *any* reference whose contribution now resolves here. `vault_reference_id` records what the decision was about; it is not what has to still match.
4. **Re-admission is two acts.** An explicit recorded reversal **and** a successful eligibility check at projection time. A reversal alone re-admits nothing.

**Fail closed.** If suppressions cannot be read, every dimension collapses to unavailable rather than risking the re-admission of a suppressed contribution.

**Private forever.** Actor, reason, time and scope are recorded internally and never published. The projection is only ever told *whether* a live suppression covers a scope.

## What is deliberately NOT built

- **No public endpoint, no manifest advertisement, no robots change.** Phase 1 is internal. §10's `/.well-known/fwt-watch-index.json` is a possible name, not an adopted route.
- **No historical backfill**, and no inference of history from a timestamp or a mutable row.
- **No seller or buyer identity, for individuals or dealers** (§8). The record type has no field for it, and the availability read selects only listing ids from the view — `seller_display_name` and `seller_slug` are never selected.
- **No aggregate counts, current or historical** (§4, §7). Links are offerings; their number is not an existence, rarity, scarcity or supply figure. Count omission is not a claim that a consumer cannot count returned links.
- **No physical-watch identifiers, serials, equality tokens, owner identifiers or pseudonyms** (§2). The Passport is a separate founder-only product and is not published here.
- **No prices, outcomes, event dates, historical listing codes or URLs, photographs, seller prose, or review findings** (§7).
- **No FK from `contribution_listing_id` to `listings`.** The decision must survive the listing's deletion, and listings already carries an open permanent-delete blocker where a 3-hop cascade meets a NO ACTION foreign key. Another RESTRICT edge would deepen it.
- **No new index identity.** The spine is `vault_references.id` (P5). A future public wire identifier is a transport decision, not a second reference identity.

## Traps

- **`is_current` is mandatory on the approval read too**, for the same reason: a revoked approval would otherwise read as live authority.
- **`is_current` is mandatory on every association read.** The table is append-and-retire; without that filter superseded and withdrawn associations read as live evidence. Same trap as `auction_evidence_result` and `physical_watch_identifier_observations`.
- **Suppression candidates must include the historical episodes' listings, not only the eligible ones.** A contribution-scoped suppression follows its contribution across reassociation, so omitting the historical half would let a reassociated episode slip past a live decision.
- **`assessedOn` is a UTC calendar day, never an event time** (§12). It is the date of an actual successful public-scope assessment — not a publication, reservation, removal or transaction date. A day-granular date is not a daily-refresh permission or a freshness guarantee, and it does not stop an observer from timing their own requests.
- **Read availability as anon, never as the session.** `listings_select_public_or_own` widens for a signed-in seller, so a cookie-bound client would let a seller's own drafts into a projection meant to compute what is *publicly* true.
- **The view decides eligibility; this code never does.** Reaching past `public_discovery_listings` for "just one more field" reintroduces the leak it prevents. The second read supplies only the reference edge for rows already admitted.
- **Suppressed and absent must look identical.** A suppressed reference with no other contribution reports exactly what a reference with no history reports. Never add a distinguishing state, error or coverage message — §13 requires that hidden existence be indistinguishable from otherwise identical public inputs.
- **"Previously Listed" has three conditions, not one.** History established, availability *successfully and completely* checked, and no current qualifying listings. If availability is unavailable, the permitted sentence says so instead of implying availability ended.

## Verify current state

```bash
# the whole law, executed against in-memory rows
node scripts/public-watch-index.test.mjs
```

```sql
-- suppression seam: denied to every client role, writers service_role-only
select relrowsecurity from pg_class where oid='public.public_watch_index_suppressions'::regclass;
select count(*) from pg_policies where schemaname='public' and tablename='public_watch_index_suppressions';
select proname, array_to_string(proacl,' | ') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and proname like 'public_watch_index%';

-- P7: the binder is installed on the one governed publication boundary
select tgname from pg_trigger where tgrelid='public.listing_lifecycle_events'::regclass
 and tgname='public_watch_index_bind_episode_reference';

-- P7: how much history the seam can speak for (unassociated = pre-seam episodes)
select count(*) filter (where a.id is null)     as unassociated_episodes,
       count(*) filter (where a.id is not null) as associated_episodes
  from public.listing_lifecycle_events e
  left join public.public_watch_index_episode_reference a
         on a.episode_id = e.id and a.is_current
 where e.event_type = 'BECAME_PUBLIC';

-- P6: reference_knowledge is closed to every client role (expect 0 / false / false)
select (select count(*) from pg_policies
         where schemaname='public' and tablename='reference_knowledge') as policies,
       has_table_privilege('anon','public.reference_knowledge','SELECT')          as anon_read,
       has_table_privilege('authenticated','public.reference_knowledge','SELECT') as authed_read,
       has_table_privilege('service_role','public.reference_knowledge','INSERT')  as compiler_still_writes;

-- P6: which references currently carry live public-knowledge authority
select vault_reference_id, approved_at, public_destination
  from public.public_watch_index_reference_knowledge_approval
 where is_current;
```
