-- Listing lifecycle event completeness — shape, access, and separation guards.
--
-- READ-ONLY BY CONSTRUCTION. Writes nothing, creates no fixture, re-runs no
-- migration. Safe against production.
--
-- The behavioural proofs — became public, public to private, private to
-- public, governed removal carrying listing_mistake, append-only refusal of
-- UPDATE and DELETE, survival of the permanent purge, and the re-save that
-- records nothing — are exercised separately against a disposable listing
-- inside a transaction that is rolled back, because proving them requires
-- producing lifecycle history and no real listing's provenance may be
-- contaminated to demonstrate machinery.
--
-- What this file guards is the shape that makes those behaviours possible,
-- and the boundary that keeps this table from becoming something else.

\echo '── listing lifecycle event producer contract ─────────────────────'

select 'append-only lifecycle table exists' as assertion,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='listing_lifecycle_events') = 1 as passed;

select 'the vocabulary is exactly the three governed transitions' as assertion,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.listing_lifecycle_events'::regclass
      and conname='lle_event_type_check')
  like '%BECAME_PUBLIC%BECAME_PRIVATE%REMOVED%' as passed;

select 'the event type can never disagree with the state it claims' as assertion,
  exists (select 1 from pg_constraint
    where conrelid='public.listing_lifecycle_events'::regclass
      and conname='lle_type_matches_state_check') as passed;

select 'a reason code may exist only on a removal' as assertion,
  exists (select 1 from pg_constraint
    where conrelid='public.listing_lifecycle_events'::regclass
      and conname='lle_reason_only_on_removal_check') as passed;

select 'a re-save of the same state cannot be recorded as a movement' as assertion,
  exists (select 1 from pg_constraint
    where conrelid='public.listing_lifecycle_events'::regclass
      and conname='lle_real_transition_check') as passed;

select 'prior_status is nullable — a listing created private has no prior state' as assertion,
  (select is_nullable from information_schema.columns
    where table_schema='public' and table_name='listing_lifecycle_events'
      and column_name='prior_status') = 'YES' as passed;

select 'the reason code carries no second taxonomy of its own' as assertion,
  not exists (select 1 from pg_constraint
    where conrelid='public.listing_lifecycle_events'::regclass
      and pg_get_constraintdef(oid) ilike '%removal_reason_code%'
      and pg_get_constraintdef(oid) ilike '%sold_elsewhere%') as passed;

select 'no foreign key — history outlives the governed permanent purge' as assertion,
  (select count(*) from pg_constraint
    where conrelid='public.listing_lifecycle_events'::regclass and contype='f') = 0 as passed;

select 'history is append-only — UPDATE and DELETE refused at the row' as assertion,
  exists (select 1 from pg_trigger
    where tgrelid='public.listing_lifecycle_events'::regclass
      and tgname='listing_lifecycle_events_immutable' and not tgisinternal) as passed;

select 'ordering is deterministic — the identity column indexes per listing' as assertion,
  exists (select 1 from pg_class
    where relname='listing_lifecycle_events_listing_idx') as passed;

\echo '── the producer sits on the column, not in a route ───────────────'

select 'the producer is a trigger on listings.status' as assertion,
  exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='listings' and t.tgname='listings_lifecycle_event'
      and not t.tgisinternal) as passed;

select 'it covers creation as well as transition' as assertion,
  (select pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='listings' and t.tgname='listings_lifecycle_event')
  ilike '%AFTER INSERT OR UPDATE OF status%' as passed;

select 'it fires for exactly the three tracked states' as assertion,
  (select pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='listings' and t.tgname='listings_lifecycle_event')
  ilike '%published%private_active%removed%' as passed;

select 'the producer is definer, because nothing may author this table' as assertion,
  (select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='record_listing_lifecycle_event') as passed;

select 'no client role can invoke the producer or the append-only guard' as assertion,
  (select bool_and(not (has_function_privilege('anon', p.oid, 'execute')
                     or has_function_privilege('authenticated', p.oid, 'execute')))
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('record_listing_lifecycle_event',
                        'listing_lifecycle_events_are_append_only')) as passed;

\echo '── source truth, not a consumer ──────────────────────────────────'

select 'row level security is on with zero policies' as assertion,
  (select relrowsecurity from pg_class
    where oid='public.listing_lifecycle_events'::regclass)
  and (select count(*) from pg_policies
    where schemaname='public' and tablename='listing_lifecycle_events') = 0 as passed;

select 'no client role holds any privilege on lifecycle history' as assertion,
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name='listing_lifecycle_events'
      and grantee in ('anon','authenticated')) = 0 as passed;

select 'history is produced, never authored — service_role holds SELECT only' as assertion,
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name='listing_lifecycle_events'
      and grantee='service_role' and privilege_type <> 'SELECT') = 0 as passed;

select 'this round created no view over lifecycle history' as assertion,
  not exists (select 1 from information_schema.views
    where table_schema='public' and view_definition ilike '%listing_lifecycle_events%') as passed;

\echo '── the two histories stay separate ───────────────────────────────'

select 'the adjudication vocabulary was not widened' as assertion,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.listing_decision_events'::regclass
      and conname='lde_decision_check')
  = E'CHECK ((decision = ANY (ARRAY[\'approved\'::text, \'rejected\'::text, \'clarification_requested\'::text, \'returned_to_draft\'::text])))' as passed;

select 'the seller-message rule on adverse decisions still stands' as assertion,
  exists (select 1 from pg_constraint
    where conrelid='public.listing_decision_events'::regclass
      and conname='lde_seller_message_required_check') as passed;

select 'no removal reason ever leaked into the adjudication log' as assertion,
  not exists (select 1 from public.listing_decision_events
    where resulting_status = 'removed') as passed;

\echo '── no guessed backfill ───────────────────────────────────────────'

-- Every lifecycle row must have been produced by a real transition after the
-- producer existed. A backfilled row would be older than the trigger.
select 'no lifecycle event predates the producer' as assertion,
  not exists (
    select 1 from public.listing_lifecycle_events
    where occurred_at < '2026-08-24 11:00:00+00'::timestamptz) as passed;

-- The legacy rows this round deliberately left unknown. Their history was
-- never reconstructed from current status, removed_at, or updated_at.
select 'legacy private and removed rows were left honestly unknown' as assertion,
  not exists (
    select 1 from public.listings l
    where l.status in ('private_active','removed')
      and l.created_at < '2026-08-24 11:00:00+00'::timestamptz
      and exists (select 1 from public.listing_lifecycle_events e
                   where e.listing_id = l.id)) as passed;
