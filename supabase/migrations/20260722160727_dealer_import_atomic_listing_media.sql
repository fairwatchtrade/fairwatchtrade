-- ════════════════════════════════════════════════════════════════════════
-- Dealer Intake — Flight 2A: Atomic Dealer-Import Integrity Repair
--
-- Closes the confirmed markerless-import attestation bypass (Flight 1B):
-- previously the import route inserted the listings row, then created
-- dealer_import listing_media rows in a SEPARATE, non-transactional, soft-warning
-- step. A media failure (or a zero-/invalid-photo payload) left a listing with
-- NO dealer_import provenance — a "markerless" row that the ordinary submit path
-- treats as a manual listing, skipping the imported availability + attestation
-- ceremony.
--
-- This migration introduces ONE atomic RPC that is the sole creation path for a
-- dealer import: the listings row + listings.photos payload + EVERY declared
-- dealer_import listing_media row commit together, or nothing commits. A
-- markerless dealer import becomes structurally impossible.
--
-- Convention (matches submit_listing_for_review / accept_purchase_request):
--   LANGUAGE plpgsql · SECURITY DEFINER · SET search_path = '' · OWNER postgres
--   (postgres bypasses RLS, so it can create a row owned by a DIFFERENT profile
--    and stamp dealer_import media — the same trusted-write basis the route's
--    service client relied on). Founder authorization stays in the server route
--    BEFORE this RPC is called; the RPC is NOT a public submission endpoint:
--    EXECUTE is granted to service_role only, revoked from PUBLIC/anon/authenticated.
--
-- Additive only. No existing object is altered or dropped. No data is written by
-- this migration.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.dealer_import_one_listing(
  p_dealer_profile_id uuid,
  p_listing           jsonb,
  p_photos            jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_brand        text;
  v_reference    text;
  v_model        text;
  v_year         text;
  v_condition    text;
  v_provenance   text;
  v_description  text;
  v_has_bracelet boolean;
  v_asking_raw   text;
  v_asking       numeric;
  v_details      jsonb;
  v_photo        jsonb;
  v_url          text;
  v_photo_count  int;
  v_stored       jsonb;
  v_warnings     jsonb := '[]'::jsonb;
  v_new_id       uuid;
begin
  -- ══ PRE-MUTATION VALIDATION (no writes until every check passes) ══

  -- ── Dealer identity ──
  if p_dealer_profile_id is null then
    return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','dealer_not_found');
  end if;
  if not exists (select 1 from public.profiles where id = p_dealer_profile_id) then
    return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','dealer_not_found');
  end if;

  -- ── Listing identity ──
  if p_listing is null or jsonb_typeof(p_listing) <> 'object' then
    return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','invalid_listing_payload');
  end if;
  v_brand     := btrim(coalesce(p_listing->>'brand',''));
  v_reference := btrim(coalesce(p_listing->>'reference',''));
  if v_brand = '' then
    return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','missing_brand');
  end if;
  if v_reference = '' then
    return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','missing_reference');
  end if;

  -- ── Photos: array, at least one, EVERY declared photo has a real url.
  --    No silent discard: one malformed declared photo rejects the whole listing. ──
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then
    return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','invalid_photos_payload');
  end if;
  v_photo_count := jsonb_array_length(p_photos);
  if v_photo_count = 0 then
    return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','zero_declared_photos');
  end if;
  if v_photo_count > 40 then
    -- explicit bound (the route capped at 40), rejected — never silently dropped
    return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','invalid_photos_payload');
  end if;
  -- Accepted URL law (unchanged from the prior route's str()-based contract):
  -- a photo url must be a JSON STRING that is non-empty after trim. NO scheme or
  -- host policy is imposed — dealer-hosted or already-uploaded urls are
  -- legitimate exactly as before. The old normalizePhotos used str(p.url), which
  -- yields '' for any non-string and then DROPPED that photo; here the same
  -- "non-string or empty = unusable" rule rejects the WHOLE listing instead of
  -- silently dropping a sibling.
  for v_photo in select value from jsonb_array_elements(p_photos) loop
    if jsonb_typeof(v_photo) <> 'object' then
      return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','invalid_declared_photo');
    end if;
    if jsonb_typeof(v_photo->'url') is distinct from 'string' then
      return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','invalid_declared_photo');
    end if;
    v_url := btrim(v_photo->>'url');
    if v_url = '' then
      return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','invalid_declared_photo');
    end if;
  end loop;

  -- ══ Derive commercial fields (mirrors the route's prior normalization) ══
  v_model       := nullif(btrim(coalesce(p_listing->>'model','')),'');
  v_year        := nullif(btrim(coalesce(p_listing->>'year','')),'');
  v_condition   := nullif(btrim(coalesce(p_listing->>'condition','')),'');
  v_provenance  := nullif(btrim(coalesce(p_listing->>'provenanceNote','')),'');
  v_description := nullif(btrim(coalesce(p_listing->>'description','')),'');
  -- hasBracelet: true only when the payload's value is JSON boolean true (=== true)
  v_has_bracelet := coalesce((p_listing->'hasBracelet') = 'true'::jsonb, false);
  -- asking_price_raw preserves the ORIGINAL string only (mirrors str(): strings only)
  v_asking_raw := case when jsonb_typeof(p_listing->'askingPrice') = 'string'
                       then nullif(btrim(p_listing->>'askingPrice'),'') else null end;
  -- price: strip to digits/dot, positive numeric else null (mirrors parsePrice)
  begin
    v_asking := nullif(regexp_replace(coalesce(p_listing->>'askingPrice',''),'[^0-9.]','','g'),'')::numeric;
    if v_asking is not null and v_asking <= 0 then v_asking := null; end if;
  exception when others then
    v_asking := null;
  end;
  if v_asking_raw is not null and v_asking is null then
    v_warnings := v_warnings || to_jsonb('asking_price_unparseable_left_blank'::text);
  end if;
  v_details := case when jsonb_typeof(coalesce(p_listing->'details','null'::jsonb)) = 'object'
                    then p_listing->'details' else '{}'::jsonb end;

  -- Buyer-facing photos payload, built from the SAME validated set (single source).
  select jsonb_agg(
           jsonb_build_object(
             'photo', jsonb_build_object(
                        'url', btrim(e->>'url'),
                        'pathname', nullif(btrim(coalesce(e->>'pathname','')),'')),
             'category', nullif(btrim(coalesce(e->>'category','')),''),
             'isWristShot', false)
           order by ord)
    into v_stored
    from jsonb_array_elements(p_photos) with ordinality as t(e, ord);

  -- ══ MUTATION — one transaction (the function body); all-or-nothing ══
  insert into public.listings (
    seller_id, status, brand, reference, model, year, condition,
    asking_price, asking_price_raw, provenance_note, description,
    has_bracelet, details, photos
  ) values (
    p_dealer_profile_id, 'draft', v_brand, v_reference, v_model, v_year, v_condition,
    v_asking, v_asking_raw, v_provenance, v_description,
    v_has_bracelet, v_details, coalesce(v_stored, '[]'::jsonb)
  )
  returning id into v_new_id;

  -- Every validated photo becomes a trusted dealer_import media row, in the same
  -- order as listings.photos. A failure here is tagged with a deterministic
  -- SQLSTATE so the route can classify it as a media-phase rollback, then it is
  -- re-raised so the WHOLE call (including the listings row above) rolls back.
  begin
    insert into public.listing_media (
      listing_id, category, storage_path, capture_source,
      ai_review_status, privacy_review_status, sequence_index
    )
    select
      v_new_id,
      coalesce(nullif(btrim(coalesce(e->>'category','')),''), 'Uncategorized'),
      btrim(e->>'url'),
      'dealer_import',
      'pending',
      'pending',
      (ord - 1)::int
    from jsonb_array_elements(p_photos) with ordinality as t(e, ord);
  exception when others then
    raise exception 'dealer_import_media_insert_failed'
      using errcode = 'DIM01';
  end;

  return jsonb_build_object(
    'result', 'IMPORTED',
    'listing_id', v_new_id,
    'media_count', v_photo_count,
    'warnings', v_warnings);
end;
$fn$;

-- Ownership + execution privileges (explicit, per Flight 2A §5/§14).
alter function public.dealer_import_one_listing(uuid, jsonb, jsonb) owner to postgres;
revoke all     on function public.dealer_import_one_listing(uuid, jsonb, jsonb) from public;
revoke all     on function public.dealer_import_one_listing(uuid, jsonb, jsonb) from anon;
revoke all     on function public.dealer_import_one_listing(uuid, jsonb, jsonb) from authenticated;
grant  execute on function public.dealer_import_one_listing(uuid, jsonb, jsonb) to   service_role;

-- PFC274 = 62 — the evaluate route is untouched.
