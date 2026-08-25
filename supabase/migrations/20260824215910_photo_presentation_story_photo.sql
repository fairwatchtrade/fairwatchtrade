/* ════════════════════════════════════════════════════════════════════════
   STORY PHOTO — admitting one key to the photo_presentation contract.

   ⚠ THIS ARTIFACT IS A RECONSTRUCTION OF AN ALREADY-APPLIED MIGRATION.
   Production carries ledger entry 20260824215910_photo_presentation_story_photo
   and the constraint below is already live. The schema was correct; only the
   repository artifact was missing. Do not re-apply expecting a change, and
   do not create a second timestamp for the same alteration.

   WHY A MIGRATION EXISTS FOR A FEATURE WITH NO NEW COLUMN

   listings.photo_presentation is guarded by a STRICT TOP-LEVEL ALLOWLIST:

     (photo_presentation - ARRAY['heroPathname','frames','focalX','focalY','zoom']) = '{}'

   Any key not on that list makes the whole row fail. That is deliberate and
   correct — it is what stops a client inventing 'crop', 'delete' or 'order'
   inside a record whose entire purpose is that presentation may improve
   while evidence may not be subtracted. It also means a new field cannot be
   introduced in TypeScript alone: the database refuses the write, which is
   how this was discovered during implementation rather than in production.

   WHAT CHANGES

   'storyPathname' joins the allowlist and gains the same type guard
   heroPathname already has: string or null, nothing else. That is the whole
   change.

   WHAT DOES NOT CHANGE

   Every other clause is carried across verbatim — the frames key allowlist,
   the focal 0..1 bounds, the 0.85–1.14 zoom band, the rotation quarter-turn
   set, the zoom-out-only-when-rotated rule, and the v1 top-level focal
   fields. Nothing is loosened. This constraint still forbids exactly what it
   forbade before; it merely admits one seller CHOICE of the same class as
   the hero.

   ⚠ WHAT THIS CONSTRAINT DOES **NOT** DO

   It does not enforce that storyPathname names a photograph belonging to
   this listing. The column has no visibility into listings.photos, and no
   FK exists because a pathname is not a row. Same-listing ownership is
   enforced at READ time by resolveStoryIndex() in lib/photoPresentation.ts,
   which only ever compares the stored value against THIS listing's own
   pathnames — a foreign value simply never matches and the reader falls
   back. Do not describe cross-listing protection as database-enforced.

   PFC274 = 62 — Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_photo_presentation_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_photo_presentation_check CHECK (
    photo_presentation IS NULL
    OR (
      jsonb_typeof(photo_presentation) = 'object'

      -- The allowlist, with storyPathname added. Everything else refused.
      AND (photo_presentation - ARRAY[
            'heroPathname', 'storyPathname', 'frames',
            'focalX', 'focalY', 'zoom'
          ]) = '{}'::jsonb

      AND ((photo_presentation -> 'heroPathname') IS NULL
           OR jsonb_typeof(photo_presentation -> 'heroPathname') IN ('string', 'null'))

      -- Same guard as the hero. A pathname or nothing; never an object,
      -- never a number, never an array of "story photos".
      AND ((photo_presentation -> 'storyPathname') IS NULL
           OR jsonb_typeof(photo_presentation -> 'storyPathname') IN ('string', 'null'))

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

      -- v1 top-level focal fields, still tolerated for rows written before
      -- the per-photo frames map existed.
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
  'Governed seller photo-presentation contract: heroPathname (which photograph leads the listing), storyPathname (which accompanies Story / Provenance, optional), and per-pathname framing. Presentation may improve; evidence may never be subtracted - the CHECK is a strict top-level allowlist for exactly that reason.';
