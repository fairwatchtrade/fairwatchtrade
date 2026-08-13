-- ============================================================================
-- Catalogue Permissioned Adjacency — per-Saved-Search opt-in close matches
--
-- Product law (build order 2026-08-12): Browse is what is on FairWatchTrade;
-- Catalogue is what is relevant to this collector. A watch may appear in a
-- collector's Catalogue only through a relationship the collector created.
--
-- Additive pieces, nothing destructive:
--
--   1. saved_searches.include_adjacent — the per-search permission. Default
--      OFF: adjacency is opt-in for each Saved Search individually, because
--      the collector may want drift around one search and strict exactness
--      around another.
--
--   2. saved_search_matches.match_kind + adjacent_reason — every accrued
--      match now says what it is. Exact rows carry no reason (the Saved
--      Search's own meaning IS the reason). Adjacent rows carry a stored,
--      collector-readable sentence explaining why the watch was shown —
--      explainability is a hard requirement; no opaque score exists anywhere.
--
--   3. The adjacency evaluator — three functions, none client-callable:
--        · saved_search_meaning_exact(kind, value, listing) — one meaning's
--          exact pass/fail, copied verbatim from the canonical evaluator
--          public.saved_search_matches_listing (20260801163906). The two
--          MUST stay in step; scripts/catalogue-matches.test.mjs asserts
--          their kind lists agree.
--        · saved_search_meaning_class_reason(kind, value, listing) — one
--          meaning's COLLECTOR-CLASS satisfaction: the meaning is not met
--          to the letter, but the interest it expresses is met in kind.
--          Returns the collector-readable reason, or null.
--        · saved_search_adjacent_reason(state, listing) — the gate:
--
--            A listing is adjacent when EVERY meaning the search expresses
--            is honored — exactly, or in its collector class — and at
--            least one is honored in class rather than to the letter.
--            Any interest left unhonored disqualifies the listing.
--
--          This gate was proven against the ruled scenarios before apply
--          (2026-08-12, Layout's challenge): a strict all-but-one-exact
--          gate rejected "manual wind + 8-day reserve + tonneau" against a
--          manual 7-day rectangular watch — the collector interest spans
--          two parsed meanings — while this gate finds it and every
--          taste-prediction control case still returns null. This is
--          deliberately narrower than "fails one filter": nothing may
--          simply fail; every expressed interest must be genuinely met,
--          merely not always to the letter.
--
--      Collector-class dimensions and their reasons:
--        · reference interest    → same reference family (the same ≥3
--          shared-leading-character rule Browse's related-references list
--          already uses — one definition of "related" across surfaces).
--          Listing-code searches have NO adjacency: a code names exactly
--          one watch, and code prefixes are deliberately meaningless
--          (keyed permutation), so a code family does not exist.
--        · caseMaterial          → same material family (gold-toned family,
--          steel family). Gold Filled ≠ 14k Gold exactly, but both express
--          the same collector interest in a gold watch.
--        · complication          → same complication family (chronograph /
--          calendar / travel-time / chiming), curated.
--        · beatRateMin           → high-beat class: the collector asked for
--          a high-beat movement and this IS one, just under the number.
--        · powerReserveMinDays   → long-reserve class: a multi-day reserve
--          against the exact day count asked for (7 days against 8).
--        · text (style terms)    → a free-text term that names a design
--          interest — architectural form (tonneau / rectangular / square /
--          cushion), dial craft (guilloché / enamel / grand feu / sector /
--          skeleton), register architecture (tri-compax / three-register /
--          bi-compax) — honored by a family sibling found in the listing's
--          own stored words. The term itself must BE a style term:
--          ordinary text (brand words, model words) never relaxes.
--
--      NOT class-eligible, deliberately: brand, collection, dial colour,
--      case size, movement winding, ordinary free text, and every
--      exclusion — relaxing those is taste prediction, not expressed
--      interest.
--
--   4. Watcher + bounded re-evaluation:
--        · evaluate_saved_searches_on_publish() gains an adjacent branch
--          (only for opted-in, unpaused searches). Exact always wins: the
--          evaluator refuses exact matches structurally, and a republished
--          listing that has become exact upgrades its old adjacent row in
--          place (never two rows, never a masquerade).
--        · reevaluate_saved_search(id) — SECURITY DEFINER, owner-gated via
--          auth.uid(), evaluates ONE saved search against currently
--          published inventory. Called when a search is created or when
--          adjacency is switched on, so a new search is never "broken"
--          merely because qualifying watches were published before it
--          existed. No global sweep, no background job, no all-search
--          backfill.
--
-- The canonical exact evaluator public.saved_search_matches_listing() is
-- NOT touched by this migration. Exact means exact.
--
-- Rollback: supabase/rollbacks/20260812233000_catalogue_permissioned_adjacency.down.sql
-- ============================================================================

-- ── 1. The per-search permission ────────────────────────────────────────────

alter table public.saved_searches
  add column if not exists include_adjacent boolean not null default false;

-- ── 2. Match kind + reason ──────────────────────────────────────────────────

alter table public.saved_search_matches
  add column if not exists match_kind text not null default 'exact'
    constraint saved_search_matches_kind_check
    check (match_kind in ('exact', 'adjacent')),
  add column if not exists adjacent_reason text;

-- ── 3a. One meaning, exact — mirrors saved_search_matches_listing ───────────

create or replace function public.saved_search_meaning_exact(p_kind text, p_val text, p_listing public.listings)
returns boolean
language plpgsql
stable
as $$
declare
  d   jsonb := coalesce(p_listing.details, '{}'::jsonb);
  num numeric;
  hay text;
begin
  if p_kind = 'brand' then
    return lower(coalesce(p_listing.brand, '')) = lower(p_val);
  elsif p_kind = 'collection' then
    return position(lower(p_val) in lower(coalesce(p_listing.model, ''))) > 0;
  elsif p_kind = 'caseMaterial' then
    return lower(coalesce(d->>'caseMaterial', '')) = lower(p_val);
  elsif p_kind = 'excludeCaseMaterial' then
    return lower(coalesce(d->>'caseMaterial', '')) <> lower(p_val);
  elsif p_kind = 'complication' then
    return exists (
      select 1 from jsonb_array_elements_text(
        case when jsonb_typeof(d->'complications') = 'array'
             then d->'complications' else '[]'::jsonb end
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
  -- Unknown kinds (unsupportedPrice, unsupportedExclusion) pass through
  -- non-restrictively, exactly as in the canonical evaluator.
  return true;
end;
$$;

revoke all on function public.saved_search_meaning_exact(text, text, public.listings) from public, anon, authenticated;

-- ── 3b. One meaning, honored in collector class ─────────────────────────────

create or replace function public.saved_search_meaning_class_reason(p_kind text, p_val text, p_listing public.listings)
returns text
language plpgsql
stable
as $$
declare
  d       jsonb := coalesce(p_listing.details, '{}'::jsonb);
  num     numeric;
  sibling text;
  l_mat   text;
  member  text;
  hay     text;
begin
  if p_kind = 'caseMaterial' then
    l_mat := coalesce(d->>'caseMaterial', '');
    -- Gold-toned family: filled, plated, capped and solid golds all express
    -- the same collector interest in a gold watch. Steel family likewise.
    if (lower(p_val) ~ 'gold' and lower(l_mat) ~ 'gold')
       or (lower(p_val) ~ '(stainless|steel)' and lower(l_mat) ~ '(stainless|steel)') then
      return 'Case in ' || l_mat || ' — the same material family as the '
        || p_val || ' you asked for.';
    end if;
    return null;

  elsif p_kind = 'complication' then
    -- Curated complication families: same family, different member (the
    -- searched complication itself is absent — that meaning failed exact).
    select c into sibling
      from jsonb_array_elements_text(
        case when jsonb_typeof(d->'complications') = 'array'
             then d->'complications' else '[]'::jsonb end
      ) c
     where (lower(p_val) ~ '(chronograph|rattrapante|flyback)'
              and lower(c) ~ '(chronograph|rattrapante|flyback)')
        or (lower(p_val) ~ '(calendar|moonphase|moon phase|pointer date|big date)'
              and lower(c) ~ '(calendar|moonphase|moon phase|pointer date|big date)')
        or (lower(p_val) ~ '(gmt|dual time|world time|worldtimer|second time)'
              and lower(c) ~ '(gmt|dual time|world time|worldtimer|second time)')
        or (lower(p_val) ~ '(repeater|sonnerie|alarm)'
              and lower(c) ~ '(repeater|sonnerie|alarm)')
     limit 1;
    if sibling is not null then
      return initcap(sibling) || ' — closely related to the '
        || lower(p_val) || ' you searched.';
    end if;
    return null;

  elsif p_kind = 'beatRateMin' then
    -- High-beat class: the collector asked high-beat and this is one.
    num := nullif(regexp_replace(coalesce(d->>'movementFrequency', ''), '[^0-9.]', '', 'g'), '')::numeric;
    if num is not null and num >= 28800 and (p_val)::numeric >= 28800 then
      return 'High-beat movement — ' || trim(to_char(num, 'FM999,999'))
        || ' vph against the ' || trim(to_char((p_val)::numeric, 'FM999,999'))
        || ' you asked for.';
    end if;
    return null;

  elsif p_kind = 'powerReserveMinDays' then
    -- Long-reserve class: a genuinely multi-day reserve, near the asked count.
    num := nullif(regexp_replace(coalesce(d->>'powerReserve', ''), '[^0-9.]', '', 'g'), '')::numeric;
    if num is not null and num > 72 then
      return round(num / 24) || '-day power reserve against the '
        || p_val || ' days you asked for.';
    end if;
    return null;

  elsif p_kind = 'text' then
    -- Style vocabulary: a free-text term that names a design interest may be
    -- honored by a family sibling found in the listing's own stored words.
    -- The term itself must BE a style term; ordinary words never relax.
    hay := lower(concat_ws(' ',
      p_listing.brand, p_listing.model, p_listing.reference,
      d->>'caseMaterial', d->>'dialColorType', d->>'movementType', p_listing.description));
    if lower(trim(p_val)) ~ '^(tonneau|rectangular|rectangle|square|cushion)$' then
      select m into member
        from unnest(array['tonneau','rectangular','rectangle','square','cushion']) m
       where hay ~ ('\m' || m || '\M') limit 1;
      if member is not null then
        return initcap(member) || ' case — the same architectural form language as the '
          || lower(p_val) || ' you searched.';
      end if;
    elsif lower(trim(p_val)) ~ '^(guilloche|guilloché|enamel|grand feu|sector|skeleton|openworked)$' then
      select m into member
        from unnest(array['guilloche','guilloché','enamel','grand feu','sector','skeleton','openworked']) m
       where hay ~ ('\m' || m || '\M') limit 1;
      if member is not null then
        return initcap(member) || ' dial work — the same dial craft as the '
          || lower(p_val) || ' you searched.';
      end if;
    elsif lower(trim(p_val)) ~ '^(tri-compax|tri compax|three-register|three register|bi-compax|two-register)$' then
      select m into member
        from unnest(array['tri-compax','tri compax','three-register','three register','bi-compax','two-register']) m
       where hay ~ ('\m' || replace(m, '-', '[- ]') || '\M') limit 1;
      if member is not null then
        return initcap(member) || ' layout — the same register architecture as the '
          || lower(p_val) || ' you searched.';
      end if;
    end if;
    return null;
  end if;

  -- Every other dimension is not class-eligible.
  return null;
end;
$$;

revoke all on function public.saved_search_meaning_class_reason(text, text, public.listings) from public, anon, authenticated;

-- ── 3c. The adjacency gate ──────────────────────────────────────────────────

create or replace function public.saved_search_adjacent_reason(p_state jsonb, p_listing public.listings)
returns text
language plpgsql
stable
as $$
declare
  m       jsonb;
  r       text;
  reasons text[] := array[]::text[];
  s_ref   text;
  l_ref   text;
  shared  int;
begin
  if p_state is null then
    return null;
  end if;

  -- Exact wins, structurally: an exact match can never also be adjacent.
  if public.saved_search_matches_listing(p_state, p_listing) then
    return null;
  end if;

  -- A listing code names exactly one watch; code prefixes are meaningless
  -- by construction (keyed permutation). No adjacency for code searches.
  if coalesce(p_state->>'code', '') <> '' then
    return null;
  end if;

  -- Reference interest → reference family, Browse's own related rule:
  -- at least three shared leading characters after normalization.
  if coalesce(p_state->>'reference', '') <> '' then
    s_ref := regexp_replace(lower(p_state->>'reference'), '[^a-z0-9]', '', 'g');
    l_ref := regexp_replace(lower(coalesce(p_listing.reference, '')), '[^a-z0-9]', '', 'g');
    if length(s_ref) < 3 or length(l_ref) < 3 or s_ref = l_ref then
      return null;
    end if;
    shared := 0;
    while shared < least(length(s_ref), length(l_ref))
      and substr(s_ref, shared + 1, 1) = substr(l_ref, shared + 1, 1)
    loop
      shared := shared + 1;
    end loop;
    if shared >= 3 then
      return 'Reference ' || coalesce(p_listing.reference, '')
        || ' — in the same reference family as the '
        || (p_state->>'reference') || ' you searched.';
    end if;
    return null;
  end if;

  -- The proven gate: every meaning honored, exactly or in collector class;
  -- at least one honored in class. Any interest left unhonored → not
  -- adjacent. (Nothing may simply FAIL — this is what separates the rule
  -- from "fails one filter".)
  for m in select * from jsonb_array_elements(coalesce(p_state->'meanings', '[]'::jsonb))
  loop
    if public.saved_search_meaning_exact(m->>'kind', m->>'value', p_listing) then
      continue;
    end if;
    r := public.saved_search_meaning_class_reason(m->>'kind', m->>'value', p_listing);
    if r is null then
      return null;
    end if;
    reasons := reasons || r;
  end loop;

  if array_length(reasons, 1) is null then
    return null;
  end if;

  return array_to_string(reasons, ' ');
end;
$$;

revoke all on function public.saved_search_adjacent_reason(jsonb, public.listings) from public, anon, authenticated;

-- ── 4a. Publish watcher: exact branch unchanged in meaning, adjacent added ──

create or replace function public.evaluate_saved_searches_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'published'
     and (TG_OP = 'INSERT' or OLD.status is distinct from 'published') then

    -- Exact matches — the canonical evaluator, exactly as before. A
    -- republished listing that previously accrued only an adjacent row and
    -- now matches exactly is upgraded in place: exact always wins.
    insert into public.saved_search_matches (saved_search_id, user_id, listing_id, match_kind)
    select s.id, s.user_id, NEW.id, 'exact'
      from public.saved_searches s
     where s.paused = false
       and s.search_state is not null
       and s.user_id <> NEW.seller_id
       and public.saved_search_matches_listing(s.search_state, NEW)
    on conflict (saved_search_id, listing_id) do update
      set match_kind = 'exact', adjacent_reason = null
      where saved_search_matches.match_kind <> 'exact';

    -- Adjacent matches — only for searches whose owner permitted them.
    -- saved_search_adjacent_reason itself refuses exact matches, so a
    -- listing can never hold both kinds for one search.
    insert into public.saved_search_matches
      (saved_search_id, user_id, listing_id, match_kind, adjacent_reason)
    select s.id, s.user_id, NEW.id, 'adjacent', r.reason
      from public.saved_searches s
      cross join lateral (
        select public.saved_search_adjacent_reason(s.search_state, NEW) as reason
      ) r
     where s.paused = false
       and s.include_adjacent = true
       and s.search_state is not null
       and s.user_id <> NEW.seller_id
       and r.reason is not null
    on conflict (saved_search_id, listing_id) do nothing;
  end if;

  return NEW;
end;
$$;

-- ── 4b. Bounded single-search re-evaluation ─────────────────────────────────
-- One saved search, evaluated against currently published inventory, owner
-- only. Called on search creation and when adjacency is switched on, so
-- already-published qualifying watches are found immediately. Never a sweep.

create or replace function public.reevaluate_saved_search(p_saved_search_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.saved_searches%rowtype;
  n_exact  integer := 0;
  n_adj    integer := 0;
begin
  select * into s
    from public.saved_searches
   where id = p_saved_search_id
     and user_id = auth.uid();

  if not found or s.search_state is null or s.paused then
    return 0;
  end if;

  insert into public.saved_search_matches (saved_search_id, user_id, listing_id, match_kind)
  select s.id, s.user_id, l.id, 'exact'
    from public.listings l
   where l.status = 'published'
     and l.seller_id <> s.user_id
     and public.saved_search_matches_listing(s.search_state, l)
  on conflict (saved_search_id, listing_id) do update
    set match_kind = 'exact', adjacent_reason = null
    where saved_search_matches.match_kind <> 'exact';
  get diagnostics n_exact = row_count;

  if s.include_adjacent then
    insert into public.saved_search_matches
      (saved_search_id, user_id, listing_id, match_kind, adjacent_reason)
    select s.id, s.user_id, l.id, 'adjacent', r.reason
      from public.listings l
      cross join lateral (
        select public.saved_search_adjacent_reason(s.search_state, l) as reason
      ) r
     where l.status = 'published'
       and l.seller_id <> s.user_id
       and r.reason is not null
    on conflict (saved_search_id, listing_id) do nothing;
    get diagnostics n_adj = row_count;
  end if;

  return n_exact + n_adj;
end;
$$;

revoke all on function public.reevaluate_saved_search(uuid) from public, anon;
grant execute on function public.reevaluate_saved_search(uuid) to authenticated;
