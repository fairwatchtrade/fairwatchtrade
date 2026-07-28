-- ============================================================================
-- v2.89 — Purchase-request notification bells move into the database (WS5)
-- ============================================================================
-- Root cause (2026-07-28 discovery): public.notifications has NO INSERT
-- policy — only "read own" and "update own" — so every client-session insert
-- has been RLS-denied since birth. Both purchase-request bells (creation,
-- v2.6-era; withdrawal, v2.86) lived in route code as the buyer's session
-- writing the SELLER's row: denied on every call, silently ("fails open"
-- concealed fails-always). The seller has never received either bell.
--
-- The proven safe pattern in this codebase is notify_on_listing_publish():
-- a SECURITY DEFINER database function that writes cross-user notifications
-- RLS-exempt, with the recipient fixed by the DATA, never by the caller.
-- Both bells now follow it:
--
--   · creation  → AFTER INSERT trigger on purchase_requests
--   · withdrawal → inside withdraw_purchase_request() itself
--
-- Deliberately NOT done (per the authorization): no client INSERT policy —
-- that would let any authenticated user write into any user's inbox. The
-- anti-leak proof lives in scripts/notification-bells.test.sql.
--
-- PFC274 = 62 — the evaluate route is untouched by this migration.
-- ============================================================================

-- ── 1. Creation bell — trigger, recipient fixed to the row's seller ────────
create or replace function public.notify_on_purchase_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_label text;
begin
  -- Watch identity: live listing first, then the row's own snapshot columns,
  -- then an honest generic. Never blocks the request itself.
  select case when l.model is not null then l.brand || ' ' || l.model else l.brand end
    into v_label
    from public.listings l where l.id = NEW.listing_id;
  if v_label is null then
    v_label := case
      when NEW.listing_brand is not null and NEW.listing_model is not null
        then NEW.listing_brand || ' ' || NEW.listing_model
      when NEW.listing_brand is not null then NEW.listing_brand
      else 'your listing'
    end;
  end if;

  begin
    insert into public.notifications (user_id, type, message, listing_id)
    values (NEW.seller_id, 'purchase_request',
            'New purchase request for your ' || v_label, NEW.listing_id);
  exception when others then
    null; -- the bell must never block the purchase request itself
  end;

  return NEW;
end;
$function$;

drop trigger if exists purchase_requests_notify_seller on public.purchase_requests;
create trigger purchase_requests_notify_seller
  after insert on public.purchase_requests
  for each row execute function public.notify_on_purchase_request();

-- ── 2. Withdrawal bell — inside the controlled RPC ─────────────────────────
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
  v_label      text;
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

  perform 1 from public.listings where id = v_listing_id for share;
  perform 1 from public.purchase_requests where id = p_request_id for update;

  select * into v_request
  from public.purchase_requests
  where id = p_request_id;

  if not found then
    raise exception 'not_found';
  end if;

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

  -- v2.89 — seller bell (WS5). Recipient is the request's seller by DATA;
  -- the caller cannot address anyone. Fails open, never the withdrawal.
  begin
    select case when l.model is not null then l.brand || ' ' || l.model else l.brand end
      into v_label from public.listings l where l.id = v_listing_id;
    if v_label is null then
      v_label := coalesce(
        nullif(concat_ws(' ', v_request.listing_brand, v_request.listing_model), ''),
        'your listing');
    end if;
    insert into public.notifications (user_id, type, message, listing_id)
    values (v_request.seller_id, 'purchase_request',
            'A buyer withdrew their offer for ' || v_label, v_listing_id);
  exception when others then
    null;
  end;

  return jsonb_build_object('request_id', p_request_id, 'status', 'cancelled');
end;
$function$;

revoke all on function public.withdraw_purchase_request(uuid) from public, anon;
grant execute on function public.withdraw_purchase_request(uuid) to authenticated;

comment on function public.notify_on_purchase_request() is
  'Seller bell for a new purchase request — SECURITY DEFINER trigger (the '
  'notify_on_listing_publish pattern): recipient is the row''s seller_id, '
  'never caller-chosen. Fails open. PFC274 = 62.';
