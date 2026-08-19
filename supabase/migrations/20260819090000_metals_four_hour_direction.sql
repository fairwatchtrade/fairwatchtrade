-- Metals 4-hour direction: one hourly observation per metal, retained for
-- only 24 hours. The public bar still gets its current price from gold-api;
-- this table supplies memory, not a second price source.

create table if not exists public.metal_price_snapshots (
  metal       text        not null,
  price       numeric(14,4) not null,
  captured_at timestamptz not null,
  snapshot_hour timestamptz not null,
  constraint metal_price_snapshots_pkey primary key (metal, snapshot_hour),
  constraint metal_price_snapshots_metal_check
    check (metal in ('gold', 'silver', 'platinum')),
  constraint metal_price_snapshots_price_check check (price > 0)
);

create index if not exists metal_price_snapshots_captured_at_idx
  on public.metal_price_snapshots (captured_at);

alter table public.metal_price_snapshots enable row level security;
revoke all on public.metal_price_snapshots
  from public, anon, authenticated, service_role;
grant select on public.metal_price_snapshots to service_role;

-- One atomic operation owns hourly de-duplication and retention. Replaying an
-- hour updates that hour rather than growing a duplicate, and every successful
-- capture removes observations outside the small operating window.
create or replace function public.record_metal_price_snapshot(
  p_gold numeric,
  p_silver numeric,
  p_platinum numeric,
  p_captured_at timestamptz default now()
)
returns table(snapshot_hour timestamptz, retained_rows bigint)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_captured_at timestamptz := coalesce(p_captured_at, pg_catalog.now());
  v_hour timestamptz := pg_catalog.date_trunc(
    'hour',
    v_captured_at,
    'UTC'
  );
begin
  if p_gold <= 0 or p_silver <= 0 or p_platinum <= 0 then
    raise exception 'metal prices must be positive';
  end if;

  insert into public.metal_price_snapshots (
    metal,
    price,
    captured_at,
    snapshot_hour
  )
  values
    ('gold', p_gold, v_captured_at, v_hour),
    ('silver', p_silver, v_captured_at, v_hour),
    ('platinum', p_platinum, v_captured_at, v_hour)
  on conflict (metal, snapshot_hour) do update
    set price = excluded.price,
        captured_at = excluded.captured_at;

  delete from public.metal_price_snapshots
   where snapshot_hour < v_hour - interval '24 hours';

  return query
  select v_hour, pg_catalog.count(*)
    from public.metal_price_snapshots;
end
$fn$;

revoke all on function public.record_metal_price_snapshot(numeric,numeric,numeric,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_metal_price_snapshot(numeric,numeric,numeric,timestamptz)
  to service_role;

-- Database-owned bearer credential: pg_cron can present it, while the route
-- can only ask this definer function whether the presented token is valid.
create table if not exists public.metal_price_snapshot_credential (
  id         boolean     not null default true,
  secret     text        not null,
  created_at timestamptz not null default now(),
  constraint metal_price_snapshot_credential_pkey primary key (id),
  constraint metal_price_snapshot_credential_singleton check (id = true),
  constraint metal_price_snapshot_credential_strong check (length(secret) >= 32)
);

insert into public.metal_price_snapshot_credential (id, secret)
values (
  true,
  replace(gen_random_uuid()::text, '-', '') ||
  replace(gen_random_uuid()::text, '-', '')
)
on conflict (id) do nothing;

alter table public.metal_price_snapshot_credential enable row level security;
revoke all on public.metal_price_snapshot_credential
  from public, anon, authenticated, service_role;

create or replace function public.metal_price_snapshot_token_valid(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_secret text;
  v_token text := coalesce(p_token, '');
  v_diff int := 0;
  i int;
begin
  select secret into v_secret
    from public.metal_price_snapshot_credential
   where id = true;

  if v_secret is null or pg_catalog.length(v_token) <> pg_catalog.length(v_secret) then
    return false;
  end if;

  for i in 1..pg_catalog.length(v_secret) loop
    if pg_catalog.substr(v_token, i, 1) <>
       pg_catalog.substr(v_secret, i, 1) then
      v_diff := v_diff + 1;
    end if;
  end loop;
  return v_diff = 0;
end
$fn$;

revoke all on function public.metal_price_snapshot_token_valid(text)
  from public, anon, authenticated;
grant execute on function public.metal_price_snapshot_token_valid(text)
  to service_role;

create or replace function public.metal_price_snapshot_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_secret text;
begin
  select secret into v_secret
    from public.metal_price_snapshot_credential
   where id = true;
  if v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://www.fairwatchtrade.com/api/metals/snapshot',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 30000
  );
end
$fn$;

revoke all on function public.metal_price_snapshot_tick()
  from public, anon, authenticated, service_role;

select cron.unschedule('metal-price-hourly-snapshot')
where exists (
  select 1 from cron.job where jobname = 'metal-price-hourly-snapshot'
);

select cron.schedule(
  'metal-price-hourly-snapshot',
  '3 * * * *',
  $cmd$select public.metal_price_snapshot_tick();$cmd$
);

-- Verification, without touching the public bar:
--   select jobname, schedule, active from cron.job
--    where jobname = 'metal-price-hourly-snapshot';
--   select metal, price, captured_at from public.metal_price_snapshots
--    order by captured_at desc, metal;
--   select count(*) <= 75 as bounded from public.metal_price_snapshots;
