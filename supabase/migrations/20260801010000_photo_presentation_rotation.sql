-- ════════════════════════════════════════════════════════════════════════
-- PHOTO PRESENTATION — quarter-turn rotation joins the frame contract
-- supabase/migrations/20260801010000_photo_presentation_rotation.sql
--
-- Adds rotationDeg to the per-photo frame shape:
--
--   frames: { "<pathname>": { focalX, focalY, zoom, rotationDeg } }
--
-- Presentation only: a CSS transform over the untouched upload, exactly like
-- focal position and zoom. The proven case is a Non-Crown Side photograph
-- captured vertically — turned east-west, the full side silhouette and both
-- teardrop lugs read as one horizontal object.
--
-- ── WHY THIS MUST PRECEDE THE APP DEPLOY ──────────────────────────────
-- The live CHECK rejects any frame key beyond focalX/focalY/zoom, so the
-- first publish carrying a rotation would fail the INSERT and the seller
-- could not list at all. Constraint first, application second.
--
-- ── VALIDATION ────────────────────────────────────────────────────────
-- rotationDeg is strictly one of 0 | 90 | 180 | 270. A 45 would tilt
-- evidence, a "90" string is a type error — both are refused, mirroring
-- lib/photoPresentation.ts. A frame WITHOUT rotationDeg stays valid (every
-- v3.9 row); in jsonpath lax mode a predicate on a missing member is unknown,
-- which does not match the violation filter — precisely the behaviour needed.
--
-- No backfill, no rewrite: existing rows are untouched and remain valid.
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table public.listings
  drop constraint if exists listings_photo_presentation_check;

alter table public.listings
  add constraint listings_photo_presentation_check check (
    photo_presentation is null
    or (
      jsonb_typeof(photo_presentation) = 'object'
      and (photo_presentation - array[
            'heroPathname', 'frames', 'focalX', 'focalY', 'zoom'
          ]) = '{}'::jsonb
      and (
        photo_presentation -> 'heroPathname' is null
        or jsonb_typeof(photo_presentation -> 'heroPathname') in ('string', 'null')
      )
      and (
        photo_presentation -> 'frames' is null
        or jsonb_typeof(photo_presentation -> 'frames') = 'object'
      )
      -- no unknown frame keys
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.*.keyvalue() ? (@.key != "focalX" && @.key != "focalY" && @.key != "zoom" && @.key != "rotationDeg")'
      )
      -- every frame value numeric
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.*.keyvalue() ? (@.value.type() != "number")'
      )
      -- focal in range
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.* ? (@.focalX < 0 || @.focalX > 1 || @.focalY < 0 || @.focalY > 1)'
      )
      -- zoom in the governed band
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.* ? (@.zoom < 1 || @.zoom > 1.14)'
      )
      -- rotation strictly a quarter-turn (absent = upright, still valid)
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.* ? (@.rotationDeg != 0 && @.rotationDeg != 90 && @.rotationDeg != 180 && @.rotationDeg != 270)'
      )
      -- legacy v1 scalars, still range-checked where present
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

comment on column public.listings.photo_presentation is
  'Per-photo framing metadata: { heroPathname, frames: { <pathname>: { focalX, focalY, zoom, rotationDeg } } }. rotationDeg is a clockwise quarter-turn (0/90/180/270), presentation only — uploaded photographs are never altered. NULL = automatic. The v1 single-record shape is still accepted and migrated on read.';

commit;
