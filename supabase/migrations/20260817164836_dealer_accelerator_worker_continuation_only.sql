-- ══════════════════════════════════════════════════════════════════════════
-- The worker continues; it never initiates
--
-- ── The defect ───────────────────────────────────────────────────────────
-- "Has unfinished items" was treated as "may be advanced". Two consequences,
-- both observed in production 2026-08-17:
--
--   · The founder's batch b7a6318d — clean-v1, completed 2026-08-08, twelve
--     items deliberately left unmaterialized because the founder path
--     materializes one deliberate call at a time — became a candidate.
--   · Continuing it re-resolved the source's CURRENT discovery document
--     rather than the batch it was handed, and CREATED a new clean-v2 batch
--     (2496ea0d) on the founder's source that nobody asked for.
--
-- A background worker exists to finish what a person started. It must never
-- discover an idle historical batch and begin new preparation.
--
-- ── The seam already existed; nothing new was invented ───────────────────
-- dealer_accelerator_transition_batch already writes batch_started with the
-- actor kind of whoever caused it, and that distinction is exactly the one
-- required:
--
--   batch_started:dealer   started through the Dealer Accelerator room, where
--                          the dealer asked for the WHOLE run to be prepared
--   batch_started:founder  a founder invoking a bounded slice by hand, which
--                          is a request for one slice and not standing
--                          permission for a background process to finish it
--
-- Verified against the live rows BEFORE choosing it:
--
--   b7a6318d  founder clean-v1   batch_created:founder, batch_started:founder
--   c0b980ae  TCI clean-v1       batch_created:founder, batch_started:founder
--   9ebe7621  TCI clean-v2       batch_created:dealer,  batch_started:dealer
--
-- So the gate excludes both hand-invoked runs and admits the genuine dealer
-- run, with no new column and no new event type.
--
-- ⚠ The accidental batch 2496ea0d carries batch_started:DEALER even though no
-- dealer started it, because advancePreparation hardcoded actorKind 'dealer'
-- and the worker inherited it. That false attribution is fixed in the
-- application (a continuation now records 'worker'), and the batch itself is
-- retired through the ordinary cancellation lifecycle rather than by editing
-- history. The gate alone would not have excluded it.
--
-- ── Terminal-negative batches are also excluded now ──────────────────────
-- Materializing items from a failed or cancelled run was never intended. Only
-- a batch that finished DISCOVERY (completed / completed_with_exceptions) has
-- items worth materializing. A cancelled batch's items are not pending work;
-- they are work that was called off.
--
-- DROP is required because the OUT row type gains source_snapshot_key — which
-- the caller needs in order to pin continuation to this batch's own snapshot.
-- Owner and grants are therefore re-issued: a freshly created function would
-- otherwise inherit EXECUTE for anon and authenticated and lose its writer
-- ownership.
-- ══════════════════════════════════════════════════════════════════════════

drop function if exists public.dealer_accelerator_advanceable_batches(integer);

create function public.dealer_accelerator_advanceable_batches(
  p_limit integer default 10
)
returns table (
  batch_id uuid,
  source_id uuid,
  dealer_profile_id uuid,
  batch_status text,
  source_snapshot_key text,
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
    -- Handed to the caller so continuation pins to THIS batch's snapshot and
    -- can never resolve a newer one into existence.
    b.source_snapshot_key,
    (select count(*)::integer
       from public.dealer_accelerator_batch_items bi
      where bi.batch_id = b.id
        and bi.status in ('discovered', 'ready'))
  from public.dealer_accelerator_batches b
  where
    -- Only runs a DEALER explicitly started through the product may be
    -- continued unattended.
    exists (
      select 1 from public.dealer_accelerator_lifecycle_events e
       where e.batch_id = b.id
         and e.event_type = 'batch_started'
         and e.actor_kind = 'dealer'
    )
    and (
      -- Phase one still running, including finalizing a requested cancellation.
      b.status in ('queued', 'running', 'cancel_requested')
      -- Or discovery finished and materialization has not. Deliberately NOT
      -- 'failed' or 'cancelled': those items are not pending work.
      or (
        b.status in ('completed', 'completed_with_exceptions')
        and exists (
          select 1 from public.dealer_accelerator_batch_items bi
           where bi.batch_id = b.id
             and bi.status in ('discovered', 'ready')
        )
      )
    )
  -- Least-recently-touched first, so one large inventory cannot starve
  -- everyone else's.
  order by b.updated_at asc
  limit greatest(1, coalesce(p_limit, 10));
$fn$;

revoke all on function public.dealer_accelerator_advanceable_batches(integer)
  from public, anon, authenticated;
grant execute on function public.dealer_accelerator_advanceable_batches(integer)
  to service_role;
alter function public.dealer_accelerator_advanceable_batches(integer)
  owner to dealer_accelerator_writer;

-- ── Proving the gate, without running anything ───────────────────────────
--   -- idle historical runs must NOT appear:
--   select * from public.dealer_accelerator_advanceable_batches(50);
--
--   -- why each batch is or is not admitted:
--   select b.id, b.status,
--          exists (select 1 from public.dealer_accelerator_lifecycle_events e
--                   where e.batch_id = b.id and e.event_type = 'batch_started'
--                     and e.actor_kind = 'dealer') as dealer_started,
--          (select count(*) from public.dealer_accelerator_batch_items bi
--            where bi.batch_id = b.id and bi.status in ('discovered','ready')) as unmaterialized
--     from public.dealer_accelerator_batches b order by b.created_at;
