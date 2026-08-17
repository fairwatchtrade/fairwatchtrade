-- ══════════════════════════════════════════════════════════════════════════
-- Dealer Accelerator — source lineage, and continuity across authorization
-- episodes
--
-- ── The defect, exposed by a controlled test reset ────────────────────────
-- dealer_accelerator_sources conflated two different things in one row:
--
--   IDENTITY / LINEAGE   which governed inventory source this is
--                        (dealer + type + locator_key + adapter_scope)
--   AUTHORIZATION        one episode of permission over it
--                        (state, authorized_by, basis, terms, revoked_at)
--
-- Source items hang off a source_id, and revocation is terminal by design.
-- So retiring an authorization silently retired the platform's memory of
-- everything that source had ever materialized: reconnecting the same dealer
-- to the same website produced a new source row with no items, every watch
-- looked new, and a second listing would have been created for watches that
-- already existed. That is a duplicate-listing defect, reached without anyone
-- doing anything wrong — a retirement performed exactly as instructed.
--
-- ── What is deliberately NOT done here ───────────────────────────────────
-- No historical source_id is rewritten. No revoked authorization is
-- resurrected — the state machine still refuses revoked -> authorized, and
-- that stays true. No listing, source item, photograph, observation or
-- revocation event is altered or removed. Every change below is additive.
--
-- ── The two pieces ───────────────────────────────────────────────────────
-- 1. LINEAGE becomes explicit. A generated column names the governed source
--    independently of any authorization episode over it, so "the same source,
--    authorized again" is a fact the database can state rather than a
--    four-column predicate repeated in every query.
--
-- 2. ADOPTION. A later episode registers its own source items — correct, they
--    record what that episode actually observed — but at materialization time
--    an item whose key was already materialized by an earlier episode of the
--    same lineage LINKS to that existing listing instead of creating a second
--    one. batch_items.listing_id carries no unique constraint, so more than
--    one episode may truthfully point at the same listing, and
--    batch_items_listing_truth_check is satisfied because the item genuinely
--    does have a draft.
--
-- ── Why adoption runs BEFORE eligibility assessment ──────────────────────
-- An item legitimately materialized once should not have to re-clear the
-- evidence bar to be recognized. Its current-episode evidence may differ — a
-- photograph that has since started 404ing, a price the dealer has edited —
-- without any of that making the existing listing untrue. Assessment governs
-- what may become a NEW draft; adoption governs what already is one.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Lineage ────────────────────────────────────────────────────────────
-- Length-prefixed segments, matching the discipline already used by the
-- adapter's idempotency digest: a value can never impersonate the delimiter,
-- so two different tuples can never collide on one key. Generated and STORED
-- so it is indexable and cannot drift from the columns it derives from.
alter table public.dealer_accelerator_sources
  add column if not exists source_lineage_key text
  generated always as (
    length(dealer_profile_id::text)::text || ':' || dealer_profile_id::text || '|' ||
    length(source_type)::text            || ':' || source_type            || '|' ||
    length(source_locator_key)::text     || ':' || source_locator_key     || '|' ||
    length(adapter_scope)::text          || ':' || adapter_scope
  ) stored;

comment on column public.dealer_accelerator_sources.source_lineage_key is
  'Identity of the governed inventory source, independent of any authorization '
  'episode over it. Two rows sharing this key are the same source authorized at '
  'different times — including a revoked episode and its successor. Derived, '
  'never written.';

create index if not exists dealer_accelerator_sources_lineage_idx
  on public.dealer_accelerator_sources (source_lineage_key);

-- ── 2. One new event type ────────────────────────────────────────────────
-- Adoption is a genuinely new fact and is recorded as one rather than
-- borrowed from item_draft_created, which would claim a draft was created when
-- none was. The vocabulary is extended additively; nothing existing changes.
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
    'listing_submitted_for_review',
    'item_materialization_adopted'
  ]));

-- ── 3. Adoption ──────────────────────────────────────────────────────────
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

  -- Already carries a listing: settled, and this call writes nothing.
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

  -- The prior materialization: same lineage, same external item key, a
  -- DIFFERENT source (a different authorization episode), already holding a
  -- listing. Oldest first, so adoption is deterministic when an item has been
  -- materialized more than once historically.
  select bi.listing_id, bi.source_id, bi.created_at
    into v_prior
    from public.dealer_accelerator_batch_items bi
    join public.dealer_accelerator_source_items si on si.id = bi.source_item_id
    join public.dealer_accelerator_sources s on s.id = bi.source_id
   where s.source_lineage_key = v_lineage
     and si.source_item_key = v_item_key
     and bi.source_id <> v_item.source_id
     and bi.listing_id is not null
     -- Ownership is re-proven, never assumed from the lineage key alone.
     and bi.dealer_profile_id = v_item.dealer_profile_id
   order by bi.created_at asc, bi.id asc
   limit 1;

  if v_prior.listing_id is null then
    return query select 'NO_PRIOR'::text, null::uuid, null::uuid,
      'no earlier episode materialized this item'::text;
    return;
  end if;

  -- The listing must still exist and still belong to this dealer. The FK is
  -- ON DELETE CASCADE so a removed listing takes its batch_item with it, but
  -- ownership is checked explicitly rather than inferred.
  if not exists (
    select 1 from public.listings l
     where l.id = v_prior.listing_id
       and l.seller_id = v_item.dealer_profile_id
  ) then
    return query select 'NO_PRIOR'::text, null::uuid, null::uuid,
      'earlier listing is absent or no longer owned by this dealer'::text;
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

-- The grant trap, for the fourth time this flight: creating a function in the
-- public schema publishes it unless anon and authenticated are revoked
-- explicitly. This one mutates item state, so exposure would be serious.
revoke all on function public.dealer_accelerator_adopt_prior_materialization(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.dealer_accelerator_adopt_prior_materialization(uuid, text, uuid)
  to service_role;
alter function public.dealer_accelerator_adopt_prior_materialization(uuid, text, uuid)
  owner to dealer_accelerator_writer;

-- ── Verifying the seam without running a walk ────────────────────────────
-- Read-only, and it predicts exactly what the next run will do:
--
--   with lineage as (
--     select id from public.dealer_accelerator_sources
--      where dealer_profile_id = '<dealer>'
--        and source_type = 'static_json_manifest'
--        and source_locator_key = '<locator>'
--        and adapter_scope = 'flight3-static-manifest-v1'
--   )
--   select distinct si.source_item_key
--     from public.dealer_accelerator_batch_items bi
--     join public.dealer_accelerator_source_items si on si.id = bi.source_item_id
--     join lineage s on s.id = bi.source_id
--    where bi.listing_id is not null;
--
-- Those keys will be ADOPTED. Everything else in the manifest is new work.
