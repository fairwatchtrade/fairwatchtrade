/* ════════════════════════════════════════════════════════════════════════
   LISTING DRAFT — RESUME                                          (v7.58)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Set-aside drafts are recoverable, so the seller can get them back."

   They were recoverable in the sense that nothing was destroyed. They were
   not reachable. v7.56 built the door OUT of the resume pool and there was
   no door back in: a set-aside draft kept every word and every photograph
   and no seller-facing path led to it. Preserved and unreachable is not
   recoverable — it is a promise the product could not keep.

   This is the other half. `listing_draft_resume` returns a draft to the
   pool so the seller's explicit choice is the thing that decides which
   draft opens.

   WHY THE UPDATE TOUCHES `updated_at`:

   The Sell page opens on `status='active' ORDER BY updated_at DESC LIMIT 1`.
   Resuming without restamping would set a draft active and then hand the
   page to a DIFFERENT draft that happened to be edited more recently —
   the seller's explicit selection silently overruled by an ordering rule.
   Restamping makes the chosen draft the one that opens, which is the whole
   point of choosing it. Ordering stays useful for presentation; it stops
   being the authority.

   WHY IT TOUCHES NOTHING ELSE:

   `handoff_token`, `handoff_status` and `active_editor` are deliberately
   left alone. A set-aside draft already had its handoff cleared by
   listing_draft_set_aside, and an ALREADY-ACTIVE draft may be mid-handoff
   with the phone holding the baton. Resetting authority here would yank a
   live capture session out from under a seller standing at their bench with
   the phone in their hand.

   DELIBERATELY NOT BUILT:
     · no un-publish — a published draft is refused, exactly as set-aside
       refuses it, because succeeding would imply the publication came undone;
     · no automatic resume, on a timer, a count, or a heuristic. A draft
       re-enters the pool because a person said so;
     · no set-aside of whatever draft was open at the time. Switching must
       preserve the draft being left, and silently retiring it would be the
       same invisible authority this round exists to remove.

   Verify current state:
     select status, count(*) from public.listing_drafts group by 1;
   ════════════════════════════════════════════════════════════════════════ */

create or replace function public.listing_draft_resume(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_uid uuid := auth.uid(); r public.listing_drafts%rowtype;
begin
  if v_uid is null then return jsonb_build_object('state','AUTH_REQUIRED'); end if;

  select * into r from public.listing_drafts where id = p_draft_id for update;
  if not found or r.seller_id <> v_uid then
    return jsonb_build_object('state','DENIED');
  end if;

  if r.status = 'published' then
    return jsonb_build_object('state','ALREADY_PUBLISHED','listing_id', r.listing_id);
  end if;

  update public.listing_drafts
     set status = 'active', updated_at = now()
   where id = r.id;

  return jsonb_build_object('state','RESUMED','revision', r.revision);
end $function$;

revoke all on function public.listing_draft_resume(uuid) from public;
revoke all on function public.listing_draft_resume(uuid) from anon;
grant execute on function public.listing_draft_resume(uuid) to authenticated;
grant execute on function public.listing_draft_resume(uuid) to service_role;

comment on function public.listing_draft_resume(uuid) is
  'Return a listing draft to the resume pool on the seller''s explicit choice. '
  'Sets status=active and restamps updated_at so the chosen draft is the one '
  'the Sell page opens. Refuses published drafts. Leaves handoff state alone.';
