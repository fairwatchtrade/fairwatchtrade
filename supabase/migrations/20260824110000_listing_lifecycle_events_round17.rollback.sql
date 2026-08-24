/* Round 17 rollback — removes the lifecycle event producer and its history.

   DESTRUCTIVE BY DEFINITION. The table is append-only and has no other copy,
   so dropping it destroys every lifecycle fact recorded since the migration
   landed. Run this only to undo a failed deployment, never to "reset".

   The trigger comes off first so that no transition can produce a row into a
   table that is mid-drop. Nothing else on listings is touched: the other ten
   triggers on that table, the status CHECK, remove_listing(), the founder
   route and the triage service were all left exactly as they were, which is
   why this rollback needs to restore nothing. */

drop trigger if exists listings_lifecycle_event on public.listings;
drop function if exists public.record_listing_lifecycle_event();

drop trigger if exists listing_lifecycle_events_immutable
  on public.listing_lifecycle_events;
drop function if exists public.listing_lifecycle_events_are_append_only();

drop table if exists public.listing_lifecycle_events;
