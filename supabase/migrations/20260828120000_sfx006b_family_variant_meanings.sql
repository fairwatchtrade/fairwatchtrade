/* ════════════════════════════════════════════════════════════════════════
   SFX-006B — governed Family / Variant meanings reach BOTH evaluators.

   The Vault stores identity below Collection: Brand → Collection → Family →
   Variant → Reference. Search previously stopped at Collection, so a governed
   identity like "Tonda PF" (a Family under Collection "Tonda") degraded to
   free text. Adding the meaning kinds to the parser alone is NOT enough — the
   saved-search side is a SECOND evaluator, and each of its three functions
   fails a DIFFERENT way on an unrecognized kind:

     saved_search_matches_listing      if/elsif, no else  → NON-RESTRICTIVE
       A family meaning would be ignored and the saved search would fire on
       watches that are not that family at all. Silent false exact matches.

     saved_search_meaning_exact        ends in `return true` → SATISFIED
       Worse. Adjacency asks this function "is this interest already met?"
       An unrecognized family meaning answers YES for every listing, so the
       every-interest-honored gate is passed on a lie. Silent false adjacency.

     saved_search_meaning_class_reason ends in `return null` → no reason
       This one fails safe, and its safety is made EXPLICIT below rather than
       left to fallthrough.

   The predicate mirrors the existing `collection` rule — substring against
   listings.model, which is where governed identity text actually lives (the
   proof listing carries model = 'Tonda PF'). Where a listing does not carry
   the text there is NO match: honest non-resolution rather than inference
   from Brand plus hierarchy position.

   ADJACENCY: Family and Variant are deliberately given NO adjacency class in
   this round. A governed sibling rule is genuinely available later —
   vault_families.collection_id lives in this same database, so "same
   Collection" would be structural truth rather than string resemblance — but
   inventing it now is out of scope. Until it is ruled, a search carrying a
   Family or Variant meaning yields honest non-adjacency. No existing saved
   search holds these kinds, so no current behaviour changes.

   Beat rate / VPH is untouched. Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

create or replace function public.saved_search_matches_listing(p_state jsonb, p_listing listings)
returns boolean language plpgsql stable as $function$
declare
  m jsonb; d jsonb := coalesce(p_listing.details, '{}'::jsonb);
  kind text; val text; num numeric; hay text;
begin
  if p_state is null then return false; end if;

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

    -- SFX-006B: governed levels below Collection. Restrictive, like collection.
    elsif kind = 'family' then
      if position(lower(val) in lower(coalesce(p_listing.model, ''))) = 0 then return false; end if;

    elsif kind = 'variant' then
      if position(lower(val) in lower(coalesce(p_listing.model, ''))) = 0 then return false; end if;

    elsif kind = 'caseMaterial' then
      if lower(coalesce(d->>'caseMaterial', '')) <> lower(val) then return false; end if;

    elsif kind = 'excludeCaseMaterial' then
      if lower(coalesce(d->>'caseMaterial', '')) = lower(val) then return false; end if;

    elsif kind = 'complication' then
      if not exists (
        select 1 from jsonb_array_elements_text(
          case when jsonb_typeof(d->'complications') = 'array' then d->'complications' else '[]'::jsonb end
        ) c where lower(c) = lower(val)
      ) then return false; end if;

    elsif kind = 'movement' then
      if lower(coalesce(d->>'movementType', '')) <> lower(val) then return false; end if;

    elsif kind = 'beatRateMin' then
      num := nullif(regexp_replace(coalesce(d->>'movementFrequency', ''), '[^0-9.]', '', 'g'), '')::numeric;
      if num is null or num < (val)::numeric then return false; end if;

    elsif kind = 'powerReserveMinDays' then
      num := nullif(regexp_replace(coalesce(d->>'powerReserve', ''), '[^0-9.]', '', 'g'), '')::numeric;
      if num is null or num <= (val)::numeric * 24 then return false; end if;

    elsif kind = 'powerReservePresent' then
      if coalesce(d->>'powerReserve', '') = '' then return false; end if;

    elsif kind = 'caseSizeMaxMm' then
      num := nullif(regexp_replace(coalesce(d->>'caseSizeMm', ''), '[^0-9.]', '', 'g'), '')::numeric;
      if num is null or num >= (val)::numeric then return false; end if;

    elsif kind = 'dialColor' then
      if lower(val) = 'grey' then
        if not (lower(coalesce(d->>'dialColorType', '')) ~ '\mgrey\M'
                or lower(coalesce(d->>'dialColorType', '')) ~ '\mgray\M') then return false; end if;
      else
        if not (lower(coalesce(d->>'dialColorType', '')) ~ ('\m' || lower(val) || '\M')) then return false; end if;
      end if;

    elsif kind = 'excludeDialColor' then
      if lower(val) = 'grey' then
        if lower(coalesce(d->>'dialColorType', '')) ~ '\mgrey\M'
           or lower(coalesce(d->>'dialColorType', '')) ~ '\mgray\M' then return false; end if;
      else
        if lower(coalesce(d->>'dialColorType', '')) ~ ('\m' || lower(val) || '\M') then return false; end if;
      end if;

    elsif kind = 'text' then
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
$function$;

create or replace function public.saved_search_meaning_exact(p_kind text, p_val text, p_listing listings)
returns boolean language plpgsql stable as $function$
declare
  d jsonb := coalesce(p_listing.details, '{}'::jsonb); num numeric; hay text;
begin
  if p_kind = 'brand' then
    return lower(coalesce(p_listing.brand, '')) = lower(p_val);

  elsif p_kind = 'collection' then
    return position(lower(p_val) in lower(coalesce(p_listing.model, ''))) > 0;

  /* SFX-006B — MUST be explicit. This function's fallthrough is `return true`,
     so an unlisted kind would claim the interest was satisfied exactly and
     hand adjacency a false pass. */
  elsif p_kind = 'family' then
    return position(lower(p_val) in lower(coalesce(p_listing.model, ''))) > 0;

  elsif p_kind = 'variant' then
    return position(lower(p_val) in lower(coalesce(p_listing.model, ''))) > 0;

  elsif p_kind = 'caseMaterial' then
    return lower(coalesce(d->>'caseMaterial', '')) = lower(p_val);
  elsif p_kind = 'excludeCaseMaterial' then
    return lower(coalesce(d->>'caseMaterial', '')) <> lower(p_val);
  elsif p_kind = 'complication' then
    return exists (
      select 1 from jsonb_array_elements_text(
        case when jsonb_typeof(d->'complications') = 'array' then d->'complications' else '[]'::jsonb end
      ) c where lower(c) = lower(p_val));
  elsif p_kind = 'movement' then
    return lower(coalesce(d->>'movementType', '')) = lower(p_val);
  elsif p_kind = 'beatRateMin' then
    num := nullif(regexp_replace(coalesce(d->>'movementFrequency', ''), '[^0-9.]', '', 'g'), '')::numeric;
    return num is not null and num >= (p_val)::numeric;
  elsif p_kind = 'powerReserveMinDays' then
    num := nullif(regexp_replace(coalesce(d->>'powerReserve', ''), '[^0-9.]', '', 'g'), '')::numeric;
    return num is not null and num > (p_val)::numeric * 24;
  elsif p_kind = 'powerReservePresent' then
    return coalesce(d->>'powerReserve', '') <> '';
  elsif p_kind = 'caseSizeMaxMm' then
    num := nullif(regexp_replace(coalesce(d->>'caseSizeMm', ''), '[^0-9.]', '', 'g'), '')::numeric;
    return num is not null and num < (p_val)::numeric;
  elsif p_kind = 'dialColor' then
    if lower(p_val) = 'grey' then
      return lower(coalesce(d->>'dialColorType', '')) ~ '\mgrey\M'
          or lower(coalesce(d->>'dialColorType', '')) ~ '\mgray\M';
    else
      return lower(coalesce(d->>'dialColorType', '')) ~ ('\m' || lower(p_val) || '\M');
    end if;
  elsif p_kind = 'excludeDialColor' then
    if lower(p_val) = 'grey' then
      return not (lower(coalesce(d->>'dialColorType', '')) ~ '\mgrey\M'
               or lower(coalesce(d->>'dialColorType', '')) ~ '\mgray\M');
    else
      return not (lower(coalesce(d->>'dialColorType', '')) ~ ('\m' || lower(p_val) || '\M'));
    end if;
  elsif p_kind = 'text' then
    hay := lower(concat_ws(' ',
      p_listing.brand, p_listing.model, p_listing.reference,
      d->>'caseMaterial', d->>'dialColorType', d->>'movementType', p_listing.description));
    return not exists (
      select 1 from unnest(regexp_split_to_array(lower(p_val), '\s+')) w
       where w <> '' and position(w in hay) = 0);
  end if;
  return true;
end;
$function$;

create or replace function public.saved_search_meaning_class_reason(p_kind text, p_val text, p_listing listings)
returns text language plpgsql stable as $function$
declare
  d jsonb := coalesce(p_listing.details, '{}'::jsonb);
  num numeric; sibling text; l_mat text; member text; hay text;
begin
  /* SFX-006B — Family and Variant have NO governed adjacency class yet, and
     this returns null DELIBERATELY rather than by fallthrough. Under
     saved_search_adjacent_reason a null reason ends adjacency for the whole
     listing, which is the honest answer: a Family relationship will not be
     invented from string resemblance. A governed sibling rule (shared
     vault_families.collection_id) is available to a later ruled round.
     Until then, unknown remains unknown. */
  if p_kind in ('family', 'variant') then
    return null;

  elsif p_kind = 'caseMaterial' then
    l_mat := coalesce(d->>'caseMaterial', '');
    if (lower(p_val) ~ 'gold' and lower(l_mat) ~ 'gold')
       or (lower(p_val) ~ '(stainless|steel)' and lower(l_mat) ~ '(stainless|steel)') then
      return 'Case in ' || l_mat || ' — the same material family as the ' || p_val || ' you asked for.';
    end if;
    return null;

  elsif p_kind = 'complication' then
    select c into sibling
      from jsonb_array_elements_text(
        case when jsonb_typeof(d->'complications') = 'array' then d->'complications' else '[]'::jsonb end
      ) c
     where (lower(p_val) ~ '(chronograph|rattrapante|flyback)' and lower(c) ~ '(chronograph|rattrapante|flyback)')
        or (lower(p_val) ~ '(calendar|moonphase|moon phase|pointer date|big date)' and lower(c) ~ '(calendar|moonphase|moon phase|pointer date|big date)')
        or (lower(p_val) ~ '(gmt|dual time|world time|worldtimer|second time)' and lower(c) ~ '(gmt|dual time|world time|worldtimer|second time)')
        or (lower(p_val) ~ '(repeater|sonnerie|alarm)' and lower(c) ~ '(repeater|sonnerie|alarm)')
     limit 1;
    if sibling is not null then
      return initcap(sibling) || ' — closely related to the ' || lower(p_val) || ' you searched.';
    end if;
    return null;

  elsif p_kind = 'beatRateMin' then
    num := nullif(regexp_replace(coalesce(d->>'movementFrequency', ''), '[^0-9.]', '', 'g'), '')::numeric;
    if num is not null and num >= 28800 and (p_val)::numeric >= 28800 then
      return 'High-beat movement — ' || trim(to_char(num, 'FM999,999'))
        || ' vph against the ' || trim(to_char((p_val)::numeric, 'FM999,999')) || ' you asked for.';
    end if;
    return null;

  elsif p_kind = 'powerReserveMinDays' then
    num := nullif(regexp_replace(coalesce(d->>'powerReserve', ''), '[^0-9.]', '', 'g'), '')::numeric;
    if num is not null and num > 72 then
      return round(num / 24) || '-day power reserve against the ' || p_val || ' days you asked for.';
    end if;
    return null;

  elsif p_kind = 'text' then
    hay := lower(concat_ws(' ',
      p_listing.brand, p_listing.model, p_listing.reference,
      d->>'caseMaterial', d->>'dialColorType', d->>'movementType', p_listing.description));
    if lower(trim(p_val)) ~ '^(tonneau|rectangular|rectangle|square|cushion)$' then
      select m into member from unnest(array['tonneau','rectangular','rectangle','square','cushion']) m
       where hay ~ ('\m' || m || '\M') limit 1;
      if member is not null then
        return initcap(member) || ' case — the same architectural form language as the ' || lower(p_val) || ' you searched.';
      end if;
    elsif lower(trim(p_val)) ~ '^(guilloche|guilloché|enamel|grand feu|sector|skeleton|openworked)$' then
      select m into member from unnest(array['guilloche','guilloché','enamel','grand feu','sector','skeleton','openworked']) m
       where hay ~ ('\m' || m || '\M') limit 1;
      if member is not null then
        return initcap(member) || ' dial work — the same dial craft as the ' || lower(p_val) || ' you searched.';
      end if;
    elsif lower(trim(p_val)) ~ '^(tri-compax|tri compax|three-register|three register|bi-compax|two-register)$' then
      select m into member from unnest(array['tri-compax','tri compax','three-register','three register','bi-compax','two-register']) m
       where hay ~ ('\m' || replace(m, '-', '[- ]') || '\M') limit 1;
      if member is not null then
        return initcap(member) || ' layout — the same register architecture as the ' || lower(p_val) || ' you searched.';
      end if;
    end if;
    return null;
  end if;

  return null;
end;
$function$;
