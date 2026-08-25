/* Rollback for 20260824215910_photo_presentation_story_photo.

   Restores the photo_presentation CHECK exactly as it stood after
   20260801053505_photo_presentation_rotated_zoom_out — the immediately
   previous definition. The ONLY difference from the migration beside it is
   that 'storyPathname' leaves the top-level allowlist and loses its type
   guard. Every other clause is identical in both files.

   ⚠ RUN THE DATA CHECK FIRST. This constraint is validated against existing
   rows on creation, so any row that already carries a storyPathname will
   make the ALTER fail — correctly, because the alternative would be a
   constraint the table silently violates. Clear the key before rolling back:

     UPDATE public.listings
        SET photo_presentation = photo_presentation - 'storyPathname'
      WHERE photo_presentation ? 'storyPathname';

   That is deliberately NOT run automatically here. It destroys seller
   choices, and a rollback script should not quietly delete a seller's work
   to make its own ALTER succeed. Decide, then run it.

   Touches nothing else: no column is dropped, no other constraint, index,
   policy or grant is altered, and listings.photos is never read or written.

   PFC274 = 62 — Canary path untouched. */

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_photo_presentation_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_photo_presentation_check CHECK (
    photo_presentation IS NULL
    OR (
      jsonb_typeof(photo_presentation) = 'object'

      -- storyPathname absent: any key outside this list refuses the row.
      AND (photo_presentation - ARRAY[
            'heroPathname', 'frames',
            'focalX', 'focalY', 'zoom'
          ]) = '{}'::jsonb

      AND ((photo_presentation -> 'heroPathname') IS NULL
           OR jsonb_typeof(photo_presentation -> 'heroPathname') IN ('string', 'null'))

      AND ((photo_presentation -> 'frames') IS NULL
           OR jsonb_typeof(photo_presentation -> 'frames') = 'object')

      AND NOT jsonb_path_exists(photo_presentation,
        '$."frames".*.keyvalue()?(@."key" != "focalX" && @."key" != "focalY" && @."key" != "zoom" && @."key" != "rotationDeg")')
      AND NOT jsonb_path_exists(photo_presentation,
        '$."frames".*.keyvalue()?(@."value".type() != "number")')
      AND NOT jsonb_path_exists(photo_presentation,
        '$."frames".*?(@."focalX" < 0 || @."focalX" > 1 || @."focalY" < 0 || @."focalY" > 1)')
      AND NOT jsonb_path_exists(photo_presentation,
        '$."frames".*?(@."zoom" < 0.85 || @."zoom" > 1.14)')
      AND NOT jsonb_path_exists(photo_presentation,
        '$."frames".*?(@."zoom" < 1 && @."rotationDeg" != 90 && @."rotationDeg" != 270)')
      AND NOT jsonb_path_exists(photo_presentation,
        '$."frames".*?(@."rotationDeg" != 0 && @."rotationDeg" != 90 && @."rotationDeg" != 180 && @."rotationDeg" != 270)')

      AND ((photo_presentation -> 'focalX') IS NULL
           OR (jsonb_typeof(photo_presentation -> 'focalX') = 'number'
               AND (photo_presentation ->> 'focalX')::numeric >= 0
               AND (photo_presentation ->> 'focalX')::numeric <= 1))
      AND ((photo_presentation -> 'focalY') IS NULL
           OR (jsonb_typeof(photo_presentation -> 'focalY') = 'number'
               AND (photo_presentation ->> 'focalY')::numeric >= 0
               AND (photo_presentation ->> 'focalY')::numeric <= 1))
      AND ((photo_presentation -> 'zoom') IS NULL
           OR (jsonb_typeof(photo_presentation -> 'zoom') = 'number'
               AND (photo_presentation ->> 'zoom')::numeric >= 1
               AND (photo_presentation ->> 'zoom')::numeric <= 1.14))
    )
  );

COMMENT ON COLUMN public.listings.photo_presentation IS
  'Governed seller photo-presentation contract: which photograph leads the listing (heroPathname) and per-pathname framing. Presentation may improve; evidence may never be subtracted - the CHECK is a strict top-level allowlist for exactly that reason.';
