/* ════════════════════════════════════════════════════════════════════════
   LISTING DRAFT — SET ASIDE                                       (v7.56)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Setting a draft aside deletes it."

   It does not, and it must never be made to. Set-aside is a LIFECYCLE
   state, not a deletion: the row, its content, its photos and its revision
   history are all untouched. The only thing that changes is that the draft
   stops competing to be the one the Sell page opens on.

   WHY THIS EXISTS AT ALL:

   A draft could only ever leave 'active' by being PUBLISHED. There was no
   state for "I am finished with this one but did not list it", so active
   drafts accumulated forever — 94 of them across the project when this was
   written, 75 on the founder's own account. Because the Sell page resumes
   `status='active' ORDER BY updated_at DESC LIMIT 1`, whichever draft
   anybody touched last owned the Sell page permanently, and a seller had no
   way to reach a clean listing.

   This was not theoretical. A family member signed into the same account on
   another machine, began a listing, and that partial listing then opened on
   the founder's computer when he clicked Sell. Account-backed persistence
   across devices is deliberate and is preserved; what was missing was the
   door out of it.

   DELIBERATELY NOT BUILT:
     · no delete — the seller's prior work survives, always;
     · no cascade to photos or listings;
     · no automatic set-aside on a timer or on count. A draft leaves the
       pool because a person said so, never because a heuristic decided the
       seller had too many.

   A published draft is already out of the resume pool, so setting one aside
   is refused rather than silently accepted — it would imply the publication
   had been undone.

   THE STATUS WRITTEN IS 'abandoned', NOT A NEW VALUE. The status CHECK has
   always permitted 'active', 'published' and 'abandoned', and DraftLifecycle
   already declares all three — the third was simply never written by anything.
   Reusing it needs no schema change at all, which is the smallest safe move;
   widening the constraint to add a synonym would have been pure ceremony.
   'Set aside' is the seller-facing word for the act because the row survives
   it; 'abandoned' is the schema's existing word for the state.

   Verify current state:
     select status, count(*) from public.listing_drafts group by 1;
   ════════════════════════════════════════════════════════════════════════ */

create or replace function public.listing_draft_set_aside(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_uid uuid := auth.uid(); r public.listing_drafts%rowtype;
begin
  if v_uid is null then return jsonb_build_object('state','AUTH_REQUIRED'); end if;
  select * into r from public.listing_drafts where id = p_draft_id for update;
  if not found or r.seller_id <> v_uid then return jsonb_build_object('state','DENIED'); end if;
  if r.status = 'published' then
    return jsonb_build_object('state','ALREADY_PUBLISHED','listing_id', r.listing_id);
  end if;
  if r.status = 'abandoned' then
    return jsonb_build_object('state','ALREADY_SET_ASIDE');
  end if;
  /* Any live phone handoff dies with the set-aside: a token pointing at a
     draft the seller has stepped away from is an invitation to edit work
     that is no longer in front of anyone. Same clearing mark_published uses. */
  update public.listing_drafts
     set status = 'abandoned', handoff_token = null,
         handoff_status = 'none', active_editor = 'desktop', updated_at = now()
   where id = r.id;
  return jsonb_build_object('state','SET_ASIDE');
end $function$;

revoke all on function public.listing_draft_set_aside(uuid) from public;
grant execute on function public.listing_draft_set_aside(uuid) to authenticated;
