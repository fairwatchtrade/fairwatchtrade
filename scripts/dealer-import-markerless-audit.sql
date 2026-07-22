-- ════════════════════════════════════════════════════════════════════════
-- Dealer Intake — Flight 2A: read-only markerless-origin audit
--
-- Classifies EXISTING listings by TRUE provenance evidence only. It performs NO
-- writes: no row is updated, stamped, repaired, deleted, or backfilled. Run it
-- read-only (SELECT only) against the main project.
--
-- Evidence used (and ONLY this):
--   • dealer_import media present            → KNOWN_DEALER_IMPORT_WITH_TRUSTED_MARKER
--   • media present, all/any non-import,
--     at least one live_camera, no import    → GENUINE_MANUAL_LISTING
--   • no media rows at all                    → UNKNOWN_ORIGIN_REQUIRES_REVIEW
--   • media present but neither import nor
--     live_camera provenance                  → UNKNOWN_ORIGIN_REQUIRES_REVIEW
--
-- POSSIBLE_FAILED_OR_ZERO_PHOTO_DEALER_IMPORT is a DEFINED terminal category but
-- is assigned ONLY on a positive failed-import signal. No such signal exists in
-- the schema (a failed/zero-photo import is byte-identical to a manual no-photo
-- draft), and the brief forbids inferring dealer-import from seller identity,
-- resemblance, populated listings.photos, or proximity to an import test.
-- Therefore no-media rows are NOT guessed as imports — they are surfaced as
-- UNKNOWN_ORIGIN_REQUIRES_REVIEW for a human to decide.
-- ════════════════════════════════════════════════════════════════════════

with m as (
  select
    l.id, l.seller_id, l.status,
    l.dealer_attested_by, l.dealer_attested_at,
    (l.dealer_attested_fingerprint is not null) as has_attestation_fingerprint,
    count(md.*)                                                   as media_count,
    count(*) filter (where md.capture_source = 'dealer_import')   as dealer_import_count,
    count(*) filter (where md.capture_source = 'live_camera')     as live_camera_count,
    coalesce(nullif(array_to_string(array_agg(distinct md.capture_source)
             filter (where md.capture_source not in ('dealer_import','live_camera')), ', '), ''), '')
                                                                  as other_capture_sources
  from public.listings l
  left join public.listing_media md on md.listing_id = l.id
  group by l.id, l.seller_id, l.status, l.dealer_attested_by, l.dealer_attested_at, l.dealer_attested_fingerprint
)
select
  id, seller_id, status, media_count, dealer_import_count, live_camera_count,
  other_capture_sources, dealer_attested_by, dealer_attested_at, has_attestation_fingerprint,
  case
    when dealer_import_count > 0 then 'KNOWN_DEALER_IMPORT_WITH_TRUSTED_MARKER'
    when media_count > 0 and live_camera_count > 0 and dealer_import_count = 0 then 'GENUINE_MANUAL_LISTING'
    when media_count = 0 then 'UNKNOWN_ORIGIN_REQUIRES_REVIEW'
    else 'UNKNOWN_ORIGIN_REQUIRES_REVIEW'
  end as classification,
  case
    when dealer_import_count > 0 then 'has >=1 trusted dealer_import media row'
    when media_count > 0 and live_camera_count > 0 and dealer_import_count = 0 then 'live_camera provenance, no import marker'
    when media_count = 0 then 'no media rows — origin indeterminate (do not infer)'
    else 'media present but no import/live_camera provenance — indeterminate'
  end as reason,
  (dealer_import_count = 0) as requires_human_review
from m
order by classification, status, id;
