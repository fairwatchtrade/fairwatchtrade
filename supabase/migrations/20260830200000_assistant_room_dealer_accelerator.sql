/* ════════════════════════════════════════════════════════════════════════
   ADMIN ASSISTANT — DEALER ACCELERATOR JOINS THE ROOM VOCABULARY  (v7.64)

   Dealer Accelerator gains a live adapter, so its key becomes storable. The
   vocabulary widens by migration and never in advance: naming a room in the
   architecture registry is not permission to persist a session, thread, or
   obligation in it. Three tables carry room vocabulary and all three widen
   together, or a thread could originate somewhere its session cannot exist.

   TIER A, AND THE SCHEMA SAYS SO BY OMISSION. No operation is added to the
   receipt allowlist for this room. Dealer Accelerator can SEE, EXPLAIN and
   CONTINUE; it performs no mutation, and the receipt CHECK still admits only
   approve_listings and remove_listing. A room without DO is useful and
   honest, and inventing a mutation to reach a tier is forbidden.

   Verify current state:
     select conname, pg_get_constraintdef(oid) from pg_constraint
      where conname in ('aws_room_check','aot_origin_room_check',
                        'aot_current_room_check','aol_source_room_check');
   ════════════════════════════════════════════════════════════════════════ */

alter table public.assistant_work_sessions drop constraint aws_room_check;
alter table public.assistant_work_sessions
  add constraint aws_room_check
    check (room in ('founder_review', 'marketplace_control', 'dealer_accelerator'));

alter table public.assistant_operational_threads drop constraint aot_origin_room_check;
alter table public.assistant_operational_threads
  add constraint aot_origin_room_check
    check (origin_room in ('founder_review', 'marketplace_control', 'dealer_accelerator'));

alter table public.assistant_operational_threads drop constraint aot_current_room_check;
alter table public.assistant_operational_threads
  add constraint aot_current_room_check
    check (current_room is null
           or current_room in ('founder_review', 'marketplace_control', 'dealer_accelerator'));

alter table public.assistant_open_loops drop constraint aol_source_room_check;
alter table public.assistant_open_loops
  add constraint aol_source_room_check
    check (source_room in ('founder_review', 'marketplace_control', 'dealer_accelerator'));
