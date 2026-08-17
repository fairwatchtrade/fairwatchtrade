-- ══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — source lineage and cross-episode continuity
--
-- ⚠ READ THIS FIRST. Rolling this back REINTRODUCES A DUPLICATE-LISTING
-- DEFECT. It is not a neutral revert.
--
-- Without the adoption function, a dealer who reconnects a governed source
-- after an authorization episode was retired gets a new source with no source
-- items, every watch looks new, and materialization creates a SECOND listing
-- for every watch that already exists. The application also stops being able
-- to tell them the truth on the confirmation screen: "already prepared" falls
-- back to zero.
--
-- If you roll this back, either forbid reconnection of a previously revoked
-- lineage outright, or accept that duplicates will be created. Do not simply
-- remove it and assume the earlier behaviour was safe — it was only safe while
-- no authorization had ever been retired.
--
-- WHAT THIS ROLLBACK DELIBERATELY DOES NOT UNDO:
-- any item_materialization_adopted event already written, and any batch_item
-- already linked to an earlier episode's listing. Those are true statements
-- about what happened. Un-linking them would strand items in a state whose
-- CHECK constraint (draft_created implies listing_id) they could not satisfy,
-- and deleting the events would falsify an append-only log. They stay.
--
-- The event type is therefore NOT removed from the CHECK constraint either:
-- rows using it exist, and narrowing the constraint under them would fail.
-- The vocabulary entry is harmless once unused.
-- ══════════════════════════════════════════════════════════════════════════

drop function if exists public.dealer_accelerator_adopt_prior_materialization(uuid, text, uuid);

-- The lineage column is derived and carries no independent state, so dropping
-- it loses nothing that cannot be recomputed from the four columns it reads.
drop index if exists public.dealer_accelerator_sources_lineage_idx;

alter table public.dealer_accelerator_sources
  drop column if exists source_lineage_key;
