-- ============================================================================
-- Rollback: Collector Dossier retrieval-bound evidence (20260813190000)
-- Refuses while retrieval-bound claims exist — removing the retrieval store
-- beneath them would leave governed claims citing evidence nothing can
-- audit. Unbind or retire those claims deliberately first.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from public.collector_dossier_claims
     where evidence_binding = 'RETRIEVAL_BOUND' and lifecycle = 'current'
  ) then
    raise exception 'retrieval-bound claims exist; unbind or retire them before rolling back';
  end if;
end;
$$;

alter table public.collector_dossier_claims drop column if exists evidence_binding;
drop table if exists public.collector_dossier_source_retrievals;
