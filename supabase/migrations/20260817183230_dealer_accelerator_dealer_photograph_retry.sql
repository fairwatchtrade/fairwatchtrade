-- ══════════════════════════════════════════════════════════════════════════
-- Dealer Accelerator — governed per-item photograph retry (founder ruling,
-- Build A, 2026-08-17)
--
-- TRY AGAIN is now supported, so the Design Gate's "only when supported"
-- condition is met by making it true rather than by hiding the button.
--
-- ── What terminality means after this change ─────────────────────────────
-- retrieval_terminal still means what it always meant to every AUTOMATIC
-- path: no unattended process will ever touch this photograph again. The
-- worker's slice only selects declared/retrieval_failed; nothing here
-- changes that, so terminality is not weakened for machines.
--
-- What changes is that a DEALER may explicitly re-arm their own failed
-- photographs. Terminality exists to stop automatic retry loops, not to
-- forbid the owner of the inventory from saying "I fixed my website, look
-- again." The re-arm is a new governed act with its own append-only event;
-- the prior failure's events remain untouched, so the history reads
-- truthfully: declared -> failed -> terminal -> retry requested -> ...
--
-- ── Scope guarantees, enforced here and not left to the caller ───────────
--   · dealer actor ONLY, and the dealer must OWN the item. Not founder, not
--     worker, not system: an explicit product action by the inventory's
--     owner is the entire justification for reversing a terminal state.
--     There is deliberately NO actor-kind parameter — this function CANNOT
--     record anyone but a dealer, which is how "no automatic retry loop" is
--     a property of the engine rather than a promise of the callers.
--   · only THIS item's photographs, and only those in retrieval_failed or
--     retrieval_terminal. Retrieved photographs are never touched.
--   · only a blocked item may retry. A discovered/ready item has nothing to
--     recover; a draft_created item is done.
--   · no source, authorization episode, or batch is created or modified.
--
-- The retrieval half lives in lib/dealer/manifestAdapter.ts
-- (retryItemPhotographs): it fetches the re-armed photographs under exactly
-- the laws a worker slice fetches under — pinned connection, governed
-- origins, magic-byte validation, content-addressed create-only archive —
-- and records outcomes through the SAME retrieval RPCs, so a failed retry
-- produces evidence indistinguishable in shape from any other failure.
-- ══════════════════════════════════════════════════════════════════════════

-- One new event type, additive (35th). Reusing photograph_declared would
-- claim a first declaration happened when what happened was a retry.
alter table public.dealer_accelerator_lifecycle_events
  drop constraint dealer_accelerator_lifecycle_events_type_check;

alter table public.dealer_accelerator_lifecycle_events
  add constraint dealer_accelerator_lifecycle_events_type_check
  check (event_type = any (array[
    'source_authorized', 'source_suspended', 'source_reauthorized',
    'source_revoked', 'source_item_registered', 'batch_created',
    'batch_started', 'batch_completed', 'batch_completed_with_exceptions',
    'batch_failed', 'batch_retry_queued', 'item_registered',
    'observation_recorded', 'item_readied', 'item_blocked', 'item_unblocked',
    'item_lease_claimed', 'item_lease_recovered', 'item_retry_scheduled',
    'item_retry_exhausted', 'payload_recorded', 'photograph_declared',
    'photograph_retrieved', 'photograph_retrieval_failed',
    'extraction_recorded', 'batch_cancel_requested', 'batch_cancelled',
    'batch_initialization_lease_claimed', 'batch_initialization_lease_recovered',
    'photograph_retrieval_terminal', 'item_draft_created',
    'listing_submitted_for_review', 'item_materialization_adopted',
    'photograph_retry_requested'
  ]));

create or replace function public.dealer_accelerator_retry_item_photographs(
  p_batch_item_id uuid,
  p_actor_user_id uuid
)
returns table (
  photograph_id uuid,
  source_url text,
  prior_state text,
  source_id uuid
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item public.dealer_accelerator_batch_items;
  v_rearmed int := 0;
  v_meta jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;

  select * into v_item
    from public.dealer_accelerator_batch_items
   where id = p_batch_item_id
   for update;
  if not found then raise exception 'batch_item_not_found'; end if;

  -- Ownership is the authorization. A dealer may re-arm their own failed
  -- photographs and nobody else's.
  if v_item.dealer_profile_id is distinct from p_actor_user_id then
    raise exception 'not_item_owner';
  end if;

  if v_item.status <> 'blocked' then
    raise exception 'item_not_blocked:%', v_item.status;
  end if;

  -- Re-arm: failed/terminal -> declared. Retrieved photographs are never
  -- touched. The UPDATE is the current-state half; the append-only history
  -- half is the event below, and the prior failure events remain exactly
  -- where they were.
  create temp table _rearmed on commit drop as
  select p.id, p.source_url, p.retrieval_state as prior_state, p.source_id
    from public.dealer_accelerator_photographs p
   where p.batch_item_id = v_item.id
     and p.retrieval_state in ('retrieval_failed', 'retrieval_terminal');

  select count(*) into v_rearmed from _rearmed;
  if v_rearmed = 0 then
    raise exception 'no_failed_photographs';
  end if;

  update public.dealer_accelerator_photographs p
     set retrieval_state = 'declared',
         updated_at = now()
    from _rearmed r
   where p.id = r.id;

  select jsonb_agg(jsonb_build_object(
           'photograph_id', r.id,
           'source_url', r.source_url,
           'prior_state', r.prior_state))
    into v_meta
    from _rearmed r;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_item_id, dealer_profile_id, entity_kind, event_type,
    prior_state, resulting_state, actor_kind, actor_user_id,
    reason_code, metadata
  ) values (
    v_item.id, v_item.dealer_profile_id, 'item', 'photograph_retry_requested',
    'blocked', 'blocked', 'dealer', p_actor_user_id,
    'dealer_photograph_retry',
    jsonb_build_object('photographs', coalesce(v_meta, '[]'::jsonb))
  );

  return query select r.id, r.source_url, r.prior_state, r.source_id from _rearmed r;
end
$fn$;

-- The grant trap, sixth time this flight: a freshly created public function
-- inherits EXECUTE for anon and authenticated, and this one mutates state.
revoke all on function public.dealer_accelerator_retry_item_photographs(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.dealer_accelerator_retry_item_photographs(uuid, uuid)
  to service_role;
alter function public.dealer_accelerator_retry_item_photographs(uuid, uuid)
  owner to dealer_accelerator_writer;

-- ── Reading a retried item's history, which now tells the whole story ────
--   select e.created_at, e.event_type, e.actor_kind, e.reason_code
--     from public.dealer_accelerator_lifecycle_events e
--    where e.batch_item_id = '<item>'
--    order by e.id;
--   -- expect: ... photograph_retrieval_failed/terminal (the real failure)
--   --         -> photograph_retry_requested:dealer (the explicit act)
--   --         -> photograph_retrieved / _failed / _terminal (the new attempt)
--   --         -> item_readied + item_draft_created on success
