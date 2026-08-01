-- ════════════════════════════════════════════════════════════════════════
-- PHOTO PRESENTATION — governed zoom-out for rotated frames
-- supabase/migrations/20260801020000_photo_presentation_rotated_zoom_out.sql
--
-- Production finding: after a quarter-turn, the fitted crop can cut a side
-- profile's lugs; the seller needs a little room to pull back. Rotated
-- frames (rotationDeg 90/270) may now carry zoom down to 0.85 — the gap is
-- filled by the surface's dark matte, never by stretching the photograph.
-- Upright frames keep the 1.00 floor: below it they would expose borders
-- with no compositional reason to.
--
-- Mirrors lib/photoPresentation.ts zoomMinFor() exactly.
--
-- Known narrow gap, accepted deliberately: a frame with zoom in [0.85, 1)
-- and NO rotationDeg key passes this CHECK (jsonpath lax mode returns
-- unknown for the missing member, which does not match the violation
-- filter). The application sanitizer always writes rotationDeg, so that
-- shape cannot arrive through the API — only through manual SQL, where the
-- operator is trusted. The alternative (requiring rotationDeg on every
-- frame) would invalidate every v3.9 row for no real protection.
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
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.*.keyvalue() ? (@.key != "focalX" && @.key != "focalY" && @.key != "zoom" && @.key != "rotationDeg")'
      )
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.*.keyvalue() ? (@.value.type() != "number")'
      )
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.* ? (@.focalX < 0 || @.focalX > 1 || @.focalY < 0 || @.focalY > 1)'
      )
      -- absolute zoom band: 0.85 .. 1.14
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.* ? (@.zoom < 0.85 || @.zoom > 1.14)'
      )
      -- zoom below 1.00 is a rotated-frame privilege only
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.* ? (@.zoom < 1 && @.rotationDeg != 90 && @.rotationDeg != 270)'
      )
      -- rotation strictly a quarter-turn (absent = upright, still valid)
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.* ? (@.rotationDeg != 0 && @.rotationDeg != 90 && @.rotationDeg != 180 && @.rotationDeg != 270)'
      )
      -- legacy v1 scalars, unchanged: upright semantics, floor 1.00
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
  'Per-photo framing metadata: { heroPathname, frames: { <pathname>: { focalX, focalY, zoom, rotationDeg } } }. rotationDeg is a clockwise quarter-turn (0/90/180/270), presentation only. Zoom 1.00-1.14 upright; rotated frames may zoom out to 0.85 (dark matte, never distortion). NULL = automatic. The v1 single-record shape is still accepted and migrated on read.';

commit;
