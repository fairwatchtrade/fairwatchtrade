-- ════════════════════════════════════════════════════════════════════════
-- WITHDRAW OFFER — RPC + event + security harness  (v2.86)
--
-- Runs the REAL migration DDL against the REAL production schema inside a
-- single transaction that is GUARANTEED to leave the database byte-identical:
-- the harness ends by RAISE-ing its own report, which aborts the transaction.
-- DDL is guarded (if not exists / or replace) so the harness runs identically
-- BEFORE the migration is applied (proving it) and AFTER (pure regression).
--
-- Auth is simulated via set_config('request.jwt.claims', …) exactly like the
-- listing-drafts harness. Real users and the real published listing are read
-- dynamically — nothing is assumed, nothing persists.
--
-- Execute as a SINGLE statement batch. Expect:  ERROR: WDR_HARNESS_REPORT …
-- That error IS the successful result.
-- ════════════════════════════════════════════════════════════════════════

-- ── Migration under test (guarded mirror of 20260727233000) ────────────────
create table if not exists public.purchase_request_events (
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
  constraint pre_event_type_check
    check (event_type in ('buyer_withdrew')),
  constraint pre_prior_status_check
    check (prior_status in ('pending')),
  constraint pre_resulting_status_check
    check (resulting_status in ('cancelled'))
);
create index if not exists purchase_request_events_request_idx
  on public.purchase_request_events (purchase_request_id);
alter table public.purchase_request_events enable row level security;
drop policy if exists pre_select_parties on public.purchase_request_events;
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

  return jsonb_build_object('request_id', p_request_id, 'status', 'cancelled');
end;
$function$;

revoke all on function public.withdraw_purchase_request(uuid) from public, anon;
grant execute on function public.withdraw_purchase_request(uuid) to authenticated;

-- ── The matrix; terminal RAISE guarantees rollback ─────────────────────────
do $harness$
declare
  rpt text := E'\n';
  n_pass int := 0; n_fail int := 0;
  v_listing uuid; v_seller uuid; v_buyer uuid; v_other uuid;
  v_req uuid; v_req2 uuid; v_req3 uuid;
  v_out jsonb; v_err text; cnt int; ok boolean; v_ev record;
  procedure_skip text := '';
begin
  -- Real published listing + its real seller; a real non-seller profile as
  -- the buyer; a second non-seller profile as the stranger when one exists.
  select id, seller_id into v_listing, v_seller
    from public.listings where status = 'published' limit 1;
  if v_listing is null then
    raise exception 'WDR_HARNESS_REPORT PASS=0 FAIL=1 -- no published listing to test against';
  end if;
  select id into v_buyer from public.profiles where id <> v_seller limit 1;
  select id into v_other from public.profiles
   where id <> v_seller and id <> v_buyer limit 1;

  -- Seed: one pending request from the buyer (goes through the creation
  -- guard trigger; proves the listing is genuinely available).
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer)::text, true);
  insert into public.purchase_requests
    (listing_id, buyer_id, seller_id, listing_price, proposed_purchase_price, status)
  values (v_listing, v_buyer, v_seller, 11111.11, 9000, 'pending')
  returning id into v_req;

  -- 1 anonymous caller fails
  perform set_config('request.jwt.claims', '', true);
  begin
    v_out := public.withdraw_purchase_request(v_req); ok := false;
  exception when others then ok := (sqlerrm = 'not_authenticated'); end;
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('01 anonymous_fails %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  -- 2 seller fails AND learns nothing (not_found, never not_allowed)
  perform set_config('request.jwt.claims', json_build_object('sub', v_seller)::text, true);
  begin
    v_out := public.withdraw_purchase_request(v_req); ok := false; v_err := 'no_error';
  exception when others then v_err := sqlerrm; ok := (sqlerrm = 'not_found'); end;
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('02 seller_fails_no_reveal got=%s %s'||E'\n', v_err, case when ok then 'PASS' else 'FAIL' end);

  -- 3 another authenticated buyer fails identically (skipped if no 3rd user)
  if v_other is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
    begin
      v_out := public.withdraw_purchase_request(v_req); ok := false; v_err := 'no_error';
    exception when others then v_err := sqlerrm; ok := (sqlerrm = 'not_found'); end;
    if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
    rpt := rpt || format('03 stranger_fails_no_reveal got=%s %s'||E'\n', v_err, case when ok then 'PASS' else 'FAIL' end);
  else
    procedure_skip := ' (03 SKIPPED: only two live profiles exist)';
  end if;

  -- 4 unknown id -> not_found (indistinguishable from not-owned)
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer)::text, true);
  begin
    v_out := public.withdraw_purchase_request(gen_random_uuid()); ok := false;
  exception when others then ok := (sqlerrm = 'not_found'); end;
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('04 unknown_id_not_found %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  -- 5 the owning buyer succeeds; safe return shape only
  v_out := public.withdraw_purchase_request(v_req);
  ok := (v_out = jsonb_build_object('request_id', v_req, 'status', 'cancelled'));
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('05 owner_withdraws_safe_return %s (%s)'||E'\n', case when ok then 'PASS' else 'FAIL' end, v_out::text);

  -- 6 status is cancelled; updated_at stamped
  select count(*) into cnt from public.purchase_requests
   where id = v_req and status = 'cancelled' and updated_at >= now() - interval '1 minute';
  if cnt=1 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('06 pending_to_cancelled %s'||E'\n', case when cnt=1 then 'PASS' else 'FAIL' end);

  -- 7 exactly one immutable event, correct facts
  select e.* into v_ev from public.purchase_request_events e where e.purchase_request_id = v_req;
  select count(*) into cnt from public.purchase_request_events where purchase_request_id = v_req;
  ok := (cnt = 1 and v_ev.event_type='buyer_withdrew' and v_ev.actor_user_id=v_buyer
         and v_ev.prior_status='pending' and v_ev.resulting_status='cancelled'
         and v_ev.occurred_at >= now() - interval '1 minute');
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('07 one_true_event %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  -- 8 repeat withdrawal fails honestly
  begin
    v_out := public.withdraw_purchase_request(v_req); ok := false; v_err := 'no_error';
  exception when others then v_err := sqlerrm; ok := (sqlerrm = 'already_resolved:cancelled'); end;
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('08 repeat_withdraw_honest got=%s %s'||E'\n', v_err, case when ok then 'PASS' else 'FAIL' end);

  -- 9 no collateral: listing untouched, no transaction created
  select count(*) into cnt from public.listings where id = v_listing and status = 'published';
  ok := (cnt = 1);
  select count(*) into cnt from public.transactions where purchase_request_id = v_req;
  ok := ok and (cnt = 0);
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('09 no_collateral %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  -- 10 resubmission works after withdrawal; old request immutable
  insert into public.purchase_requests
    (listing_id, buyer_id, seller_id, listing_price, proposed_purchase_price, status)
  values (v_listing, v_buyer, v_seller, 11111.11, 9500, 'pending')
  returning id into v_req2;
  select count(*) into cnt from public.purchase_requests where id = v_req and status = 'cancelled';
  ok := (v_req2 is not null and cnt = 1);
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('10 resubmission_works_old_immutable %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  -- 11 RACE, withdrawal-first: v_req was withdrawn while the listing is
  --    still published — a later acceptance must fail on the request's
  --    resolved state. (Same-transaction sequencing proves the lock-ordered
  --    OUTCOME; true concurrency serializes on these very locks.)
  perform set_config('request.jwt.claims', json_build_object('sub', v_seller)::text, true);
  begin
    v_out := public.accept_purchase_request(v_req); ok := false; v_err := 'no_error';
  exception when others then v_err := sqlerrm; ok := (sqlerrm = 'already_resolved:cancelled'); end;
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('11 race_withdraw_first got=%s %s'||E'\n', v_err, case when ok then 'PASS' else 'FAIL' end);

  -- 12 RACE, acceptance-first: seller accepts v_req2; the buyer's later
  --    withdrawal fails already_resolved:accepted.
  v_out := public.accept_purchase_request(v_req2);
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer)::text, true);
  begin
    v_out := public.withdraw_purchase_request(v_req2); ok := false; v_err := 'no_error';
  exception when others then v_err := sqlerrm; ok := (sqlerrm = 'already_resolved:accepted'); end;
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('12 race_accept_first got=%s %s'||E'\n', v_err, case when ok then 'PASS' else 'FAIL' end);

  -- 13 no direct client write paths anywhere
  ok := not has_table_privilege('authenticated','public.purchase_requests','update')
    and not has_table_privilege('anon','public.purchase_requests','update')
    and not has_table_privilege('authenticated','public.purchase_request_events','insert')
    and not has_table_privilege('authenticated','public.purchase_request_events','update')
    and not has_table_privilege('authenticated','public.purchase_request_events','delete')
    and not has_table_privilege('anon','public.purchase_request_events','insert');
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('13 no_direct_write_paths %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  -- 14 RPC posture: definer, empty search_path, anon/PUBLIC cannot execute
  select (p.prosecdef
          and (select array_agg(cfg) from unnest(p.proconfig) cfg) @> array['search_path=""']
          and has_function_privilege('authenticated','public.withdraw_purchase_request(uuid)','execute')
          and not has_function_privilege('anon','public.withdraw_purchase_request(uuid)','execute')
          and (p.proacl is null or not (array_to_string(p.proacl,',') like '=%')))
    into ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='withdraw_purchase_request';
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('14 rpc_posture %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  raise exception E'WDR_HARNESS_REPORT  PASS=% FAIL=%  %\n%', n_pass, n_fail, procedure_skip, rpt;
end
$harness$;
