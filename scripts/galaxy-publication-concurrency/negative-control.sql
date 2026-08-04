-- ════════════════════════════════════════════════════════════════════════
-- GALAXY CONCURRENCY PROOF — NEGATIVE CONTROL
-- scripts/galaxy-publication-concurrency/negative-control.sql
--
-- ⚠ DISPOSABLE. THIS IS **NOT** THE IMPLEMENTATION AND MUST NEVER REACH
--   PRODUCTION OR THE MIGRATION FILE. It exists for exactly one purpose:
--   to prove the harness DETECTS a missing lock rather than always
--   passing. It redefines galaxy_activate WITHOUT the serialization
--   advisory lock — the pre-correction defect, resurrected on a
--   disposable branch so `run.mjs --negative-control` can watch scenario
--   S1 catch it (session B completes while session A still holds the
--   lock → MISSING_SERIALIZATION_DETECTED).
--
--   After the negative-control run, the branch is deleted; nothing to
--   restore.
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
  v_missing text; v_extra text; v_rows int; v_kind "char";
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
    raise exception 'REFUSED: no disposable-target marker — run guarded fixture.sql first; the negative control never mints one.';
  end if;
  if to_regclass('public.galaxy_proof_target') is null then
    raise exception 'REFUSED: no target artifact — the marker alone does not certify a validated fixture.';
  end if;
  -- ordinary table, exactly one row, null-safe agreement — identical to the
  -- helpers guard. `select … into` yields NULL on zero rows and an
  -- arbitrary row on many, and a NULL identity makes `<>` NULL, which does
  -- NOT raise: an empty target artifact would otherwise pass this guard.
  if (select c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'galaxy_proof_target') <> 'r' then
    raise exception 'REFUSED: galaxy_proof_target is not an ordinary table';
  end if;
  select count(*) into v_rows from public.galaxy_proof_target;
  if v_rows <> 1 then
    raise exception 'REFUSED: target artifact holds % row(s), expected exactly 1', v_rows;
  end if;
  select public.test_branch_marker() into v_marker;
  select t.declared_branch_ref into v_target from public.galaxy_proof_target t;
  if v_marker is null or v_target is null then
    raise exception 'REFUSED: marker or target artifact identity is NULL — nothing to verify against';
  end if;
  if v_marker is distinct from v_ref or v_target is distinct from v_ref
     or v_marker is distinct from v_target then
    raise exception 'REFUSED: identity disagreement — declared %, marker %, target artifact %', v_ref, v_marker, v_target;
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

  -- galaxy_visible on all five levels, with the EXACT column type
  select string_agg(format('%s.galaxy_visible', t), ', ') into v_missing from unnest(array[
    'vault_brands','vault_collections','vault_families','vault_variants','vault_references']) t
   where not exists (select 1 from information_schema.columns
     where table_schema='public' and table_name=t and column_name='galaxy_visible'
       and data_type='boolean' and is_nullable='NO');
  if v_missing is not null then
    raise exception 'REFUSED: galaxy_visible missing, or not boolean NOT NULL, on: % — apply the publication migration first', v_missing;
  end if;

  -- all five publication views, as VIEWS (relkind 'v'), no more and no
  -- fewer — swept through pg_class so a materialized view of the same name
  -- cannot hide from information_schema.views.
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

  -- operator functions by EXACT SIGNATURE (to_regproc cannot prove an
  -- argument list and returns NULL on any overload)
  select string_agg(t, ', ') into v_missing from unnest(array[
    'public.galaxy_activate(jsonb,text,text)',
    'public.galaxy_rollback_event(uuid,text)',
    'public.galaxy_brand_subtree(uuid)']) t
   where to_regprocedure(t) is null;
  if v_missing is not null then
    raise exception 'REFUSED: publication operator function(s) missing at the exact signature: %', v_missing;
  end if;
  select c.relkind into v_kind from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='galaxy_publication_event';
  if v_kind is not null and v_kind <> 'r' then
    raise exception 'REFUSED: galaxy_publication_event is relkind %, not an ordinary table', v_kind;
  end if;
  if to_regclass('public.galaxy_publication_event') is null then
    raise exception 'REFUSED: publication audit table missing';
  end if;

  raise notice 'Exact-target guard passed for declared branch % (fixture 192/396/579/710/388, 5 views, operators present)', v_ref;
end
$guard$;

create or replace function public.galaxy_activate(
  p_manifest jsonb, p_actor text, p_note text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_bad text; v_missing text; v_suppressed text;
  v_before jsonb; v_after jsonb; v_changed int := 0; v_n int; v_event_id uuid;
begin
  -- NEGATIVE CONTROL: the advisory lock that belongs here has been
  -- deliberately REMOVED. Everything else is unchanged.

  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'REFUSED: an actor must be named for the audit record';
  end if;
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'array' or jsonb_array_length(p_manifest) = 0 then
    raise exception 'REFUSED: manifest must be a non-empty JSON array of {entity_type, entity_id} objects';
  end if;

  drop table if exists pg_temp._m;
  drop table if exists pg_temp._req;
  drop table if exists pg_temp._all;

  create temp table _m on commit drop as
  select distinct e->>'entity_type' as entity_type, e->>'entity_id' as entity_id
    from jsonb_array_elements(p_manifest) e;

  select string_agg(distinct coalesce(entity_type,'<null>'), ', ') into v_bad
    from pg_temp._m
   where entity_type is null
      or entity_type not in ('brand','collection','family','variant','reference');
  if v_bad is not null then raise exception 'REFUSED: unknown entity_type(s): %', v_bad; end if;

  select string_agg(coalesce(entity_id,'<null>'), ', ') into v_bad
    from pg_temp._m
   where entity_id is null
      or entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad is not null then raise exception 'REFUSED: entity_id(s) are not UUIDs: %', v_bad; end if;

  create temp table _req on commit drop as
  select entity_type, entity_id::uuid as entity_id from pg_temp._m;

  create temp table _all on commit drop as
  select 'brand'::text as entity_type, id, galaxy_visible from public.vault_brands
  union all select 'collection', id, galaxy_visible from public.vault_collections
  union all select 'family', id, galaxy_visible from public.vault_families
  union all select 'variant', id, galaxy_visible from public.vault_variants
  union all select 'reference', id, galaxy_visible from public.vault_references;

  select string_agg(format('%s %s', r.entity_type, r.entity_id), ', ') into v_missing
    from pg_temp._req r
    left join pg_temp._all a on a.entity_type = r.entity_type and a.id = r.entity_id
   where a.id is null;
  if v_missing is not null then raise exception 'REFUSED: target(s) do not exist: %', v_missing; end if;

  select jsonb_agg(jsonb_build_object('entity_type', a.entity_type, 'entity_id', a.id,
                                      'galaxy_visible', a.galaxy_visible)
                   order by a.entity_type, a.id) into v_before
    from pg_temp._req r join pg_temp._all a on a.entity_type = r.entity_type and a.id = r.entity_id;

  update public.vault_brands t set galaxy_visible = true
    from pg_temp._req r where r.entity_type = 'brand' and r.entity_id = t.id and not t.galaxy_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;
  update public.vault_collections t set galaxy_visible = true
    from pg_temp._req r where r.entity_type = 'collection' and r.entity_id = t.id and not t.galaxy_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;
  update public.vault_families t set galaxy_visible = true
    from pg_temp._req r where r.entity_type = 'family' and r.entity_id = t.id and not t.galaxy_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;
  update public.vault_variants t set galaxy_visible = true
    from pg_temp._req r where r.entity_type = 'variant' and r.entity_id = t.id and not t.galaxy_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;
  update public.vault_references t set galaxy_visible = true
    from pg_temp._req r where r.entity_type = 'reference' and r.entity_id = t.id and not t.galaxy_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  select string_agg(format('%s %s', r.entity_type, r.entity_id), ', ') into v_suppressed
    from pg_temp._req r
   where not exists (
     select 1 from public.vault_galaxy_brands x where r.entity_type='brand' and x.id=r.entity_id
     union all
     select 1 from public.vault_galaxy_collections x where r.entity_type='collection' and x.id=r.entity_id
     union all
     select 1 from public.vault_galaxy_families x where r.entity_type='family' and x.id=r.entity_id
     union all
     select 1 from public.vault_galaxy_variants x where r.entity_type='variant' and x.id=r.entity_id
     union all
     select 1 from public.vault_galaxy_references x where r.entity_type='reference' and x.id=r.entity_id
   );
  if v_suppressed is not null then
    raise exception 'REFUSED: % would stay suppressed by a hidden ancestor not named in this manifest - add the ancestors or release nothing', v_suppressed;
  end if;

  select jsonb_agg(jsonb_build_object('entity_type', x.entity_type, 'entity_id', x.entity_id,
                                      'galaxy_visible', true)
                   order by x.entity_type, x.entity_id) into v_after
    from pg_temp._req x;

  insert into public.galaxy_publication_event
    (actor, operation, manifest, before_state, after_state, changed_rows, note)
  values (p_actor, 'activate', p_manifest, v_before, v_after, v_changed, p_note)
  returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id, 'operation', 'activate',
    'requested_rows', (select count(*) from pg_temp._req),
    'changed_rows', v_changed, 'idempotent_noop', v_changed = 0,
    'before_state', v_before, 'after_state', v_after);
end $$;

select 'NEGATIVE CONTROL INSTALLED - galaxy_activate has NO serialization lock. Run run.mjs --negative-control, then DELETE THIS BRANCH.' as warning;
