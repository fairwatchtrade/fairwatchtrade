-- Installation-recovery rollback only. Evidence rows using the added source
-- state must be resolved before this schema capability can be removed.
do $$
begin
  if exists (
    select 1 from public.auction_evidence_result where sale_outcome = 'unsold'
  ) then
    raise exception 'Refusing rollback: auction evidence contains Unsold source-state rows';
  end if;
end $$;

alter table public.auction_evidence_result
  drop constraint aer_sale_outcome_check,
  add constraint aer_sale_outcome_check
    check (sale_outcome in ('sold', 'passed', 'withdrawn'));
