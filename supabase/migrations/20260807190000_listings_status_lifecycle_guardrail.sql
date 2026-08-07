-- Listing lifecycle status guardrail.
--
-- listings.status is plain text with no database-level constraint: every guard
-- has lived in application code (the admin adjudication route validates against
-- four values, submit_listing_for_review() owns its own transition). That was
-- survivable while the seller flow wrote the status directly, but the governed
-- lifecycle makes status the publication gate itself — the difference between
-- a listing buyers can see and one they cannot is now a single text value.
--
-- This is the smallest bounded guardrail: the five values the application
-- already uses (lib/listingStatus.ts LIFECYCLE_STATUSES) and nothing more. It
-- adds no new state, no enum type, no lifecycle behavior, and no event table.
-- A typo or a future ad-hoc UPDATE can no longer invent a status that silently
-- falls outside every public filter.
--
-- Verified before writing: all 11 production rows conform (draft 2,
-- pending_review 2, published 6, rejected 1), zero NULLs, no existing CHECK.
-- NOT VALID is deliberately NOT used — the data is already clean, so the
-- constraint is validated immediately and covers existing rows too.

alter table public.listings
  add constraint listings_status_lifecycle
  check (status in ('draft', 'pending_review', 'published', 'rejected', 'reserved'));

comment on constraint listings_status_lifecycle on public.listings is
  'Lifecycle statuses only. Mirrors LIFECYCLE_STATUSES in lib/listingStatus.ts; publication is governed by status = published, so an unrecognised value must never be storable.';
