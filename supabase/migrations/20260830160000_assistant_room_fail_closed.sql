/* ════════════════════════════════════════════════════════════════════════
   ADMIN ASSISTANT — ROOM IDENTITY FAILS CLOSED                    (v7.59)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Fixing the resolver fixes the fallback."

   It fixes one of two. The application resolver returned `founder_review`
   for any unrecognized input, and that is now a refusal. But the COLUMN
   carried the same fallback independently:

     room text not null default 'founder_review'

   so any writer that inserts a session without naming a room still lands in
   Founder Review silently — a second fail-open surface, in the storage layer,
   surviving every repair made in TypeScript.

   > Wrong room is an error, not a default.

   Dropping the default converts that silence into a NOT NULL violation. The
   route has always passed `room` explicitly on insert, so nothing that exists
   today changes behaviour; what changes is that the next writer who forgets
   cannot be quietly filed under Founder Review.

   WHY THE COLUMN STAYS NOT NULL: a nullable room would replace one silent
   wrong answer with a silent absent one. A session must know its room.

   WHY THE CHECK IS NOT WIDENED HERE: the constraint still admits only
   `founder_review` and `marketplace_control` — the rooms with a live adapter.
   A room key becomes storable when its adapter lands, by migration, never in
   advance. Naming a room in the architecture registry is not permission to
   persist a session in it.

   DELIBERATELY NOT BUILT:
     · no backfill — every existing row was created after the column existed
       and carries a genuinely recorded room, verified before this migration;
     · no remap of any historical row;
     · no widening of the room vocabulary.

   Verify current state:
     select room, status, count(*) from public.assistant_work_sessions
      group by 1,2 order by 1,2;
     select column_default from information_schema.columns
      where table_name='assistant_work_sessions' and column_name='room';
   ════════════════════════════════════════════════════════════════════════ */

alter table public.assistant_work_sessions
  alter column room drop default;

comment on column public.assistant_work_sessions.room is
  'Which room the conversation belongs to. NOT NULL with NO default: an '
  'insert that does not name a room fails rather than defaulting into '
  'Founder Review. Vocabulary widens by migration as each adapter lands.';
