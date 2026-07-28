-- ============================================================================
-- v2.86 — Withdraw Offer (buyer retracts a still-pending purchase request)
-- ============================================================================
-- Closes the one missing pre-acceptance Purchase action. Governed by the
-- Withdraw Offer Implementation Order v4 (2026-07-27).
--
-- Authority model amendment (extends the v2.27 ladder):
--   pending -> cancelled : withdraw_purchase_request()  ONLY  (buyer action;
--                          public vocabulary renders it "Withdrawn")
--
-- Preflight-proven live posture mirrored exactly (2026-07-27):
--   accept/decline are SECURITY DEFINER, search_path = '', owner postgres,
--   EXECUTE = {authenticated, service_role}, canonical lock order
--   listing-first (FOR SHARE on non-listing-mutating paths) then request
--   FOR UPDATE, error vocabulary not_authenticated / not_found /
--   already_resolved:<status>.
--
-- ONE deliberate vocabulary deviation, per the order's Named Security Gate:
-- a caller who is not the owning buyer receives 'not_found', never
-- 'not_allowed' — errors must not reveal whether another user's request
-- exists. (decline's seller-gate raises not_allowed after row discovery;
-- that leak is acceptable for the seller party to a request but not for the
-- withdrawal gate, which strangers could probe.)
--
-- Withdrawal is a single-request transition: NO transaction row, NO listing
-- change, NO sibling effect. The withdrawn request is immutable history; the
-- buyer may submit a fresh request afterwards (creation guard + partial
-- unique index already permit exactly that — no change needed there).
--
-- PFC274 = 62 — the evaluate route is untouched by this migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. purchase_request_events — narrow append-only lifecycle facts.
--    First (and only, this flight) event: buyer_withdrew. Deliberately NOT a
--    ledger: no fee/payment/settlement columns, ever, per the order.
-- ----------------------------------------------------------------------------
create table public.purchase_request_events (
  id                  uuid        not null default gen_random_uuid(),
  purchase_request_id uuid        not null,
  event_type          text        not null,
  actor_user_id       uuid        not null,
  prior_status        text        not null,
  resulting_status    text        not null,
  occurred_at         timestamptz not null default now(),
  metadata            jsonb       not null default '{}'::jsonb,
  constraint purchase_request_events_pkey primary key (id),
  constraint pre_request_fk
    foreign key (purchase_request_id) references public.purchase_requests (id),
  -- This flight's vocabulary only; future lifecycle events extend these
  -- CHECKs by migration.
  constraint pre_event_type_check
    check (event_type in ('buyer_withdrew')),
  constraint pre_prior_status_check
    check (prior_status in ('pending')),
  constraint pre_resulting_status_check
    check (resulting_status in ('cancelled'))
);
create index purchase_request_events_request_idx
  on public.purchase_request_events (purchase_request_id);

-- Append-only posture: RLS on; the two parties may read their own request's
-- events; NO client insert/update/delete policy exists, and write grants are
-- revoked — the controlled RPC (definer, owner postgres) is the only writer.
alter table public.purchase_request_events enable row level security;

create policy pre_select_parties on public.purchase_request_events
  for select
  using (
    exists (
      select 1 from public.purchase_requests pr
      where pr.id = purchase_request_events.purchase_request_id
        and (pr.buyer_id = auth.uid() or pr.seller_id = auth.uid())
    )
  );

revoke insert, update, delete, truncate on public.purchase_request_events
  from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. withdraw_purchase_request — the only pending -> cancelled path.
-- ----------------------------------------------------------------------------
create or replace function public.withdraw_purchase_request(p_request_id uuid)
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

  -- Canonical lock order: listing first (FOR SHARE — withdrawal never mutates
  -- the listing, but this serializes correctly against acceptance's FOR
  -- UPDATE so the Race Outcome Law is deterministic), then the target row.
  perform 1 from public.listings where id = v_listing_id for share;
  perform 1 from public.purchase_requests where id = p_request_id for update;

  select * into v_request
  from public.purchase_requests
  where id = p_request_id;

  if not found then
    raise exception 'not_found';
  end if;

  -- Named Security Gate: non-owners learn nothing — not even existence.
  if v_request.buyer_id is distinct from v_caller then
    raise exception 'not_found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'already_resolved:%', v_request.status;
  end if;

  update public.purchase_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id;

  insert into public.purchase_request_events
    (purchase_request_id, event_type, actor_user_id, prior_status, resulting_status)
  values
    (p_request_id, 'buyer_withdrew', v_caller, 'pending', 'cancelled');

  return jsonb_build_object('request_id', p_request_id, 'status', 'cancelled');
end;
$function$;

revoke all on function public.withdraw_purchase_request(uuid) from public, anon;
grant execute on function public.withdraw_purchase_request(uuid) to authenticated;

comment on function public.withdraw_purchase_request(uuid) is
  'Buyer retracts their own still-pending purchase request (public status '
  '"Withdrawn", internal ''cancelled''). SECURITY DEFINER, empty search_path, '
  'canonical listing-first lock order. Appends exactly one immutable '
  'buyer_withdrew event. Creates no transaction, changes no listing, touches '
  'no sibling. Non-owners receive not_found (existence is never revealed). '
  'PFC274 = 62.';
