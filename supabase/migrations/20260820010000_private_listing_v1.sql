-- ============================================================================
-- v5.98 — Private Listing V1: one seller → one specifically authorized buyer
-- ============================================================================
-- Private is an ACCESS/ADMISSION state on the same listing object, never a
-- second sale system. The design choice that carries the whole leakage law:
-- 'private_active' is its OWN status value, so every public surface that
-- filters status='published' (Browse, seller pages, Watch DNA, the publish
-- broadcast bell, saved-search matching, the dossier trigger, the public
-- half of listings_select_public_or_own) excludes private listings BY
-- CONSTRUCTION — no per-surface hide conditions, nothing to forget later.
--
-- Authorization belongs to the ACCOUNT, never the URL:
--   · seller  — existing own-rows clause;
--   · the one authorized buyer — the new listings_select_private_buyer
--     policy (additive; the canonical listings_select_public_or_own policy
--     is deliberately untouched);
--   · admin/review machinery — service role, as ever;
--   · everyone else — no row, so every surface degrades to not-found with
--     zero metadata.
--
-- After an accepted offer the listing turns 'reserved' (existing machinery);
-- the buyer keeps access through the accepted-purchase-request clause the
-- SELECT policy has carried since v2.x. Transaction continuity needs no new
-- rule.
--
-- PFC274 = 62 — Sell Flow scoring untouched. Canary path untouched.
-- ============================================================================

-- ── 1. The authorized buyer ────────────────────────────────────────────────
alter table public.listings
  add column if not exists private_buyer_id uuid
  references auth.users(id) on delete set null;

create index if not exists listings_private_buyer_id_idx
  on public.listings (private_buyer_id)
  where private_buyer_id is not null;

comment on column public.listings.private_buyer_id is
  'The ONE FairWatchTrade account this listing is privately offered to. '
  'Set only through the conversation-led creation path (the server derives '
  'it from a message thread the seller is a participant of — never from a '
  'typed email, never from a URL). NULL on every ordinary listing.';

-- ── 2. The admission state ─────────────────────────────────────────────────
alter table public.listings drop constraint if exists listings_status_lifecycle;
alter table public.listings add constraint listings_status_lifecycle
  check (status = any (array[
    'draft'::text, 'pending_review'::text, 'published'::text,
    'rejected'::text, 'reserved'::text, 'removed'::text,
    'private_active'::text
  ]));

-- A listing can never be privately active without its buyer — the state and
-- the relationship are one fact.
alter table public.listings drop constraint if exists listings_private_active_has_buyer;
alter table public.listings add constraint listings_private_active_has_buyer
  check (status <> 'private_active' or private_buyer_id is not null);

-- ── 3. RLS — the authorized buyer reads the row ────────────────────────────
drop policy if exists listings_select_private_buyer on public.listings;
create policy listings_select_private_buyer on public.listings
  for select using (
    status = 'private_active' and private_buyer_id = auth.uid()
  );

-- ── 4. Purchase-request creation guard — private eligibility ───────────────
-- The eligibility extension into the EXISTING engine: a Private Active
-- listing accepts a request only from its one authorized buyer. Everyone
-- else keeps the same listing_not_available they always got.
create or replace function public.purchase_requests_creation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_listing_status text;
  v_private_buyer  uuid;
begin
  -- CANONICAL LOCK ORDER — listing row first.
  select status, private_buyer_id into v_listing_status, v_private_buyer
  from public.listings
  where id = NEW.listing_id
  for share;

  if v_listing_status is null then
    raise exception 'listing_not_found';
  end if;

  if v_listing_status <> 'published'
     and not (v_listing_status = 'private_active' and NEW.buyer_id = v_private_buyer) then
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

-- ── 5. Accept — a private request is acceptable ────────────────────────────
-- One gate line changes: 'private_active' joins 'published' as an acceptable
-- listing state. Everything else — locks, sibling supersession, the atomic
-- transaction row, the move to 'reserved' — is the existing machinery,
-- reproduced verbatim.
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

  select listing_id into v_listing_id
  from public.purchase_requests
  where id = p_request_id;

  if v_listing_id is null then
    raise exception 'not_found';
  end if;

  select status into v_listing_status
  from public.listings
  where id = v_listing_id
  for update;

  if v_listing_status is null then
    raise exception 'not_found';
  end if;

  if v_listing_status not in ('published', 'private_active') then
    raise exception 'listing_not_available';
  end if;

  perform 1
  from public.purchase_requests
  where listing_id = v_listing_id
  for update;

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

  if exists (
    select 1 from public.purchase_requests
    where listing_id = v_listing_id and status = 'accepted'
  ) then
    raise exception 'listing_already_accepted';
  end if;

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

-- ── 6. Withdraw Private Listing — the existing Remove machinery ────────────
-- 'private_active' joins the removable states. Withdrawal closes pending
-- requests with the existing Stage 6A attribution and lands on 'removed' —
-- one Delete doctrine, one Pause/Withdraw doctrine, no private fork.
create or replace function public.remove_listing(
  p_listing_id uuid, p_reason_code text default null, p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
DECLARE
  v_caller    uuid := auth.uid();
  v_listing   public.listings%ROWTYPE;
  v_now       timestamptz;
  v_closed    jsonb := '[]'::jsonb;
  v_cancelled int := 0;
  v_accepted  int := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_listing FROM public.listings
   WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_listing.seller_id <> v_caller THEN RAISE EXCEPTION 'not_allowed'; END IF;

  IF v_listing.status = 'removed' THEN
    RAISE EXCEPTION 'already_removed';
  END IF;

  IF v_listing.status NOT IN ('published', 'reserved', 'pending_review', 'private_active') THEN
    RAISE EXCEPTION 'not_removable:%', v_listing.status;
  END IF;

  -- Optional now. Short-circuits on NULL rather than coalescing it.
  IF p_reason_code IS NOT NULL
     AND p_reason_code NOT IN
         ('sold_in_store','sold_elsewhere','no_longer_for_sale','listing_mistake','other') THEN
    RAISE EXCEPTION 'invalid_reason_code';
  END IF;

  v_now := now();

  UPDATE public.listings SET
    status              = 'removed',
    removed_at          = v_now,
    removal_reason_code = p_reason_code,
    removal_reason_note = left(nullif(btrim(coalesce(p_reason_note, '')), ''), 320)
  WHERE id = p_listing_id;

  WITH closed AS (
    UPDATE public.purchase_requests
       SET status        = 'cancelled',
           closure_cause = 'listing_removed_by_seller',
           updated_at    = v_now
     WHERE listing_id = p_listing_id
       AND status = 'pending'
    RETURNING id, buyer_id
  ), logged AS (
    INSERT INTO public.purchase_request_events
      (purchase_request_id, event_type, actor_user_id,
       prior_status, resulting_status, metadata)
    SELECT c.id, 'listing_removed_by_seller', v_caller,
           'pending', 'cancelled',
           jsonb_build_object(
             'listing_id',          p_listing_id,
             'removal_reason_code', p_reason_code)
      FROM closed c
    RETURNING id AS event_id, purchase_request_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'purchase_request_id', l.purchase_request_id,
           'buyer_id',            c.buyer_id,
           'event_id',            l.event_id)), '[]'::jsonb),
         count(*)
    INTO v_closed, v_cancelled
    FROM logged l
    JOIN closed c ON c.id = l.purchase_request_id;

  SELECT count(*) INTO v_accepted
    FROM public.purchase_requests
   WHERE listing_id = p_listing_id AND status = 'accepted';

  RETURN jsonb_build_object(
    'listing_id',                  p_listing_id,
    'status',                      'removed',
    'removed_at',                  v_now,
    'reason_code',                 p_reason_code,
    'requests_cancelled',          v_cancelled,
    'closed_requests',             v_closed,
    'accepted_requests_remaining', v_accepted
  );
END
$function$;

-- ── 7. The buyer's doorbell — transactional, single recipient ──────────────
-- The one account this listing exists for gets a real in-product
-- notification the moment it becomes Private Active — creation-direct
-- (INSERT) or via a released hold the founder approved (UPDATE). Recipient
-- is fixed by the ROW's private_buyer_id, never by the caller. Fails open:
-- the bell must never block the activation. This is the private counterpart
-- of notify_on_listing_publish, which deliberately keeps firing only for
-- 'published' — a private listing is never broadcast.
create or replace function public.notify_on_private_listing_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_label text;
begin
  if NEW.private_buyer_id is null then
    return NEW;
  end if;

  v_label := case
    when NEW.model is not null then NEW.brand || ' ' || NEW.model
    else NEW.brand
  end;

  begin
    insert into public.notifications (user_id, type, message, listing_id)
    values (NEW.private_buyer_id, 'private_listing',
            'A private listing has been created for you: ' || v_label, NEW.id);
  exception when others then
    null; -- the bell must never block the activation itself
  end;

  return NEW;
end;
$function$;

drop trigger if exists listings_notify_private_activation_insert on public.listings;
create trigger listings_notify_private_activation_insert
  after insert on public.listings
  for each row
  when (NEW.status = 'private_active')
  execute function public.notify_on_private_listing_activation();

drop trigger if exists listings_notify_private_activation_update on public.listings;
create trigger listings_notify_private_activation_update
  after update of status on public.listings
  for each row
  when (NEW.status = 'private_active' and OLD.status is distinct from NEW.status)
  execute function public.notify_on_private_listing_activation();

comment on function public.notify_on_private_listing_activation() is
  'Private-listing doorbell: notifies exactly the row''s private_buyer_id '
  'when a listing becomes private_active. SECURITY DEFINER (the '
  'notify_on_listing_publish pattern), fails open, never broadcast.';
