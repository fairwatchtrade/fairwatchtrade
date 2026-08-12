-- Aubrey Check Flight 1 — exact retained-byte hash index.
-- Evidence-only and inert: no trigger, status write, hold, rejection, or UI state.

alter table public.listing_media
  add column content_sha256 text,
  add column content_sha256_computed_at timestamptz;

alter table public.listing_media
  add constraint listing_media_content_sha256_shape
  check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint listing_media_content_sha256_pair
  check (
    (content_sha256 is null and content_sha256_computed_at is null)
    or
    (content_sha256 is not null and content_sha256_computed_at is not null)
  );

-- Deliberately NON-UNIQUE. Recurrence is the evidence this index must permit.
create index listing_media_content_sha256_idx
  on public.listing_media (content_sha256)
  where content_sha256 is not null;

comment on column public.listing_media.content_sha256 is
  'Aubrey Flight 1: lowercase SHA-256 of exact retained object bytes; evidence only, never identity or verdict.';

comment on column public.listing_media.content_sha256_computed_at is
  'Server time at which FairWatchTrade derived content_sha256 from retained bytes.';

create or replace function public.record_listing_media_content_sha256(
  p_media_id uuid,
  p_content_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_listing_id uuid;
  v_capture_source text;
  v_storage_path text;
  v_existing_hash text;
  v_match_count bigint;
  v_matches jsonb;
begin
  if p_media_id is null then
    raise exception 'media_id_required';
  end if;

  if p_content_sha256 is null
     or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'content_sha256_invalid';
  end if;

  -- Serialize equal digests. Under concurrent first sightings, at least the
  -- later transaction must observe the earlier committed row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fwt.aubrey.exact_hash/' || p_content_sha256, 0)
  );

  select m.listing_id, m.capture_source, m.storage_path, m.content_sha256
    into v_listing_id, v_capture_source, v_storage_path, v_existing_hash
    from public.listing_media m
   where m.id = p_media_id
   for update;

  if not found then
    raise exception 'listing_media_not_found';
  end if;

  if v_existing_hash is not null and v_existing_hash <> p_content_sha256 then
    raise exception 'content_sha256_immutable';
  end if;

  update public.listing_media
     set content_sha256 = p_content_sha256,
         content_sha256_computed_at = coalesce(content_sha256_computed_at, statement_timestamp())
   where id = p_media_id;

  select count(*)
    into v_match_count
    from public.listing_media other
   where other.content_sha256 = p_content_sha256
     and other.id <> p_media_id
     and other.listing_id <> v_listing_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'media_id', q.id,
               'listing_id', q.listing_id,
               'capture_source', q.capture_source
             ) order by q.id
           ),
           '[]'::jsonb
         )
    into v_matches
    from (
      select other.id, other.listing_id, other.capture_source
        from public.listing_media other
       where other.content_sha256 = p_content_sha256
         and other.id <> p_media_id
         and other.listing_id <> v_listing_id
       order by other.id
       limit 20
    ) q;

  return jsonb_build_object(
    'schema_version', 'aubrey.exact_hash.rpc/v1',
    'media_id', p_media_id,
    'listing_id', v_listing_id,
    'capture_source', v_capture_source,
    'storage_path', v_storage_path,
    'content_sha256', p_content_sha256,
    'cross_listing_match_count', v_match_count,
    'matches', v_matches,
    'matches_truncated', v_match_count > jsonb_array_length(v_matches)
  );
end;
$fn$;

alter function public.record_listing_media_content_sha256(uuid, text) owner to postgres;
revoke all on function public.record_listing_media_content_sha256(uuid, text) from public;
revoke all on function public.record_listing_media_content_sha256(uuid, text) from anon;
revoke all on function public.record_listing_media_content_sha256(uuid, text) from authenticated;
grant execute on function public.record_listing_media_content_sha256(uuid, text) to service_role;
