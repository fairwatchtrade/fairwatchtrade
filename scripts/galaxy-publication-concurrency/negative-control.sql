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


-- ── NON-CIRCULAR TARGET GUARD (same law as helpers.sql) ─────────────────
-- Never creates the marker; requires the fixture's marker, the operator's
-- session-declared identity, their agreement, and the fixture shape.
do $guard$
declare v_ref text; v_marker text; v_brands int;
begin
  begin
    v_ref := current_setting('galaxy_proof.declared_branch_ref');
  exception when others then v_ref := null; end;
  if v_ref is null or btrim(v_ref) = '' then
    raise exception 'REFUSED: declare the branch first: set galaxy_proof.declared_branch_ref = ''<ref>'';';
  end if;
  if to_regproc('public.test_branch_marker') is null then
    raise exception 'REFUSED: no disposable-target marker — run guarded fixture.sql first; the negative control never creates the marker.';
  end if;
  select public.test_branch_marker() into v_marker;
  if v_marker <> v_ref then
    raise exception 'REFUSED: marker identity % does not match declared identity %', v_marker, v_ref;
  end if;
  select count(*) into v_brands from public.vault_brands;
  if v_brands < 192 then
    raise exception 'REFUSED: fixture shape unexpected (% brands)', v_brands;
  end if;
  raise notice 'Target guard passed for declared branch % — installing NEGATIVE CONTROL', v_ref;
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
