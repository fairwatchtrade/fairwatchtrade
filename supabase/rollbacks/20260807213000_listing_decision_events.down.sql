-- Rollback: remove the listing decision history layer.
-- Drops only the new table. No current-state store is touched: listings.*
-- reason columns and listing_integrity_reviews are unchanged by the forward
-- migration and unchanged by this one.
--
-- Destructive by nature: dropping this discards recorded adjudication
-- history, which no other table holds.

drop table if exists public.listing_decision_events;
