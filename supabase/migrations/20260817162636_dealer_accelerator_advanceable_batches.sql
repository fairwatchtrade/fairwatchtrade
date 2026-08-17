-- ══════════════════════════════════════════════════════════════════════════
-- Dealer Accelerator — one definition of "this run still has work"
--
-- ── The defect this closes ────────────────────────────────────────────────
-- "Advanceable" was expressed in three places and they disagreed:
--
--   the room        !settled || stillProcessing > 0        (correct)
--   worker_tick()   status in (queued,running,cancel_requested)
--   worker route    status in (queued,running,cancel_requested)
--
-- A batch whose DISCOVERY finished still has work if any of its items are
-- awaiting materialization. Both worker predicates missed that, so a batch at
-- completed_with_exceptions with twelve unmaterialized items was invisible:
-- pg_cron fired on schedule, every run succeeded, the tick found no candidate
-- and made zero HTTP calls, and the run sat still forever.
--
-- Observed in production 2026-08-17 during the acceptance walk: thirteen
-- consecutive successful cron runs between 16:00 and 16:24, zero rows in
-- net._http_response, twelve items stranded in 'discovered' behind a batch at
-- completed_with_exceptions. Nothing was broken about the schedule, the
-- credential, the HTTP path, or the adoption logic. The candidate question was
-- simply asked wrongly.
--
-- The batch status alone was never a sufficient signal, because a batch has
-- two phases and its status only describes the first one.
--
-- ── Why a function and not a fixed query in each caller ──────────────────
-- Because it already drifted once, and the drift was invisible until a real
-- walk hit the exact state that exposed it. The predicate now has exactly one
-- definition; the tick asks whether any row exists, the route asks for the
-- rows themselves, and neither restates the rule. If the notion of
-- advanceable work changes, it changes here and both callers follow.
--
-- ⚠ Do not reintroduce a status filter in the worker route or in the tick.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.dealer_accelerator_advanceable_batches(
  p_limit integer default 10
)
returns table (
  batch_id uuid,
  source_id uuid,
  dealer_profile_id uuid,
  batch_status text,
  unmaterialized integer
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    b.id,
    b.source_id,
    b.dealer_profile_id,
    b.status,
    (select count(*)::integer
       from public.dealer_accelerator_batch_items bi
      where bi.batch_id = b.id
        and bi.status in ('discovered', 'ready'))
  from public.dealer_accelerator_batches b
  where
    -- Phase one still running.
    b.status in ('queued', 'running', 'cancel_requested')
    -- Or phase one finished and phase two has not. A blocked item is NOT
    -- work: it is a truthful outcome awaiting the dealer, and treating it as
    -- pending would make the worker spin on it forever.
    or exists (
      select 1 from public.dealer_accelerator_batch_items bi
       where bi.batch_id = b.id
         and bi.status in ('discovered', 'ready')
    )
  -- Least-recently-touched first, so one large inventory cannot starve
  -- everyone else's.
  order by b.updated_at asc
  limit greatest(1, coalesce(p_limit, 10));
$fn$;

-- The grant trap, fifth time this flight. This one only reads, but it reads
-- across every dealer's runs, so it is server-only like the rest.
revoke all on function public.dealer_accelerator_advanceable_batches(integer)
  from public, anon, authenticated;
grant execute on function public.dealer_accelerator_advanceable_batches(integer)
  to service_role;
alter function public.dealer_accelerator_advanceable_batches(integer)
  owner to dealer_accelerator_writer;

-- ── The tick now asks the shared definition ──────────────────────────────
-- The URL also moves from the apex to www. That was NOT a defect: pg_net does
-- follow the apex's 308 (verified — an invalid-token probe to the apex reached
-- the route and was correctly refused with 403, with the redirect recorded).
-- Naming the canonical host just removes a needless hop.
create or replace function public.dealer_accelerator_worker_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_secret text;
begin
  -- One authority on what "has work" means. Previously this restated the
  -- batch-status filter and therefore ignored runs whose discovery had
  -- finished but whose items were still awaiting materialization.
  if not exists (select 1 from public.dealer_accelerator_advanceable_batches(1)) then
    return; -- nothing in flight: no request, no noise
  end if;

  select secret into v_secret
    from public.dealer_accelerator_worker_credential where id = true;
  if v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://www.fairwatchtrade.com/api/dealer-accelerator/worker',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 60000
  );
end
$fn$;

revoke all on function public.dealer_accelerator_worker_tick()
  from public, anon, authenticated, service_role;

-- ── Diagnosing a stalled run, in the order that actually narrows it ──────
--   -- 1. is the schedule alive?
--   select status, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname='dealer-accelerator-worker')
--    order by start_time desc limit 10;
--
--   -- 2. did the tick decide there was work, and did the call land?
--   select status_code, timed_out, error_msg, left(content,80), created
--     from net._http_response order by created desc limit 10;
--
--   -- 3. does the shared definition agree there is work?
--   select * from public.dealer_accelerator_advanceable_batches(10);
--
-- Successful cron runs with NO http responses means the tick saw no work.
-- If (3) returns rows while (2) is empty, the tick and the definition have
-- drifted apart again — which is the bug this migration exists to prevent.
