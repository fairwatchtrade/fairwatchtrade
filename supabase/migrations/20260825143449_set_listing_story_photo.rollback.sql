/* ════════════════════════════════════════════════════════════════════════
   ROLLBACK — set_listing_story_photo

   Dropping the function removes the ONLY post-creation writer of
   listings.photo_presentation. Existing storyPathname values are left
   exactly as they are: they are valid data under the CHECK constraint, the
   collector reader keeps honouring them, and destroying seller choices to
   undo a function would be a subtraction this contract forbids.

   After this runs, a Story Photo can once again only be chosen at listing
   creation.

   PFC274 = 62 — Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

DROP FUNCTION IF EXISTS public.set_listing_story_photo(uuid, text);
