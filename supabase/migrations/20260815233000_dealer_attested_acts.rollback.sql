/* ════════════════════════════════════════════════════════════════════════
   ROLLBACK — dealer attested acts

   Restores public.submit_listing_for_review to its pre-migration
   single-argument form (the verbatim v2 attestation-activation definition,
   20260730210000) and returns the lifecycle trigger to the metadata shape
   it wrote before the acts existed.

   The COLUMN is deliberately left in place. Dropping it would discard the
   record of what dealers actually attested while the migration was live,
   and a nullable unused jsonb column costs nothing. Drop it by hand only if
   that record is genuinely unwanted:

     ALTER TABLE public.listings DROP COLUMN dealer_attested_acts;

   Run the whole file in one transaction. After it, the two-argument
   function no longer exists — any deployed client that sends
   p_attested_acts will fail to resolve the function, so roll the
   application back with it.
   ════════════════════════════════════════════════════════════════════════ */

DROP FUNCTION IF EXISTS public.submit_listing_for_review(uuid, jsonb);

CREATE FUNCTION public.submit_listing_for_review(p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_is_imported := EXISTS (SELECT 1 FROM public.listing_media
                            WHERE listing_id = p_listing_id
                              AND capture_source = 'dealer_import');

  IF v_is_imported THEN
    IF coalesce(v_listing.details->>'availability','') <> 'In Stock' THEN
      RAISE EXCEPTION 'not_available_for_submission';
    END IF;

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
            WHERE p.e->'photo'->>'url' ~ '\S') t);

    IF v_listing.asking_currency IS NULL THEN
      v_fingerprint := encode(sha256(convert_to(v_canonical,'UTF8')),'hex');
    ELSE
      v_fingerprint := public.listing_attestation_fingerprint_v2(v_listing.id);
    END IF;
  END IF;

  v_prior_status := v_listing.status;
  v_now := now();

  UPDATE public.listings SET
    status                      = 'pending_review',
    dealer_attested_at          = CASE WHEN v_is_imported THEN v_now         ELSE dealer_attested_at          END,
    dealer_attested_by          = CASE WHEN v_is_imported THEN v_caller      ELSE dealer_attested_by          END,
    dealer_attested_fingerprint = CASE WHEN v_is_imported THEN v_fingerprint ELSE dealer_attested_fingerprint END,
    rejection_reason            = NULL,
    seller_clarification_note   = NULL
  WHERE id = p_listing_id;

  RETURN jsonb_build_object(
    'listing_id',   p_listing_id,
    'status',       'pending_review',
    'imported',     v_is_imported,
    'resubmission', v_prior_status = 'rejected',
    'attested_at',  CASE WHEN v_is_imported THEN v_now ELSE NULL END);
END $function$;

REVOKE ALL ON FUNCTION public.submit_listing_for_review(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_listing_for_review(uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_listing_for_review(uuid) IS
  'Dealer submission + attestation stamp. Fingerprint frame selected by the row''s currency: NULL -> v1 (13 frames, legacy-identical), set -> v2 via listing_attestation_fingerprint_v2 (15 frames). Mirrored in lib/attestation.ts.';

-- Lifecycle trigger returns to the pre-acts metadata shape.
CREATE OR REPLACE FUNCTION public.log_dealer_submission_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_batch_item uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> NEW.seller_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.listing_media
     WHERE listing_id = NEW.id AND capture_source = 'dealer_import'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT bi.id INTO v_batch_item
    FROM public.dealer_accelerator_batch_items bi
   WHERE bi.listing_id = NEW.id
   ORDER BY bi.id
   LIMIT 1;

  IF v_batch_item IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
  INSERT INTO public.dealer_accelerator_lifecycle_events (
    batch_item_id, dealer_profile_id, listing_id, entity_kind, event_type,
    prior_state, resulting_state, actor_kind, actor_user_id, metadata
  ) VALUES (
    v_batch_item, NEW.seller_id, NEW.id, 'item', 'listing_submitted_for_review',
    OLD.status, NEW.status, 'dealer', v_caller,
    jsonb_build_object(
      'availability',            NEW.details->>'availability',
      'attestation_fingerprint', NEW.dealer_attested_fingerprint,
      'fingerprint_version',     CASE WHEN NEW.asking_currency IS NULL
                                      THEN 'v1' ELSE 'v2' END,
      'ceremony',                'complete',
      'resubmission',            OLD.status = 'rejected'
    )
  );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.log_dealer_submission_event() FROM PUBLIC, anon, authenticated, service_role;
