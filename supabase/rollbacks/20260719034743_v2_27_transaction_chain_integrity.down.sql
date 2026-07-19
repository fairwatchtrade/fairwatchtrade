-- ============================================================================
-- ROLLBACK for v2.27 — Transaction-Chain Integrity Correction
-- ============================================================================
-- ⚠️  NOT TRIVIAL ONCE REAL DATA EXISTS. This down-migration is safe and clean
--     ONLY against the pre-flight baseline (0 accepted requests, 0 transactions,
--     0 reserved listings). After genuine transactions/acceptances exist:
--       · dropping transactions_one_per_request can re-admit duplicate rows;
--       · dropping the snapshot columns destroys captured buyer-facing identity;
--       · reverting reserved -> published re-opens a sold watch to new requests;
--       · restoring the permissive seller UPDATE / transactions INSERT policies
--         re-opens the exact bypass this migration closed.
--     In that state, rollback is a DATA-RECONCILIATION exercise, not a blind
--     down-migration. Review live rows first.
--
-- Restores the exact objects captured from live before the correction.
-- ============================================================================

-- 1. Restore the prior acceptance function (SECURITY INVOKER; no reserve step,
--    no up-front listing lock, no listing_not_available guard) — verbatim from
--    the pre-flight definition.
create or replace function public.accept_purchase_request(p_request_id uuid)
 returns jsonb
 language plpgsql
as $function$
declare
  v_caller uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
  v_transaction_id uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  perform 1
  from public.purchase_requests
  where listing_id = (select listing_id from public.purchase_requests where id = p_request_id)
  for update;

  select * into v_request from public.purchase_requests where id = p_request_id;

  if not found then
    raise exception 'not_found';
  end if;

  if v_request.seller_id <> v_caller then
    raise exception 'not_allowed';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'already_resolved:%', v_request.status;
  end if;

  if exists (
    select 1 from public.purchase_requests
    where listing_id = v_request.listing_id and status = 'accepted'
  ) then
    raise exception 'listing_already_accepted';
  end if;

  update public.purchase_requests
  set status = 'accepted', updated_at = now()
  where id = p_request_id;

  update public.purchase_requests
  set status = 'superseded', updated_at = now()
  where listing_id = v_request.listing_id
    and id <> p_request_id
    and status = 'pending';

  insert into public.transactions
    (purchase_request_id, listing_id, buyer_id, seller_id, final_purchase_price, rail, status)
  values
    (v_request.id, v_request.listing_id, v_request.buyer_id, v_request.seller_id,
     v_request.proposed_purchase_price, null, 'pending')
  returning id into v_transaction_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', 'accepted',
    'transaction_id', v_transaction_id
  );
end;
$function$;

grant execute on function public.accept_purchase_request(uuid) to anon, authenticated;

-- 2. Remove the new functions / trigger.
drop trigger if exists purchase_requests_creation_guard on public.purchase_requests;
drop function if exists public.purchase_requests_creation_guard();
drop function if exists public.decline_purchase_request(uuid);

-- 3. Remove the new indexes.
drop index if exists public.transactions_one_per_request;
drop index if exists public.purchase_requests_one_pending_per_buyer;

-- 4. Restore the permissive seller UPDATE path on purchase_requests.
grant update on public.purchase_requests to anon, authenticated;
drop policy if exists "purchase_requests update own (seller)" on public.purchase_requests;
create policy "purchase_requests update own (seller)" on public.purchase_requests
  for update using (auth.uid() = seller_id);

-- 5. Restore the direct seller INSERT path + write grants on transactions.
grant insert, update, delete, truncate on public.transactions to anon, authenticated;
drop policy if exists "transactions insert own (seller)" on public.transactions;
create policy "transactions insert own (seller)" on public.transactions
  for insert with check (auth.uid() = seller_id);

-- 6. Restore the narrow listings SELECT policy.
drop policy if exists "listings_select_public_or_own" on public.listings;
create policy "listings_select_public_or_own" on public.listings
  for select using (status = 'published' or auth.uid() = seller_id);

-- 7. Return any listings reserved by this flight to published.
--    (Trigger disabled so the revert does not emit publish notifications.)
alter table public.listings disable trigger on_listing_published;
update public.listings set status = 'published', updated_at = now() where status = 'reserved';
alter table public.listings enable trigger on_listing_published;

-- 8. Drop the identity snapshot columns (destroys captured identity — see header).
alter table public.purchase_requests
  drop column if exists listing_brand,
  drop column if exists listing_model,
  drop column if exists listing_reference;
