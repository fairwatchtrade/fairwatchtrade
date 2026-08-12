-- ════════════════════════════════════════════════════════════════════════
-- AUBREY CHECK FLIGHT 1 — database test matrix (DB01–DB15, DB17)
-- scripts/aubrey-listing-photo-exact-hash.test.sql
--
-- Run AFTER the forward migration, against a DISPOSABLE database only:
--   psql "$env:TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/aubrey-listing-photo-exact-hash.test.sql
--
-- Executes inside one transaction and finishes with ROLLBACK — disposable
-- fixture rows only, no production identifiers, nothing persists.
--
-- Covered here: DB01–DB15, DB17.
-- Proven in the migration/rollback proof sequence, outside this
-- transaction by necessity:
--   DB16 — equal-digest concurrency (two genuinely concurrent sessions);
--   DB18–DB20 — rollback / reapply / byte-equivalence (schema mutation
--   cannot run inside this rolled-back transaction).
-- Every failed assertion raises, so ON_ERROR_STOP aborts the run.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── Fixtures — disposable, transaction-local, rolled back at the end ──────
insert into auth.users (id, email)
values ('a0b9f100-0000-4000-8000-0000000000ff', 'aubrey-f1-fixture@test.invalid');

insert into public.listings (id, seller_id, brand, reference, status, public_code)
values
  ('a0b9f100-0000-4000-8000-000000000001', 'a0b9f100-0000-4000-8000-0000000000ff', 'FixtureBrand', 'AUB-F1', 'draft', 'AUBF1-L1'),
  ('a0b9f100-0000-4000-8000-000000000002', 'a0b9f100-0000-4000-8000-0000000000ff', 'FixtureBrand', 'AUB-F1', 'draft', 'AUBF1-L2'),
  ('a0b9f100-0000-4000-8000-000000000003', 'a0b9f100-0000-4000-8000-0000000000ff', 'FixtureBrand', 'AUB-F1', 'draft', 'AUBF1-L3'),
  ('a0b9f100-0000-4000-8000-000000000004', 'a0b9f100-0000-4000-8000-0000000000ff', 'FixtureBrand', 'AUB-F1', 'draft', 'AUBF1-L4');

insert into public.listing_media (id, listing_id, category, storage_path, capture_source)
values
  -- M1 · L1 · desktop
  ('a0b9f100-0000-4000-8000-000000000011', 'a0b9f100-0000-4000-8000-000000000001', 'Dial', 'listings/aubf1-m1.jpg', 'desktop_upload'),
  -- M2 · L2 · live camera
  ('a0b9f100-0000-4000-8000-000000000012', 'a0b9f100-0000-4000-8000-000000000002', 'Dial', 'listings/aubf1-m2.jpg', 'live_camera'),
  -- M3 · L3 · dealer import
  ('a0b9f100-0000-4000-8000-000000000013', 'a0b9f100-0000-4000-8000-000000000003', 'Dial', 'listings/aubf1-m3.jpg', 'dealer_import'),
  -- M4a + M4b · L4 · same-listing siblings
  ('a0b9f100-0000-4000-8000-000000000014', 'a0b9f100-0000-4000-8000-000000000004', 'Dial', 'listings/aubf1-m4a.jpg', 'desktop_upload'),
  ('a0b9f100-0000-4000-8000-000000000015', 'a0b9f100-0000-4000-8000-000000000004', 'Caseback', 'listings/aubf1-m4b.jpg', 'desktop_upload');

-- ── DB01 · new columns exist with exact names/types/nullability ──────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'listing_media'
       and column_name = 'content_sha256' and data_type = 'text' and is_nullable = 'YES'
  ) then
    raise exception 'DB01 failed: content_sha256 text nullable column missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'listing_media'
       and column_name = 'content_sha256_computed_at'
       and data_type = 'timestamp with time zone' and is_nullable = 'YES'
  ) then
    raise exception 'DB01 failed: content_sha256_computed_at timestamptz nullable column missing';
  end if;
  raise notice 'DB01 PASS';
end $$;

-- ── DB02 · index exists, non-unique, keys content_sha256 only, partial ───
do $$
declare
  v_def text;
  v_unique boolean;
begin
  select pg_get_indexdef(i.indexrelid), i.indisunique
    into v_def, v_unique
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
   where c.relname = 'listing_media_content_sha256_idx';
  if v_def is null then
    raise exception 'DB02 failed: index missing';
  end if;
  if v_unique then
    raise exception 'DB02 failed: index is unique — recurrence must be recordable';
  end if;
  if v_def not like '%(content_sha256)%' then
    raise exception 'DB02 failed: index keys are not (content_sha256): %', v_def;
  end if;
  if v_def not ilike '%WHERE (content_sha256 IS NOT NULL)%' then
    raise exception 'DB02 failed: index predicate is not content_sha256 IS NOT NULL: %', v_def;
  end if;
  raise notice 'DB02 PASS';
end $$;

-- ── DB03 · null hash + null timestamp accepted (already true of fixtures) ─
do $$
begin
  if (select count(*) from public.listing_media
       where id = 'a0b9f100-0000-4000-8000-000000000011'
         and content_sha256 is null and content_sha256_computed_at is null) <> 1 then
    raise exception 'DB03 failed: unprocessed row with null hash/timestamp not accepted';
  end if;
  raise notice 'DB03 PASS';
end $$;

-- ── DB04 · uppercase / short / long / non-hex digests rejected ───────────
do $$
declare
  bad text;
begin
  foreach bad in array array[
    upper(repeat('ab', 32)),          -- uppercase
    repeat('ab', 31),                 -- short (62)
    repeat('ab', 33),                 -- long (66)
    repeat('zx', 32)                  -- non-hex
  ] loop
    begin
      update public.listing_media
         set content_sha256 = bad,
             content_sha256_computed_at = now()
       where id = 'a0b9f100-0000-4000-8000-000000000011';
      raise exception 'DB04 failed: invalid digest accepted: %', bad;
    exception when check_violation then null;
    end;
  end loop;
  raise notice 'DB04 PASS';
end $$;

-- ── DB05 · hash and timestamp present-or-absent together ─────────────────
do $$
begin
  begin
    update public.listing_media
       set content_sha256 = repeat('ab', 32), content_sha256_computed_at = null
     where id = 'a0b9f100-0000-4000-8000-000000000011';
    raise exception 'DB05 failed: hash without timestamp accepted';
  exception when check_violation then null;
  end;
  begin
    update public.listing_media
       set content_sha256 = null, content_sha256_computed_at = now()
     where id = 'a0b9f100-0000-4000-8000-000000000011';
    raise exception 'DB05 failed: timestamp without hash accepted';
  exception when check_violation then null;
  end;
  raise notice 'DB05 PASS';
end $$;

-- ── DB06 · RPC rejects null/unknown media id and invalid digest ──────────
do $$
begin
  begin
    perform public.record_listing_media_content_sha256(null, repeat('ab', 32));
    raise exception 'DB06 failed: null media id accepted';
  exception when others then
    if sqlerrm <> 'media_id_required' then
      raise exception 'DB06 failed: null media id raised %', sqlerrm;
    end if;
  end;
  begin
    perform public.record_listing_media_content_sha256(
      'a0b9f100-0000-4000-8000-000000000011', upper(repeat('ab', 32)));
    raise exception 'DB06 failed: invalid digest accepted';
  exception when others then
    if sqlerrm <> 'content_sha256_invalid' then
      raise exception 'DB06 failed: invalid digest raised %', sqlerrm;
    end if;
  end;
  begin
    perform public.record_listing_media_content_sha256(
      'a0b9f100-0000-4000-8000-0000000000ee', repeat('ab', 32));
    raise exception 'DB06 failed: unknown media id accepted';
  exception when others then
    if sqlerrm <> 'listing_media_not_found' then
      raise exception 'DB06 failed: unknown media id raised %', sqlerrm;
    end if;
  end;
  raise notice 'DB06 PASS';
end $$;

-- ── DB07 · ACL: service_role only ────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon',
       'public.record_listing_media_content_sha256(uuid, text)', 'execute') then
    raise exception 'DB07 failed: anon holds execute';
  end if;
  if has_function_privilege('authenticated',
       'public.record_listing_media_content_sha256(uuid, text)', 'execute') then
    raise exception 'DB07 failed: authenticated holds execute';
  end if;
  if not has_function_privilege('service_role',
       'public.record_listing_media_content_sha256(uuid, text)', 'execute') then
    raise exception 'DB07 failed: service_role lacks execute';
  end if;
  raise notice 'DB07 PASS (ACL)';
end $$;

-- DB07 · execute under each role where the harness permits.
set local role anon;
do $$
begin
  begin
    perform public.record_listing_media_content_sha256(
      'a0b9f100-0000-4000-8000-000000000011', repeat('ab', 32));
    raise exception 'DB07 failed: anon executed the RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin
    perform public.record_listing_media_content_sha256(
      'a0b9f100-0000-4000-8000-000000000011', repeat('ab', 32));
    raise exception 'DB07 failed: authenticated executed the RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role service_role;
do $$
declare r jsonb;
begin
  r := public.record_listing_media_content_sha256(
    'a0b9f100-0000-4000-8000-000000000014', repeat('99', 32));
  if r->>'schema_version' <> 'aubrey.exact_hash.rpc/v1' then
    raise exception 'DB07 failed: service_role call returned wrong schema %', r;
  end if;
  raise notice 'DB07 PASS (role execution)';
end $$;
reset role;

-- Undo the service_role probe so later sibling tests start clean.
update public.listing_media
   set content_sha256 = null, content_sha256_computed_at = null
 where id = 'a0b9f100-0000-4000-8000-000000000014';

-- ── DB08 · first valid record: digest + timestamp, zero recurrence ───────
do $$
declare r jsonb;
begin
  r := public.record_listing_media_content_sha256(
    'a0b9f100-0000-4000-8000-000000000011', repeat('ab', 32));
  if (r->>'cross_listing_match_count')::bigint <> 0
     or jsonb_array_length(r->'matches') <> 0
     or (r->>'matches_truncated')::boolean then
    raise exception 'DB08 failed: first record reported recurrence: %', r;
  end if;
  if (select content_sha256 from public.listing_media
       where id = 'a0b9f100-0000-4000-8000-000000000011') <> repeat('ab', 32) then
    raise exception 'DB08 failed: digest not persisted';
  end if;
  if (select content_sha256_computed_at from public.listing_media
       where id = 'a0b9f100-0000-4000-8000-000000000011') is null then
    raise exception 'DB08 failed: computed timestamp not persisted';
  end if;
  raise notice 'DB08 PASS';
end $$;

-- ── DB09 · same digest re-record: timestamp preserved, same result ───────
do $$
declare
  t_before timestamptz;
  t_after timestamptz;
  r jsonb;
begin
  select content_sha256_computed_at into t_before from public.listing_media
   where id = 'a0b9f100-0000-4000-8000-000000000011';
  perform pg_sleep(0.05);
  r := public.record_listing_media_content_sha256(
    'a0b9f100-0000-4000-8000-000000000011', repeat('ab', 32));
  select content_sha256_computed_at into t_after from public.listing_media
   where id = 'a0b9f100-0000-4000-8000-000000000011';
  if t_after <> t_before then
    raise exception 'DB09 failed: computed timestamp changed on re-record';
  end if;
  if (r->>'cross_listing_match_count')::bigint <> 0 then
    raise exception 'DB09 failed: re-record changed the result: %', r;
  end if;
  if (select count(*) from public.listing_media
       where content_sha256 = repeat('ab', 32)) <> 1 then
    raise exception 'DB09 failed: re-record duplicated the row';
  end if;
  raise notice 'DB09 PASS';
end $$;

-- ── DB10 · a different digest is refused for hashed media ────────────────
do $$
begin
  begin
    perform public.record_listing_media_content_sha256(
      'a0b9f100-0000-4000-8000-000000000011', repeat('cd', 32));
    raise exception 'DB10 failed: different digest replaced a recorded hash';
  exception when others then
    if sqlerrm <> 'content_sha256_immutable' then
      raise exception 'DB10 failed: raised % instead of content_sha256_immutable', sqlerrm;
    end if;
  end;
  raise notice 'DB10 PASS';
end $$;

-- ── DB11 · same-listing siblings never count as recurrence ───────────────
do $$
declare r jsonb;
begin
  r := public.record_listing_media_content_sha256(
    'a0b9f100-0000-4000-8000-000000000014', repeat('ef', 32));
  if (r->>'cross_listing_match_count')::bigint <> 0 then
    raise exception 'DB11 failed: first sibling reported recurrence';
  end if;
  r := public.record_listing_media_content_sha256(
    'a0b9f100-0000-4000-8000-000000000015', repeat('ef', 32));
  if (r->>'cross_listing_match_count')::bigint <> 0
     or jsonb_array_length(r->'matches') <> 0 then
    raise exception 'DB11 failed: same-listing sibling counted as cross-listing recurrence: %', r;
  end if;
  raise notice 'DB11 PASS';
end $$;

-- ── DB12 · a different listing counts, with exact match fields ───────────
do $$
declare r jsonb;
begin
  r := public.record_listing_media_content_sha256(
    'a0b9f100-0000-4000-8000-000000000012', repeat('ab', 32));
  if (r->>'cross_listing_match_count')::bigint <> 1 then
    raise exception 'DB12 failed: expected exactly one recurrence: %', r;
  end if;
  if r->'matches'->0->>'media_id' <> 'a0b9f100-0000-4000-8000-000000000011'
     or r->'matches'->0->>'listing_id' <> 'a0b9f100-0000-4000-8000-000000000001'
     or r->'matches'->0->>'capture_source' <> 'desktop_upload' then
    raise exception 'DB12 failed: matched fields wrong: %', r->'matches';
  end if;
  if (r->>'matches_truncated')::boolean then
    raise exception 'DB12 failed: truncation flagged at one match';
  end if;
  raise notice 'DB12 PASS';
end $$;

-- ── DB13 + DB14 · three recurrences permitted; capture sources verbatim ──
do $$
declare
  r jsonb;
  sources text[];
begin
  r := public.record_listing_media_content_sha256(
    'a0b9f100-0000-4000-8000-000000000013', repeat('ab', 32));
  if (r->>'cross_listing_match_count')::bigint <> 2 then
    raise exception 'DB13 failed: expected two prior recurrences: %', r;
  end if;
  if (select count(*) from public.listing_media
       where content_sha256 = repeat('ab', 32)) <> 3 then
    raise exception 'DB13 failed: three identical digests not all recorded';
  end if;
  select array_agg(m->>'capture_source' order by m->>'capture_source')
    into sources
    from jsonb_array_elements(r->'matches') m;
  if sources <> array['desktop_upload', 'live_camera'] then
    raise exception 'DB14 failed: matched capture sources rewritten: %', sources;
  end if;
  if r->>'capture_source' <> 'dealer_import' then
    raise exception 'DB14 failed: current capture source rewritten: %', r->>'capture_source';
  end if;
  raise notice 'DB13 PASS';
  raise notice 'DB14 PASS';
end $$;

-- ── DB15 · matches cap at 20; count stays exact; truncation flagged ──────
do $$
declare
  i int;
  v_listing uuid;
  v_media uuid;
  r jsonb;
begin
  for i in 1..22 loop
    v_listing := ('a0b9f100-0000-4000-8000-0000000001' || lpad(to_hex(i), 2, '0'))::uuid;
    v_media   := ('a0b9f100-0000-4000-8000-0000000002' || lpad(to_hex(i), 2, '0'))::uuid;
    insert into public.listings (id, seller_id, brand, reference, status, public_code)
    values (v_listing, 'a0b9f100-0000-4000-8000-0000000000ff', 'FixtureBrand',
            'AUB-F1', 'draft', 'AUBF1-C' || i);
    insert into public.listing_media (id, listing_id, category, storage_path, capture_source)
    values (v_media, v_listing, 'Dial', 'listings/aubf1-cap-' || i || '.jpg', 'desktop_upload');
    r := public.record_listing_media_content_sha256(v_media, repeat('77', 32));
  end loop;
  -- The 22nd call saw the previous 21 recurrences.
  if (r->>'cross_listing_match_count')::bigint <> 21 then
    raise exception 'DB15 failed: exact count wrong: %', r->>'cross_listing_match_count';
  end if;
  if jsonb_array_length(r->'matches') <> 20 then
    raise exception 'DB15 failed: matches not capped at 20: %', jsonb_array_length(r->'matches');
  end if;
  if not (r->>'matches_truncated')::boolean then
    raise exception 'DB15 failed: truncation not flagged';
  end if;
  raise notice 'DB15 PASS';
end $$;

-- ── DB17 · no trigger on listing_media; no listing status/review change ──
do $$
begin
  if exists (
    select 1 from pg_trigger
     where tgrelid = 'public.listing_media'::regclass and not tgisinternal
  ) then
    raise exception 'DB17 failed: a trigger exists on listing_media';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'listings'
       and column_name in ('content_sha256', 'content_sha256_computed_at')
  ) then
    raise exception 'DB17 failed: migration touched public.listings';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'listings'
         and column_name in ('status', 'integrity_hold_reason', 'rejection_reason')) <> 3 then
    raise exception 'DB17 failed: listing status/review columns changed';
  end if;
  raise notice 'DB17 PASS';
end $$;

-- Disposable fixtures only — nothing persists.
rollback;
