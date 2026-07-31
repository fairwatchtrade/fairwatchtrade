-- ════════════════════════════════════════════════════════════════════════
-- LISTING PHOTO PRESENTATION — hero framing metadata
-- supabase/migrations/20260731040000_listing_photo_presentation.sql
--
-- Adds ONE nullable jsonb column carrying the seller's hero choice and focal
-- framing. Presentation only: no photograph is copied, re-encoded, moved, or
-- deleted by this flight, and `listings.photos` keeps exactly its old shape.
--
-- ── WHY A SEPARATE COLUMN AND NOT A KEY INSIDE photos ──────────────────
-- `listings.photos` is evidence — it is read by the Aubrey integrity gate,
-- the dealer-import atomic RPC, the money-truth checks, and the attestation
-- functions, several of which iterate it with jsonb_array_elements and assume
-- its element shape. Threading a presentation key through those elements
-- would put a cosmetic value inside the evidence array every one of those
-- readers trusts. A sibling column keeps presentation adjacent to the photos
-- and structurally outside them.
--
-- ── NULL IS A REAL STATE ───────────────────────────────────────────────
-- NULL means automatic framing, which is what every existing row means and
-- what every row written before this migration keeps meaning. There is no
-- backfill, because there is nothing to correct: the default IS the truth for
-- those listings. The application sanitizer maps NULL to the default, so a
-- null column and an explicit centred object render identically.
--
-- ── THE CHECK ──────────────────────────────────────────────────────────
-- The constraint refuses a malformed object rather than trusting the client.
-- Bounds mirror lib/photoPresentation.ts exactly (focal 0..1, zoom 1..1.14);
-- if those ever move, they move in both places or the write is refused here.
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table public.listings
  add column if not exists photo_presentation jsonb;

comment on column public.listings.photo_presentation is
  'Hero framing metadata (heroPathname, focalX, focalY, zoom). Presentation only — the uploaded photographs are never altered. NULL = automatic framing.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'listings_photo_presentation_check'
       and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_photo_presentation_check check (
        photo_presentation is null
        or (
          jsonb_typeof(photo_presentation) = 'object'
          /* No unknown keys: an unrecognised field is a contract mismatch,
             not something to silently store and later half-honour.

             Expressed as `jsonb - text[]` rather than the obvious
             NOT EXISTS (select from jsonb_object_keys(...)) because Postgres
             forbids subqueries in a CHECK constraint (SQLSTATE 0A000).
             Subtracting the four known keys must leave the empty object. */
          and (photo_presentation - array['heroPathname', 'focalX', 'focalY', 'zoom'])
              = '{}'::jsonb
          and (
            photo_presentation -> 'heroPathname' is null
            or jsonb_typeof(photo_presentation -> 'heroPathname') in ('string', 'null')
          )
          and (
            photo_presentation -> 'focalX' is null
            or (
              jsonb_typeof(photo_presentation -> 'focalX') = 'number'
              and (photo_presentation ->> 'focalX')::numeric between 0 and 1
            )
          )
          and (
            photo_presentation -> 'focalY' is null
            or (
              jsonb_typeof(photo_presentation -> 'focalY') = 'number'
              and (photo_presentation ->> 'focalY')::numeric between 0 and 1
            )
          )
          and (
            photo_presentation -> 'zoom' is null
            or (
              jsonb_typeof(photo_presentation -> 'zoom') = 'number'
              and (photo_presentation ->> 'zoom')::numeric between 1 and 1.14
            )
          )
        )
      );
  end if;
end $$;

commit;
