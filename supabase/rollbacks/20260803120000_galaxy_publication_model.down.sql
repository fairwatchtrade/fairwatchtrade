-- ════════════════════════════════════════════════════════════════════════
-- GALAXY PUBLICATION MODEL — SCHEMA ROLLBACK
-- supabase/rollbacks/20260803120000_galaxy_publication_model.down.sql
--
-- Removes the publication mechanism entirely and returns the five
-- hierarchy tables to their pre-migration shape.
--
-- ── THIS IS NOT THE OPERATIONAL ROLLBACK ───────────────────────────────
-- To undo ONE activation, call public.galaxy_rollback_event(event_id,
-- actor). That is exact, audited, and reversible. This file is the
-- structural retreat — "the model itself was wrong" — and it discards the
-- audit history with it.
--
-- ── WHAT IT DOES NOT TOUCH ─────────────────────────────────────────────
-- No taxonomy row is created, deleted or edited. Dropping galaxy_visible
-- removes publication state, which means every row becomes visible again
-- because the Galaxy code paths that read the views are, by then, also
-- being reverted. Deploy order for a retreat is the mirror of the rollout:
-- revert the application FIRST, then run this. Running this while the
-- deployed code still selects from vault_galaxy_* will darken the Vault
-- through its "gates are closed" fallback.
--
-- ── REFUSAL ────────────────────────────────────────────────────────────
-- Refuses if any row is currently hidden, because dropping the column
-- would silently publish it. Publish or delete those rows deliberately
-- first, then retreat.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── SERIALIZATION AND STABILITY (before anything is counted) ───────────
-- 1 · The SAME transaction-scoped advisory lock the operator functions
--     take (key hashtextextended('fwt.galaxy_publication', 0)), so a
--     concurrent galaxy_activate/galaxy_rollback_event cannot interleave
--     with the retreat.
-- 2 · ACCESS EXCLUSIVE on all five hierarchy tables, in one fixed order
--     (brands → collections → families → variants → references — parent
--     to child, always this order, so two lockers cannot deadlock).
--     Without these, an ingestion running between the guard's count and
--     the column drops could insert a default-hidden row that the drop
--     would then silently publish — the guard would have passed against
--     one state and the drop executed against another.
-- Both are held through the guard, the teardown, the column drops, and
-- transaction completion. The retreat either observes ONE stable
-- hierarchy and proceeds, or refuses; there is no in-between.
select pg_advisory_xact_lock(hashtextextended('fwt.galaxy_publication', 0));
lock table public.vault_brands      in access exclusive mode;
lock table public.vault_collections in access exclusive mode;
lock table public.vault_families    in access exclusive mode;
lock table public.vault_variants    in access exclusive mode;
lock table public.vault_references  in access exclusive mode;

do $$
declare v_hidden int;
begin
  select
      (select count(*) from public.vault_brands      where not galaxy_visible)
    + (select count(*) from public.vault_collections where not galaxy_visible)
    + (select count(*) from public.vault_families    where not galaxy_visible)
    + (select count(*) from public.vault_variants    where not galaxy_visible)
    + (select count(*) from public.vault_references  where not galaxy_visible)
    into v_hidden;
  if v_hidden > 0 then
    raise exception
      'REFUSED: % row(s) are currently unpublished — dropping the column would publish them silently. Resolve them deliberately first.',
      v_hidden;
  end if;
end $$;

drop function if exists public.galaxy_rollback_event(uuid, text);
drop function if exists public.galaxy_activate(jsonb, text, text);
drop function if exists public.galaxy_brand_subtree(uuid);

drop view if exists public.vault_galaxy_references;
drop view if exists public.vault_galaxy_variants;
drop view if exists public.vault_galaxy_families;
drop view if exists public.vault_galaxy_collections;
drop view if exists public.vault_galaxy_brands;

drop table if exists public.galaxy_publication_event;

drop index if exists public.vault_brands_galaxy_visible_idx;
drop index if exists public.vault_collections_galaxy_visible_idx;
drop index if exists public.vault_families_galaxy_visible_idx;
drop index if exists public.vault_variants_galaxy_visible_idx;
drop index if exists public.vault_references_galaxy_visible_idx;

alter table public.vault_brands      drop column if exists galaxy_visible;
alter table public.vault_collections drop column if exists galaxy_visible;
alter table public.vault_families    drop column if exists galaxy_visible;
alter table public.vault_variants    drop column if exists galaxy_visible;
alter table public.vault_references  drop column if exists galaxy_visible;

commit;
