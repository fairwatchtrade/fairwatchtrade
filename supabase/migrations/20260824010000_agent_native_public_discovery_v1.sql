-- ============================================================================
-- AGENT-NATIVE PUBLIC DISCOVERY V1  (v6.44)
--
-- THE MISCONCEPTION THIS KILLS: "the external surface can just query the
-- listings table and filter for published rows." It cannot. A filter written
-- in a route is a promise; a filter written here is a property. External
-- agents get ONE object -- this view -- and that object positively admits
-- rows rather than trying to remember what to hide.
--
-- TWO INDEPENDENT LOCKS, deliberately not merged:
--
--   1. RLS.  security_invoker = true means this view is evaluated as the
--            CALLER. The external route calls as the anonymous public, and
--            listings_select_public_or_own already returns only
--            status = 'published' to a caller with no auth.uid(). If every
--            line of the WHERE clause below were deleted tomorrow, a private
--            listing STILL could not leave.
--   2. The admission predicate below, which is stricter than RLS and states
--            the external-discovery boundary in its own right.
--
-- Both must pass. That is the difference between "we intend not to expose
-- private listings" and "there is no supported external path by which one
-- can leave".
--
-- FIELD-LEVEL ADMISSION. `details` is NEVER serialized wholesale. It carries
-- review machinery -- `admission` holds component-originality findings and a
-- manufacturer style number gathered for the Rolex identity gate -- which is
-- internal evidence, not a public spec. `specs` below is built by INTERSECTING
-- the stored keys with an explicit whitelist, so a key added to details next
-- year appears externally only when somebody puts it in this list on purpose.
-- The whitelist is exactly the set the public Listing Detail already renders.
--
-- SERVICE PHOTOGRAPHS. The public photo predicate is restated here in SQL
-- rather than trusted to the caller: a service document is private unless the
-- seller deliberately opted that one image into public display. Same rule the
-- listing page, Browse and the Catalogue consume.
--
-- SCORES. significance_score, score_state, combined_score and
-- completeness_score are absent by construction. They are not filtered out
-- below; they were never selected. The law applies to machines too.
--
-- COMPOSE AT READ TIME. This is a view, not a table. There is no second
-- stored copy of inventory, no sync job, and nothing that can go stale
-- against the listing it describes. One canonical listing, one truth,
-- multiple discovery entrances.
--
-- PFC274 = 62 -- the evaluate route is untouched.
-- ============================================================================

drop view if exists public.public_discovery_listings;

create view public.public_discovery_listings
with (security_invoker = true) as
select
  -- Canonical identity -----------------------------------------------------
  l.id,
  l.public_code,
  l.brand,
  l.model,
  l.reference,
  l.year,

  -- Transactional truth ----------------------------------------------------
  l.condition,
  l.asking_price,
  l.asking_currency,

  -- Availability is derived from marketplace STATUS, never from a stored
  -- label. Every row this view can return is 'published', so 'available' is
  -- true by construction of the admission predicate rather than by a column
  -- somebody has to remember to update. An agent reading this field is
  -- reading the same fact that decides whether the listing is on Browse.
  'available'::text as availability,

  -- The seller's own stock sentence, when they wrote one. Absent stays
  -- absent -- no penalty for missing data, only for bad data.
  nullif(l.details->>'availability', '') as stock_statement,

  l.in_hand_verified,
  l.open_to_trades,

  -- Completeness / documentation -------------------------------------------
  nullif(l.details->>'documentation', '') as documentation,
  case
    when jsonb_typeof(l.details->'includedWithWatch') = 'array'
      then l.details->'includedWithWatch'
    else '[]'::jsonb
  end as included_with_watch,

  -- Approved public specifications (whitelist intersection) ----------------
  (
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(l.details) as e(key, value)
    where e.key = any (array[
      'caseSizeMm', 'caseThicknessMm', 'caseMaterial', 'caseColorFinish',
      'movementType', 'calibre', 'movementFrequency', 'powerReserve',
      'waterResistance', 'dialColorType', 'complications', 'closureType',
      'casebackType', 'crystalMaterial', 'bezelMaterial', 'jewels',
      'crownPresent', 'originalStrapBracelet', 'braceletWristSize',
      'serviceHistory'
    ])
      and e.value <> 'null'::jsonb
  ) as specs,

  l.description,

  -- Approved public photographs --------------------------------------------
  (
    select coalesce(jsonb_agg(t.url order by t.ord), '[]'::jsonb)
    from (
      select p->'photo'->>'url' as url, ord
      from jsonb_array_elements(
             case when jsonb_typeof(l.photos) = 'array' then l.photos else '[]'::jsonb end
           ) with ordinality as a(p, ord)
      where p->'photo'->>'url' is not null
        and (
          p->>'category' is distinct from 'Service Evidence'
          or (p->>'servicePublicOptIn')::boolean is true
        )
    ) as t
  ) as photo_urls,

  -- Public seller identity --------------------------------------------------
  -- Read through public_seller_profiles, the sanctioned projection -- id,
  -- display_name, created_at and nothing else. No email, no phone, no strike
  -- count is widened to reach a name.
  nullif(btrim(coalesce(sp.display_name, '')), '') as seller_display_name,
  dp.slug as seller_slug,

  -- Freshness ---------------------------------------------------------------
  l.created_at,
  l.updated_at

from public.listings l
left join public.public_seller_profiles sp on sp.id = l.seller_id
left join public.dealer_profiles dp on dp.seller_id = l.seller_id

-- THE ADMISSION PREDICATE ---------------------------------------------------
-- Positive admission only. Anything not named here does not serialize.
where l.status = 'published'          -- not draft, pending_review, rejected,
                                      -- reserved, private_active, removed
  and l.private_buyer_id is null      -- belt to the private-listing braces
  and l.removed_at is null            -- a removed row can never re-emerge
  and coalesce(l.details->>'availability', '') <> 'Not Currently Available';

comment on view public.public_discovery_listings is
  'The ONLY supported path by which FairWatchTrade inventory leaves the '
  'platform for external agent discovery. Positively admits public, active, '
  'currently-available listings and projects only approved public facts. '
  'security_invoker = true, so RLS on listings applies underneath this '
  'predicate rather than being replaced by it. Never add a column here '
  'without deciding, on purpose, that an external machine may read it.';

grant select on public.public_discovery_listings to anon, authenticated;

-- Exact-identifier lookups are a promise under the Exact Identifier Search
-- Law, so they get real indexes rather than a sequential scan that happens to
-- be fast at today's inventory size.
create index if not exists listings_public_code_lower_idx
  on public.listings (lower(public_code));

create index if not exists listings_reference_lower_idx
  on public.listings (lower(reference));
