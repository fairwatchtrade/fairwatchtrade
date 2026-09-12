-- ═══════════════════════════════════════════════════════════════════════════
-- TRADE ARCHIVE — database proof (order §18)
--
-- Run as ONE statement. It ends by raising PROOF_OK, which rolls the whole
-- thing back: every fixture row, every preference, every trade. Nothing in
-- this file survives its own execution.
--
-- What it proves, in order:
--   A archives their own view; B still sees the record Active
--   B cannot read A's preference
--   a stranger can neither archive nor restore
--   a nonparticipant / missing target gets a nonrevealing refusal
--   archive changes no deal, offer, leg or transfer field
--   restore changes none either
--   a live (settling) deal refuses archive
--   completed and cancelled deals are eligible
--   declined / superseded / withdrawn no-deal offers are eligible
--   an accepted offer with a cancelled deal is governed by the DEAL
--   leg status alone never grants eligibility
--   a reactivated deal retires the old preference and returns to Active
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_a       uuid := gen_random_uuid();
  v_b       uuid := gen_random_uuid();
  v_s       uuid := gen_random_uuid();
  v_la      uuid;
  v_lb      uuid;
  v_offer   uuid;
  v_deal    uuid;
  v_o       uuid;
  v_term    text;
  v_n       int;
  v_before  jsonb;
  v_after   jsonb;
  v_gen     timestamptz;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arch-a-' || v_a || '@example.invalid', '', now(), now(), now(), '{}', '{}'),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arch-b-' || v_b || '@example.invalid', '', now(), now(), now(), '{}', '{}'),
    (v_s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arch-s-' || v_s || '@example.invalid', '', now(), now(), now(), '{}', '{}');

  insert into public.listings (seller_id, brand, model, reference, asking_price, asking_currency, status, condition, photos)
  values (v_a, 'ArchBrand', 'A', 'ARCH-A', 1000, 'USD', 'published', 'Excellent', '[]'::jsonb) returning id into v_la;
  insert into public.listings (seller_id, brand, model, reference, asking_price, asking_currency, status, condition, photos)
  values (v_b, 'ArchBrand', 'B', 'ARCH-B', 1200, 'USD', 'published', 'Excellent', '[]'::jsonb) returning id into v_lb;

  insert into public.trade_offers (target_listing_id, offered_listing_id, proposer_id, recipient_id, status, cash_direction)
  values (v_lb, v_la, v_a, v_b, 'accepted', 'none') returning id into v_offer;
  insert into public.trade_deals (trade_offer_id, party_a_id, party_b_id, status, cash_direction)
  values (v_offer, v_a, v_b, 'completed', 'none') returning id into v_deal;
  insert into public.trade_deal_legs (trade_deal_id, listing_id, from_user_id, to_user_id, leg_status)
  values (v_deal, v_la, v_a, v_b, 'transferred'), (v_deal, v_lb, v_b, v_a, 'transferred');

  /* Snapshot every commercial field archive must never touch. */
  select to_jsonb(d) - 'updated_at' into v_before from public.trade_deals d where d.id = v_deal;

  -- ── A archives their own view ────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform public.trade_archive_set('deal', v_deal, true);
  select count(*) into v_n from public.trade_archive_preferences where user_id = v_a and record_id = v_deal;
  if v_n <> 1 then raise exception 'FAIL: A archive did not record'; end if;

  -- idempotent
  perform public.trade_archive_set('deal', v_deal, true);
  select count(*) into v_n from public.trade_archive_preferences where user_id = v_a and record_id = v_deal;
  if v_n <> 1 then raise exception 'FAIL: archive is not idempotent (%)', v_n; end if;

  -- ── B is unaffected, and cannot read A's preference ──────────────────
  select count(*) into v_n from public.trade_archive_preferences where user_id = v_b and record_id = v_deal;
  if v_n <> 0 then raise exception 'FAIL: B was archived by A'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.trade_archive_preferences;
  if v_n <> 0 then raise exception 'FAIL: B can read %s preference rows that are not theirs', v_n; end if;
  reset role;

  -- ── the commercial record is untouched by archiving ──────────────────
  select to_jsonb(d) - 'updated_at' into v_after from public.trade_deals d where d.id = v_deal;
  if v_before is distinct from v_after then raise exception 'FAIL: archive mutated the deal: % -> %', v_before, v_after; end if;
  select count(*) into v_n from public.trade_deal_legs where trade_deal_id = v_deal and leg_status <> 'transferred';
  if v_n <> 0 then raise exception 'FAIL: archive mutated a leg'; end if;

  -- ── a stranger can neither archive nor restore, and learns nothing ───
  perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
  begin
    perform public.trade_archive_set('deal', v_deal, true);
    raise exception 'FAIL: a stranger archived a trade';
  exception when others then
    if sqlerrm not like '%not_found%' then raise exception 'FAIL: stranger archive: expected not_found, got %', sqlerrm; end if;
  end;
  begin
    perform public.trade_archive_set('deal', v_deal, false);
    raise exception 'FAIL: a stranger restored a trade';
  exception when others then
    if sqlerrm not like '%not_found%' then raise exception 'FAIL: stranger restore: expected not_found, got %', sqlerrm; end if;
  end;
  -- a target that does not exist gets the SAME refusal
  begin
    perform public.trade_archive_set('deal', gen_random_uuid(), true);
    raise exception 'FAIL: archived a nonexistent deal';
  exception when others then
    if sqlerrm not like '%not_found%' then raise exception 'FAIL: missing target: expected not_found, got %', sqlerrm; end if;
  end;

  -- ── restore is reversible and equally harmless ───────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform public.trade_archive_set('deal', v_deal, false);
  select count(*) into v_n from public.trade_archive_preferences where user_id = v_a and record_id = v_deal;
  if v_n <> 0 then raise exception 'FAIL: restore did not release'; end if;
  perform public.trade_archive_set('deal', v_deal, false); -- idempotent
  select to_jsonb(d) - 'updated_at' into v_after from public.trade_deals d where d.id = v_deal;
  if v_before is distinct from v_after then raise exception 'FAIL: restore mutated the deal'; end if;

  -- ── eligibility: the DEAL governs ────────────────────────────────────
  update public.trade_deals set status = 'settling' where id = v_deal;
  begin
    perform public.trade_archive_set('deal', v_deal, true);
    raise exception 'FAIL: archived a settling deal';
  exception when others then
    if sqlerrm not like '%not_eligible%' then raise exception 'FAIL: settling: expected not_eligible, got %', sqlerrm; end if;
  end;

  update public.trade_deals set status = 'pending' where id = v_deal;
  begin
    perform public.trade_archive_set('deal', v_deal, true);
    raise exception 'FAIL: archived a pending deal';
  exception when others then
    if sqlerrm not like '%not_eligible%' then raise exception 'FAIL: pending: expected not_eligible, got %', sqlerrm; end if;
  end;

  /* Leg status alone never grants eligibility: both legs are `transferred`
     above and the deal is still refused while it is not finished. */
  select count(*) into v_n from public.trade_deal_legs where trade_deal_id = v_deal and leg_status = 'transferred';
  if v_n <> 2 then raise exception 'FAIL: fixture legs are not transferred'; end if;

  update public.trade_deals set status = 'cancelled' where id = v_deal;
  perform public.trade_archive_set('deal', v_deal, true);
  select count(*) into v_n from public.trade_archive_preferences where user_id = v_a and record_id = v_deal;
  if v_n <> 1 then raise exception 'FAIL: cancelled deal is not eligible'; end if;

  /* And the offer's own `accepted` did not override the deal in either
     direction: the offer never changed, and the deal decided twice. */
  if (select status from public.trade_offers where id = v_offer) <> 'accepted' then
    raise exception 'FAIL: the offer status drifted';
  end if;

  -- ── §13 · reactivation retires the preference ────────────────────────
  select record_updated_at into v_gen from public.trade_archive_preferences where user_id = v_a and record_id = v_deal;
  /* THE ONE THING THIS PROOF MUST FAKE, AND WHY.
     `touch_trade_updated_at` writes `now()`, which is the TRANSACTION
     timestamp — so every statement in this single DO block produces the
     same generation, and a reactivation here would be indistinguishable
     from the archive that preceded it. In production the two are always
     separate requests and therefore separate transactions with different
     timestamps. `session_replication_role = replica` suspends the touch
     trigger just long enough to write the timestamp that later transaction
     would have written. The column, the comparison and the retirement are
     all real; only the passage of time is staged. */
  set local session_replication_role = replica;
  update public.trade_deals set status = 'settling', updated_at = v_gen + interval '1 second' where id = v_deal;
  set local session_replication_role = origin;
  if (select updated_at from public.trade_deals where id = v_deal) = v_gen then
    raise exception 'FAIL: the lifecycle generation did not move on reactivation';
  end if;
  /* The row still exists — nothing was destroyed — but it no longer
     matches the record's generation, which is what the read path uses to
     decide the record is Active again. */
  select count(*) into v_n
  from public.trade_archive_preferences p
  join public.trade_deals d on d.id = p.record_id
  where p.user_id = v_a and p.record_id = v_deal and p.record_updated_at = d.updated_at;
  if v_n <> 0 then raise exception 'FAIL: a stale preference still applies after reactivation'; end if;

  /* Completed a SECOND time: still not hidden by the old archive bit. */
  set local session_replication_role = replica;
  update public.trade_deals set status = 'completed', updated_at = v_gen + interval '2 seconds' where id = v_deal;
  set local session_replication_role = origin;
  select count(*) into v_n
  from public.trade_archive_preferences p
  join public.trade_deals d on d.id = p.record_id
  where p.user_id = v_a and p.record_id = v_deal and p.record_updated_at = d.updated_at;
  if v_n <> 0 then raise exception 'FAIL: an old archive bit hid a new terminal episode'; end if;

  -- ── eligibility: with NO deal, the offer governs ─────────────────────
  /* One offer per terminal status, not one offer walked through three:
     `trade_offer_terminal_states_are_immutable` rightly refuses to move a
     resolved offer, and `trade_offers_one_pending_per_proposer` refuses a
     second pending offer on the same watch — so each fixture is created
     only once its predecessor is terminal. Both guards are real product
     law and the proof bends to them rather than around them. */
  foreach v_term in array array['declined', 'superseded', 'withdrawn'] loop
    insert into public.trade_offers (target_listing_id, offered_listing_id, proposer_id, recipient_id, status, cash_direction)
    values (v_lb, v_la, v_a, v_b, 'pending', 'none') returning id into v_o;
    begin
      perform public.trade_archive_set('offer', v_o, true);
      raise exception 'FAIL: archived a pending offer';
    exception when others then
      if sqlerrm not like '%not_eligible%' then raise exception 'FAIL: pending offer: got %', sqlerrm; end if;
    end;
    update public.trade_offers set status = v_term where id = v_o;
    perform public.trade_archive_set('offer', v_o, true);
    select count(*) into v_n from public.trade_archive_preferences
     where user_id = v_a and record_kind = 'offer' and record_id = v_o;
    if v_n <> 1 then raise exception 'FAIL: a % offer is not eligible', v_term; end if;
  end loop;

  -- ── a bad record kind is refused ─────────────────────────────────────
  begin
    perform public.trade_archive_set('leg', v_deal, true);
    raise exception 'FAIL: accepted an unknown record kind';
  exception when others then
    if sqlerrm not like '%bad_record_kind%' then raise exception 'FAIL: bad kind: got %', sqlerrm; end if;
  end;

  raise exception 'PROOF_OK';
end $$;
