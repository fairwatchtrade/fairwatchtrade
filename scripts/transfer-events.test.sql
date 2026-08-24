-- Transfer event producer — schema, access, and non-inference guards.
--
-- READ-ONLY BY CONSTRUCTION. Writes nothing, creates no fixture, re-runs no
-- migration. Safe against production.
--
-- The behavioural proofs — recipient confirmation, founder assertion,
-- sender refusal, idempotency, retraction, later re-transfer, partial
-- transfer, cascade refusal — are exercised separately against disposable
-- deals inside rolled-back transactions, because proving them requires
-- writing transfer history and no real watch history may be contaminated to
-- demonstrate machinery.
--
-- What this file guards is the shape that makes those behaviours possible.

\echo '── transfer event producer contract ──────────────────────────────'

select 'append-only transfer event table exists' as assertion,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='physical_watch_transfer_events') = 1 as passed;

select 'event vocabulary is exactly TRANSFERRED / TRANSFER_RETRACTED' as assertion,
  (select count(*) = 2 and bool_and(enumlabel in ('TRANSFERRED','TRANSFER_RETRACTED'))
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'physical_watch_transfer_event_type') as passed;

select 'no sender-only class, and no verified/platform_verified claim' as assertion,
  (select count(*) = 2 and bool_and(enumlabel in ('party_confirmed_recipient','founder_asserted'))
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'physical_watch_transfer_provenance') as passed;

select 'the event stamps a 06D generation' as assertion,
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='physical_watch_transfer_events'
      and column_name='decision_generation') as passed;

select 'and stores neither a resolved id nor a conflict flag' as assertion,
  not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='physical_watch_transfer_events'
      and (column_name ilike '%resolved%' or column_name ilike '%conflict%')) as passed;

select 'every reference is RESTRICT — evidence cannot be cascade-deleted' as assertion,
  (select bool_and(confdeltype = 'r') from pg_constraint
    where conrelid = 'public.physical_watch_transfer_events'::regclass and contype = 'f') as passed;

select 'a retraction must supersede, and a transfer must not' as assertion,
  (select count(*) = 2 from pg_constraint
    where conrelid = 'public.physical_watch_transfer_events'::regclass
      and conname in ('transfer_retraction_supersedes','transfer_forward_does_not_supersede')) as passed;

select 'no naive UNIQUE on the leg — a corrected later transfer stays possible' as assertion,
  not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
    where i.indrelid = 'public.physical_watch_transfer_events'::regclass
      and i.indisunique and c.relname like '%leg%') as passed;

select 'retry safety is structural — idempotency key is unique' as assertion,
  exists (select 1 from pg_class where relname = 'transfer_events_idempotency_key_idx') as passed;

select 'history is append-only — UPDATE and DELETE refused' as assertion,
  exists (select 1 from pg_trigger
    where tgrelid = 'public.physical_watch_transfer_events'::regclass
      and tgname = 'transfer_events_immutable' and not tgisinternal) as passed;

select 'a listing bead cannot be rewritten once set' as assertion,
  exists (select 1 from pg_trigger
    where tgrelid = 'public.listings'::regclass
      and tgname = 'listings_physical_watch_id_immutable' and not tgisinternal) as passed;

select 'leg_status transferred cannot be authored outside the seam' as assertion,
  exists (select 1 from pg_trigger
    where tgrelid = 'public.trade_deal_legs'::regclass
      and tgname = 'trade_leg_transferred_guard' and not tgisinternal) as passed;

select 'row level security is on with zero policies' as assertion,
  (select relrowsecurity from pg_class
    where oid = 'public.physical_watch_transfer_events'::regclass)
  and (select count(*) from pg_policies
    where schemaname='public' and tablename='physical_watch_transfer_events') = 0 as passed;

select 'no client role holds any privilege on transfer history' as assertion,
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated')
      and table_name in ('physical_watch_transfer_events','physical_watch_live_transfers')) = 0 as passed;

select 'no client role can invoke the governed seam or the resolver' as assertion,
  (select bool_and(not (has_function_privilege('anon', p.oid, 'execute')
                     or has_function_privilege('authenticated', p.oid, 'execute')))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('record_physical_watch_transfer_event',
                        'recompute_trade_transfer_status',
                        'resolve_physical_watch_as_of')) as passed;

select 'the leg cache never disagrees with live event truth' as assertion,
  not exists (
    select 1 from public.trade_deal_legs l
    where (l.leg_status = 'transferred') <> exists (
      select 1 from public.physical_watch_live_transfers t where t.trade_deal_leg_id = l.id)
  ) as passed;
