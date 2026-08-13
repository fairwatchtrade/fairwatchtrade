-- ============================================================================
-- Rollback: Collector Dossier articles storage + approval (20260813150000)
-- Refuses while an approved article exists — approved editorial content is
-- never silently destroyed by a rollback; retire it first, deliberately.
-- ============================================================================

do $$
begin
  if exists (select 1 from public.collector_dossier_articles where status = 'approved') then
    raise exception 'approved collector dossier articles exist; retire them before rolling back';
  end if;
end;
$$;

drop function if exists public.collector_dossier_article_approve(uuid, uuid);
drop trigger if exists trg_collector_dossier_article_protect on public.collector_dossier_articles;
drop function if exists public.collector_dossier_article_protect();
drop table if exists public.collector_dossier_articles;
