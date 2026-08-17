-- ══════════════════════════════════════════════════════════════════════════
-- Adoption: stop reading public.listings
--
-- ── The failure ──────────────────────────────────────────────────────────
-- Every adoption attempt failed with 42501, "permission denied for table
-- purchase_requests", and the caller's per-item catch turned twelve identical
-- failures into twelve silent "needing attention" counts. Durable state said
-- 'discovered' while the report said "attention" — that contradiction was the
-- only visible clue.
--
-- The function is SECURITY DEFINER owned by dealer_accelerator_writer, a role
-- with deliberately narrow grants. Its ownership re-check read
-- public.listings, and listings' RLS policy listings_select_public_or_own
-- contains:
--
--   EXISTS (SELECT 1 FROM purchase_requests pr
--            WHERE pr.listing_id = listings.id AND pr.buyer_id = auth.uid() ...)
--
-- Evaluating that policy requires SELECT on purchase_requests. The writer role
-- has no such grant, correctly — an ingestion role has no business reading
-- buyer offers.
--
-- ── What was NOT done to fix it ──────────────────────────────────────────
-- Not granting dealer_accelerator_writer access to purchase_requests, which
-- would hand an ingestion role a view of buyer offers to satisfy a check it
-- does not need. Not widening listings_select_public_or_own, which is the
-- canonical PUBLIC predicate and must never gain exceptions.
--
-- The real error was reaching into an unrelated table from inside a
-- narrow-privilege definer function at all. So the read is removed.
--
-- ── Why removing it loses nothing ────────────────────────────────────────
-- Both properties it checked are already guaranteed structurally:
--
--   EXISTENCE — dealer_accelerator_batch_items_listing_fk is
--   FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE.
--   A deleted listing takes its batch_item with it, so a surviving row with a
--   non-null listing_id proves the listing exists. There is no window in
--   which it can point at a listing that is gone.
--
--   OWNERSHIP — the candidate query already requires
--   bi.dealer_profile_id = v_item.dealer_profile_id, and imported listings are
--   created for that dealer by dealer_import_one_listing in one transaction
--   with their provenance. A batch_item of this dealer cannot carry another
--   dealer's listing.
--
-- The lookup half was verified correct in production BEFORE this change: for
-- TD-0001 the prior-match query returned exactly one row, the expected
-- listing, still owned by the dealer. Only the redundant read was failing.
--
-- ── The durable lesson ───────────────────────────────────────────────────
-- A SECURITY DEFINER function owned by a narrow role inherits that role's
-- privileges for EVERY table it touches, including tables reached only through
-- another table's RLS policy. Before adding a cross-table read to any function
-- in this family, ask what policies that table carries and what THEY read.
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
  -- earlier episode's success.
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

  -- Same lineage, same external item key, a DIFFERENT source (a different
  -- authorization episode), already holding a listing, and belonging to this
  -- same dealer. Oldest first, so adoption is deterministic when an item has
  -- been materialized more than once historically.
  --
  -- This query stays entirely inside the accelerator's own tables. It does
  -- NOT join public.listings — see the header: that read was redundant and it
  -- dragged an unrelated buyer-side RLS policy into this function.
  select bi.listing_id, bi.source_id, bi.created_at
    into v_prior
    from public.dealer_accelerator_batch_items bi
    join public.dealer_accelerator_source_items si on si.id = bi.source_item_id
    join public.dealer_accelerator_sources s on s.id = bi.source_id
   where s.source_lineage_key = v_lineage
     and si.source_item_key = v_item_key
     and bi.source_id <> v_item.source_id
     and bi.listing_id is not null
     and bi.dealer_profile_id = v_item.dealer_profile_id
   order by bi.created_at asc, bi.id asc
   limit 1;

  if v_prior.listing_id is null then
    return query select 'NO_PRIOR'::text, null::uuid, null::uuid,
      'no earlier episode materialized this item'::text;
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
    'linked to the listing an earlier authorization episode created; no second listing'::text;
end
$fn$;

revoke all on function public.dealer_accelerator_adopt_prior_materialization(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.dealer_accelerator_adopt_prior_materialization(uuid, text, uuid)
  to service_role;
alter function public.dealer_accelerator_adopt_prior_materialization(uuid, text, uuid)
  owner to dealer_accelerator_writer;
