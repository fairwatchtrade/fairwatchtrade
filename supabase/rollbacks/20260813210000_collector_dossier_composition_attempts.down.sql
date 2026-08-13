-- Rollback: Collector Dossier composition attempts audit trail.
-- Drops the attempts table and its touch trigger function. Draft articles
-- created by verified attempts live in collector_dossier_articles and are
-- untouched here — they remain governed by that table's own lifecycle.

drop trigger if exists trg_cdca_touch on public.collector_dossier_composition_attempts;
drop function if exists public.collector_dossier_composition_attempt_touch();
drop table if exists public.collector_dossier_composition_attempts;
