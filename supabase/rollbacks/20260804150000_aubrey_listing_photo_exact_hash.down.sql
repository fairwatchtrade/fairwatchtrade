-- Aubrey Check Flight 1 rollback. Schema-only; no blob deletion and no listing mutation.

revoke all on function public.record_listing_media_content_sha256(uuid, text) from service_role;
drop function if exists public.record_listing_media_content_sha256(uuid, text);

drop index if exists public.listing_media_content_sha256_idx;

alter table public.listing_media
  drop constraint if exists listing_media_content_sha256_pair,
  drop constraint if exists listing_media_content_sha256_shape,
  drop column if exists content_sha256_computed_at,
  drop column if exists content_sha256;
