-- ════════════════════════════════════════════════════════════════════════
-- v2.61 — Auction Evidence Preservation Layer (GUARDED rollback)
--
-- INSTALLATION-RECOVERY tool, NOT permission to erase evidence. Refuses to run
-- if ANY row exists in ANY of the seven evidence tables (including both
-- append-only event tables). Runs as one atomic transaction.
--
-- Pairs with: supabase/migrations/20260723214500_auction_evidence_preservation_layer.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── DATA-EXISTENCE GUARD (first; nothing below runs if it raises) ──
do $$
declare v_rows bigint;
begin
  select
      (select count(*) from public.auction_evidence_result)
    + (select count(*) from public.auction_evidence_lot_fact_events)
    + (select count(*) from public.auction_evidence_source_artifact_events)
    + (select count(*) from public.auction_evidence_lot)
    + (select count(*) from public.auction_evidence_source_artifact)
    + (select count(*) from public.auction_evidence_sale)
    + (select count(*) from public.auction_evidence_house)
  into v_rows;
  if v_rows > 0 then
    raise exception
      'ROLLBACK REFUSED: % auction-evidence row(s) exist. This .down.sql is an installation-recovery tool, not an evidence-erasure tool. Export/preserve the evidence through a deliberate procedure before any teardown.', v_rows;
  end if;
end $$;

-- ── Verified-empty baseline below ──

-- 2. Revoke EXECUTE on all three RPCs (full schema-qualified signatures).
revoke all on function public.auction_evidence_create_or_correct_result(
  uuid, numeric, text, text, text, date, uuid, uuid, uuid
) from service_role;
revoke all on function public.auction_evidence_update_artifact_rights_state(
  uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid
) from service_role;
revoke all on function public.auction_evidence_correct_lot_facts(
  uuid, boolean, text, boolean, text, boolean, text, boolean, text, uuid, text, uuid
) from service_role;

-- 3. Drop all three RPCs (full signatures).
drop function if exists public.auction_evidence_create_or_correct_result(
  uuid, numeric, text, text, text, date, uuid, uuid, uuid
);
drop function if exists public.auction_evidence_update_artifact_rights_state(
  uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid
);
drop function if exists public.auction_evidence_correct_lot_facts(
  uuid, boolean, text, boolean, text, boolean, text, boolean, text, uuid, text, uuid
);

-- 4-11. Drop tables. Each DROP TABLE removes its own policies, triggers,
-- indexes, and constraints. Child-before-parent:
--   · lot_fact_events BEFORE lot (its ON DELETE RESTRICT FK would block it)
--   · source_artifact_events BEFORE source_artifact (same reason)
drop table if exists public.auction_evidence_result;
drop table if exists public.auction_evidence_lot_fact_events;
drop table if exists public.auction_evidence_lot;
drop table if exists public.auction_evidence_source_artifact_events;
drop table if exists public.auction_evidence_source_artifact;
drop table if exists public.auction_evidence_sale;
drop table if exists public.auction_evidence_house;

-- Domain trigger function.
drop function if exists public.auction_evidence_touch_updated_at();

-- 12-13. Owner-role teardown: only after every object a role owned is gone.
-- If a role still owns any object, STOP with an explicit error (never a blanket
-- reassignment). Otherwise sweep its residual schema grants + membership + drop.
do $$
declare
  r_name text;
  v_owned bigint;
begin
  foreach r_name in array array['auction_evidence_result_writer','auction_evidence_rights_writer','auction_evidence_lot_writer'] loop
    if exists (select 1 from pg_roles where rolname = r_name) then
      select
          (select count(*) from pg_class c join pg_roles ro on c.relowner = ro.oid where ro.rolname = r_name)
        + (select count(*) from pg_proc  p join pg_roles ro on p.proowner = ro.oid where ro.rolname = r_name)
      into v_owned;
      if v_owned > 0 then
        raise exception 'ROLLBACK HALTED: role % still owns % object(s); refusing to force-drop or reassign. Investigate before retrying.', r_name, v_owned;
      end if;
      execute format('revoke create, usage on schema public from %I', r_name);
      execute format('revoke %I from postgres', r_name);
      execute format('drop role %I', r_name);
    end if;
  end loop;
end $$;
