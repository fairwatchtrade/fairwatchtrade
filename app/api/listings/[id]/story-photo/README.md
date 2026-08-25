# Story Photo — the whole chain

**The misconception this file exists to kill:** *"The seller owns the row, so
changing a listing's Story Photo is an UPDATE."*

It is not, and discovering why costs about half an hour. Two independent walls
stop every client-session write to `listings.photo_presentation`:

1. **Column grant.** `authenticated` holds `UPDATE` on a short list of
   `public.listings` columns. `photo_presentation` is not on it — so a seller
   session cannot write that column on any row, in any state.
2. **Row policy.** `listings_update_own` is
   `USING (auth.uid() = seller_id AND status IN ('draft','rejected'))`, so even
   a granted column would be unwritable on a **published** listing — which is
   the case this capability exists for.

Verify both, current:

```sql
select column_name from information_schema.column_privileges
 where table_schema='public' and table_name='listings'
   and grantee='authenticated' and privilege_type='UPDATE'
 order by 1;

select polname, pg_get_expr(polqual, polrelid)
  from pg_policy p join pg_class c on c.oid=p.polrelid
 where c.relname='listings';
```

That is why the choice was creation-only until 2026-08-25: `POST /api/listings`
writes the record once, as the service role, at insert.

## The five links

| Link | Where | What it owns |
|---|---|---|
| Contract + type guard | `supabase/migrations/*_photo_presentation_story_photo.sql` | `storyPathname` is admitted to the `photo_presentation` allowlist; string or null, nothing else |
| Sanitizer + resolver | `lib/photoPresentation.ts` | `sanitizePhotoPresentation`, `withStoryPhoto`, `resolveStoryIndex` |
| Writer (post-creation) | `supabase/migrations/*_set_listing_story_photo.sql` | the **only** writer of `photo_presentation` after insert |
| Route | this folder's `route.ts` | thin RPC wrapper; refusals → seller sentences |
| Controls | `components/PhotoPresentationEditor.tsx` (creation), `components/StoryPhotoPicker.tsx` (after) | the two places a seller chooses |
| Reader | `app/listings/[id]/page.tsx`, `From the Seller` | renders the chosen photograph, or the automatic one |

## Properties that will not age

- **Compares, never dereferences.** `resolveStoryIndex` matches the stored
  pathname against *this listing's own* photographs. A deleted photo and a
  pathname belonging to another listing both simply fail to match and fall back.
  There is no dangling reference to clean up, and cross-listing protection is
  **not** database-enforced — do not describe it as such.
- **The automatic rule has one home.** It lives at the reader, and
  `resolveStoryIndex` takes the automatic index as an argument rather than
  re-deriving it. Nothing else may compute "the best non-hero photograph" — a
  second definition is the drift this shape exists to prevent. The picker
  deliberately does not badge which photograph the fallback would pick.
- **The picker offers only publicly displayable photographs.** An un-opted-in
  Service Evidence document is filtered out of the listing page before the Story
  Photo is resolved, so offering it would let a seller save a choice that never
  appears and never says why. Both sides consume
  `lib/servicePhotoPrivacy` — one rule, one definition.
- **Empty means NULL.** Clearing removes the key, and a record left carrying no
  seller choice at all is written as `NULL`, not as an object full of nulls.
- **No commercial-truth column moves.** The writer touches
  `photo_presentation` only, so no lifecycle event, saved-search evaluation,
  publication notice, or review transition can fire from it. Every `listings`
  trigger that rings is either `AFTER UPDATE OF status` or guarded by an
  `OLD.status IS DISTINCT FROM` check — re-check with:

```sql
select tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
 where c.relname='listings' and not t.tgisinternal;
```

## Deliberately NOT built

- **No general listing editor.** This door writes one key. A second editable
  field earns its own named door with its own checks — not a `fields` parameter
  here.
- **No status gate on the writer.** A Story Photo adds no image, removes none,
  and alters no claim; it chooses among photographs the listing already
  published and review already saw. Gating it to draft/rejected would recreate
  the hole this closes.
- **No founder override.** `remove_listing` admits the founder because removal
  is administrative. Choosing which photograph tells a watch's story is
  editorial and belongs to the seller alone.
- **No new column.** The record already was the governed seller-photo-choice
  contract; a second column would be a second authority over the same fact.

## Current state

```sql
select public_code, status, photo_presentation->>'storyPathname' as story
  from listings
 where photo_presentation ? 'storyPathname'
 order by updated_at desc;
```
