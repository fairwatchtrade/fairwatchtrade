-- Exact-watch resolution — schema, access, and non-conclusion guards.
--
-- READ-ONLY BY CONSTRUCTION. Writes nothing, re-runs no migration, creates
-- no fixture. Safe against production.
--
-- The behavioural proofs (transitive closure, derived conflict, retirement
-- and remint, retraction discipline, candidate suppression) are exercised
-- separately against disposable beads inside rolled-back transactions,
-- because proving them requires writing decisions and no real watch history
-- may be contaminated to demonstrate machinery.
--
-- What this file guards is the shape that makes those behaviours possible:
--   · one canonical linear history per unordered pair;
--   · history that cannot be edited, only appended to;
--   · a watermark that is a real committed total order, not a clock;
--   · beads that cannot be deleted by a resolution;
--   · no client role anywhere near any of it.

\echo '── exact-watch resolution contract ───────────────────────────────'

select 'append-only decision log exists' as assertion,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='physical_watch_resolution_decisions') = 1 as passed;

select 'canonical pair ordering is database-enforced' as assertion,
  exists (select 1 from pg_constraint
    where conrelid='public.physical_watch_resolution_decisions'::regclass
      and conname='decision_pair_is_canonical') as passed;

select 'self-pairs are impossible' as assertion,
  exists (select 1 from pg_constraint
    where conrelid='public.physical_watch_resolution_decisions'::regclass
      and conname='decision_no_self_pair') as passed;

select 'exactly one root history per canonical pair' as assertion,
  exists (select 1 from pg_class where relname='decision_one_root_per_pair' and relkind='i') as passed;

select 'supersession cannot fork' as assertion,
  exists (select 1 from pg_class where relname='decision_supersedes_once' and relkind='i') as passed;

select 'a retraction must supersede something and must state why' as assertion,
  (select count(*) from pg_constraint
    where conrelid='public.physical_watch_resolution_decisions'::regclass
      and conname in ('decision_retraction_needs_reason','decision_retraction_must_supersede')) = 2 as passed;

select 'history is append-only — UPDATE and DELETE are refused' as assertion,
  exists (select 1 from pg_trigger
    where tgrelid='public.physical_watch_resolution_decisions'::regclass
      and tgname='physical_watch_decisions_immutable' and not tgisinternal) as passed;

select 'no is_current flag exists on decisions — currentness is derived' as assertion,
  not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='physical_watch_resolution_decisions'
      and column_name='is_current') as passed;

select 'CONFLICTED is not a storable outcome' as assertion,
  not exists (
    select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typname='watch_resolution_outcome' and e.enumlabel in ('CONFLICTED','PROBABLE_LINK')
  ) as passed;

select 'immutable beads cannot be deleted by a resolution' as assertion,
  (select bool_and(confdeltype='r') from pg_constraint
    where conrelid='public.physical_watch_resolution_decisions'::regclass
      and confrelid='public.physical_watches'::regclass) as passed;

select 'the watermark is sequence-backed, not a clock or a row count' as assertion,
  exists (select 1 from pg_class
    where relname='watch_resolution_generation_seq' and relkind='S') as passed;

select 'resolved identities carry mint and retirement generations' as assertion,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='resolved_watches'
      and column_name in ('minted_generation','retired_generation','retired_at')) = 3 as passed;

select 'a bead has at most one current resolved membership' as assertion,
  exists (select 1 from pg_constraint
    where conrelid='public.resolved_watch_members'::regclass and contype='p') as passed;

select 'no authoritative resolved pointer was written onto listings or beads' as assertion,
  not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name in ('listings','physical_watches')
      and column_name ilike '%resolved%') as passed;

select 'row level security is on for every resolution table' as assertion,
  (select bool_and(relrowsecurity) from pg_class
    where relname in ('physical_watch_resolution_decisions','resolved_watches',
                      'resolved_watch_members','resolved_watch_membership_state')) as passed;

select 'no policy exists — client roles are denied by default' as assertion,
  (select count(*) from pg_policies where schemaname='public'
    and tablename in ('physical_watch_resolution_decisions','resolved_watches',
                      'resolved_watch_members','resolved_watch_membership_state')) = 0 as passed;

select 'anon and authenticated hold no privilege on any resolution table' as assertion,
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated')
      and table_name in ('physical_watch_resolution_decisions','resolved_watches',
                         'resolved_watch_members','resolved_watch_membership_state',
                         'physical_watch_decision_heads','physical_watch_effective_decisions')) = 0 as passed;

select 'no client role can adjudicate identity' as assertion,
  (select bool_and(not (has_function_privilege('anon', p.oid, 'execute')
                     or has_function_privilege('authenticated', p.oid, 'execute')))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('adjudicate_physical_watch_pair','resolve_physical_watch',
                        'physical_watch_identifier_candidates','reconcile_resolved_watches',
                        'rebuild_resolved_watch_membership')) as passed;
