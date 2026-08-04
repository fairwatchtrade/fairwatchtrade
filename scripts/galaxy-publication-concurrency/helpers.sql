-- ════════════════════════════════════════════════════════════════════════
-- GALAXY CONCURRENCY PROOF — DISPOSABLE BRANCH-LOCAL HELPERS
-- scripts/galaxy-publication-concurrency/helpers.sql
--
-- Applied AFTER fixture.sql and the Galaxy publication migration, on the
-- DISPOSABLE branch only. Nothing here is ever a production object.
--
-- What it installs:
--   · timed lock-holding wrappers around the operator functions, so one
--     HTTP session can HOLD the serialization advisory lock while another
--     attempts an operation (the lock is transaction-scoped and re-entrant,
--     so the wrapped operator call re-acquires it without deadlock)
--   · test_timed_retreat()      — executes the down file's corrected
--     sequence (advisory key → 5× ACCESS EXCLUSIVE in the fixed order →
--     guard → hold → teardown → column drops) with timing
--   · test_read_audit()         — security-definer audit reader (the audit
--     table is deliberately invisible to anon; the proof needs to assert
--     its ordering)
--   · test-only anon EXECUTE grants + fixture staging helpers so the
--     harness can drive everything through PostgREST sessions
--   · anon statement_timeout raise (default 3s would cancel lock-holders)
-- ════════════════════════════════════════════════════════════════════════

-- ── EXACT-TARGET GUARD (required before ANY DDL below) ──────────────────
-- This file NEVER creates or repairs the marker. It requires, and verifies
-- exactly: the operator's session-declared identity; the plausible-ref rule
-- and production denylist; the connected reference read from the
-- INDEPENDENTLY minted target artifact; three-way agreement between
-- declared identity, marker, and target artifact; the exact five-table
-- fixture counts and parent-child shape; every required hierarchy column;
-- every required galaxy_visible column; all five publication views; both
-- operator functions; the audit table; and the absence of unexpected
-- fixture objects. A broad threshold is not validation.
do $guard$
declare
  v_ref text; v_marker text; v_target text;
  b int; c int; f int; v int; r int;
  cj int; fj int; vj int; rj int;
  v_missing text; v_extra text; v_rows int; v_kind "char"; v_seq text;
begin
  begin
    v_ref := current_setting('galaxy_proof.declared_branch_ref');
  exception when others then v_ref := null; end;
  if v_ref is null or btrim(v_ref) = '' then
    raise exception 'REFUSED: declare the branch first: set galaxy_proof.declared_branch_ref = ''<ref>'';';
  end if;
  if v_ref !~ '^[a-z]{20}$' then
    raise exception 'REFUSED: % is not a plausible Supabase branch ref', v_ref;
  end if;
  if v_ref = 'aqgjcezhdoianqmoknnu' then
    raise exception 'REFUSED: that is the PRODUCTION project ref.';
  end if;

  -- identity artifacts minted by guarded fixture.sql; never created here
  if to_regprocedure('public.test_branch_marker()') is null then
    raise exception 'REFUSED: no disposable-target marker — run guarded fixture.sql first; this file never mints one.';
  end if;
  if to_regclass('public.galaxy_proof_target') is null then
    raise exception 'REFUSED: no target artifact — the marker alone does not certify a validated fixture.';
  end if;
  -- the target artifact must be an ORDINARY TABLE: to_regclass is satisfied
  -- by a view, matview, sequence or foreign table just as happily, any of
  -- which could serve an attacker-chosen identity.
  if (select c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'galaxy_proof_target') <> 'r' then
    raise exception 'REFUSED: galaxy_proof_target is not an ordinary table';
  end if;

  -- CARDINALITY FIRST. `select … into` accepts zero rows (leaving NULL) and
  -- silently takes an arbitrary row when there are many. A NULL identity
  -- then makes every `<>` comparison NULL, and `if NULL then raise` does
  -- NOT raise — an empty target artifact would have passed this guard.
  select count(*) into v_rows from public.galaxy_proof_target;
  if v_rows <> 1 then
    raise exception 'REFUSED: target artifact holds % row(s), expected exactly 1 — the identity root is not trustworthy', v_rows;
  end if;

  select public.test_branch_marker() into v_marker;
  select t.declared_branch_ref into v_target from public.galaxy_proof_target t;
  -- NULL-SAFE three-way agreement: `is distinct from` treats NULL as a
  -- disagreement, which is what a missing identity is.
  if v_marker is null then
    raise exception 'REFUSED: marker returned NULL — no identity to verify against';
  end if;
  if v_target is null then
    raise exception 'REFUSED: target artifact identity is NULL — no identity to verify against';
  end if;
  if v_marker is distinct from v_ref or v_target is distinct from v_ref
     or v_marker is distinct from v_target then
    raise exception 'REFUSED: identity disagreement — declared %, marker %, target artifact %',
      coalesce(v_ref,'<null>'), coalesce(v_marker,'<null>'), coalesce(v_target,'<null>');
  end if;

  -- exact five-table counts
  select count(*) into b from public.vault_brands;
  select count(*) into c from public.vault_collections;
  select count(*) into f from public.vault_families;
  select count(*) into v from public.vault_variants;
  select count(*) into r from public.vault_references;
  if (b, c, f, v, r) is distinct from (192, 396, 579, 710, 388) then
    raise exception 'REFUSED: fixture counts %/%/%/%/% are not the exact guarded fixture (192/396/579/710/388)', b, c, f, v, r;
  end if;
  -- exact parent-child shape
  select count(*) into cj from public.vault_collections x join public.vault_brands p on p.id = x.brand_id;
  select count(*) into fj from public.vault_families x join public.vault_collections p on p.id = x.collection_id;
  select count(*) into vj from public.vault_variants x join public.vault_families p on p.id = x.family_id;
  select count(*) into rj from public.vault_references x join public.vault_variants p on p.id = x.variant_id;
  if (cj, fj, vj, rj) is distinct from (396, 579, 710, 388) then
    raise exception 'REFUSED: parent-child shape %/%/%/% is not the guarded fixture', cj, fj, vj, rj;
  end if;

  -- required hierarchy columns (identity + parent key at every level)
  select string_agg(x.want, ', ') into v_missing from (
    select 'vault_brands.slug' as want where not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='vault_brands' and column_name='slug')
    union all select 'vault_collections.brand_id' where not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='vault_collections' and column_name='brand_id')
    union all select 'vault_families.collection_id' where not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='vault_families' and column_name='collection_id')
    union all select 'vault_variants.family_id' where not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='vault_variants' and column_name='family_id')
    union all select 'vault_references.variant_id' where not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='vault_references' and column_name='variant_id')
  ) x;
  if v_missing is not null then
    raise exception 'REFUSED: missing required hierarchy column(s): %', v_missing;
  end if;

  -- galaxy_visible on all five levels, with the EXACT column type. A
  -- text or nullable column of the same name would satisfy an
  -- existence-only check while changing what every predicate below means.
  select string_agg(format('%s.galaxy_visible', t), ', ') into v_missing from unnest(array[
    'vault_brands','vault_collections','vault_families','vault_variants','vault_references']) t
   where not exists (select 1 from information_schema.columns
     where table_schema='public' and table_name=t and column_name='galaxy_visible'
       and data_type='boolean' and is_nullable='NO');
  if v_missing is not null then
    raise exception 'REFUSED: galaxy_visible missing, or not boolean NOT NULL, on: % — apply the publication migration first', v_missing;
  end if;

  -- parent-key columns must be uuid, not merely present
  select string_agg(x.want, ', ') into v_missing from (
    select 'vault_collections.brand_id' as want where not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='vault_collections' and column_name='brand_id' and data_type='uuid')
    union all select 'vault_families.collection_id' where not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='vault_families' and column_name='collection_id' and data_type='uuid')
    union all select 'vault_variants.family_id' where not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='vault_variants' and column_name='family_id' and data_type='uuid')
    union all select 'vault_references.variant_id' where not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='vault_references' and column_name='variant_id' and data_type='uuid')
  ) x;
  if v_missing is not null then
    raise exception 'REFUSED: parent-key column(s) not of type uuid: %', v_missing;
  end if;

  -- all five publication views, as VIEWS (relkind 'v'), no more and no fewer.
  -- Swept through pg_class: a MATERIALIZED view of the same name never
  -- appears in information_schema.views, so an information_schema sweep
  -- would report it both "missing" and not "extra" — and a matview serves
  -- stale rows, which is precisely the failure this proof exists to detect.
  select string_agg(t, ', ') into v_missing from unnest(array[
    'vault_galaxy_brands','vault_galaxy_collections','vault_galaxy_families',
    'vault_galaxy_variants','vault_galaxy_references']) t
   where not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname=t and c.relkind='v');
  if v_missing is not null then
    raise exception 'REFUSED: publication view(s) missing or not an ordinary view: %', v_missing;
  end if;
  select string_agg(format('%s (relkind %s)', c.relname, c.relkind), ', ') into v_extra
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname like 'vault\_galaxy\_%'
     and (c.relkind <> 'v'
          or c.relname not in ('vault_galaxy_brands','vault_galaxy_collections',
            'vault_galaxy_families','vault_galaxy_variants','vault_galaxy_references'));
  if v_extra is not null then
    raise exception 'REFUSED: unexpected extra or wrong-kind publication relation(s): %', v_extra;
  end if;

  -- operator functions by EXACT SIGNATURE. to_regproc matches on bare name
  -- and returns NULL when a name is overloaded, so it can neither prove the
  -- argument list nor survive an added overload; to_regprocedure pins both.
  select string_agg(t, ', ') into v_missing from unnest(array[
    'public.galaxy_activate(jsonb,text,text)',
    'public.galaxy_rollback_event(uuid,text)',
    'public.galaxy_brand_subtree(uuid)']) t
   where to_regprocedure(t) is null;
  if v_missing is not null then
    raise exception 'REFUSED: publication operator function(s) missing at the exact signature: %', v_missing;
  end if;

  -- audit table: ordinary table, exact column set, exact types
  select c.relkind into v_kind from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='galaxy_publication_event';
  if v_kind is null then
    raise exception 'REFUSED: publication audit table missing';
  elsif v_kind <> 'r' then
    raise exception 'REFUSED: galaxy_publication_event is relkind %, not an ordinary table', v_kind;
  end if;
  select string_agg(x.want, ', ') into v_missing from (
    values ('seq','bigint'), ('id','uuid'), ('operation','text'), ('actor','text'),
           ('changed_rows','integer'), ('reverted_event_id','uuid')
  ) x(want, typ)
   where not exists (select 1 from information_schema.columns
     where table_schema='public' and table_name='galaxy_publication_event'
       and column_name=x.want and data_type=x.typ);
  if v_missing is not null then
    raise exception 'REFUSED: audit table shape wrong — missing or mistyped column(s): %', v_missing;
  end if;

  -- the audit ordering column must be backed by a real sequence: P1 reads
  -- the log `order by seq`, and an unbacked column orders nothing.
  select pg_get_serial_sequence('public.galaxy_publication_event','seq') into v_seq;
  if v_seq is null then
    raise exception 'REFUSED: galaxy_publication_event.seq has no owned sequence — audit ordering is not guaranteed';
  end if;
  if to_regclass(v_seq) is null
     or (select c.relkind from pg_class c where c.oid = to_regclass(v_seq)) <> 'S' then
    raise exception 'REFUSED: % is not a sequence', v_seq;
  end if;

  raise notice 'Exact-target guard passed for declared branch % (fixture 192/396/579/710/388; 5 views as relkind v; 3 operators at exact signature; audit table shape + owned sequence %)', v_ref, v_seq;
end
$guard$;

alter role anon set statement_timeout = '60s';
notify pgrst, 'reload config';

-- ── timed operator wrappers ──────────────────────────────────────────────
create or replace function public.test_timed_activate(
  p_manifest jsonb, p_actor text, p_hold_secs float default 0
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t0 timestamptz := clock_timestamp(); t_lock timestamptz; r jsonb; v_ok boolean := true; v_msg text;
begin
  if p_hold_secs > 0 then
    perform pg_advisory_xact_lock(hashtextextended('fwt.galaxy_publication', 0));
    t_lock := clock_timestamp();
    perform pg_sleep(p_hold_secs);
  end if;
  begin
    r := public.galaxy_activate(p_manifest, p_actor, 'concurrency proof');
  exception when others then
    get stacked diagnostics v_msg = MESSAGE_TEXT; v_ok := false;
  end;
  return jsonb_build_object('t_start', t0, 't_lock', t_lock, 't_end', clock_timestamp(),
                            'ok', v_ok, 'error', v_msg, 'result', r);
end $$;

create or replace function public.test_timed_rollback(
  p_event uuid, p_actor text, p_hold_secs float default 0
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t0 timestamptz := clock_timestamp(); t_lock timestamptz; r jsonb; v_ok boolean := true; v_msg text;
begin
  if p_hold_secs > 0 then
    perform pg_advisory_xact_lock(hashtextextended('fwt.galaxy_publication', 0));
    t_lock := clock_timestamp();
    perform pg_sleep(p_hold_secs);
  end if;
  begin
    r := public.galaxy_rollback_event(p_event, p_actor);
  exception when others then
    get stacked diagnostics v_msg = MESSAGE_TEXT; v_ok := false;
  end;
  return jsonb_build_object('t_start', t0, 't_lock', t_lock, 't_end', clock_timestamp(),
                            'ok', v_ok, 'error', v_msg, 'result', r);
end $$;

-- ── timed schema retreat (the down file's corrected sequence) ───────────
create or replace function public.test_timed_retreat(p_hold_secs float default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  t0 timestamptz := clock_timestamp(); t_locked timestamptz; t_guard timestamptz;
  v_hidden int;
begin
  perform pg_advisory_xact_lock(hashtextextended('fwt.galaxy_publication', 0));
  lock table public.vault_brands      in access exclusive mode;
  lock table public.vault_collections in access exclusive mode;
  lock table public.vault_families    in access exclusive mode;
  lock table public.vault_variants    in access exclusive mode;
  lock table public.vault_references  in access exclusive mode;
  t_locked := clock_timestamp();

  select
      (select count(*) from public.vault_brands      where not galaxy_visible)
    + (select count(*) from public.vault_collections where not galaxy_visible)
    + (select count(*) from public.vault_families    where not galaxy_visible)
    + (select count(*) from public.vault_variants    where not galaxy_visible)
    + (select count(*) from public.vault_references  where not galaxy_visible)
    into v_hidden;
  t_guard := clock_timestamp();
  if v_hidden > 0 then
    raise exception 'REFUSED: % row(s) are currently unpublished - dropping the column would publish them silently. Resolve them deliberately first.', v_hidden;
  end if;

  if p_hold_secs > 0 then perform pg_sleep(p_hold_secs); end if;

  drop function if exists public.galaxy_rollback_event(uuid, text);
  drop function if exists public.galaxy_activate(jsonb, text, text);
  drop function if exists public.galaxy_brand_subtree(uuid);
  drop view if exists public.vault_galaxy_references;
  drop view if exists public.vault_galaxy_variants;
  drop view if exists public.vault_galaxy_families;
  drop view if exists public.vault_galaxy_collections;
  drop view if exists public.vault_galaxy_brands;
  drop table if exists public.galaxy_publication_event;
  drop index if exists public.vault_brands_galaxy_visible_idx;
  drop index if exists public.vault_collections_galaxy_visible_idx;
  drop index if exists public.vault_families_galaxy_visible_idx;
  drop index if exists public.vault_variants_galaxy_visible_idx;
  drop index if exists public.vault_references_galaxy_visible_idx;
  alter table public.vault_brands      drop column if exists galaxy_visible;
  alter table public.vault_collections drop column if exists galaxy_visible;
  alter table public.vault_families    drop column if exists galaxy_visible;
  alter table public.vault_variants    drop column if exists galaxy_visible;
  alter table public.vault_references  drop column if exists galaxy_visible;

  return jsonb_build_object('t_start', t0, 't_locked', t_locked, 't_guard', t_guard,
                            't_end', clock_timestamp(), 'retreated', true);
end $$;

-- ── audit reader (exact ids + seq; never selected by timestamp) ─────────
create or replace function public.test_read_audit()
returns table (seq bigint, event_id uuid, operation text, actor text,
               changed_rows int, reverted_event_id uuid)
language sql security definer set search_path='' as $$
  select e.seq, e.id, e.operation, e.actor, e.changed_rows, e.reverted_event_id
    from public.galaxy_publication_event e order by e.seq
$$;

-- ── fixture staging (drive state between scenarios over PostgREST) ──────
create or replace function public.test_stage(p_step text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
  if p_step = 'fresh_fixture' then
    -- (re)create the scenario rows: NEW-COLL under TB-001, NEWCOLL-FAM
    -- under it, plus the hidden ZZ brand w/ subtree; everything hidden.
    insert into public.vault_brands (slug, name)
      values ('zz-hidden', 'ZZ-HIDDEN') on conflict (slug) do nothing;
    insert into public.vault_collections (brand_id, name)
      select id, 'NEW-COLL' from public.vault_brands where name = 'TB-001'
      on conflict do nothing;
    insert into public.vault_families (collection_id, name)
      select id, 'NEWCOLL-FAM' from public.vault_collections where name = 'NEW-COLL'
      on conflict do nothing;
    -- LEVEL 4 + LEVEL 5 scenario rows, so P2 can assert Variant and
    -- Reference identity/parent/visibility/membership like the rest.
    insert into public.vault_variants (family_id, name)
      select id, 'NEWFAM-VAR' from public.vault_families where name = 'NEWCOLL-FAM'
      on conflict do nothing;
    insert into public.vault_references (variant_id, reference)
      select id, 'NEWVAR-REF' from public.vault_variants where name = 'NEWFAM-VAR'
      on conflict do nothing;
    update public.vault_collections set galaxy_visible = false where name = 'NEW-COLL';
    update public.vault_families set galaxy_visible = false where name = 'NEWCOLL-FAM';
    update public.vault_variants set galaxy_visible = false where name = 'NEWFAM-VAR';
    update public.vault_references set galaxy_visible = false where reference = 'NEWVAR-REF';
    -- `where true` satisfies the pg-safeupdate session guard active on
    -- Supabase's anon web path, which applies inside functions too.
    delete from public.galaxy_publication_event where true;
  elsif p_step = 'reset_rows' then
    update public.vault_collections set galaxy_visible = false where name = 'NEW-COLL';
    update public.vault_families set galaxy_visible = false where name = 'NEWCOLL-FAM';
    update public.vault_variants set galaxy_visible = false where name = 'NEWFAM-VAR';
    update public.vault_references set galaxy_visible = false where reference = 'NEWVAR-REF';
  elsif p_step = 'publish_all' then
    -- retreat staging: every row live so the retreat guard passes
    update public.vault_brands set galaxy_visible = true where not galaxy_visible;
    update public.vault_collections set galaxy_visible = true where not galaxy_visible;
    update public.vault_families set galaxy_visible = true where not galaxy_visible;
    update public.vault_variants set galaxy_visible = true where not galaxy_visible;
    update public.vault_references set galaxy_visible = true where not galaxy_visible;
  else
    raise exception 'unknown stage step: %', p_step;
  end if;
  select jsonb_build_object(
    'brand_id',(select id from public.vault_brands where name = 'TB-001'),
    -- ZZ-HIDDEN's id is returned at STAGING time so P2 can assert it
    -- against an independently captured value. Reading the expected id out
    -- of the very row under assertion (`row.id !== row.id`) can never fail.
    'zz_id',   (select id from public.vault_brands where name = 'ZZ-HIDDEN'),
    'coll_id', (select id from public.vault_collections where name = 'NEW-COLL'),
    'fam_id',  (select id from public.vault_families where name = 'NEWCOLL-FAM'),
    'var_id',  (select id from public.vault_variants where name = 'NEWFAM-VAR'),
    'ref_id',  (select id from public.vault_references where reference = 'NEWVAR-REF'),
    'coll_visible', (select galaxy_visible from public.vault_collections where name = 'NEW-COLL'),
    -- ALL FIVE base counts and ALL FIVE view counts, so the harness can
    -- capture a complete baseline and P2 can assert every one of them.
    'base_counts', jsonb_build_array(
      (select count(*) from public.vault_brands),
      (select count(*) from public.vault_collections),
      (select count(*) from public.vault_families),
      (select count(*) from public.vault_variants),
      (select count(*) from public.vault_references)),
    'view_counts', jsonb_build_array(
      (select count(*) from public.vault_galaxy_brands),
      (select count(*) from public.vault_galaxy_collections),
      (select count(*) from public.vault_galaxy_families),
      (select count(*) from public.vault_galaxy_variants),
      (select count(*) from public.vault_galaxy_references))
  ) into v;
  return v;
end $$;

create or replace function public.test_insert_brand(p_slug text, p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t0 timestamptz := clock_timestamp();
begin
  insert into public.vault_brands (slug, name) values (p_slug, p_name);
  return jsonb_build_object('t_start', t0, 't_end', clock_timestamp(), 'ok', true);
end $$;


-- ── five-level exact state inspector (S7 pre-cleanup assertions) ────────
create or replace function public.test_inspect_state()
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object(
    'base_counts', jsonb_build_array(
      (select count(*) from public.vault_brands),
      (select count(*) from public.vault_collections),
      (select count(*) from public.vault_families),
      (select count(*) from public.vault_variants),
      (select count(*) from public.vault_references)),
    'view_counts', jsonb_build_array(
      (select count(*) from public.vault_galaxy_brands),
      (select count(*) from public.vault_galaxy_collections),
      (select count(*) from public.vault_galaxy_families),
      (select count(*) from public.vault_galaxy_variants),
      (select count(*) from public.vault_galaxy_references)),
    -- visible-under-hidden-ancestor violations per child level (must be 0:
    -- the ancestor-closed views make this structurally unreachable).
    -- Every scenario row below reports exact id, exact PARENT id,
    -- galaxy_visible, publication-view membership and copy count — at all
    -- FIVE levels, Variant and Reference included.
    'closure_violations', jsonb_build_array(
      (select count(*) from public.vault_collections c join public.vault_brands b on b.id=c.brand_id
        where c.galaxy_visible and not b.galaxy_visible),
      (select count(*) from public.vault_families f join public.vault_collections c on c.id=f.collection_id
        where f.galaxy_visible and not c.galaxy_visible),
      (select count(*) from public.vault_variants v join public.vault_families f on f.id=v.family_id
        where v.galaxy_visible and not f.galaxy_visible),
      (select count(*) from public.vault_references r join public.vault_variants v on v.id=r.variant_id
        where r.galaxy_visible and not v.galaxy_visible)),
    -- exact scenario-row identities + visibility (id, base flag, in-view)
    'scenario_rows', jsonb_build_object(
      'tb001', (select jsonb_build_object('id', b.id, 'parent_id', null,
                 'visible', b.galaxy_visible,
                 'in_view', exists (select 1 from public.vault_galaxy_brands g where g.id=b.id),
                 'copies', (select count(*) from public.vault_brands x where x.name='TB-001'))
                 from public.vault_brands b where b.name='TB-001'),
      'zz_hidden', (select jsonb_build_object('id', b.id, 'parent_id', null,
                 'visible', b.galaxy_visible,
                 'in_view', exists (select 1 from public.vault_galaxy_brands g where g.id=b.id),
                 'copies', (select count(*) from public.vault_brands x where x.name='ZZ-HIDDEN'))
                 from public.vault_brands b where b.name='ZZ-HIDDEN'),
      'new_coll', (select jsonb_build_object('id', c.id, 'parent_id', c.brand_id,
                 'visible', c.galaxy_visible,
                 'in_view', exists (select 1 from public.vault_galaxy_collections g where g.id=c.id),
                 'copies', (select count(*) from public.vault_collections x where x.name='NEW-COLL'))
                 from public.vault_collections c where c.name='NEW-COLL'),
      'newcoll_fam', (select jsonb_build_object('id', f.id, 'parent_id', f.collection_id,
                 'visible', f.galaxy_visible,
                 'in_view', exists (select 1 from public.vault_galaxy_families g where g.id=f.id),
                 'copies', (select count(*) from public.vault_families x where x.name='NEWCOLL-FAM'))
                 from public.vault_families f where f.name='NEWCOLL-FAM'),
      'newfam_var', (select jsonb_build_object('id', v.id, 'parent_id', v.family_id,
                 'visible', v.galaxy_visible,
                 'in_view', exists (select 1 from public.vault_galaxy_variants g where g.id=v.id),
                 'copies', (select count(*) from public.vault_variants x where x.name='NEWFAM-VAR'))
                 from public.vault_variants v where v.name='NEWFAM-VAR'),
      'newvar_ref', (select jsonb_build_object('id', r.id, 'parent_id', r.variant_id,
                 'visible', r.galaxy_visible,
                 'in_view', exists (select 1 from public.vault_galaxy_references g where g.id=r.id),
                 'copies', (select count(*) from public.vault_references x where x.reference='NEWVAR-REF'))
                 from public.vault_references r where r.reference='NEWVAR-REF')),
    -- ── SET-LEVEL RECONCILIATION AT ALL FIVE LEVELS ────────────────────
    -- Per-row `in_view` flags only ever speak for the handful of scenario
    -- rows named above; closure_violations only ever reads base tables.
    -- Neither can see a row the view OMITS, nor one it serves that nothing
    -- entitles. So each level is reconciled as a SET: the ancestor-closed
    -- expected id set versus the ids the view actually serves, reported as
    -- omissions (expected but absent), extras (served but not entitled) and
    -- the symmetric difference. All must be zero at every level.
    'view_set_diff', (
      with
      exp_b as (select b.id from public.vault_brands b where b.galaxy_visible),
      exp_c as (select c.id from public.vault_collections c
                  join public.vault_brands b on b.id = c.brand_id
                 where c.galaxy_visible and b.galaxy_visible),
      exp_f as (select f.id from public.vault_families f
                  join public.vault_collections c on c.id = f.collection_id
                  join public.vault_brands b on b.id = c.brand_id
                 where f.galaxy_visible and c.galaxy_visible and b.galaxy_visible),
      exp_v as (select v.id from public.vault_variants v
                  join public.vault_families f on f.id = v.family_id
                  join public.vault_collections c on c.id = f.collection_id
                  join public.vault_brands b on b.id = c.brand_id
                 where v.galaxy_visible and f.galaxy_visible and c.galaxy_visible and b.galaxy_visible),
      exp_r as (select r.id from public.vault_references r
                  join public.vault_variants v on v.id = r.variant_id
                  join public.vault_families f on f.id = v.family_id
                  join public.vault_collections c on c.id = f.collection_id
                  join public.vault_brands b on b.id = c.brand_id
                 where r.galaxy_visible and v.galaxy_visible and f.galaxy_visible
                   and c.galaxy_visible and b.galaxy_visible),
      act_b as (select g.id from public.vault_galaxy_brands g),
      act_c as (select g.id from public.vault_galaxy_collections g),
      act_f as (select g.id from public.vault_galaxy_families g),
      act_v as (select g.id from public.vault_galaxy_variants g),
      act_r as (select g.id from public.vault_galaxy_references g),
      lv as (
        select 'brand'      as level, (select count(*) from exp_b) e, (select count(*) from act_b) a,
               (select count(*) from (select id from exp_b except select id from act_b) z) omitted,
               (select count(*) from (select id from act_b except select id from exp_b) z) extra
        union all
        select 'collection', (select count(*) from exp_c), (select count(*) from act_c),
               (select count(*) from (select id from exp_c except select id from act_c) z),
               (select count(*) from (select id from act_c except select id from exp_c) z)
        union all
        select 'family', (select count(*) from exp_f), (select count(*) from act_f),
               (select count(*) from (select id from exp_f except select id from act_f) z),
               (select count(*) from (select id from act_f except select id from exp_f) z)
        union all
        select 'variant', (select count(*) from exp_v), (select count(*) from act_v),
               (select count(*) from (select id from exp_v except select id from act_v) z),
               (select count(*) from (select id from act_v except select id from exp_v) z)
        union all
        select 'reference', (select count(*) from exp_r), (select count(*) from act_r),
               (select count(*) from (select id from exp_r except select id from act_r) z),
               (select count(*) from (select id from act_r except select id from exp_r) z))
      select jsonb_agg(jsonb_build_object(
               'level', level, 'expected', e, 'actual', a,
               'omitted', omitted, 'extra', extra,
               'symmetric_difference', omitted + extra)
             order by case level when 'brand' then 1 when 'collection' then 2
                                 when 'family' then 3 when 'variant' then 4 else 5 end)
        from lv),
    -- duplicate detection at every level (same-parent duplicates)
    'duplicates', jsonb_build_array(
      (select count(*) from (select name from public.vault_brands group by name having count(*)>1) d),
      (select count(*) from (select brand_id, name from public.vault_collections group by 1,2 having count(*)>1) d),
      (select count(*) from (select collection_id, name from public.vault_families group by 1,2 having count(*)>1) d),
      (select count(*) from (select family_id, name from public.vault_variants group by 1,2 having count(*)>1) d),
      (select count(*) from (select variant_id, reference from public.vault_references where reference is not null group by 1,2 having count(*)>1) d))
  )
$$;

grant execute on function public.test_timed_activate(jsonb, text, float) to anon;
grant execute on function public.test_timed_rollback(uuid, text, float) to anon;
grant execute on function public.test_timed_retreat(float) to anon;
grant execute on function public.test_read_audit() to anon;
grant execute on function public.test_stage(text) to anon;
grant execute on function public.test_insert_brand(text, text) to anon;
grant execute on function public.test_inspect_state() to anon;

select 'helpers installed - run the node harness' as next_step;
