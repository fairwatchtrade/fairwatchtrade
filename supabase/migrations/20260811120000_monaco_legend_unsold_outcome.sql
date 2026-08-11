-- Monaco Legend ingestion requires the house's explicit `Unsold` source state
-- to remain distinct from `Passed`. Both remain non-price outcomes.
alter table public.auction_evidence_result
  drop constraint aer_sale_outcome_check,
  add constraint aer_sale_outcome_check
    check (sale_outcome in ('sold', 'passed', 'withdrawn', 'unsold'));

comment on constraint aer_sale_outcome_check on public.auction_evidence_result is
  'Source-native auction result states. Unsold is deliberately distinct from Passed.';
