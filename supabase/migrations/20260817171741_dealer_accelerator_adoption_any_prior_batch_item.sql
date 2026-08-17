-- ══════════════════════════════════════════════════════════════════════════
-- Adoption: match any OTHER batch item of the lineage, not only another source
--
-- ── Why the original condition was too narrow ────────────────────────────
-- Adoption required bi.source_id <> v_item.source_id, i.e. "a different
-- authorization episode". That was the case it was built for — a revoked source
-- and its successor — but it is not the only way one source item legitimately
-- appears in two batches.
--
-- A dealer who corrects their inventory and publishes a NEW SNAPSHOT gets a new
-- batch over the SAME source and the SAME source items. The already-materialized
-- watches then have a prior batch item holding a listing on the same source_id,
-- which the old condition skipped. With nothing to adopt they would be
-- re-materialized — a second listing for a watch that already has one, which is
-- the exact defect adoption exists to prevent.
--
-- The correct test was never "a different source". It is "a different batch
-- item of the same lineage that already holds a listing". That covers both:
--
--   different authorization episode   (revoked source -> successor)
--   different snapshot, same source   (a corrected or updated inventory)
--
-- Ownership is still re-proven via bi.dealer_profile_id, and the lineage key
-- still bounds the search to this dealer's own governed source.
--
-- Found while restoring TD-0013: its two declared photographs 404'd, the item
-- blocked truthfully, and recovering it required a new snapshot — which would
-- have walked straight into this narrowness for the twelve watches already
-- prepared.
--
-- Pairs with a TypeScript change in the same flight: materializeOneItem now
-- accepts an explicit batchItemId, because a batch-driven caller must act on
-- the item IT selected rather than on "whichever item for this key already
-- holds a listing". Without both halves, a second snapshot either strands its
-- items forever or duplicates listings.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.dealer_accelerator_adopt_prior_materialization(
  p_batch_item_id uuid,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns table (
  outcome text,
  listing_id uuid,
  adopted_from_source_id uuid,
  detail text
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item public.dealer_accelerator_batch_items;
  v_item_key text;
  v_lineage text;
  v_actor text := btrim(coalesce(p_actor_kind, ''));
  v_prior record;
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;

  select * into v_item
    from public.dealer_accelerator_batch_items
   where id = p_batch_item_id
   for update;
  if not found then raise exception 'batch_item_not_found'; end if;

  if v_item.listing_id is not null then
    return query select 'ALREADY_LINKED'::text, v_item.listing_id, null::uuid,
      'item already carries a listing; nothing written'::text;
    return;
  end if;

  -- Only an item that has not reached a terminal state may adopt. A blocked
  -- item must be re-assessed on its own evidence, not quietly satisfied by an
  -- earlier success.
  if v_item.status not in ('discovered', 'ready') then
    return query select 'NOT_ELIGIBLE'::text, null::uuid, null::uuid,
      ('item status ' || v_item.status || ' cannot adopt')::text;
    return;
  end if;

  select si.source_item_key, s.source_lineage_key
    into v_item_key, v_lineage
    from public.dealer_accelerator_source_items si
    join public.dealer_accelerator_sources s on s.id = si.source_id
   where si.id = v_item.source_item_id;
  if v_item_key is null then
    raise exception 'source_item_not_found';
  end if;

  -- Any OTHER batch item of this lineage, same external item key, already
  -- holding a listing, same dealer. `bi.id <> v_item.id` replaces the former
  -- `bi.source_id <> v_item.source_id`: a second snapshot on the SAME source is
  -- just as much a prior materialization as a previous authorization episode.
  --
  -- Still no join to public.listings — that read was redundant and dragged an
  -- unrelated buyer-side RLS policy into this narrow-privilege function.
  select bi.listing_id, bi.source_id, bi.created_at
    into v_prior
    from public.dealer_accelerator_batch_items bi
    join public.dealer_accelerator_source_items si on si.id = bi.source_item_id
    join public.dealer_accelerator_sources s on s.id = bi.source_id
   where s.source_lineage_key = v_lineage
     and si.source_item_key = v_item_key
     and bi.id <> v_item.id
     and bi.listing_id is not null
     and bi.dealer_profile_id = v_item.dealer_profile_id
   order by bi.created_at asc, bi.id asc
   limit 1;

  if v_prior.listing_id is null then
    return query select 'NO_PRIOR'::text, null::uuid, null::uuid,
      'no earlier batch item materialized this watch'::text;
    return;
  end if;

  update public.dealer_accelerator_batch_items
     set status = 'draft_created',
         listing_id = v_prior.listing_id,
         blocked_reason_code = null,
         lease_token = null,
         lease_expires_at = null,
         updated_at = now()
   where id = v_item.id;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_item_id, dealer_profile_id, entity_kind, event_type,
    prior_state, resulting_state, actor_kind, actor_user_id,
    reason_code, metadata
  ) values (
    v_item.id, v_item.dealer_profile_id, 'item', 'item_materialization_adopted',
    v_item.status, 'draft_created', v_actor, p_actor_user_id,
    'lineage_continuity',
    jsonb_build_object(
      'source_item_key', v_item_key,
      'source_lineage_key', v_lineage,
      'adopted_listing_id', v_prior.listing_id,
      'adopted_from_source_id', v_prior.source_id,
      'current_source_id', v_item.source_id
    )
  );

  return query select 'ADOPTED'::text, v_prior.listing_id, v_prior.source_id,
    'linked to the listing an earlier batch item created; no second listing'::text;
end
$fn$;

revoke all on function public.dealer_accelerator_adopt_prior_materialization(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.dealer_accelerator_adopt_prior_materialization(uuid, text, uuid)
  to service_role;
alter function public.dealer_accelerator_adopt_prior_materialization(uuid, text, uuid)
  owner to dealer_accelerator_writer;
