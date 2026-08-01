-- Restores public.saved_search_matches_listing to its prior committed form
-- (20260723124500 — no dialColor branch). Saved Searches carrying a
-- dialColor meaning then pass through the watcher non-restrictively again,
-- per the unknown-kind fall-through design.

create or replace function public.saved_search_matches_listing(p_state jsonb, p_listing public.listings)
returns boolean
language plpgsql
stable
as $$
declare
  m        jsonb;
  d        jsonb := coalesce(p_listing.details, '{}'::jsonb);
  kind     text;
  val      text;
  num      numeric;
  hay      text;
begin
  if p_state is null then
    return false;
  end if;

  -- Exact identity first, mirroring the resolution order in the product.
  if coalesce(p_state->>'code', '') <> '' then
    return lower(p_state->>'code') = lower(coalesce(p_listing.public_code, ''));
  end if;

  if coalesce(p_state->>'reference', '') <> '' then
    return lower(p_state->>'reference') = lower(coalesce(p_listing.reference, ''));
  end if;

  for m in select * from jsonb_array_elements(coalesce(p_state->'meanings', '[]'::jsonb))
  loop
    kind := m->>'kind';
    val  := m->>'value';

    if kind = 'brand' then
      if lower(coalesce(p_listing.brand, '')) <> lower(val) then return false; end if;

    elsif kind = 'collection' then
      if position(lower(val) in lower(coalesce(p_listing.model, ''))) = 0 then return false; end if;

    elsif kind = 'caseMaterial' then
      -- Exact identity: Gold Filled is not Gold (mirrors parse.ts).
      if lower(coalesce(d->>'caseMaterial', '')) <> lower(val) then return false; end if;

    elsif kind = 'excludeCaseMaterial' then
      if lower(coalesce(d->>'caseMaterial', '')) = lower(val) then return false; end if;

    elsif kind = 'complication' then
      if not exists (
        select 1 from jsonb_array_elements_text(
          case when jsonb_typeof(d->'complications') = 'array'
               then d->'complications' else '[]'::jsonb end
        ) c where lower(c) = lower(val)
      ) then return false; end if;

    elsif kind = 'movement' then
      if lower(coalesce(d->>'movementType', '')) <> lower(val) then return false; end if;

    elsif kind = 'beatRateMin' then
      num := nullif(regexp_replace(coalesce(d->>'movementFrequency', ''), '[^0-9.]', '', 'g'), '')::numeric;
      if num is null or num < (val)::numeric then return false; end if;

    elsif kind = 'powerReserveMinDays' then
      num := nullif(regexp_replace(coalesce(d->>'powerReserve', ''), '[^0-9.]', '', 'g'), '')::numeric;
      -- powerReserve is stored in hours; compare in hours.
      if num is null or num <= (val)::numeric * 24 then return false; end if;

    elsif kind = 'powerReservePresent' then
      if coalesce(d->>'powerReserve', '') = '' then return false; end if;

    elsif kind = 'caseSizeMaxMm' then
      num := nullif(regexp_replace(coalesce(d->>'caseSizeMm', ''), '[^0-9.]', '', 'g'), '')::numeric;
      if num is null or num >= (val)::numeric then return false; end if;

    elsif kind = 'text' then
      -- Every word must appear, matching matchesMeaning('text') in
      -- lib/search/parse.ts. A whole-phrase substring test would silently
      -- disagree with live Browse results.
      hay := lower(concat_ws(' ',
        p_listing.brand, p_listing.model, p_listing.reference,
        d->>'caseMaterial', d->>'dialColorType', d->>'movementType', p_listing.description));
      if exists (
        select 1 from unnest(regexp_split_to_array(lower(val), '\s+')) w
         where w <> '' and position(w in hay) = 0
      ) then return false; end if;
    end if;
  end loop;

  return true;
end;
$$;
