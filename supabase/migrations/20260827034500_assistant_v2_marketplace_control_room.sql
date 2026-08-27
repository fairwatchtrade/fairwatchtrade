/* ════════════════════════════════════════════════════════════════════════
   PERSISTENT ADMIN ASSISTANT V2 — the second room               (v6.89)

   The Assistant gains Marketplace Control. It does NOT gain a second
   framework: same gate, same session table, same receipts, same
   propose → preview → confirm → execute → report loop. What is new is a
   room key, one operation, and two constraints that make the round's
   refusals structural instead of habitual.

   WHY ROOM IS A COLUMN AND NOT AN INFERENCE

   A session carries a conversation and at most one pending plan. Without a
   room, resuming in Marketplace Control would surface the Founder Review
   conversation — and worse, a pending approval plan could be confirmed from
   a room whose operation is removal. The column scopes the resume; the route
   additionally refuses a plan whose operation does not belong to the room it
   is being confirmed from. Two independent checks, neither trusting the
   other.

   NO BATCH REMOVE — ENFORCED, NOT INTENDED

   Taking a watch off the market is a single-listing act under explicit
   confirmation. approve_listings keeps its multi-id shape because a
   confirmed approval set was always N independent governed calls, each
   recorded on its own. remove_listing gets a cardinality CHECK, because a
   rule that lives only in application code is a rule the next caller can
   forget.

   PFC274 = 62 — Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

alter table public.assistant_work_sessions
  add column room text not null default 'founder_review';

alter table public.assistant_work_sessions
  add constraint aws_room_check
    check (room in ('founder_review', 'marketplace_control'));

drop index if exists public.assistant_work_sessions_owner_open_idx;
create index assistant_work_sessions_owner_room_open_idx
  on public.assistant_work_sessions (owner_uid, room, updated_at desc)
  where status = 'open';

comment on column public.assistant_work_sessions.room is
  'Which room the conversation belongs to. Existing sessions default to founder_review, which is where every session before v6.89 was held.';

-- The allowlist widens by migration, never by a drive-by edit.
alter table public.assistant_operation_receipts drop constraint aor_operation_check;
alter table public.assistant_operation_receipts
  add constraint aor_operation_check
    check (operation in ('approve_listings', 'remove_listing'));

alter table public.assistant_operation_receipts
  add constraint aor_remove_is_single_listing_check
    check (operation <> 'remove_listing' or cardinality(requested_listing_ids) = 1);
