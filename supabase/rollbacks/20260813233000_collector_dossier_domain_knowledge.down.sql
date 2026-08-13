-- Rollback: Collector Dossier governed domain knowledge (the editorial shelf).
-- Refuses while any composition attempt still references shelf units — those
-- attempts' audit trails would silently lose their evidence basis.

do $$
begin
  if exists (
    select 1 from public.collector_dossier_composition_attempts
    where coalesce(array_length(input_domain_ids, 1), 0) > 0
  ) then
    raise exception 'composition attempts reference domain-knowledge units; refusing to drop the shelf under them';
  end if;
end;
$$;

alter table public.collector_dossier_composition_attempts
  drop column if exists input_domain_ids,
  drop column if exists input_domain_keys;

drop trigger if exists trg_cddk_touch on public.collector_dossier_domain_knowledge;
drop function if exists public.collector_dossier_domain_knowledge_touch();
drop table if exists public.collector_dossier_domain_knowledge;
