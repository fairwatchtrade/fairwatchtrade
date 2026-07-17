-- ═══════════════════════════════════════════════════════════════════════
-- v2.21 — Dealer Accelerator Flight 2B: Review Workspace
-- Additive columns + canonical submission RPC + column-level grants +
-- status-scoped update policy + dealer_import provenance protection.
-- Rollback: DROP the 4 columns; DROP FUNCTION submit_listing_for_review;
-- GRANT UPDATE ON public.listings TO authenticated; restore prior
-- listings_update_own (owner-only USING) and listing_media ALL policy.
-- ═══════════════════════════════════════════════════════════════════════

-- 1 · Attestation + rejection columns (additive, no backfill)
ALTER TABLE public.listings
  ADD COLUMN dealer_attested_at timestamptz,
  ADD COLUMN dealer_attested_by uuid,
  ADD COLUMN dealer_attested_fingerprint text,
  ADD COLUMN rejection_reason text;

-- 2 · Canonical submission RPC — both origins, one atomic path.
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
            WHERE p.e->'photo'->>'url' IS NOT NULL) t);

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

-- 3 · Column-level UPDATE grants: dealers touch commercial truth only.
REVOKE UPDATE ON public.listings FROM authenticated;
GRANT UPDATE (brand, model, reference, year, condition, asking_price,
              provenance_note, description, has_bracelet, details, photos)
  ON public.listings TO authenticated;

-- 4 · Status-scoped owner update policy: edits only in draft/rejected.
--     No WITH CHECK, deliberately: Postgres reuses USING for the new row,
--     preserving the seller_id-reassignment protection.
DROP POLICY listings_update_own ON public.listings;
CREATE POLICY listings_update_own ON public.listings FOR UPDATE
  USING (auth.uid() = seller_id AND status IN ('draft','rejected'));

-- 5 · dealer_import provenance is unforgeable by client sessions.
--     Same ownership semantics, command-scoped; INSERT/UPDATE exclude the value.
DROP POLICY "own listing media" ON public.listing_media;
CREATE POLICY listing_media_select_own ON public.listing_media FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.listings l
                  WHERE l.id = listing_media.listing_id AND l.seller_id = auth.uid()));
CREATE POLICY listing_media_insert_own ON public.listing_media FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l
                       WHERE l.id = listing_media.listing_id AND l.seller_id = auth.uid())
              AND capture_source <> 'dealer_import');
CREATE POLICY listing_media_update_own ON public.listing_media FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.listings l
                  WHERE l.id = listing_media.listing_id AND l.seller_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l
                       WHERE l.id = listing_media.listing_id AND l.seller_id = auth.uid())
              AND capture_source <> 'dealer_import');
CREATE POLICY listing_media_delete_own ON public.listing_media FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.listings l
                  WHERE l.id = listing_media.listing_id AND l.seller_id = auth.uid()));
