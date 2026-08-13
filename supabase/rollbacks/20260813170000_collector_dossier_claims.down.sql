-- ============================================================================
-- Rollback: Collector Dossier claims corpus (20260813170000)
-- Refuses while admitted claims exist — governed evidence is never silently
-- destroyed by a rollback. Retire the claims deliberately first.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from public.collector_dossier_claims
     where admission = 'ADMITTED' and lifecycle = 'current'
  ) then
    raise exception 'admitted collector dossier claims exist; retire them before rolling back';
  end if;
end;
$$;

drop function if exists public.collector_dossier_claim_set_hash(uuid);
drop trigger if exists trg_collector_dossier_claim_touch on public.collector_dossier_claims;
drop function if exists public.collector_dossier_claim_touch();
drop table if exists public.collector_dossier_claims;
