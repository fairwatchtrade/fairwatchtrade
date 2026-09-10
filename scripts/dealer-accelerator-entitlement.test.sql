-- ════════════════════════════════════════════════════════════════════════
-- DEALER ACCELERATOR ENTITLEMENT — database proof (executable, read-only)
-- scripts/dealer-accelerator-entitlement.test.sql
--
-- Founder lock 2026-09-10: Dealer Accelerator entitlement is a separate,
-- founder-written fact in public.dealer_accelerator_entitlements. This file
-- proves the storage and the policy behave as the law says, against the
-- live project, without leaving residue: every assertion is a RAISE inside
-- one DO block, role switches are SET LOCAL, and the block ends by raising
-- PROOF_OK so the transaction rolls back whatever it touched (nothing).
--
-- Run (Supabase MCP execute_sql, or psql on the production project):
--   the whole DO block below as one statement. Expected outcome: an error
--   whose message is exactly PROOF_OK. Any other message is a failing
--   assertion, named in the message.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_tci      constant uuid := '524851b5-1eb5-45d2-92ad-533c2de8d465';
  v_william  constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_joe      constant uuid := '00000000-0000-4000-8000-00000000c0de';
  n int;
  b boolean;
begin
  -- 1 · storage exists with the law's columns
  perform 1 from information_schema.tables
   where table_schema = 'public' and table_name = 'dealer_accelerator_entitlements';
  if not found then raise exception 'T1 table missing'; end if;
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'dealer_accelerator_entitlements'
     and column_name in ('seller_id','granted_at','granted_by','revoked_at','revoked_by');
  if n <> 5 then raise exception 'T2 expected 5 law columns, found %', n; end if;

  -- 2 · RLS on, one own-live-row select policy, no write policies
  select relrowsecurity into b from pg_class where oid = 'public.dealer_accelerator_entitlements'::regclass;
  if not b then raise exception 'T3 RLS not enabled'; end if;
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'dealer_accelerator_entitlements';
  if n <> 1 then raise exception 'T4 expected exactly 1 policy, found %', n; end if;
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'dealer_accelerator_entitlements' and cmd <> 'SELECT';
  if n <> 0 then raise exception 'T5 a non-SELECT policy exists'; end if;

  -- 3 · privileges: authenticated may SELECT only; anon nothing
  if not has_table_privilege('authenticated', 'public.dealer_accelerator_entitlements', 'SELECT') then raise exception 'T6 authenticated cannot SELECT'; end if;
  if has_table_privilege('authenticated', 'public.dealer_accelerator_entitlements', 'INSERT') then raise exception 'T7 authenticated can INSERT'; end if;
  if has_table_privilege('authenticated', 'public.dealer_accelerator_entitlements', 'UPDATE') then raise exception 'T8 authenticated can UPDATE'; end if;
  if has_table_privilege('authenticated', 'public.dealer_accelerator_entitlements', 'DELETE') then raise exception 'T9 authenticated can DELETE'; end if;
  if has_table_privilege('anon', 'public.dealer_accelerator_entitlements', 'SELECT') then raise exception 'T10 anon can SELECT'; end if;

  -- 4 · no trigger grants anything
  select count(*) into n from pg_trigger
   where tgrelid = 'public.dealer_accelerator_entitlements'::regclass and not tgisinternal;
  if n <> 0 then raise exception 'T11 a trigger exists on the entitlement table'; end if;

  -- 5 · the founder designation: exactly one live row, and it is TCI
  select count(*) into n from public.dealer_accelerator_entitlements where revoked_at is null;
  if n <> 1 then raise exception 'T12 expected exactly 1 live entitlement, found %', n; end if;
  perform 1 from public.dealer_accelerator_entitlements where seller_id = v_tci and revoked_at is null and granted_by = 'founder:Jason';
  if not found then raise exception 'T13 TCI is not the live founder-granted row'; end if;
  perform 1 from public.dealer_accelerator_entitlements where seller_id = v_william;
  if found then raise exception 'T14 William has an entitlement row'; end if;
  -- and dealer identity is NOT entitlement: two dealer profiles, one entitlement
  select count(*) into n from public.dealer_profiles;
  if n < 2 then raise exception 'T15 expected both dealer profiles present, found %', n; end if;
  perform 1 from public.dealer_profiles where seller_id = v_william;
  if not found then raise exception 'T16 William dealer profile missing (Tax Time law depends on it)'; end if;

  -- 6 · policy behaviour under real roles (SET LOCAL: undone by the rollback)
  perform set_config('request.jwt.claims', json_build_object('sub', v_tci, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dealer_accelerator_entitlements;
  if n <> 1 then raise exception 'T17 TCI session sees % rows, expected 1', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_william, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dealer_accelerator_entitlements;
  if n <> 0 then raise exception 'T18 William session sees % rows, expected 0', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_joe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dealer_accelerator_entitlements;
  if n <> 0 then raise exception 'T19 ordinary session sees % rows, expected 0', n; end if;
  -- an ordinary session cannot self-grant
  begin
    insert into public.dealer_accelerator_entitlements (seller_id, granted_by) values (v_joe, 'self');
    raise exception 'T20 authenticated INSERT succeeded';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise exception 'PROOF_OK';
end $$;
