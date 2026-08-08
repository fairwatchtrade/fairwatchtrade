-- ════════════════════════════════════════════════════════════════════════
-- EVIDENCE → DRAFT MATERIALIZATION BRIDGE
--
-- The batch spine has always refused to write 'draft_created' directly:
--   dealer_accelerator_transition_item raises
--   'draft_created_requires_materialization_bridge'
-- and dealer_accelerator_batch_items enforces
--   (status = 'draft_created') = (listing_id is not null).
--
-- That refusal was a promise that a bridge would exist. This migration is
-- that bridge, and it PRESERVES the refusal: transition_item is untouched,
-- so the new function below remains the ONLY lawful entry into
-- 'draft_created', and the only way an item can ever acquire a listing_id.
--
-- What the bridge does, in one transaction:
--   read the item's own captured evidence
--   → derive the listing fields from that evidence and nothing else
--   → call the existing atomic primitive dealer_import_one_listing
--   → couple listing_id + 'draft_created' onto the item
--   → record one lifecycle event
-- All of it commits together or none of it does. An item can never hold a
-- listing_id without 'draft_created', and a listing can never exist whose
-- item forgot it.
--
-- What it deliberately does NOT do: no publication, no pending_review, no
-- notification, no score, no buyer-facing exposure, no identity resolution.
-- The result is a truthful seller-owned DRAFT and nothing more.
--
-- Convention (matches the spine): LANGUAGE plpgsql · SECURITY DEFINER ·
-- SET search_path = '' · OWNER postgres · EXECUTE granted to
-- dealer_accelerator_writer and service_role only.
--
-- Additive. No existing table is dropped, no existing column is altered,
-- no row is written by this migration.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ════════════════════════════════════════════════════════════════════════

-- --------------------------------------------------------------------------
-- 0. Money-pairing repair inside the existing atomic primitive
--
--    Money Truth Stage D added, and validated, on public.listings:
--      listings_money_pairing_check  CHECK ((asking_price IS NULL) = (asking_currency IS NULL))
--
--    dealer_import_one_listing inserts asking_price but has never inserted
--    asking_currency, so ANY priced import violates that constraint and the
--    whole row rolls back as ROLLED_BACK_DATABASE_ERROR. The primitive today
--    can only create unpriced drafts — a latent defect, not a design choice.
--
--    Repaired here, in place, with the SAME SIGNATURE: askingCurrency is read
--    from the existing p_listing jsonb, so no caller breaks and no second
--    listing/media primitive is created. The money-pairing law is enforced
--    where the money is written:
--      · a declared currency must be a supported, active currency, else the
--        row is rejected before mutation — never silently downgraded;
--      · a price with no currency is not a truthful amount, so BOTH are left
--        blank and the caller is told exactly that in warnings;
--      · a currency with no usable price carries no amount, so it is dropped.
-- --------------------------------------------------------------------------

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
  v_currency     text;
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

  -- ── Currency (new): a declared currency must be real. An unrecognised one
  --    is a caller error, not something to quietly discard alongside a price. ──
  v_currency := upper(nullif(btrim(coalesce(p_listing->>'askingCurrency','')),''));
  if v_currency is not null
     and not exists (
       select 1 from public.supported_currencies
        where code = v_currency and active
     ) then
    return jsonb_build_object('result','REJECTED_BEFORE_MUTATION','reason','unsupported_asking_currency');
  end if;

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

  -- ── Money-pairing law, enforced where the money is written ──
  -- An amount without a currency is not an amount. Rather than fail the whole
  -- import (which is what the unrepaired function did, invisibly), the listing
  -- is created honestly WITHOUT a price and the caller is told.
  if v_asking is not null and v_currency is null then
    v_asking := null;
    v_warnings := v_warnings || to_jsonb('asking_price_without_currency_left_blank'::text);
  end if;
  -- A currency labelling nothing is noise; drop it so the pair stays true.
  if v_asking is null and v_currency is not null then
    v_currency := null;
    v_warnings := v_warnings || to_jsonb('asking_currency_without_price_dropped'::text);
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
    asking_price, asking_price_raw, asking_currency, provenance_note, description,
    has_bracelet, details, photos
  ) values (
    p_dealer_profile_id, 'draft', v_brand, v_reference, v_model, v_year, v_condition,
    v_asking, v_asking_raw, v_currency, v_provenance, v_description,
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

alter function public.dealer_import_one_listing(uuid, jsonb, jsonb) owner to postgres;
revoke all     on function public.dealer_import_one_listing(uuid, jsonb, jsonb) from public;
revoke all     on function public.dealer_import_one_listing(uuid, jsonb, jsonb) from anon;
revoke all     on function public.dealer_import_one_listing(uuid, jsonb, jsonb) from authenticated;
grant  execute on function public.dealer_import_one_listing(uuid, jsonb, jsonb) to   service_role;

-- --------------------------------------------------------------------------
-- 1. One new lifecycle event type
--
--    'item_draft_created' is the only new narrative fact this flight adds.
--    The mechanical eligibility pass reuses the spine's existing
--    item_readied / item_blocked events; the rehost fact is a row, not a
--    story. Recreated with the full list because a CHECK cannot be extended
--    in place.
-- --------------------------------------------------------------------------

alter table public.dealer_accelerator_lifecycle_events
  drop constraint dealer_accelerator_lifecycle_events_type_check;

alter table public.dealer_accelerator_lifecycle_events
  add constraint dealer_accelerator_lifecycle_events_type_check
  check (
    event_type in (
      'source_authorized',
      'source_suspended',
      'source_reauthorized',
      'source_revoked',
      'source_item_registered',
      'batch_created',
      'batch_started',
      'batch_completed',
      'batch_completed_with_exceptions',
      'batch_failed',
      'batch_retry_queued',
      'item_registered',
      'observation_recorded',
      'item_readied',
      'item_blocked',
      'item_unblocked',
      'item_lease_claimed',
      'item_lease_recovered',
      'item_retry_scheduled',
      'item_retry_exhausted',
      'payload_recorded',
      'photograph_declared',
      'photograph_retrieved',
      'photograph_retrieval_failed',
      'extraction_recorded',
      'batch_cancel_requested',
      'batch_cancelled',
      'batch_initialization_lease_claimed',
      'batch_initialization_lease_recovered',
      'photograph_retrieval_terminal',
      'item_draft_created'
    )
  );

-- --------------------------------------------------------------------------
-- 2. Photograph chain key
--
--    Every downstream table in this spine binds to its parent's FULL chain,
--    so a child can never claim a different item, source, or dealer than the
--    parent it names. dealer_accelerator_photographs has no such key yet;
--    the rehost table below needs one.
-- --------------------------------------------------------------------------

alter table public.dealer_accelerator_photographs
  add constraint dealer_accelerator_photographs_chain_key
  unique (id, batch_item_id, source_id, dealer_profile_id);

-- --------------------------------------------------------------------------
-- 3. Photograph rehosts — the private→public republication fact
--
--    Evidence photographs live in the PRIVATE 'dealer-evidence' bucket,
--    content-addressed by sha256. A buyer's browser can never read them, so a
--    draft cannot point at them. Materialization therefore republishes the
--    exact same bytes to the sanctioned public listing-media path.
--
--    That republication is a fact worth keeping separate from the evidence
--    row: the evidence records what the SOURCE showed us, this records what
--    WE then served. Keeping them apart also makes replay trivially safe —
--    one row per photograph, forever, so a second materialization attempt
--    reuses the existing URL instead of minting a duplicate.
-- --------------------------------------------------------------------------

create table public.dealer_accelerator_photograph_rehosts (
  id                      uuid        not null default gen_random_uuid(),
  photograph_id           uuid        not null,
  batch_item_id           uuid        not null,
  source_id               uuid        not null,
  dealer_profile_id       uuid        not null,
  content_hash            text        not null,
  evidence_storage_path   text        not null,
  listing_media_url       text        not null,
  listing_media_pathname  text        not null,
  byte_length             integer     not null,
  content_type            text        not null,
  rehosted_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),

  constraint dealer_accelerator_photograph_rehosts_pkey
    primary key (id),
  -- The one-to-one law: a photograph is republished at most once, ever.
  constraint dealer_accelerator_photograph_rehosts_photograph_key
    unique (photograph_id),
  constraint dealer_accelerator_photograph_rehosts_photograph_fk
    foreign key (photograph_id, batch_item_id, source_id, dealer_profile_id)
    references public.dealer_accelerator_photographs (id, batch_item_id, source_id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_photograph_rehosts_hash_check
    check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint dealer_accelerator_photograph_rehosts_evidence_path_check
    check (btrim(evidence_storage_path) <> ''),
  -- The republished object must be a real https URL a browser can fetch.
  constraint dealer_accelerator_photograph_rehosts_url_check
    check (listing_media_url ~ '^https://'),
  constraint dealer_accelerator_photograph_rehosts_pathname_check
    check (btrim(listing_media_pathname) <> ''),
  constraint dealer_accelerator_photograph_rehosts_bytes_check
    check (byte_length > 0),
  constraint dealer_accelerator_photograph_rehosts_content_type_check
    check (btrim(content_type) <> '')
);

create index dealer_accelerator_photograph_rehosts_item_idx
  on public.dealer_accelerator_photograph_rehosts (batch_item_id);

alter table public.dealer_accelerator_photograph_rehosts enable row level security;

-- Supabase grants ALL on new public tables to the app roles by default;
-- revoke first, then grant back exactly the spine's shape.
revoke all on public.dealer_accelerator_photograph_rehosts
  from public, anon, authenticated, service_role;
grant select                 on public.dealer_accelerator_photograph_rehosts to service_role;
grant select, insert         on public.dealer_accelerator_photograph_rehosts to dealer_accelerator_writer;

create policy dealer_accelerator_photograph_rehosts_writer_select
  on public.dealer_accelerator_photograph_rehosts
  for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_photograph_rehosts_writer_insert
  on public.dealer_accelerator_photograph_rehosts
  for insert to dealer_accelerator_writer with check (true);

-- --------------------------------------------------------------------------
-- 4. Mechanical eligibility
--
--    'discovered → ready' is a deterministic reading of the item's own
--    evidence, not a founder-by-founder judgement. This function performs
--    that reading and nothing else: it writes nothing, it decides nothing
--    about merit, and given the same evidence it always returns the same
--    verdict.
--
--    Incomplete or contradictory evidence yields an EXACT reason code, never
--    a vague failure and never a half-truthful listing.
-- --------------------------------------------------------------------------

create or replace function public.dealer_accelerator_assess_item_eligibility(
  p_batch_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_item          public.dealer_accelerator_batch_items;
  v_source_key    text;
  v_observation   uuid;
  v_parse_status  text;
  v_doc           jsonb;
  v_brand         text;
  v_reference     text;
  v_declared_id   text;
  v_price_text    text;
  v_price         numeric;
  v_currency      text;
  v_declared      int := 0;
  v_retrieved     int := 0;
  v_photographs   jsonb := '[]'::jsonb;
  v_reason        text := null;
begin
  select * into v_item
    from public.dealer_accelerator_batch_items
   where id = p_batch_item_id;
  if not found then
    raise exception 'item_not_found';
  end if;

  select si.source_item_key into v_source_key
    from public.dealer_accelerator_source_items si
   where si.id = v_item.source_item_id;

  <<assess>>
  loop
    -- ── The evidence must exist ──
    select o.id into v_observation
      from public.dealer_accelerator_observations o
     where o.batch_item_id = v_item.id
     order by o.observed_at desc, o.id desc
     limit 1;
    if v_observation is null then
      v_reason := 'no_observation_recorded';
      exit assess;
    end if;

    select op.parse_status, op.payload_jsonb
      into v_parse_status, v_doc
      from public.dealer_accelerator_observation_payloads op
     where op.observation_id = v_observation;
    if v_parse_status is null then
      v_reason := 'no_payload_recorded';
      exit assess;
    end if;
    if v_parse_status <> 'parsed' or v_doc is null or jsonb_typeof(v_doc) <> 'object' then
      v_reason := 'evidence_payload_unparsed';
      exit assess;
    end if;

    -- ── Identity ──
    v_declared_id := btrim(coalesce(v_doc->>'item_id',''));
    if v_declared_id <> '' and v_declared_id is distinct from v_source_key then
      -- The captured document names a different item than the identity it was
      -- filed under. That is a contradiction, not a detail.
      v_reason := 'evidence_item_id_mismatch';
      exit assess;
    end if;

    v_brand := nullif(btrim(coalesce(v_doc->>'brand','')),'');
    if v_brand is null then
      v_reason := 'evidence_missing_brand';
      exit assess;
    end if;
    v_reference := nullif(btrim(coalesce(v_doc->>'reference','')),'');
    if v_reference is null then
      v_reason := 'evidence_missing_reference';
      exit assess;
    end if;

    -- ── Photographs: declared and retrieved must agree exactly ──
    select count(*) into v_declared
      from public.dealer_accelerator_photographs p
     where p.observation_id = v_observation;
    if v_declared = 0 then
      v_reason := 'evidence_no_photographs';
      exit assess;
    end if;
    select count(*) into v_retrieved
      from public.dealer_accelerator_photographs p
     where p.observation_id = v_observation
       and p.retrieval_state = 'retrieved';
    if v_retrieved <> v_declared then
      -- A draft built from some of the photographs would misrepresent the
      -- watch. Either every declared photograph is in hand, or none is used.
      v_reason := 'photograph_evidence_incomplete';
      exit assess;
    end if;

    -- ── Money: parsed exactly as the import primitive will parse it, so
    --    eligibility and import can never disagree about the amount ──
    v_price_text := nullif(btrim(coalesce(v_doc->>'asking_price','')),'');
    v_currency   := upper(nullif(btrim(coalesce(v_doc->>'currency','')),''));
    if v_price_text is not null then
      begin
        v_price := nullif(regexp_replace(v_price_text,'[^0-9.]','','g'),'')::numeric;
      exception when others then
        v_price := null;
      end;
      if v_price is null or v_price <= 0 then
        v_reason := 'evidence_price_contradiction';
        exit assess;
      end if;
      if v_currency is null then
        v_reason := 'evidence_currency_missing';
        exit assess;
      end if;
    elsif v_currency is not null then
      -- A currency labelling no amount states nothing and hides the fact that
      -- no price was published.
      v_reason := 'evidence_currency_without_price';
      exit assess;
    end if;
    if v_currency is not null
       and not exists (
         select 1 from public.supported_currencies where code = v_currency and active
       ) then
      v_reason := 'evidence_currency_unsupported';
      exit assess;
    end if;

    exit assess;
  end loop;

  if v_observation is not null then
    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'photograph_id',         p.id,
                 'sequence_index',        p.sequence_index,
                 'declared_category',     p.declared_category,
                 'retrieval_state',       p.retrieval_state,
                 'content_hash',          p.content_hash,
                 'evidence_storage_path', p.storage_path)
               order by p.sequence_index),
             '[]'::jsonb)
      into v_photographs
      from public.dealer_accelerator_photographs p
     where p.observation_id = v_observation;
  end if;

  return jsonb_build_object(
    'batch_item_id',       v_item.id,
    'source_item_key',     v_source_key,
    'item_status',         v_item.status,
    'listing_id',          v_item.listing_id,
    'observation_id',      v_observation,
    'eligible',            (v_reason is null),
    'blocked_reason_code', v_reason,
    'listing', case when v_reason is null then
      jsonb_strip_nulls(jsonb_build_object(
        'brand',          v_brand,
        'reference',      v_reference,
        'model',          nullif(btrim(coalesce(v_doc->>'model','')),''),
        'year',           nullif(btrim(coalesce(v_doc->>'year','')),''),
        'condition',      nullif(btrim(coalesce(v_doc->>'condition','')),''),
        'description',    nullif(btrim(coalesce(v_doc->>'description','')),''),
        'askingPrice',    v_price_text,
        'askingCurrency', v_currency))
      else null end,
    'photographs',         v_photographs);
end;
$fn$;

alter function public.dealer_accelerator_assess_item_eligibility(uuid) owner to postgres;
revoke all     on function public.dealer_accelerator_assess_item_eligibility(uuid) from public, anon, authenticated;
grant  execute on function public.dealer_accelerator_assess_item_eligibility(uuid) to dealer_accelerator_writer, service_role;

-- --------------------------------------------------------------------------
-- 5. Record one photograph republication
--
--    The caller republishes the bytes and reports where they landed. Every
--    fact that could be lied about — which item, which source, which dealer,
--    which hash, which evidence object — is read from the photograph row
--    itself, never accepted from the caller.
--
--    Idempotent by the one-to-one key: a replay returns the URL already
--    recorded rather than minting a second one.
-- --------------------------------------------------------------------------

create or replace function public.dealer_accelerator_record_photograph_rehost(
  p_photograph_id          uuid,
  p_listing_media_url      text,
  p_listing_media_pathname text,
  p_byte_length            integer,
  p_content_type           text,
  p_actor_kind             text,
  p_actor_user_id          uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_photo   public.dealer_accelerator_photographs;
  v_actor   text := btrim(coalesce(p_actor_kind, ''));
  v_url     text := btrim(coalesce(p_listing_media_url, ''));
  v_path    text := btrim(coalesce(p_listing_media_pathname, ''));
  v_type    text := btrim(coalesce(p_content_type, ''));
  v_row     public.dealer_accelerator_photograph_rehosts;
  v_inserted int := 0;
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;

  select * into v_photo
    from public.dealer_accelerator_photographs
   where id = p_photograph_id
   for update;
  if not found then
    raise exception 'photograph_not_found';
  end if;
  -- Only bytes we actually hold, and verified, may be republished.
  if v_photo.retrieval_state <> 'retrieved' then
    raise exception 'photograph_not_retrieved:%', v_photo.retrieval_state;
  end if;

  if v_url = '' or v_url !~ '^https://' then
    raise exception 'invalid_listing_media_url';
  end if;
  if v_path = '' then
    raise exception 'invalid_listing_media_pathname';
  end if;
  if p_byte_length is null or p_byte_length <= 0 then
    raise exception 'invalid_byte_length';
  end if;
  if v_type = '' then
    raise exception 'invalid_content_type';
  end if;

  insert into public.dealer_accelerator_photograph_rehosts (
    photograph_id, batch_item_id, source_id, dealer_profile_id,
    content_hash, evidence_storage_path,
    listing_media_url, listing_media_pathname, byte_length, content_type
  ) values (
    v_photo.id, v_photo.batch_item_id, v_photo.source_id, v_photo.dealer_profile_id,
    v_photo.content_hash, v_photo.storage_path,
    v_url, v_path, p_byte_length, v_type
  )
  on conflict (photograph_id) do nothing;

  get diagnostics v_inserted = row_count;

  select * into v_row
    from public.dealer_accelerator_photograph_rehosts
   where photograph_id = v_photo.id;

  return jsonb_build_object(
    'result',                 case when v_inserted > 0 then 'REHOSTED' else 'ALREADY_REHOSTED' end,
    'photograph_id',          v_row.photograph_id,
    'content_hash',           v_row.content_hash,
    'listing_media_url',      v_row.listing_media_url,
    'listing_media_pathname', v_row.listing_media_pathname);
end;
$fn$;

alter function public.dealer_accelerator_record_photograph_rehost(uuid, text, text, integer, text, text, uuid) owner to postgres;
revoke all     on function public.dealer_accelerator_record_photograph_rehost(uuid, text, text, integer, text, text, uuid) from public, anon, authenticated;
grant  execute on function public.dealer_accelerator_record_photograph_rehost(uuid, text, text, integer, text, text, uuid) to dealer_accelerator_writer, service_role;

-- --------------------------------------------------------------------------
-- 6. THE BRIDGE
--
--    The only lawful path into 'draft_created'. It takes no listing content
--    from its caller at all: every field comes from the item's own captured
--    evidence, and every photograph URL comes from the recorded rehost rows.
--    A caller cannot inject a brand, a price, a photograph, or a seller.
--
--    The seller is the item's own dealer_profile_id, carried unbroken through
--    the source → source_item → batch_item chain. It is never a parameter,
--    so no invocation — founder-triggered or otherwise — can create a listing
--    owned by anyone but the dealer the evidence belongs to.
--
--    Everything commits together: the listings row, its media rows, the
--    item's status, its listing_id, and the lifecycle event.
-- --------------------------------------------------------------------------

create or replace function public.dealer_accelerator_materialize_item_draft(
  p_batch_item_id uuid,
  p_actor_kind    text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item        public.dealer_accelerator_batch_items;
  v_actor       text := btrim(coalesce(p_actor_kind, ''));
  v_assessment  jsonb;
  v_observation uuid;
  v_listing     jsonb;
  v_photos      jsonb;
  v_expected    int;
  v_have        int;
  v_import      jsonb;
  v_listing_id  uuid;
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;

  select * into v_item
    from public.dealer_accelerator_batch_items
   where id = p_batch_item_id
   for update;
  if not found then
    raise exception 'item_not_found';
  end if;

  -- ── Replay: an already-materialized item is settled. Zero new writes,
  --    no second listing, no second media row. ──
  if v_item.status = 'draft_created' then
    return jsonb_build_object(
      'result',        'ALREADY_MATERIALIZED',
      'batch_item_id', v_item.id,
      'listing_id',    v_item.listing_id);
  end if;

  if v_item.status <> 'ready' then
    raise exception 'item_not_ready:%', v_item.status;
  end if;
  -- Another worker holding a live lease is mid-flight on this item.
  if v_item.lease_token is not null and v_item.lease_expires_at > now() then
    raise exception 'item_leased';
  end if;

  -- ── Eligibility is re-read here, at the moment of the write. 'ready' is a
  --    memory of a past reading; this is the present truth. ──
  v_assessment := public.dealer_accelerator_assess_item_eligibility(v_item.id);
  if not (v_assessment->>'eligible')::boolean then
    raise exception 'item_not_eligible:%', coalesce(v_assessment->>'blocked_reason_code','unknown');
  end if;
  v_observation := (v_assessment->>'observation_id')::uuid;
  v_listing     := v_assessment->'listing';

  -- ── Photographs come from the rehost record, in evidence order. Category
  --    is the category the source declared, carried through unchanged. ──
  select count(*) into v_expected
    from public.dealer_accelerator_photographs p
   where p.observation_id = v_observation
     and p.retrieval_state = 'retrieved';

  select count(*),
         jsonb_agg(
           jsonb_build_object(
             'url',      r.listing_media_url,
             'pathname', r.listing_media_pathname,
             'category', p.declared_category)
           order by p.sequence_index)
    into v_have, v_photos
    from public.dealer_accelerator_photographs p
    join public.dealer_accelerator_photograph_rehosts r on r.photograph_id = p.id
   where p.observation_id = v_observation
     and p.retrieval_state = 'retrieved';

  if v_have <> v_expected then
    -- Materializing now would publish a draft missing photographs the
    -- evidence says exist. Republish the rest first.
    raise exception 'photograph_rehost_incomplete:%/%', v_have, v_expected;
  end if;

  -- ── The existing atomic listing/media primitive. Not duplicated here: the
  --    listings row, the listings.photos payload, and every dealer_import
  --    listing_media row still commit together or not at all — and now within
  --    THIS transaction, so the item's own status commits with them. ──
  v_import := public.dealer_import_one_listing(
    v_item.dealer_profile_id,
    v_listing,
    v_photos
  );
  if coalesce(v_import->>'result','') <> 'IMPORTED' then
    raise exception 'materialization_rejected:%', coalesce(v_import->>'reason','unknown');
  end if;
  v_listing_id := (v_import->>'listing_id')::uuid;

  -- ── Couple the truth. The table's own CHECK makes the pair inseparable;
  --    the partial unique index on (source_item_id) where listing_id is not
  --    null makes a second listing for this source item impossible. ──
  update public.dealer_accelerator_batch_items
     set status           = 'draft_created',
         listing_id       = v_listing_id,
         lease_token      = null,
         lease_expires_at = null,
         next_attempt_at  = null,
         updated_at       = now()
   where id = v_item.id;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_item_id,
    dealer_profile_id,
    listing_id,
    entity_kind,
    event_type,
    prior_state,
    resulting_state,
    actor_kind,
    actor_user_id,
    reason_code,
    metadata
  ) values (
    v_item.id,
    v_item.dealer_profile_id,
    v_listing_id,
    'item',
    'item_draft_created',
    'ready',
    'draft_created',
    v_actor,
    p_actor_user_id,
    'evidence_materialized',
    jsonb_build_object(
      'observation_id', v_observation,
      'media_count',    v_import->'media_count',
      'warnings',       coalesce(v_import->'warnings', '[]'::jsonb))
  );

  return jsonb_build_object(
    'result',         'DRAFT_CREATED',
    'batch_item_id',  v_item.id,
    'listing_id',     v_listing_id,
    'observation_id', v_observation,
    'media_count',    v_import->'media_count',
    'warnings',       coalesce(v_import->'warnings', '[]'::jsonb));
end;
$fn$;

alter function public.dealer_accelerator_materialize_item_draft(uuid, text, uuid) owner to postgres;
revoke all     on function public.dealer_accelerator_materialize_item_draft(uuid, text, uuid) from public, anon, authenticated;
grant  execute on function public.dealer_accelerator_materialize_item_draft(uuid, text, uuid) to dealer_accelerator_writer, service_role;

-- PFC274 = 62 — the evaluate route is untouched.
