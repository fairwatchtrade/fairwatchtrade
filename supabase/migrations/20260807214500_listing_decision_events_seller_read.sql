-- Sellers may read the decisions made about their own listings.
--
-- listing_currency_events has RLS on with no policies because money
-- attestations are founder evidence — nobody outside the service role has any
-- business reading them. Decision events are the opposite: the seller-facing
-- message exists precisely so the seller can read it, and Account → Listings
-- has to render "what happened, why, what next" for rejected, clarification,
-- and returned-to-draft states.
--
-- The alternative was mirroring the message onto another listings column, but
-- the schema-gate ruling holds rejection_reason to rejection-only and
-- seller_clarification_note to clarification-only, and returned-to-draft has
-- no column of its own. Reading the event directly is smaller than inventing
-- a fourth current-state field, and it lets the Account surface show truthful
-- prior decisions instead of only the latest one.
--
-- Scope is exactly one's own listings. No policy is added for anon, and the
-- founder-only reviewer note lives in a different table entirely.

grant select on public.listing_decision_events to authenticated;

create policy listing_decision_events_select_own
  on public.listing_decision_events
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.listings l
       where l.id = listing_decision_events.listing_id
         and l.seller_id = auth.uid()
    )
  );
