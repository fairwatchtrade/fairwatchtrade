-- ══════════════════════════════════════════════════════════════════════════
-- Dealer Accelerator — the unattended worker's heartbeat
--
-- "You can leave this page" is only true if something other than the
-- dealer's browser advances the run. This is that something: the database
-- wakes the worker route on a schedule.
--
-- ── Why the credential lives HERE and not in an environment variable ──────
-- The obvious design gives the route a shared secret via env and has the
-- scheduler send it. That needs a human to set the variable, which puts a
-- person back into the loop for the one feature whose whole purpose is
-- removing them from it.
--
-- Instead the secret is generated in the database and NEVER LEAVES IT. The
-- scheduler reads it to build the header; the route does not read it at all —
-- it asks the database "is this token valid?" and gets back a boolean. So the
-- secret is not present in application memory, in a build, in a log, or in
-- anyone's clipboard.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.dealer_accelerator_worker_credential (
  id          boolean     not null default true,
  secret      text        not null,
  created_at  timestamptz not null default now(),
  constraint dealer_accelerator_worker_credential_pkey primary key (id),
  -- One row, forever. `id` is a boolean pinned to true, so a second row is
  -- structurally impossible rather than merely discouraged.
  constraint dealer_accelerator_worker_credential_singleton check (id = true),
  constraint dealer_accelerator_worker_credential_strong check (length(secret) >= 32)
);

-- 64 hex characters from two v4 UUIDs. gen_random_uuid() is built in, so this
-- needs no cryptographic extension to be present.
insert into public.dealer_accelerator_worker_credential (id, secret)
values (
  true,
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (id) do nothing;

-- Deny-all, matching every other table in this family: no client role reaches
-- it, and even the service role cannot read the secret. Only the definer
-- functions below and the table owner can.
alter table public.dealer_accelerator_worker_credential enable row level security;
revoke all on public.dealer_accelerator_worker_credential from public, anon, authenticated, service_role;

-- ── The validator the route calls ────────────────────────────────────────
-- Returns a boolean, never the secret. Comparison is length-checked first and
-- then bitwise over the whole string, so it does not short-circuit on the
-- first differing character.
create or replace function public.dealer_accelerator_worker_token_valid(p_token text)
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
  select secret into v_secret from public.dealer_accelerator_worker_credential where id = true;
  if v_secret is null then
    return false; -- unconfigured means closed, never open
  end if;
  if pg_catalog.length(v_token) <> pg_catalog.length(v_secret) then
    return false;
  end if;
  for i in 1..pg_catalog.length(v_secret) loop
    if pg_catalog.substr(v_token, i, 1) <> pg_catalog.substr(v_secret, i, 1) then
      v_diff := v_diff + 1;
    end if;
  end loop;
  return v_diff = 0;
end
$fn$;

-- The grant trap this schema has already been bitten by once: a newly created
-- public function inherits EXECUTE for anon and authenticated from Supabase's
-- default privileges, and revoking from PUBLIC does not remove them. Revoke
-- the roles explicitly. This one only returns a boolean, but an oracle that
-- confirms a guessed token is still an oracle.
revoke all on function public.dealer_accelerator_worker_token_valid(text) from public, anon, authenticated;
grant execute on function public.dealer_accelerator_worker_token_valid(text) to service_role;

-- ── The tick ─────────────────────────────────────────────────────────────
-- Only wakes the worker when durable state says there is work. An idle
-- platform makes no outbound requests at all, so the schedule costs nothing
-- when nobody is importing.
create or replace function public.dealer_accelerator_worker_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_secret text;
  v_pending int;
begin
  select pg_catalog.count(*) into v_pending
    from public.dealer_accelerator_batches
   where status in ('queued', 'running', 'cancel_requested');

  if v_pending = 0 then
    return; -- nothing in flight: no request, no noise
  end if;

  select secret into v_secret
    from public.dealer_accelerator_worker_credential where id = true;
  if v_secret is null then
    return;
  end if;

  -- Fire and record. The response lands in net._http_response, which is where
  -- to look when a run is not advancing.
  perform net.http_post(
    url := 'https://fairwatchtrade.com/api/dealer-accelerator/worker',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    -- The route works synchronously and answers with what it advanced, so the
    -- wait is deliberate: a short timeout would cut the connection mid-run and
    -- risk the platform aborting the function.
    timeout_milliseconds := 60000
  );
end
$fn$;

revoke all on function public.dealer_accelerator_worker_tick() from public, anon, authenticated, service_role;

-- ── The schedule ─────────────────────────────────────────────────────────
-- Every two minutes. Each tick is bounded and resumable, so cadence only
-- affects how quickly a large inventory finishes, never whether it does.
select cron.unschedule('dealer-accelerator-worker')
where exists (select 1 from cron.job where jobname = 'dealer-accelerator-worker');

select cron.schedule(
  'dealer-accelerator-worker',
  '*/2 * * * *',
  $cmd$select public.dealer_accelerator_worker_tick();$cmd$
);

-- ── Verifying it, later, without guessing ────────────────────────────────
--   select jobname, schedule, active from cron.job
--    where jobname = 'dealer-accelerator-worker';
--
--   -- did the ticks actually reach the route?
--   select status_code, timed_out, error_msg, created
--     from net._http_response order by created desc limit 10;
--
--   -- no client role may ever appear on either function:
--   select p.proname, p.proacl from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname like 'dealer_accelerator_worker%';
