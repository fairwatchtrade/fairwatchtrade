-- ============================================================================
-- Rollback: Catalogue Permissioned Adjacency (20260812233000)
-- Restores the v2.60 publish watcher (exact-only), removes the bounded
-- re-evaluation, the adjacency evaluator, and the two additive columns.
-- ============================================================================

drop function if exists public.reevaluate_saved_search(uuid);

-- Restore the exact-only watcher exactly as shipped in
-- 20260723124500_search_unified_listing_codes_and_saved_search.sql.
create or replace function public.evaluate_saved_searches_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'published'
     and (TG_OP = 'INSERT' or OLD.status is distinct from 'published') then

    insert into public.saved_search_matches (saved_search_id, user_id, listing_id)
    select s.id, s.user_id, NEW.id
      from public.saved_searches s
     where s.paused = false
       and s.search_state is not null
       and s.user_id <> NEW.seller_id
       and public.saved_search_matches_listing(s.search_state, NEW)
    on conflict (saved_search_id, listing_id) do nothing;
  end if;

  return NEW;
end;
$$;

drop function if exists public.saved_search_adjacent_reason(jsonb, public.listings);
drop function if exists public.saved_search_meaning_class_reason(text, text, public.listings);
drop function if exists public.saved_search_meaning_exact(text, text, public.listings);

alter table public.saved_search_matches
  drop column if exists adjacent_reason,
  drop column if exists match_kind;

alter table public.saved_searches
  drop column if exists include_adjacent;
