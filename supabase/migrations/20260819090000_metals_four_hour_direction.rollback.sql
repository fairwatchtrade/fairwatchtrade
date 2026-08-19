select cron.unschedule('metal-price-hourly-snapshot')
where exists (
  select 1 from cron.job where jobname = 'metal-price-hourly-snapshot'
);

drop function if exists public.metal_price_snapshot_tick();
drop function if exists public.metal_price_snapshot_token_valid(text);
drop function if exists public.record_metal_price_snapshot(numeric,numeric,numeric,timestamptz);
drop table if exists public.metal_price_snapshot_credential;
drop table if exists public.metal_price_snapshots;
