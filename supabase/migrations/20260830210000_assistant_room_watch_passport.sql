/* ════════════════════════════════════════════════════════════════════════
   ADMIN ASSISTANT — WATCH PASSPORT JOINS THE ROOM VOCABULARY      (v7.65)

   Fourth room, Tier A. Passport is a PURE PROJECTION with zero writes — it
   has no table, no snapshot, and no correction layer, and every render is
   derived from the governed sources. So the receipt allowlist is again left
   untouched: no operation is added for this room and none should ever be.

   A room whose entire value is read-only evidence must not acquire a
   mutation to satisfy a tier. Tier A is the honest ceiling here, not a
   shortfall, and §20 of the order says so outright: do not manufacture a
   mutation.

   All three room-vocabulary tables widen together, for the same reason as
   the last room: a thread that can originate where its session cannot exist
   is broken, not partial.

   Verify current state:
     select conname, pg_get_constraintdef(oid) from pg_constraint
      where conname in ('aws_room_check','aot_origin_room_check',
                        'aot_current_room_check','aol_source_room_check',
                        'aor_operation_check');
   ════════════════════════════════════════════════════════════════════════ */

alter table public.assistant_work_sessions drop constraint aws_room_check;
alter table public.assistant_work_sessions
  add constraint aws_room_check
    check (room in ('founder_review', 'marketplace_control', 'dealer_accelerator', 'watch_passport'));

alter table public.assistant_operational_threads drop constraint aot_origin_room_check;
alter table public.assistant_operational_threads
  add constraint aot_origin_room_check
    check (origin_room in ('founder_review', 'marketplace_control', 'dealer_accelerator', 'watch_passport'));

alter table public.assistant_operational_threads drop constraint aot_current_room_check;
alter table public.assistant_operational_threads
  add constraint aot_current_room_check
    check (current_room is null
           or current_room in ('founder_review', 'marketplace_control', 'dealer_accelerator', 'watch_passport'));

alter table public.assistant_open_loops drop constraint aol_source_room_check;
alter table public.assistant_open_loops
  add constraint aol_source_room_check
    check (source_room in ('founder_review', 'marketplace_control', 'dealer_accelerator', 'watch_passport'));
