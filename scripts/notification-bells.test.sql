-- ════════════════════════════════════════════════════════════════════════
-- NOTIFICATION BELLS — anti-leak + delivery harness  (v2.89, WS5)
--
-- Proves, against the real production schema in one rolled-back transaction:
--   · no client session can write ANY notification row — own inbox or
--     anyone else's (no INSERT policy exists; that is the security posture,
--     not a gap);
--   · the creation trigger delivers exactly one bell to the SELLER;
--   · the withdrawal RPC delivers exactly one bell to the SELLER;
--   · the caller cannot address a recipient (structural: no such argument);
--   · uninvolved inboxes are untouched.
--
-- Terminal RAISE aborts everything. Expect: ERROR: NB_HARNESS_REPORT …
-- ════════════════════════════════════════════════════════════════════════

do $harness$
declare
  rpt text := E'\n';
  n_pass int := 0; n_fail int := 0;
  v_listing uuid; v_seller uuid; v_buyer uuid; v_other uuid;
  v_req uuid; v_out jsonb; cnt int; ok boolean; v_state text;
  v_seller_before int; v_other_before int;
begin
  select id, seller_id into v_listing, v_seller
    from public.listings where status = 'published' limit 1;
  select id into v_buyer from public.profiles where id <> v_seller limit 1;
  select id into v_other from public.profiles
   where id <> v_seller and id <> v_buyer limit 1;

  select count(*) into v_seller_before from public.notifications where user_id = v_seller;
  select count(*) into v_other_before  from public.notifications where user_id = coalesce(v_other, v_buyer);

  -- 1 client session cannot write its OWN inbox (no INSERT policy)
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer)::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.notifications (user_id, type, message)
    values (v_buyer, 'purchase_request', 'self-write attempt');
    ok := false; v_state := 'INSERT_SUCCEEDED';
  exception when others then v_state := SQLSTATE; ok := (SQLSTATE = '42501'); end;
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('01 client_cannot_write_own got=%s %s'||E'\n', v_state, case when ok then 'PASS' else 'FAIL' end);

  -- 2 client session cannot write ANOTHER user's inbox
  begin
    insert into public.notifications (user_id, type, message)
    values (v_seller, 'purchase_request', 'cross-user attempt');
    ok := false; v_state := 'INSERT_SUCCEEDED';
  exception when others then v_state := SQLSTATE; ok := (SQLSTATE = '42501'); end;
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('02 client_cannot_write_cross got=%s %s'||E'\n', v_state, case when ok then 'PASS' else 'FAIL' end);
  execute 'reset role';

  -- 3 creation bell: new pending request -> exactly one SELLER bell
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer)::text, true);
  insert into public.purchase_requests
    (listing_id, buyer_id, seller_id, listing_price, proposed_purchase_price, status)
  values (v_listing, v_buyer, v_seller, 11111.11, 9000, 'pending')
  returning id into v_req;
  select count(*) into cnt from public.notifications
   where user_id = v_seller and listing_id = v_listing
     and message like 'New purchase request for your %'
     and created_at >= now() - interval '1 minute';
  ok := (cnt = 1);
  select count(*) into cnt from public.notifications
   where user_id = v_buyer and created_at >= now() - interval '1 minute';
  ok := ok and (cnt = 0);
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('03 creation_bell_to_seller_only %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  -- 4 withdrawal bell: RPC as the buyer -> one more SELLER bell, none to caller
  v_out := public.withdraw_purchase_request(v_req);
  select count(*) into cnt from public.notifications
   where user_id = v_seller and listing_id = v_listing
     and message like 'A buyer withdrew their offer for %'
     and created_at >= now() - interval '1 minute';
  ok := (cnt = 1);
  select count(*) into cnt from public.notifications
   where user_id = v_buyer and created_at >= now() - interval '1 minute';
  ok := ok and (cnt = 0);
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('04 withdrawal_bell_to_seller_only %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  -- 5 structural: the RPC takes ONE argument — no recipient can be addressed
  select (p.pronargs = 1) into ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='withdraw_purchase_request';
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('05 no_recipient_argument %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  -- 6 uninvolved inbox untouched
  select count(*) into cnt from public.notifications where user_id = coalesce(v_other, v_buyer);
  ok := (cnt = v_other_before);
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('06 uninvolved_inbox_untouched %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  raise exception E'NB_HARNESS_REPORT  PASS=% FAIL=%\n%', n_pass, n_fail, rpt;
end
$harness$;
