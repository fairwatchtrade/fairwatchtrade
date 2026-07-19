-- ============================================================================
-- v2.27 — Transaction-Chain Integrity Correction
-- ============================================================================
-- Closes three release-blocking gaps proven in live inspection:
--   1. purchase_requests seller UPDATE had no restrictive WITH CHECK, so a
--      seller could bypass accept_purchase_request() and write any lifecycle
--      status directly (accepted/superseded/declined/…).
--   2. transactions had no unique constraint on purchase_request_id AND a
--      direct seller INSERT path, so a seller could forge/duplicate a
--      transaction outside the acceptance function.
--   3. Acceptance never altered the listing, so a listing stayed publicly
--      available and new buyers could file requests that could never be
--      accepted.
--
-- Authority model after this migration:
--   none -> pending        : buyer INSERT + creation-guard trigger (DB-authoritative)
--   pending -> accepted     : accept_purchase_request()  ONLY
--   pending -> superseded   : accept_purchase_request()  (side effect) ONLY
--   pending -> declined     : decline_purchase_request() ONLY
--   pending -> cancelled    : future buyer RPC (not in this flight)
--   pending -> expired      : future system process (not in this flight)
--   terminal -> anything    : prohibited
--
-- Canonical lock order on every path that can race acceptance:
--   listing row -> purchase-request rows -> lifecycle writes
--
-- Reserved model: acceptance sets listings.status = 'reserved' (NOT 'sold').
-- Reserved = offer accepted, watch off competitive market, settlement NOT
-- represented. A dedicated future settlement flight owns 'sold'.
--
-- Pre-apply baseline (verified clean): 0 accepted requests, 0 transactions,
-- 0 reserved listings, 0 duplicate transactions.purchase_request_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Identity snapshot columns on purchase_requests
--    So My Offers can show watch identity + outcome to a superseded/declined
--    buyer WITHOUT SELECT access to a now-reserved listing (RLS denies that
--    buyer the listing row). Snapshotted at request creation; authoritative
--    to the moment the buyer made the offer.
-- ----------------------------------------------------------------------------
alter table public.purchase_requests
  add column if not exists listing_brand     text,
  add column if not exists listing_model     text,
  add column if not exists listing_reference text;

update public.purchase_requests pr
set listing_brand     = l.brand,
    listing_model     = l.model,
    listing_reference = l.reference
from public.listings l
where l.id = pr.listing_id
  and pr.listing_brand is null;

-- ----------------------------------------------------------------------------
-- 2. Remove the direct seller UPDATE path on purchase_requests
--    Lifecycle transitions now go exclusively through SECURITY DEFINER RPCs.
--    Dropping the policy makes RLS deny every client UPDATE; revoking the
--    grant is defense-in-depth beneath RLS.
-- ----------------------------------------------------------------------------
drop policy if exists "purchase_requests update own (seller)" on public.purchase_requests;
revoke update on public.purchase_requests from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Transactions are RPC-owned truth
--    Drop the direct seller INSERT policy and revoke write grants. Only the
--    SECURITY DEFINER acceptance function (owner rights) may insert. Preserve
--    buyer/seller SELECT. Unique backstop guarantees at most one transaction
--    per purchase request.
-- ----------------------------------------------------------------------------
drop policy if exists "transactions insert own (seller)" on public.transactions;
revoke insert, update, delete, truncate on public.transactions from anon, authenticated;

create unique index if not exists transactions_one_per_request
  on public.transactions (purchase_request_id)
  where purchase_request_id is not null;

-- ----------------------------------------------------------------------------
-- 4. Atomic per-buyer exclusivity (one pending request per buyer per listing)
--    DB-authoritative; the app pre-check remains only for friendly UX.
-- ----------------------------------------------------------------------------
create unique index if not exists purchase_requests_one_pending_per_buyer
  on public.purchase_requests (listing_id, buyer_id)
  where status = 'pending';

-- ----------------------------------------------------------------------------
-- 5. Hardened acceptance function (SECURITY DEFINER, canonical lock order)
-- ----------------------------------------------------------------------------
create or replace function public.accept_purchase_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller         uuid := auth.uid();
  v_listing_id     uuid;
  v_listing_status text;
  v_request        public.purchase_requests%rowtype;
  v_transaction_id uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  -- Discover the target listing (unlocked; everything is re-validated under
  -- lock below, so this read grants no authority).
  select listing_id into v_listing_id
  from public.purchase_requests
  where id = p_request_id;

  if v_listing_id is null then
    raise exception 'not_found';
  end if;

  -- CANONICAL LOCK ORDER 1/2 — lock the LISTING row first.
  select status into v_listing_status
  from public.listings
  where id = v_listing_id
  for update;

  if v_listing_status is null then
    raise exception 'not_found';
  end if;

  -- Verify the listing is still published BEFORE accepting.
  if v_listing_status <> 'published' then
    raise exception 'listing_not_available';
  end if;

  -- CANONICAL LOCK ORDER 2/2 — lock every purchase-request row for this listing
  -- so concurrent accepts on sibling requests serialize behind this one.
  perform 1
  from public.purchase_requests
  where listing_id = v_listing_id
  for update;

  -- Re-read and re-validate the target request under lock.
  select * into v_request
  from public.purchase_requests
  where id = p_request_id;

  if not found then
    raise exception 'not_found';
  end if;

  if v_request.seller_id <> v_caller then
    raise exception 'not_allowed';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'already_resolved:%', v_request.status;
  end if;

  -- Clean application-level error ahead of the partial unique index backstop.
  if exists (
    select 1 from public.purchase_requests
    where listing_id = v_listing_id and status = 'accepted'
  ) then
    raise exception 'listing_already_accepted';
  end if;

  -- LIFECYCLE WRITES (locks already held) ------------------------------------
  update public.purchase_requests
  set status = 'accepted', updated_at = now()
  where id = p_request_id;

  update public.purchase_requests
  set status = 'superseded', updated_at = now()
  where listing_id = v_listing_id
    and id <> p_request_id
    and status = 'pending';

  insert into public.transactions
    (purchase_request_id, listing_id, buyer_id, seller_id, final_purchase_price, rail, status)
  values
    (v_request.id, v_request.listing_id, v_request.buyer_id, v_request.seller_id,
     v_request.proposed_purchase_price, null, 'pending')
  returning id into v_transaction_id;

  -- Reserve the listing (row already locked FOR UPDATE at the top).
  update public.listings
  set status = 'reserved', updated_at = now()
  where id = v_listing_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', 'accepted',
    'transaction_id', v_transaction_id,
    'listing_status', 'reserved'
  );
end;
$function$;

revoke all on function public.accept_purchase_request(uuid) from public, anon;
grant execute on function public.accept_purchase_request(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Dedicated decline function (SECURITY DEFINER, canonical lock order)
--    Replaces the direct table UPDATE the API route used. Decline is a single
--    request transition: it does NOT touch the listing or siblings.
-- ----------------------------------------------------------------------------
create or replace function public.decline_purchase_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller     uuid := auth.uid();
  v_listing_id uuid;
  v_request    public.purchase_requests%rowtype;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select listing_id into v_listing_id
  from public.purchase_requests
  where id = p_request_id;

  if v_listing_id is null then
    raise exception 'not_found';
  end if;

  -- Canonical lock order: listing first (FOR SHARE — decline never mutates the
  -- listing, but this preserves the global lock order vs acceptance), then the
  -- target request row.
  perform 1 from public.listings where id = v_listing_id for share;
  perform 1 from public.purchase_requests where id = p_request_id for update;

  select * into v_request
  from public.purchase_requests
  where id = p_request_id;

  if not found then
    raise exception 'not_found';
  end if;

  if v_request.seller_id <> v_caller then
    raise exception 'not_allowed';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'already_resolved:%', v_request.status;
  end if;

  update public.purchase_requests
  set status = 'declined', updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'status', 'declined');
end;
$function$;

revoke all on function public.decline_purchase_request(uuid) from public, anon;
grant execute on function public.decline_purchase_request(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Request-creation guard (DB-authoritative, atomic vs acceptance)
--    SECURITY DEFINER so it can always see + lock the listing row regardless
--    of the inserting buyer's RLS visibility. Locks the listing FOR SHARE
--    (canonical order: listing first) — this conflicts with acceptance's
--    FOR UPDATE, so a new request cannot slip in around a reserve, while two
--    different buyers inserting concurrently do not block each other.
-- ----------------------------------------------------------------------------
create or replace function public.purchase_requests_creation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_listing_status text;
begin
  -- CANONICAL LOCK ORDER — listing row first.
  select status into v_listing_status
  from public.listings
  where id = NEW.listing_id
  for share;

  if v_listing_status is null then
    raise exception 'listing_not_found';
  end if;

  if v_listing_status <> 'published' then
    raise exception 'listing_not_available';
  end if;

  if exists (
    select 1 from public.purchase_requests
    where listing_id = NEW.listing_id and status = 'accepted'
  ) then
    raise exception 'listing_already_accepted';
  end if;

  return NEW;
end;
$function$;

drop trigger if exists purchase_requests_creation_guard on public.purchase_requests;
create trigger purchase_requests_creation_guard
  before insert on public.purchase_requests
  for each row execute function public.purchase_requests_creation_guard();

-- ----------------------------------------------------------------------------
-- 8. Reserved-listing visibility
--    Widen the listings SELECT policy so the ACCEPTED buyer (and the seller)
--    can read a reserved listing to render its sale-pending detail page.
--    Superseded / declined / cancelled / expired / uninvolved buyers are NOT
--    granted access (the buyer clause requires status = 'accepted').
--    Founder/admin visibility is served by the existing service-role admin
--    surface, NOT by RLS — so the founder UUID is deliberately NOT hard-coded
--    here.
-- ----------------------------------------------------------------------------
drop policy if exists "listings_select_public_or_own" on public.listings;
create policy "listings_select_public_or_own" on public.listings
  for select
  using (
    status = 'published'
    or auth.uid() = seller_id
    or exists (
      select 1 from public.purchase_requests pr
      where pr.listing_id = listings.id
        and pr.buyer_id = auth.uid()
        and pr.status = 'accepted'
    )
  );
