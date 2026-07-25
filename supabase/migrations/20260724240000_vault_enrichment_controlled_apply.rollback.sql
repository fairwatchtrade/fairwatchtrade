-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK — Vault Enrichment controlled apply  (down migration; run manually)
--
-- NON-DESTRUCTIVE. Removes the controlled-apply FUNCTION and its execute grant
-- only. It deliberately does NOT drop public.vault_enrichment_events and does
-- NOT touch any metadata.enrichment facts already written: valid production
-- enrichment data and audit history survive a rollback of the mechanism.
--
-- After this runs, no new enrichment writes are possible (the RPC is gone), but
-- everything already applied — the facts on vault_references and every audit row
-- — remains intact. To also retire the (empty) audit table in a clean-slate
-- environment, drop it separately and only when it holds no rows you must keep.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ════════════════════════════════════════════════════════════════════════

drop function if exists public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text);

-- vault_enrichment_events is intentionally preserved (append-only audit history).
-- Uncomment ONLY for a clean-slate teardown with no history worth keeping:
-- drop table if exists public.vault_enrichment_events;
