-- Bind the hourly upsert to its named key and qualify the retention predicate.
-- The function's TABLE result exposes `snapshot_hour` as a PL/pgSQL variable,
-- so unqualified uses of that name are ambiguous at runtime.
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
  on conflict on constraint metal_price_snapshots_pkey do update
    set price = excluded.price,
        captured_at = excluded.captured_at;

  delete from public.metal_price_snapshots as snapshots
   where snapshots.snapshot_hour < v_hour - interval '24 hours';

  return query
  select v_hour, pg_catalog.count(*)
    from public.metal_price_snapshots;
end
$fn$;

revoke all on function public.record_metal_price_snapshot(numeric,numeric,numeric,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_metal_price_snapshot(numeric,numeric,numeric,timestamptz)
  to service_role;
