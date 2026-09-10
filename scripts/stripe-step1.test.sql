-- ════════════════════════════════════════════════════════════════════════
-- STRIPE STEP 1 — database proof (executable, leaves no residue)
-- scripts/stripe-step1.test.sql
--
-- Run the DO block as one statement against the live project after the
-- migration is applied. Expected outcome: an error whose message is exactly
-- PROOF_OK. Every write inside rolls back with it. Any other message is the
-- failing assertion.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_buyer  constant uuid := 'a1fe1ce9-c17e-4462-ba40-944122913801';  -- controlled buyer (test account)
  v_seller constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';  -- William
  v_other  constant uuid := '524851b5-1eb5-45d2-92ad-533c2de8d465';  -- TCI, a stranger to this purchase
  v_listing constant uuid := '878bd4d5-7956-4d40-94b8-1058a8a86a45';
  v_txn uuid; v_att uuid; r jsonb; n int; b boolean; s text;
begin
  -- 1 · schema
  perform 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='final_purchase_currency';
  if not found then raise exception 'S1 transactions.final_purchase_currency missing'; end if;
  for s in select unnest(array['stripe_payment_attempts','stripe_refunds','stripe_events']) loop
    perform 1 from information_schema.tables where table_schema='public' and table_name=s;
    if not found then raise exception 'S2 table % missing', s; end if;
    select relrowsecurity into b from pg_class where oid=('public.'||s)::regclass;
    if not b then raise exception 'S3 RLS off on %', s; end if;
    for r in select jsonb_build_object('role', x) from unnest(array['anon','authenticated']) x loop
      if has_table_privilege(r->>'role', 'public.'||s, 'INSERT') then raise exception 'S4 % can INSERT %', r->>'role', s; end if;
      if has_table_privilege(r->>'role', 'public.'||s, 'UPDATE') then raise exception 'S5 % can UPDATE %', r->>'role', s; end if;
      if has_table_privilege(r->>'role', 'public.'||s, 'DELETE') then raise exception 'S6 % can DELETE %', r->>'role', s; end if;
    end loop;
  end loop;
  if has_table_privilege('authenticated', 'public.stripe_events', 'SELECT') then raise exception 'S7 authenticated can read the event log'; end if;
  if has_table_privilege('anon', 'public.stripe_payment_attempts', 'SELECT') then raise exception 'S8 anon can read attempts'; end if;
  if has_function_privilege('authenticated', 'public.stripe_apply_event(jsonb,uuid,text,jsonb)', 'EXECUTE') then raise exception 'S9 authenticated can execute stripe_apply_event'; end if;
  if not has_function_privilege('service_role', 'public.stripe_apply_event(jsonb,uuid,text,jsonb)', 'EXECUTE') then raise exception 'S10 service_role cannot execute stripe_apply_event'; end if;
  select pg_get_functiondef('public.accept_purchase_request(uuid)'::regprocedure) into s;
  if position('final_purchase_currency' in s) = 0 then raise exception 'S11 acceptance does not snapshot currency'; end if;
  if position('v_request.proposed_currency' in s) = 0 then raise exception 'S12 acceptance snapshots the wrong currency source'; end if;
  perform 1 from pg_indexes where schemaname='public' and indexname='transactions_one_per_request';
  if not found then raise exception 'S13 one-transaction-per-request index gone'; end if;
  perform 1 from pg_indexes where schemaname='public' and indexname='stripe_events_provider_identity';
  if not found then raise exception 'S14 event identity index missing'; end if;
  perform 1 from pg_indexes where schemaname='public' and indexname='stripe_payment_attempts_one_active';
  if not found then raise exception 'S15 one-active-attempt index missing'; end if;
  select count(*) into n from public.transactions;
  if n <> 0 then raise exception 'S16 expected zero transactions before proof rows, found %', n; end if;

  -- 2 · behaviour (all rolled back)
  insert into public.transactions (listing_id, buyer_id, seller_id, final_purchase_price, final_purchase_currency, status, listing_brand, listing_model)
  values (v_listing, v_buyer, v_seller, 7150, 'USD', 'pending', 'Rolex', 'Datejust') returning id into v_txn;
  insert into public.stripe_payment_attempts (transaction_id, environment, stripe_account_id, amount_minor, currency, lifecycle, idempotency_key, checkout_session_id)
  values (v_txn, 'sandbox', 'acct_proof', 715000, 'USD', 'checkout_created', 'fwt:stripe:checkout:'||v_txn||':proof', 'cs_proof') returning id into v_att;

  -- one active attempt per transaction
  begin
    insert into public.stripe_payment_attempts (transaction_id, environment, amount_minor, currency, idempotency_key) values (v_txn, 'sandbox', 715000, 'USD', 'k2');
    raise exception 'B1 second active attempt was allowed';
  exception when unique_violation then null; end;

  -- succeeded, via the atomic writer
  r := public.stripe_apply_event(jsonb_build_object('event_id','evt_1','stripe_account_id','acct_proof','event_type','checkout.session.completed','livemode',false,'object_type','checkout.session','object_id','cs_proof','payload','{}'::jsonb),
        v_att, 'checkout_created', jsonb_build_object('lifecycle','succeeded','payment_intent_id','pi_proof','provider_status','paid'));
  if r->>'result' <> 'applied' then raise exception 'B2 expected applied, got %', r; end if;
  select lifecycle into s from public.stripe_payment_attempts where id=v_att;
  if s <> 'succeeded' then raise exception 'B3 lifecycle % after success', s; end if;

  -- replay: duplicate, no second transition
  r := public.stripe_apply_event(jsonb_build_object('event_id','evt_1','stripe_account_id','acct_proof','event_type','checkout.session.completed','livemode',false,'payload','{}'::jsonb),
        v_att, 'succeeded', jsonb_build_object('lifecycle','failed'));
  if r->>'result' <> 'duplicate' then raise exception 'B4 replay was not a duplicate: %', r; end if;
  select lifecycle into s from public.stripe_payment_attempts where id=v_att;
  if s <> 'succeeded' then raise exception 'B5 replay changed lifecycle to %', s; end if;

  -- same event id from a DIFFERENT account context is a different event
  r := public.stripe_apply_event(jsonb_build_object('event_id','evt_1','stripe_account_id',null,'event_type','ping','livemode',false,'payload','{}'::jsonb), null, null, null);
  if r->>'result' <> 'unresolved' then raise exception 'B6 platform-context event not recorded: %', r; end if;

  -- stale: the caller saw a lifecycle that has since moved
  r := public.stripe_apply_event(jsonb_build_object('event_id','evt_2','stripe_account_id','acct_proof','event_type','checkout.session.expired','livemode',false,'payload','{}'::jsonb),
        v_att, 'checkout_created', jsonb_build_object('lifecycle','expired'));
  if r->>'result' <> 'stale' then raise exception 'B7 expected stale, got %', r; end if;
  select lifecycle into s from public.stripe_payment_attempts where id=v_att;
  if s <> 'succeeded' then raise exception 'B8 stale event demoted lifecycle to %', s; end if;

  -- partial refund coexists with success; refund identity preserved; total derived
  r := public.stripe_apply_event(jsonb_build_object('event_id','evt_3','stripe_account_id','acct_proof','event_type','charge.refunded','livemode',false,'payload','{}'::jsonb),
        v_att, 'succeeded', jsonb_build_object('refund_state','partial','refunded_amount_minor',100000,'refunds', jsonb_build_array(jsonb_build_object('id','re_1','amountMinor',100000,'status','succeeded','created',1))));
  if r->>'result' <> 'applied' then raise exception 'B9 refund not applied: %', r; end if;
  r := public.stripe_apply_event(jsonb_build_object('event_id','evt_4','stripe_account_id','acct_proof','event_type','refund.created','livemode',false,'payload','{}'::jsonb),
        v_att, 'succeeded', jsonb_build_object('refunded_amount_minor',50000,'refunds', jsonb_build_array(jsonb_build_object('id','re_2','amountMinor',50000,'status','succeeded','created',2))));
  select lifecycle, refund_state into s, b from public.stripe_payment_attempts where id=v_att;
  select lifecycle||'/'||refund_state||'/'||refunded_amount_minor into s from public.stripe_payment_attempts where id=v_att;
  if s <> 'succeeded/partial/150000' then raise exception 'B10 expected succeeded/partial/150000, got %', s; end if;
  select count(*) into n from public.stripe_refunds where payment_attempt_id=v_att;
  if n <> 2 then raise exception 'B11 expected 2 refund rows, found %', n; end if;

  -- dispute coexists with success and partial refund
  r := public.stripe_apply_event(jsonb_build_object('event_id','evt_5','stripe_account_id','acct_proof','event_type','charge.dispute.created','livemode',false,'payload','{}'::jsonb),
        v_att, 'succeeded', jsonb_build_object('dispute_state','open','dispute_provider_status','needs_response','dispute_id','dp_1'));
  select lifecycle||'/'||refund_state||'/'||dispute_state into s from public.stripe_payment_attempts where id=v_att;
  if s <> 'succeeded/partial/open' then raise exception 'B12 expected succeeded/partial/open, got %', s; end if;

  -- full refund
  r := public.stripe_apply_event(jsonb_build_object('event_id','evt_6','stripe_account_id','acct_proof','event_type','charge.refunded','livemode',false,'payload','{}'::jsonb),
        v_att, 'succeeded', jsonb_build_object('refund_state','full','refunded_amount_minor',715000,'refunds', jsonb_build_array(jsonb_build_object('id','re_3','amountMinor',565000,'status','succeeded','created',3))));
  select refund_state||'/'||refunded_amount_minor||'/'||dispute_state into s from public.stripe_payment_attempts where id=v_att;
  if s <> 'full/715000/open' then raise exception 'B13 expected full/715000/open, got %', s; end if;

  -- event log holds every event with its result
  select count(*) into n from public.stripe_events where event_id in ('evt_1','evt_2','evt_3','evt_4','evt_5','evt_6');
  if n <> 7 then raise exception 'B14 expected 7 event rows (evt_1 twice: two contexts), found %', n; end if;
  select processing_result into s from public.stripe_events where event_id='evt_2';
  if s <> 'stale' then raise exception 'B15 evt_2 result %', s; end if;

  -- transactions.rail untouched by all of the above
  select coalesce(rail,'null') into s from public.transactions where id=v_txn;
  if s <> 'null' then raise exception 'B16 rail was written: %', s; end if;

  -- 3 · RLS under real roles
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.stripe_payment_attempts where transaction_id=v_txn;
  if n <> 1 then raise exception 'R1 buyer sees % attempts, expected 1', n; end if;
  select count(*) into n from public.stripe_refunds where payment_attempt_id=v_att;
  if n <> 3 then raise exception 'R2 buyer sees % refunds, expected 3', n; end if;
  begin
    update public.stripe_payment_attempts set lifecycle='succeeded' where id=v_att;
    raise exception 'R3 buyer UPDATE succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.stripe_events;
    raise exception 'R4 buyer can read the event log';
  exception when insufficient_privilege then null; end;
  begin
    perform public.stripe_apply_event('{}'::jsonb, null, null, null);
    raise exception 'R5 buyer can execute stripe_apply_event';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_seller, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.stripe_payment_attempts where transaction_id=v_txn;
  if n <> 1 then raise exception 'R6 seller sees % attempts, expected 1', n; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.stripe_payment_attempts where transaction_id=v_txn;
  if n <> 0 then raise exception 'R7 stranger sees % attempts, expected 0', n; end if;
  reset role;

  raise exception 'PROOF_OK';
end $$;
