-- ════════════════════════════════════════════════════════════════════════
-- GALAXY VISIBILITY GATE
-- supabase/migrations/20260731020000_galaxy_visibility_gate.sql
--
-- Split out of the Flight A identity-constraints migration deliberately.
-- That flight repairs data and closes a duplication path; this one changes
-- what the public Galaxy draws. Different risk, different reviewer, and an
-- ordering dependency of its own — so it gets its own migration.
--
-- ── WHY ────────────────────────────────────────────────────────────────
-- Vault truth readiness and Galaxy presentation readiness are different
-- completion states. A brand can be fully and truthfully ingested long
-- before the renderer can draw it honestly: the incoming Vault-lock v3.2
-- corpus carries brands dense enough to overlap the current fixed moon
-- ring (Speake-Marin alone would put 24 moons on a ring that collides
-- above ~20).
--
-- Both brand-listing queries select every row with no filter, so a brand
-- becomes a star the instant it is inserted. This column is the seam that
-- lets ingestion proceed without forcing a premature debut.
--
-- ── FAIL CLOSED ────────────────────────────────────────────────────────
-- The default is false: a newly ingested brand is invisible until someone
-- decides otherwise. Every existing brand is explicitly backfilled to true,
-- so present behaviour is preserved exactly — including the 51 brands with
-- no variants, which are mapped stars awaiting enrichment and must keep
-- rendering.
--
-- ── ORDERING (matters) ─────────────────────────────────────────────────
-- This migration MUST reach production BEFORE the application deploys.
-- app/vault/page.tsx and app/vault/galaxy/page.tsx filter on this column;
-- if the code lands first they fall through to their error fallback and
-- the Vault goes dark ("The gates are closed for a moment"). It degrades
-- gracefully rather than crashing, but the two are not order-independent.
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table public.vault_brands
  add column if not exists galaxy_visible boolean not null default false;

-- Preserve today exactly: every brand that already exists stays visible.
update public.vault_brands set galaxy_visible = true where galaxy_visible = false;

comment on column public.vault_brands.galaxy_visible is
  'Presentation gate, not a truth flag. false = ingested and queryable but withheld from the public Galaxy (renderer not ready for its density, or awaiting review). Defaults false so a new brand cannot debut by accident; existing brands were backfilled true. Never use this to express data quality — an empty brand is a mapped star awaiting enrichment, not a hidden one.';

create index if not exists vault_brands_galaxy_visible_idx
  on public.vault_brands (galaxy_visible) where galaxy_visible;

do $$
declare v_hidden int; v_total int;
begin
  select count(*) filter (where not galaxy_visible), count(*)
    into v_hidden, v_total from public.vault_brands;
  if v_hidden > 0 then
    raise exception 'REFUSED: % existing brand(s) would be hidden by this migration', v_hidden;
  end if;
  raise notice 'Galaxy gate installed — % existing brands remain visible, new brands default hidden.', v_total;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════
-- REJECTED 2026-08-03 — DO NOT APPLY
--
-- Superseded by supabase/migrations/20260803120000_galaxy_publication_model.sql.
--
-- This design gated Brands only. Galaxy renders descendants, and no
-- descendant level carried publication state, so a new Collection /
-- Family / Variant / Reference inserted beneath an already-live Brand
-- would have published itself on insert — the exact ingestion shape
-- Vault-lock v3.2 produces.
--
-- Moved out of supabase/migrations/ so that a routine `supabase db push`
-- cannot apply it. Retained as the record of a rejected approach.
-- ════════════════════════════════════════════════════════════════════════
