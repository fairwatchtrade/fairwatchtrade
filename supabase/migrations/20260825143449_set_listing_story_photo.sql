/* ════════════════════════════════════════════════════════════════════════
   SET LISTING STORY PHOTO — the door that lets an EXISTING listing change
   which photograph accompanies its narrative.

   THE MISCONCEPTION THIS EXISTS TO KILL

   "The seller owns the row, so the app can just update it."
   It cannot. Two independent walls stop every client-session write to
   listings.photo_presentation, and both were verified against live
   production before this function was written:

     1. COLUMN GRANT — `authenticated` holds UPDATE on eleven columns of
        public.listings. photo_presentation is NOT one of them. A seller
        session cannot write that column at all, on any row, ever.

     2. ROW POLICY — listings_update_own is
          USING (auth.uid() = seller_id AND status IN ('draft','rejected'))
        so even a granted column would be unwritable on a PUBLISHED listing,
        which is precisely the case this capability is for.

   That is why the choice was, until now, creation-only: POST /api/listings
   writes photo_presentation once, as the service role, at insert time, and
   nothing in the product could ever change it afterwards.

   This function is the narrow, purpose-named door — the same shape the repo
   already uses for the other post-creation seller acts
   (submit_listing_for_review, remove_listing): SECURITY DEFINER, empty
   search_path, EXECUTE to authenticated only, and its own explicit checks
   carried INSIDE so no other caller can walk around them.

   WHAT IT WILL AND WILL NOT DO

   · It changes exactly one key. heroPathname, frames, and the tolerated v1
     top-level focal fields are carried across untouched — the merge is a
     jsonb_set on one path, never a replacement of the record.
   · It refuses a pathname that does not belong to THIS listing. The read
     side (resolveStoryIndex) already degrades a foreign value to fallback,
     but a reader that copes is not the same as a writer that refuses, and
     only the writer can tell the seller their choice did not take.
   · It never touches status, photos, price, or any commercial-truth column,
     so no lifecycle event, saved-search evaluation, publication notice, or
     review transition can fire from it. Verified: every listings trigger
     that could ring is either AFTER UPDATE OF status or guarded by an
     OLD.status IS DISTINCT FROM check.
   · It is OWNER-ONLY. remove_listing admits the founder because a removal
     is an administrative act; choosing which photograph tells a watch's
     story is editorial and belongs to the seller alone.

   WHY NO STATUS GATE

   A Story Photo selection adds no image, removes no image, and alters no
   claim — it chooses among photographs this listing already published and
   that review already saw. Gating it to draft/rejected would recreate the
   exact hole this closes.

   NO SCHEMA CHANGE. listings_photo_presentation_check already admits
   storyPathname (20260824215910) and its string-or-null guard still does the
   type work. Nothing here loosens it.

   PFC274 = 62 — Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

CREATE OR REPLACE FUNCTION public.set_listing_story_photo(
  p_listing_id uuid,
  p_pathname   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_listing public.listings%ROWTYPE;
  v_path    text;
  v_pres    jsonb;
  v_new     jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_listing FROM public.listings
   WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  /* Editorial, not administrative — see the header. */
  IF v_listing.seller_id <> v_caller THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  /* An absent, empty, or whitespace pathname is the CLEAR instruction, not
     an error. 512 matches the reader's own boundPath cap so a value that
     survives here cannot be one the sanitizer would later truncate. */
  v_path := left(nullif(btrim(coalesce(p_pathname, '')), ''), 512);

  /* THE OWNERSHIP CHECK THE COLUMN CANNOT MAKE. photo_presentation has no
     visibility into listings.photos and no FK is possible — a pathname is
     not a row — so the comparison happens here, against THIS listing's own
     photographs, while the row is locked. */
  IF v_path IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_listing.photos) = 'array'
                  THEN v_listing.photos ELSE '[]'::jsonb END) AS e
     WHERE e -> 'photo' ->> 'pathname' = v_path
  ) THEN
    RAISE EXCEPTION 'photo_not_in_listing';
  END IF;

  v_pres := coalesce(v_listing.photo_presentation, '{}'::jsonb);

  IF v_path IS NULL THEN
    /* Removed, not nulled: "the seller cleared it" and "the key was never
       written" must read identically to the sanitizer, and dropping the key
       is the smaller record. */
    v_pres := v_pres - 'storyPathname';
  ELSE
    v_pres := jsonb_set(v_pres, '{storyPathname}', to_jsonb(v_path), true);
  END IF;

  /* The create route's honesty rule, applied to updates: a presentation that
     now carries no seller choice at all is stored as NULL rather than as an
     object full of nulls. The leftover test preserves any v1 top-level focal
     field, which would still be a real choice. */
  IF (v_pres - ARRAY['heroPathname', 'storyPathname', 'frames']) = '{}'::jsonb
     AND coalesce(jsonb_typeof(v_pres -> 'heroPathname'), 'null') = 'null'
     AND coalesce(jsonb_typeof(v_pres -> 'storyPathname'), 'null') = 'null'
     AND coalesce(v_pres -> 'frames', '{}'::jsonb) = '{}'::jsonb
  THEN
    v_new := NULL;
  ELSE
    v_new := v_pres;
  END IF;

  UPDATE public.listings
     SET photo_presentation = v_new
   WHERE id = p_listing_id;

  RETURN jsonb_build_object(
    'listing_id',     p_listing_id,
    'story_pathname', v_path
  );
END $function$;

REVOKE ALL ON FUNCTION public.set_listing_story_photo(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_listing_story_photo(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_listing_story_photo(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.set_listing_story_photo(uuid, text) IS
  'Seller-owned post-creation choice of which of a listing''s own photographs accompanies Story / Provenance. Owner-only, validates the pathname against that listing''s photos, merges one key and preserves heroPathname and frames. The only writer of photo_presentation after insert - authenticated has no UPDATE grant on that column.';
