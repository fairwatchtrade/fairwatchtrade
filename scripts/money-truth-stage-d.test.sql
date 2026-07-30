-- ============================================================================
-- STAGE D PAIRING — database-side harness.
--
-- Target: a DISPOSABLE production-derived database. NEVER production.
--
-- SELF-ADAPTING to the constraint's three states, so one file serves every
-- step of the apply → validate → rollback → reapply cycle:
--   ABSENT     -> proves the discriminator write SUCCEEDS (and removes it),
--                 i.e. rollback genuinely restored permissiveness;
--   NOT VALID  -> proves mismatched writes are rejected immediately, paired
--                 writes still pass, existing rows carry zero violations;
--   VALIDATED  -> everything NOT VALID proves, plus convalidated = true.
--
-- Discriminator fixtures are transaction-local synthetics — never the real
-- Czapek. The H. Moser-derived rejection test mutates nothing: the violating
-- UPDATE is rolled back by its own exception subtransaction, and the harness
-- asserts the row is byte-unchanged afterward. Zero residue, proven against
-- baselines captured at entry.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ============================================================================

do $$
declare
  v_founder  uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_moser    uuid := '800802c8-e37f-4e7a-918f-5e2c02a49f46';
  v_state    text; -- 'absent' | 'notvalid' | 'validated'
  v_caught   boolean;
  v_fix      uuid;
  v_count    bigint;
  b_listings bigint;
  b_prs      bigint;
  b_profiles bigint;
  b_media    bigint;
  b_events   bigint;
  s_amount   text;
  s_ccy      text;
begin
  select case when not exists
           (select 1 from pg_constraint where conname = 'listings_money_pairing_check')
         then 'absent'
         when (select convalidated from pg_constraint where conname = 'listings_money_pairing_check')
         then 'validated' else 'notvalid' end
    into v_state;

  select count(*) into b_listings from public.listings;
  select count(*) into b_prs      from public.purchase_requests;
  select count(*) into b_profiles from public.profiles;
  select count(*) into b_media    from public.listing_media;
  select count(*) into b_events   from public.listing_currency_events;

  -- ── zero existing violations, in EVERY state (the data law holds) ──
  select count(*) into v_count from public.listings
   where (asking_price is null) <> (asking_currency is null);
  if v_count <> 0 then
    raise exception 'FAIL: % existing pairing violations', v_count; end if;

  if v_state = 'absent' then
    -- rollback-mode proof: the discriminator write SUCCEEDS without the
    -- constraint, then leaves. (Under either constrained state it is refused.)
    insert into public.listings (seller_id, brand, reference, status, details, photos,
                                 asking_price, asking_currency)
    values (v_founder, 'Pairing Fixture Co.', 'PAIR-0001', 'draft', '{}'::jsonb, '[]'::jsonb,
            4321, null)
    returning id into v_fix;
    delete from public.listings where id = v_fix;

  else
    -- ── mismatched INSERT: amount without currency → refused immediately ──
    v_caught := false;
    begin
      insert into public.listings (seller_id, brand, reference, status, details, photos,
                                   asking_price, asking_currency)
      values (v_founder, 'Pairing Fixture Co.', 'PAIR-0001', 'draft', '{}'::jsonb, '[]'::jsonb,
              4321, null);
    exception when check_violation then v_caught := true;
    end;
    if not v_caught then raise exception 'FAIL: amount-without-currency insert accepted'; end if;

    -- ── mismatched INSERT: currency without amount → refused immediately ──
    v_caught := false;
    begin
      insert into public.listings (seller_id, brand, reference, status, details, photos,
                                   asking_price, asking_currency)
      values (v_founder, 'Pairing Fixture Co.', 'PAIR-0002', 'draft', '{}'::jsonb, '[]'::jsonb,
              null, 'USD');
    exception when check_violation then v_caught := true;
    end;
    if not v_caught then raise exception 'FAIL: currency-without-amount insert accepted'; end if;

    -- ── mismatched UPDATE, H. Moser-derived: clear the amount, keep USD ──
    select trim_scale(asking_price)::text, asking_currency into s_amount, s_ccy
      from public.listings where id = v_moser;
    v_caught := false;
    begin
      update public.listings set asking_price = null where id = v_moser;
    exception when check_violation then v_caught := true;
    end;
    if not v_caught then raise exception 'FAIL: moser amount-clear accepted'; end if;
    if not exists (select 1 from public.listings
                    where id = v_moser and trim_scale(asking_price)::text = s_amount
                      and asking_currency = s_ccy) then
      raise exception 'FAIL: moser row not byte-unchanged after refused update'; end if;

    -- ── legal writes still pass: present-present and absent-absent ──
    insert into public.listings (seller_id, brand, reference, status, details, photos,
                                 asking_price, asking_currency)
    values (v_founder, 'Pairing Fixture Co.', 'PAIR-0003', 'draft', '{}'::jsonb, '[]'::jsonb,
            4321, 'USD')
    returning id into v_fix;
    delete from public.listings where id = v_fix;

    insert into public.listings (seller_id, brand, reference, status, details, photos,
                                 asking_price, asking_currency)
    values (v_founder, 'Pairing Fixture Co.', 'PAIR-0004', 'draft', '{}'::jsonb, '[]'::jsonb,
            null, null)
    returning id into v_fix;
    delete from public.listings where id = v_fix;

    -- ── validated state additionally proves convalidated = true ──
    if v_state = 'validated' then
      if not (select convalidated from pg_constraint
               where conname = 'listings_money_pairing_check') then
        raise exception 'FAIL: constraint not convalidated'; end if;
    end if;
  end if;

  -- ── zero residue + protected counts, in every state ──
  if (select count(*) from public.listings) <> b_listings then
    raise exception 'FAIL residue: listings'; end if;
  if (select count(*) from public.purchase_requests) <> b_prs then
    raise exception 'FAIL residue: purchase_requests'; end if;
  if (select count(*) from public.profiles) <> b_profiles then
    raise exception 'FAIL residue: profiles'; end if;
  if (select count(*) from public.listing_media) <> b_media then
    raise exception 'FAIL residue: listing_media'; end if;
  if (select count(*) from public.listing_currency_events) <> b_events then
    raise exception 'FAIL residue: currency events'; end if;

  raise notice 'money-truth-stage-d harness: ALL PASS (state = %)', v_state;
end $$;
