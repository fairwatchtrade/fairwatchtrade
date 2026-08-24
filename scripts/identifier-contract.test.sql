-- Sensitive identifier contract — schema, access, and non-conclusion guards.
--
-- READ-ONLY BY CONSTRUCTION. Unlike the batch-spine test, this file writes
-- nothing, re-runs no migration, and is therefore safe to execute against
-- production. It asserts the shape of the contract, not the behaviour of a
-- fixture.
--
-- What it is guarding, in one line each:
--   · identifier evidence lives on the physical watch, never on a listing;
--   · the parent cannot be deleted out from under the evidence;
--   · no client role can read the table, the token, or an existence bit;
--   · V1 stores no recoverable raw value, and the schema enforces it;
--   · the equality token is NOT unique, so the database can never imply
--     that two watches sharing a token are one watch.

\echo '── sensitive identifier contract ─────────────────────────────────'

select
  'observation table exists with a physical-watch parent' as assertion,
  count(*) = 1 as passed
from information_schema.tables
where table_schema = 'public'
  and table_name = 'physical_watch_identifier_observations';

select
  'evidence is keyed to the physical watch, never to a listing' as assertion,
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'physical_watch_identifier_observations'
       and column_name in ('listing_id', 'seller_id')
  ) as passed;

select
  'no serial/case/movement column leaked onto listings or physical_watches' as assertion,
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name in ('listings', 'physical_watches')
       and (column_name ilike '%serial%'
         or column_name ilike '%case_number%'
         or column_name ilike '%movement_number%'
         or column_name ilike '%equality_token%')
  ) as passed;

select
  'parent physical watch cannot be deleted out from under evidence' as assertion,
  confdeltype = 'r' as passed
from pg_constraint
where conrelid = 'public.physical_watch_identifier_observations'::regclass
  and confrelid = 'public.physical_watches'::regclass;

select
  'submitter identity detaches on account deletion rather than cascading' as assertion,
  count(*) = 2 and bool_and(confdeltype = 'n') as passed
from pg_constraint
where conrelid = 'public.physical_watch_identifier_observations'::regclass
  and confrelid = 'auth.users'::regclass;

select
  'row level security is on' as assertion,
  relrowsecurity as passed
from pg_class
where oid = 'public.physical_watch_identifier_observations'::regclass;

select
  'no policy exists — RLS denies every client role by default' as assertion,
  count(*) = 0 as passed
from pg_policies
where schemaname = 'public'
  and tablename = 'physical_watch_identifier_observations';

select
  'anon and authenticated hold no privilege of any kind' as assertion,
  count(*) = 0 as passed
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'physical_watch_identifier_observations'
  and grantee in ('anon', 'authenticated');

select
  'the write RPC is not reachable by any client role' as assertion,
  not (
    has_function_privilege('anon', p.oid, 'execute')
    or has_function_privilege('authenticated', p.oid, 'execute')
  ) as passed
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'record_identifier_observation';

select
  'V1 cannot store a recoverable raw value — enforced, not promised' as assertion,
  exists (
    select 1 from pg_constraint
     where conrelid = 'public.physical_watch_identifier_observations'::regclass
       and conname = 'identifier_observation_protected_value_unused_in_v1'
  )
  and not exists (
    select 1 from public.physical_watch_identifier_observations
     where protected_value is not null
  ) as passed;

select
  'the equality token is NOT unique — the DB cannot imply a merge' as assertion,
  not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where i.indrelid = 'public.physical_watch_identifier_observations'::regclass
      and i.indisunique
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = i.indrelid
          and a.attnum = any (i.indkey::smallint[])
          and a.attname = 'equality_token'
      )
  ) as passed;

select
  'a correction chain has exactly one current head' as assertion,
  exists (
    select 1 from pg_class
    where relname = 'identifier_observations_one_current_per_chain'
  ) as passed;

select
  'observed time and recorded time are separate facts' as assertion,
  count(*) = 2 as passed
from information_schema.columns
where table_schema = 'public'
  and table_name = 'physical_watch_identifier_observations'
  and column_name in ('observed_at', 'recorded_at');

select
  'both versions are persisted per observation' as assertion,
  count(*) = 2 as passed
from information_schema.columns
where table_schema = 'public'
  and table_name = 'physical_watch_identifier_observations'
  and column_name in ('normalization_version', 'token_key_version');

select
  'no same-watch conclusion exists anywhere in the schema' as assertion,
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and (column_name ilike '%same_watch%'
         or column_name ilike '%confirmed_same%'
         or column_name ilike '%probable_link%')
  ) as passed;

select
  'caller-supplied free text cannot persist — enforced, not promised' as assertion,
  exists (
    select 1 from pg_constraint
     where conrelid = 'public.physical_watch_identifier_observations'::regclass
       and conname = 'identifier_observation_source_reference_unused_in_v1'
  )
  and not exists (
    select 1 from public.physical_watch_identifier_observations
     where source_reference is not null
  ) as passed;
