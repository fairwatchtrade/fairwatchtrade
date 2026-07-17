-- ═══════════════════════════════════════════════════════════════════════
-- v2.21b — Photo URL normalization alignment (OGGPT final release condition)
-- Field 13 of the fingerprint contract now EXCLUDES missing/NULL, empty,
-- and whitespace-only urls on BOTH sides (SQL here, TS in lib/attestation.ts):
-- emptiness is tested on the trimmed value ( ~ '\S' = has a non-whitespace
-- char), while surviving urls hash their ORIGINAL bytes, untrimmed.
-- Only the photos WHERE clause changes; everything else is byte-identical
-- to migration 20260716233352.
-- Rollback: re-apply the function body from 20260716233352.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_listing_for_review(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_listing      public.listings%ROWTYPE;
  v_is_imported  boolean;
  v_prior_status text;
  v_canonical    text;
  v_fingerprint  text;
  v_now          timestamptz;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_listing FROM public.listings
   WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_listing.seller_id <> v_caller THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_listing.status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'invalid_transition:%', v_listing.status;
  END IF;

  -- Origin determined INTERNALLY from trusted provenance, never from caller.
  v_is_imported := EXISTS (SELECT 1 FROM public.listing_media
                            WHERE listing_id = p_listing_id
                              AND capture_source = 'dealer_import');

  IF v_is_imported THEN
    IF coalesce(v_listing.details->>'availability','') <> 'In Stock' THEN
      RAISE EXCEPTION 'not_available_for_submission';
    END IF;

    -- 13-field length-prefixed fingerprint. Contract mirrored byte-for-byte
    -- in lib/attestation.ts — any change here REQUIRES a matching change there.
    -- frame(s) = octet_length_utf8(s) ':' s ; fields concatenated, no separator.
    v_canonical :=
         octet_length(convert_to(coalesce(v_listing.brand,''),'UTF8'))::text || ':' || coalesce(v_listing.brand,'')
      || octet_length(convert_to(coalesce(v_listing.model,''),'UTF8'))::text || ':' || coalesce(v_listing.model,'')
      || octet_length(convert_to(coalesce(v_listing.reference,''),'UTF8'))::text || ':' || coalesce(v_listing.reference,'')
      || octet_length(convert_to(coalesce(v_listing.year,''),'UTF8'))::text || ':' || coalesce(v_listing.year,'')
      || octet_length(convert_to(coalesce(v_listing.condition,''),'UTF8'))::text || ':' || coalesce(v_listing.condition,'')
      || octet_length(convert_to(coalesce(trim_scale(v_listing.asking_price)::text,''),'UTF8'))::text || ':' || coalesce(trim_scale(v_listing.asking_price)::text,'')
      || octet_length(convert_to(coalesce(v_listing.provenance_note,''),'UTF8'))::text || ':' || coalesce(v_listing.provenance_note,'')
      || octet_length(convert_to(coalesce(v_listing.description,''),'UTF8'))::text || ':' || coalesce(v_listing.description,'')
      || octet_length(convert_to(CASE WHEN v_listing.has_bracelet THEN 'true' ELSE 'false' END,'UTF8'))::text || ':' || CASE WHEN v_listing.has_bracelet THEN 'true' ELSE 'false' END
      || octet_length(convert_to(coalesce(v_listing.details->>'availability',''),'UTF8'))::text || ':' || coalesce(v_listing.details->>'availability','')
      || (SELECT octet_length(convert_to(s,'UTF8'))::text || ':' || s FROM (
            SELECT coalesce(string_agg(
              octet_length(convert_to(x.v,'UTF8'))::text || ':' || x.v, '' ORDER BY x.o), '') AS s
            FROM jsonb_array_elements_text(
              coalesce(v_listing.details->'includedWithWatch','[]'::jsonb)
            ) WITH ORDINALITY AS x(v,o)) t)
      || octet_length(convert_to(coalesce(v_listing.details->>'includedNotes',''),'UTF8'))::text || ':' || coalesce(v_listing.details->>'includedNotes','')
      || (SELECT octet_length(convert_to(s,'UTF8'))::text || ':' || s FROM (
            SELECT coalesce(string_agg(
              octet_length(convert_to(p.e->'photo'->>'url','UTF8'))::text || ':' || (p.e->'photo'->>'url'), '' ORDER BY p.o), '') AS s
            FROM jsonb_array_elements(coalesce(v_listing.photos,'[]'::jsonb))
            WITH ORDINALITY AS p(e,o)
            -- v2.21b: exclude missing/NULL, empty, and whitespace-only urls.
            -- '\S' = at least one non-whitespace character; NULL fails it.
            -- Surviving urls hash their ORIGINAL bytes, untrimmed.
            WHERE p.e->'photo'->>'url' ~ '\S') t);

    v_fingerprint := encode(sha256(convert_to(v_canonical,'UTF8')),'hex');
  END IF;

  v_prior_status := v_listing.status;
  v_now := now();  -- captured ONCE, reused for write and return

  UPDATE public.listings SET
    status                      = 'pending_review',
    dealer_attested_at          = CASE WHEN v_is_imported THEN v_now         ELSE dealer_attested_at          END,
    dealer_attested_by          = CASE WHEN v_is_imported THEN v_caller      ELSE dealer_attested_by          END,
    dealer_attested_fingerprint = CASE WHEN v_is_imported THEN v_fingerprint ELSE dealer_attested_fingerprint END,
    rejection_reason            = NULL
  WHERE id = p_listing_id;

  RETURN jsonb_build_object(
    'listing_id',   p_listing_id,
    'status',       'pending_review',
    'imported',     v_is_imported,
    'resubmission', v_prior_status = 'rejected',
    'attested_at',  CASE WHEN v_is_imported THEN v_now ELSE NULL END);
END $$;

REVOKE ALL ON FUNCTION public.submit_listing_for_review(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_listing_for_review(uuid) TO authenticated;
