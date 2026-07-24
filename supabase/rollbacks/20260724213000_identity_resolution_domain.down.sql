-- ════════════════════════════════════════════════════════════════════════
-- v2.64 — Identity Resolution Domain (GUARDED rollback)
--
-- INSTALLATION-RECOVERY tool, NOT permission to erase reviewed identity
-- history. Refuses to run if ANY row exists in any of the three domain
-- tables. Runs as one atomic transaction.
--
-- Pairs with: supabase/migrations/20260724213000_identity_resolution_domain.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── DATA-EXISTENCE GUARD (first; nothing below runs if it raises) ──
do $$
declare v_rows bigint;
begin
  select
      (select count(*) from public.identity_resolution_candidate)
    + (select count(*) from public.identity_resolution_decision)
    + (select count(*) from public.identity_resolution_case)
  into v_rows;
  if v_rows > 0 then
    raise exception
      'ROLLBACK REFUSED: % identity-resolution row(s) exist. This .down.sql is an installation-recovery tool, not an identity-history-erasure tool.', v_rows;
  end if;
end $$;

-- ── Verified-empty baseline below ──

-- Revoke + drop both functions (full schema-qualified signatures).
revoke all on function public.identity_resolution_review_case(text, uuid, uuid, text, jsonb, text, uuid, uuid) from service_role;
revoke all on function public.identity_resolution_claim_fingerprint(text, uuid) from service_role;
drop function if exists public.identity_resolution_review_case(text, uuid, uuid, text, jsonb, text, uuid, uuid);
drop function if exists public.identity_resolution_claim_fingerprint(text, uuid);

-- Drop tables child-before-parent (candidate -> decision -> case).
drop table if exists public.identity_resolution_candidate;
drop table if exists public.identity_resolution_decision;
drop table if exists public.identity_resolution_case;

-- Drop the writer's scoped read policies on shared tables.
drop policy if exists irw_listings_select    on public.listings;
drop policy if exists irw_auction_lot_select on public.auction_evidence_lot;
drop policy if exists irw_vault_refs_select  on public.vault_references;
drop policy if exists irw_vault_vars_select  on public.vault_variants;
revoke select on public.listings             from identity_resolution_writer;
revoke select on public.auction_evidence_lot from identity_resolution_writer;
revoke select on public.vault_references     from identity_resolution_writer;
revoke select on public.vault_variants       from identity_resolution_writer;

-- Owner-role teardown: only after everything it owned is gone; STOP rather
-- than force-drop if anything survives.
do $$
declare v_owned bigint;
begin
  if exists (select 1 from pg_roles where rolname = 'identity_resolution_writer') then
    select
        (select count(*) from pg_class c join pg_roles r on c.relowner = r.oid where r.rolname = 'identity_resolution_writer')
      + (select count(*) from pg_proc  p join pg_roles r on p.proowner = r.oid where r.rolname = 'identity_resolution_writer')
    into v_owned;
    if v_owned > 0 then
      raise exception 'ROLLBACK HALTED: identity_resolution_writer still owns % object(s); refusing to force-drop or reassign.', v_owned;
    end if;
    revoke create, usage on schema public from identity_resolution_writer;
    revoke usage on schema extensions from identity_resolution_writer;
    revoke identity_resolution_writer from postgres;
    drop role identity_resolution_writer;
  end if;
end $$;
