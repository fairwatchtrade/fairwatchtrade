-- ============================================================================
-- v5.93 — Communications room: notification deep links carry the exact request
-- ============================================================================
-- Founder-observed defect: a seller taps "New purchase request for your …"
-- and lands on the PUBLIC listing — a page that renders no correspondence
-- and no request controls for the owner. The bell row only ever carried
-- listing_id, so the client could not route any tighter than the listing.
--
-- Fix: notifications gains purchase_request_id. The two purchase-request
-- bells (creation trigger + withdrawal RPC) now stamp the exact request row
-- they announce. The client routes a stamped bell into the seller
-- Communications room with that request selected; unstamped rows (all
-- history, and any future type that has no tighter home) keep the old
-- listing routing.
--
-- ON DELETE SET NULL: a purged request quietly degrades its old bells back
-- to listing routing — never a broken link, never a blocked purge. The index
-- exists for that purge path (FK referencing columns are not auto-indexed).
--
-- PFC274 = 62 — the evaluate route is untouched by this migration.
-- ============================================================================

alter table public.notifications
  add column if not exists purchase_request_id uuid
  references public.purchase_requests(id) on delete set null;

create index if not exists notifications_purchase_request_id_idx
  on public.notifications (purchase_request_id)
  where purchase_request_id is not null;

-- ── 1. Creation bell — now stamps the request id ────────────────────────────
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
    insert into public.notifications (user_id, type, message, listing_id, purchase_request_id)
    values (NEW.seller_id, 'purchase_request',
            'New purchase request for your ' || v_label, NEW.listing_id, NEW.id);
  exception when others then
    null; -- the bell must never block the purchase request itself
  end;

  return NEW;
end;
$function$;

-- ── 2. Withdrawal bell — same stamp, inside the controlled RPC ──────────────
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
  -- v5.93 — the bell now stamps the exact request so the seller lands on it.
  begin
    select case when l.model is not null then l.brand || ' ' || l.model else l.brand end
      into v_label from public.listings l where l.id = v_listing_id;
    if v_label is null then
      v_label := coalesce(
        nullif(concat_ws(' ', v_request.listing_brand, v_request.listing_model), ''),
        'your listing');
    end if;
    insert into public.notifications (user_id, type, message, listing_id, purchase_request_id)
    values (v_request.seller_id, 'purchase_request',
            'A buyer withdrew their offer for ' || v_label, v_listing_id, p_request_id);
  exception when others then
    null;
  end;

  return jsonb_build_object('request_id', p_request_id, 'status', 'cancelled');
end;
$function$;

comment on column public.notifications.purchase_request_id is
  'Exact purchase request a bell announces, when one exists. Routes the '
  'seller into the Communications room with that request selected. SET NULL '
  'on request purge — the bell degrades to listing routing, never breaks.';
