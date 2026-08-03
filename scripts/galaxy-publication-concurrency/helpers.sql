-- ════════════════════════════════════════════════════════════════════════
-- GALAXY CONCURRENCY PROOF — DISPOSABLE BRANCH-LOCAL HELPERS
-- scripts/galaxy-publication-concurrency/helpers.sql
--
-- Applied AFTER fixture.sql and the Galaxy publication migration, on the
-- DISPOSABLE branch only. Nothing here is ever a production object.
--
-- What it installs:
--   · test_branch_marker()      — the harness refuses any target lacking it
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

create or replace function public.test_branch_marker() returns text
language sql as $$ select 'galaxy-concurrency-proof-branch' $$;
grant execute on function public.test_branch_marker() to anon;

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
    update public.vault_collections set galaxy_visible = false where name = 'NEW-COLL';
    update public.vault_families set galaxy_visible = false where name = 'NEWCOLL-FAM';
    -- `where true` satisfies the pg-safeupdate session guard active on
    -- Supabase's anon web path, which applies inside functions too.
    delete from public.galaxy_publication_event where true;
  elsif p_step = 'reset_rows' then
    update public.vault_collections set galaxy_visible = false where name = 'NEW-COLL';
    update public.vault_families set galaxy_visible = false where name = 'NEWCOLL-FAM';
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
    'coll_id', (select id from public.vault_collections where name = 'NEW-COLL'),
    'fam_id',  (select id from public.vault_families where name = 'NEWCOLL-FAM'),
    'coll_visible', (select galaxy_visible from public.vault_collections where name = 'NEW-COLL'),
    'view_counts', jsonb_build_array(
      (select count(*) from public.vault_galaxy_brands),
      (select count(*) from public.vault_galaxy_collections),
      (select count(*) from public.vault_galaxy_families))
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

grant execute on function public.test_timed_activate(jsonb, text, float) to anon;
grant execute on function public.test_timed_rollback(uuid, text, float) to anon;
grant execute on function public.test_timed_retreat(float) to anon;
grant execute on function public.test_read_audit() to anon;
grant execute on function public.test_stage(text) to anon;
grant execute on function public.test_insert_brand(text, text) to anon;

select 'helpers installed - run the node harness' as next_step;
