-- Transaction-local RLS proof against existing deliberately-public rooms.
-- No rows are inserted, and every publication/identity change is rolled back.
begin;
do $$
declare owner_id uuid;
begin
  if not exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='dealer_profiles' and column_name='public_room_enabled'
    and data_type='boolean' and is_nullable='NO' and column_default='false') then
    raise exception 'publication column/default failed';
  end if;
  if has_column_privilege('authenticated', 'public.dealer_profiles', 'public_room_enabled', 'UPDATE') then
    raise exception 'owner publication privilege must be denied';
  end if;
  if not has_column_privilege('authenticated', 'public.dealer_profiles', 'tagline', 'UPDATE') then
    raise exception 'owner identity grant was lost';
  end if;
  select seller_id into strict owner_id from public.dealer_profiles where slug='the-collector-identity';
  if not exists (select 1 from public.dealer_profiles where slug='the-collector-identity' and public_room_enabled)
    or not exists (select 1 from public.dealer_profiles where slug='williams-watches' and public_room_enabled) then
    raise exception 'deliberate backfill failed';
  end if;

  -- The private state exists only inside this transaction; outside readers retain public state.
  update public.dealer_profiles set public_room_enabled=false where seller_id=owner_id;
  execute 'set local role service_role';
  if not exists (select 1 from public.dealer_profiles where seller_id=owner_id and not public_room_enabled) then
    raise exception 'service private read failed';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  if exists (select 1 from public.dealer_profiles where slug='the-collector-identity') then
    raise exception 'anonymous private row leaked';
  end if;
  if not exists (select 1 from public.dealer_profiles where slug='williams-watches') then
    raise exception 'anonymous public read failed';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  execute 'set local role authenticated';
  if exists (select 1 from public.dealer_profiles where slug='the-collector-identity') then
    raise exception 'unrelated authenticated private row leaked';
  end if;
  if not exists (select 1 from public.dealer_profiles where slug='williams-watches') then
    raise exception 'unrelated public read failed';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.dealer_profiles where seller_id=owner_id and not public_room_enabled) then
    raise exception 'owner private identity/workspace read failed';
  end if;
  update public.dealer_profiles set tagline=tagline where seller_id=owner_id;
  if not found then raise exception 'owner private identity edit failed'; end if;
  begin
    update public.dealer_profiles set public_room_enabled=true where seller_id=owner_id;
    raise exception 'owner self-publication unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  update public.dealer_profiles set public_room_enabled=true where seller_id=owner_id;
  execute 'set local role authenticated';
  if not exists (select 1 from public.dealer_profiles where seller_id=owner_id and public_room_enabled) then
    raise exception 'owner public read failed';
  end if;
  execute 'reset role';
end $$;
rollback;
select 'PASS: default false, grants, public/private anon/unrelated/owner/service reads, owner private edit, owner publication denied; transaction rolled back' as publication_rls_proof;
