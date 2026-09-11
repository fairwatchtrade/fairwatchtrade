-- Accepted Purchase Continuity — database proof (2026-09-11)
-- Run as ONE statement (service role / SQL editor). Every row it creates is
-- rolled back by the final RAISE EXCEPTION; expect the message PROOF_OK.
--
-- Proves, against the live accept_purchase_request():
--   1. seller can accept own pending request; exactly ONE transaction results;
--      listing becomes 'reserved', never 'sold'
--   2. the buyer acceptance summons is written, addressed to the REQUEST ROW's
--      buyer, typed purchase_accepted, deep-linked by the minted transaction id
--   3. dedupe: the summons row is unique per request
--   4. fail-open: with notifications made un-insertable, acceptance still commits
--   5. a non-seller cannot accept (not_allowed)
--   6. competing pending sibling requests are superseded, not declined
do $$
declare
  v_seller   uuid := gen_random_uuid();
  v_buyer    uuid := gen_random_uuid();
  v_rival    uuid := gen_random_uuid();
  v_listing  uuid;
  v_req      uuid;
  v_req2     uuid;
  v_out      jsonb;
  v_txn      uuid;
  v_n        int;
  v_note     record;
  v_errored  boolean := false;
begin
  -- identities (auth.users rows so FKs hold)
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    (v_seller, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proof-seller-' || v_seller || '@example.invalid', '', now(), now(), now(), '{}', '{}'),
    (v_buyer,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proof-buyer-'  || v_buyer  || '@example.invalid', '', now(), now(), now(), '{}', '{}'),
    (v_rival,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proof-rival-'  || v_rival  || '@example.invalid', '', now(), now(), now(), '{}', '{}');

  insert into public.listings (seller_id, brand, model, reference, asking_price, asking_currency, status, condition, photos)
  values (v_seller, 'ProofBrand', 'ProofModel', 'PRF-1', 5000, 'USD', 'published', 'Excellent', '[]'::jsonb)
  returning id into v_listing;

  insert into public.purchase_requests (listing_id, buyer_id, seller_id, listing_price, proposed_purchase_price, proposed_currency, listing_currency, status, notes, listing_brand, listing_model, listing_reference)
  values (v_listing, v_buyer, v_seller, 5000, 4800, 'USD', 'USD', 'pending', 'proof note', 'ProofBrand', 'ProofModel', 'PRF-1')
  returning id into v_req;
  insert into public.purchase_requests (listing_id, buyer_id, seller_id, listing_price, proposed_purchase_price, proposed_currency, listing_currency, status, listing_brand, listing_model, listing_reference)
  values (v_listing, v_rival, v_seller, 5000, 4700, 'USD', 'USD', 'pending', 'ProofBrand', 'ProofModel', 'PRF-1')
  returning id into v_req2;

  -- 5 · a non-seller cannot accept
  perform set_config('request.jwt.claims', json_build_object('sub', v_rival, 'role', 'authenticated')::text, true);
  begin
    perform public.accept_purchase_request(v_req);
    raise exception 'FAIL: non-seller accepted';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise exception 'FAIL: expected not_allowed, got %', sqlerrm; end if;
  end;

  -- 1 · seller accepts
  perform set_config('request.jwt.claims', json_build_object('sub', v_seller, 'role', 'authenticated')::text, true);
  v_out := public.accept_purchase_request(v_req);
  v_txn := (v_out->>'transaction_id')::uuid;
  if v_txn is null then raise exception 'FAIL: no transaction id returned'; end if;

  select count(*) into v_n from public.transactions where purchase_request_id = v_req;
  if v_n <> 1 then raise exception 'FAIL: expected exactly one transaction, got %', v_n; end if;
  select count(*) into v_n from public.transactions where listing_id = v_listing;
  if v_n <> 1 then raise exception 'FAIL: expected one transaction per listing, got %', v_n; end if;

  if (select status from public.listings where id = v_listing) <> 'reserved' then
    raise exception 'FAIL: listing not reserved';
  end if;
  if (select status from public.purchase_requests where id = v_req) <> 'accepted' then raise exception 'FAIL: request not accepted'; end if;
  -- 6 · sibling superseded, not declined
  if (select status from public.purchase_requests where id = v_req2) <> 'superseded' then raise exception 'FAIL: sibling not superseded'; end if;

  -- 2 · the summons, addressed from the request row
  select * into v_note from public.notifications where type = 'purchase_accepted' and purchase_request_id = v_req;
  if not found then raise exception 'FAIL: no buyer summons written'; end if;
  if v_note.user_id <> v_buyer then raise exception 'FAIL: summons addressed to % not the request buyer', v_note.user_id; end if;
  if v_note.transaction_id <> v_txn then raise exception 'FAIL: summons not deep-linked to the minted transaction'; end if;
  if v_note.listing_id <> v_listing then raise exception 'FAIL: summons listing mismatch'; end if;
  if v_note.message not like 'Offer accepted — ProofBrand ProofModel%' then raise exception 'FAIL: summons copy: %', v_note.message; end if;
  -- the rival got no buyer summons
  select count(*) into v_n from public.notifications where type = 'purchase_accepted' and user_id = v_rival;
  if v_n <> 0 then raise exception 'FAIL: superseded buyer received a summons'; end if;

  -- 3 · dedupe key present and unique
  if v_note.dedupe_key <> 'purchase_accepted:' || v_req::text then raise exception 'FAIL: dedupe key %', v_note.dedupe_key; end if;
  begin
    insert into public.notifications (user_id, type, message, purchase_request_id, transaction_id, dedupe_key)
    values (v_buyer, 'purchase_accepted', 'dup', v_req, v_txn, 'purchase_accepted:' || v_req::text);
    raise exception 'FAIL: duplicate summons inserted';
  exception when unique_violation then
    null;
  end;

  -- 4 · fail-open: make the summons un-insertable, accept a fresh request, acceptance still commits
  declare
    v_listing2 uuid;
    v_req3     uuid;
    v_buyer2   uuid := gen_random_uuid();
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_buyer2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proof-buyer2-' || v_buyer2 || '@example.invalid', '', now(), now(), now(), '{}', '{}');
    insert into public.listings (seller_id, brand, model, reference, asking_price, asking_currency, status, condition, photos)
    values (v_seller, 'ProofBrand', 'Second', 'PRF-2', 6000, 'USD', 'published', 'Excellent', '[]'::jsonb)
    returning id into v_listing2;
    insert into public.purchase_requests (listing_id, buyer_id, seller_id, listing_price, proposed_purchase_price, proposed_currency, listing_currency, status, listing_brand, listing_model)
    values (v_listing2, v_buyer2, v_seller, 6000, 5900, 'USD', 'USD', 'pending', 'ProofBrand', 'Second')
    returning id into v_req3;

    -- a trigger that refuses every notifications insert for the rest of this transaction
    create or replace function pg_temp.refuse_notifications() returns trigger language plpgsql as $t$
    begin raise exception 'proof: notifications refused'; end $t$;
    create trigger proof_refuse before insert on public.notifications for each row execute function pg_temp.refuse_notifications();

    v_out := public.accept_purchase_request(v_req3);
    if (v_out->>'status') <> 'accepted' then raise exception 'FAIL: acceptance did not commit under notification failure'; end if;
    select count(*) into v_n from public.transactions where purchase_request_id = v_req3;
    if v_n <> 1 then raise exception 'FAIL: fail-open: transaction count %', v_n; end if;
    if (select status from public.listings where id = v_listing2) <> 'reserved' then raise exception 'FAIL: fail-open: listing not reserved'; end if;
    -- type-filtered: the seller's own purchase_request bell was written when
    -- the request was inserted, before the refusing trigger existed
    select count(*) into v_n from public.notifications where purchase_request_id = v_req3 and type = 'purchase_accepted';
    if v_n <> 0 then raise exception 'FAIL: the refusing trigger did not fire'; end if;
    drop trigger proof_refuse on public.notifications;
  end;

  raise exception 'PROOF_OK';
end $$;
