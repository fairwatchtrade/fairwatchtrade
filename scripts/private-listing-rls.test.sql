-- Private Listing V1 — RLS + purchase-request eligibility behavior pins.
--
-- Run against a database where the private_listing_v1 migration is applied.
-- The whole run is one transaction that ROLLS BACK: it creates a private
-- fixture between two REAL accounts, probes every access boundary under
-- switched roles/JWT claims, returns one pass/fail row per behavior, and
-- leaves nothing behind.
--
-- Replace the three ids below with real accounts before running:
--   :seller  — a real seller account id
--   :buyer   — a real, DIFFERENT account id (the authorized private buyer)
--   the "unrelated" id is intentionally a nonexistent uuid — RLS denial
--   happens before any FK could matter, which is itself part of the proof.
--
-- Behaviors pinned (all must pass):
--   seller_reads_private            — owner sees the row
--   authorized_buyer_reads_private  — the ONE buyer sees the row
--   unrelated_account_denied        — any other signed-in account: no row
--   anonymous_denied                — signed-out: no row
--   public_query_excludes_private   — status='published' never matches it
--   authorized_buyer_can_request    — the buyer enters the EXISTING
--                                     purchase-request machinery
--   unauthorized_request_denied     — anyone else is refused by the
--                                     creation guard (listing_not_available)
--
-- A companion regression (run separately with a real second buyer):
-- an ordinary published listing must still accept a purchase request.

begin;

insert into public.listings
  (id, seller_id, status, brand, model, reference, condition,
   asking_price, asking_price_raw, asking_currency, private_buyer_id)
values
  ('11111111-2222-3333-4444-555555555555',
   :'seller', 'private_active', 'RlsProbe', 'PrivateFixture',
   'RLS-1', 'Excellent', 5000, '5000', 'USD', :'buyer');

create temp table rls_results (test text, pass boolean);

do $$
declare
  v_fixture uuid := '11111111-2222-3333-4444-555555555555';
  v_seller  text := current_setting('vars.seller', true);
  v_buyer   text := current_setting('vars.buyer', true);
  v_ok boolean;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_seller, 'role','authenticated')::text, true);
  select exists(select 1 from public.listings where id = v_fixture) into v_ok;
  perform set_config('role','postgres',true);
  insert into rls_results values ('seller_reads_private', v_ok);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role','authenticated')::text, true);
  select exists(select 1 from public.listings where id = v_fixture) into v_ok;
  perform set_config('role','postgres',true);
  insert into rls_results values ('authorized_buyer_reads_private', v_ok);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-00000000dead','role','authenticated')::text, true);
  select not exists(select 1 from public.listings where id = v_fixture) into v_ok;
  perform set_config('role','postgres',true);
  insert into rls_results values ('unrelated_account_denied', v_ok);

  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','',true);
  select not exists(select 1 from public.listings where id = v_fixture) into v_ok;
  perform set_config('role','postgres',true);
  insert into rls_results values ('anonymous_denied', v_ok);

  perform set_config('role','anon',true);
  select not exists(select 1 from public.listings where status = 'published' and id = v_fixture) into v_ok;
  perform set_config('role','postgres',true);
  insert into rls_results values ('public_query_excludes_private', v_ok);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role','authenticated')::text, true);
  begin
    insert into public.purchase_requests
      (listing_id, buyer_id, seller_id, listing_price, proposed_purchase_price,
       listing_currency, proposed_currency, listing_brand, listing_model, listing_reference, status)
    values (v_fixture, v_buyer::uuid, v_seller::uuid, 5000, 4500,
            'USD','USD','RlsProbe','PrivateFixture','RLS-1','pending');
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform set_config('role','postgres',true);
  insert into rls_results values ('authorized_buyer_can_request', v_ok);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-00000000dead','role','authenticated')::text, true);
  begin
    insert into public.purchase_requests
      (listing_id, buyer_id, seller_id, listing_price, proposed_purchase_price,
       listing_currency, proposed_currency, listing_brand, status)
    values (v_fixture, '00000000-0000-4000-8000-00000000dead', v_seller::uuid, 5000, 4500,
            'USD','USD','RlsProbe','pending');
    v_ok := false; -- an insert succeeding here would be the defect
  exception when others then
    v_ok := sqlerrm like '%listing_not_available%';
  end;
  perform set_config('role','postgres',true);
  insert into rls_results values ('unauthorized_request_denied', v_ok);
end $$;

select * from rls_results order by test;

rollback;
