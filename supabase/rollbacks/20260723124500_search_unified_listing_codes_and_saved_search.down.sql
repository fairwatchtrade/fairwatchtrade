-- Rollback for 20260723124500_search_unified_listing_codes_and_saved_search.sql
--
-- Prelaunch rollback: drops the Search additions and returns listings to the
-- pre-flight shape. Dropping public_code destroys the issued codes — acceptable
-- only because no code has ever been shown to a real collector. Once codes are
-- live this file must not be used; issue a forward migration instead.

drop trigger if exists trg_evaluate_saved_searches_on_publish on public.listings;
drop function if exists public.evaluate_saved_searches_on_publish();
drop function if exists public.saved_search_matches_listing(jsonb, public.listings);

drop table if exists public.saved_search_matches;

alter table public.saved_searches
  drop column if exists search_state,
  drop column if exists meaning_version,
  drop column if exists paused;

drop trigger if exists trg_protect_listing_public_code on public.listings;
drop function if exists public.protect_listing_public_code();
drop trigger if exists trg_assign_listing_public_code on public.listings;
drop function if exists public.assign_listing_public_code();

drop index if exists public.listings_public_code_key;
alter table public.listings drop column if exists public_code;

drop sequence if exists public.listing_public_code_seq;

drop function if exists public.listing_code_encode(bigint);
drop function if exists public.listing_code_permute(bigint);
drop function if exists public.listing_code_round(text, int, int);
drop function if exists public.listing_code_key();

-- The secret container is dropped WITH its secret — reissue it on re-apply.
drop table if exists private.search_secrets;
drop schema if exists private;
