/* ════════════════════════════════════════════════════════════════════════
   PERSISTENT ADMIN ASSISTANT — OPERATIONAL THREAD FOUNDATION      (v7.60)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "assistant_work_sessions already stores the conversation, so it is the
      thread."

   It is not, and it must never be turned into one. A work session is a
   ROOM-SCOPED CONVERSATION: it holds messages and at most one pending plan,
   it is created fresh per room, and it has no concept of the work continuing
   somewhere else. An Operational Thread is the opposite kind of object — it
   is what the founder is DOING, it outlives any one room, and rooms are
   something that happens to it.

   > Persist what Jason is doing. Re-read what FairWatchTrade contains.

   ── FOUR TABLES, AND WHY THEY ARE NOT ONE ───────────────────────────────

     assistant_operational_threads       what the work IS
     assistant_thread_events             what HAPPENED to the work
     assistant_thread_anchors            which governed objects it concerns
     assistant_thread_anchor_relations   why those objects are one story
     assistant_open_loops                what remains unfinished

   Thread history and operation receipts are deliberately separate tables
   answering different questions. Thread history proves WHAT THE FOUNDER WAS
   DOING. A receipt proves WHAT GOVERNED MUTATION HAPPENED. Conflating them
   would make a product mutation look like a navigation, or worse, let a
   conversation event masquerade as evidence of a write.

   ── THE ANCHOR TABLE HAS NO PRODUCT-STATE COLUMNS, ON PURPOSE ───────────

   No status. No label. No count. No eligibility. No title. Not because a
   writer is trusted to leave them alone, but because there is nowhere to put
   them: an anchor is `type + canonical id`, and current meaning is re-read
   from the governed system every time. A cached display label rendered as
   current truth is the exact failure this product exists to prevent.

   > Anchors identify the objects. Relationships identify why those objects
   > belong to the same work.

   ── NO "NEWEST ACTIVE WINS" ─────────────────────────────────────────────

   There is deliberately NO unique constraint limiting a founder to one
   ACTIVE thread. Real admin days contain several live problems at once, and
   a hidden single-thread rule is how a product silently picks for the user.
   Selection is a deliberate founder act, made through a visible surface.

   ── OPEN LOOPS BLOCK SILENT CLOSURE, STRUCTURALLY ───────────────────────

   A thread carrying unresolved obligations cannot become COMPLETE. That is a
   TRIGGER, not a convention in application code, because the whole point of
   the rule is that it must survive the next writer who does not know it.
   Closing the conversation must never erase unfinished work.

   ── LEGACY IS NOT MIGRATED ──────────────────────────────────────────────

   No foreign key to assistant_work_sessions. No backfill. No timestamp
   proximity merge. No invented room, thread, anchor, or handoff reason for
   any historical session. Operational Threads begin at this boundary and
   carry nothing backwards. Existing sessions remain readable exactly as the
   legacy session history they are.

   Verify current state:
     select status, count(*) from public.assistant_operational_threads group by 1;
     select event_type, count(*) from public.assistant_thread_events group by 1;
     select state, count(*) from public.assistant_open_loops group by 1;
   ════════════════════════════════════════════════════════════════════════ */

-- ═════ 1 · THE THREAD ═════════════════════════════════════════════════════

create table public.assistant_operational_threads (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references auth.users(id) on delete restrict,

  status text not null default 'ACTIVE',

  /* Founder-facing human identity. This is how a thread is told apart on the
     selection surface, so it may never be a UUID or an internal code. It
     describes the WORK, not any object's current state. */
  title text,

  /* What the founder is trying to accomplish. Intent may name what is
     unresolved; it may never assert the current state of the unresolved
     thing. "Determine whether the identity blocker can be resolved" is
     intent. "These two serials are still conflicting" is a product fact and
     belongs to the system that owns it. */
  operational_intent text,

  origin_room text not null,
  current_room text,

  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz,
  closed_by uuid references auth.users(id) on delete restrict,

  constraint aot_status_check check (status in ('ACTIVE', 'PAUSED', 'COMPLETE')),

  /* COMPLETE is always deliberate and always attributable. A thread cannot
     drift into completion without a time and a person attached to it. */
  constraint aot_complete_pairing_check
    check ((status = 'COMPLETE') = (completed_at is not null)),
  constraint aot_complete_needs_closer_check
    check (status <> 'COMPLETE' or closed_by is not null),

  /* Rooms widen by migration as adapters land — the same posture as the
     session table. A thread cannot originate in a room with no adapter. */
  constraint aot_origin_room_check
    check (origin_room in ('founder_review', 'marketplace_control')),
  constraint aot_current_room_check
    check (current_room is null or current_room in ('founder_review', 'marketplace_control'))
);

/* Deliberately NOT unique on (owner_uid, status): multiple ACTIVE and PAUSED
   threads are legitimate and the product must not pick between them. */
create index assistant_threads_owner_live_idx
  on public.assistant_operational_threads (owner_uid, last_activity_at desc)
  where status in ('ACTIVE', 'PAUSED');

comment on table public.assistant_operational_threads is
  'What the founder is working on across Admin rooms. Never a copy of product state: intent and identity only, with current facts re-read from their governing systems. Multiple ACTIVE/PAUSED threads per founder are legitimate and no newest-wins rule exists.';

-- ═════ 2 · THREAD HISTORY — append-only, distinct from receipts ═══════════

create table public.assistant_thread_events (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null
    references public.assistant_operational_threads(id) on delete restrict,
  event_type text not null,
  at timestamptz not null default now(),
  actor_uid uuid not null references auth.users(id) on delete restrict,

  from_room text,
  to_room text,

  /* Why the work moved. Historical context, never a durable assertion that
     the reason still holds — the destination re-reads current truth and may
     find the reason already answered. */
  reason_for_moving text,

  /* Event-shaped metadata only. Never product state. */
  detail jsonb not null default '{}'::jsonb,

  constraint ate_event_type_check check (event_type in (
    'THREAD_CREATED',
    'THREAD_ACTIVATED',
    'THREAD_PAUSED',
    'THREAD_COMPLETED',
    'THREAD_SWITCHED',
    'ROOM_HANDOFF',
    'ROOM_HANDOFF_FAILED',
    'ANCHOR_ADDED',
    'ANCHOR_REMOVED',
    'RELATION_ADDED',
    'RELATION_REMOVED',
    'OPEN_LOOP_CREATED',
    'OPEN_LOOP_RESOLVED',
    'OPEN_LOOP_DISMISSED',
    'OPEN_LOOP_CARRIED_FORWARD',
    'UNRECEIPTED_OPERATION',
    'RECEIPT_RECONCILED'
  ))
);

create index assistant_thread_events_thread_idx
  on public.assistant_thread_events (thread_id, at desc);

/* Same posture as assistant_operation_receipts: append-only enforced at the
   row against every role including the owner and service_role. History that
   can be revised is not history. */
create or replace function public.assistant_thread_events_are_append_only()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception 'assistant_thread_events_are_append_only';
end
$fn$;

revoke all on function public.assistant_thread_events_are_append_only()
  from public, anon, authenticated, service_role;

create trigger assistant_thread_events_immutable
  before update or delete on public.assistant_thread_events
  for each row execute function public.assistant_thread_events_are_append_only();

comment on table public.assistant_thread_events is
  'Append-only history of what the founder was DOING. Distinct from assistant_operation_receipts, which prove what governed product mutation happened. Never product-state authority.';

-- ═════ 3 · TYPED OBJECT ANCHORS — identity, never state ═══════════════════

create table public.assistant_thread_anchors (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null
    references public.assistant_operational_threads(id) on delete restrict,

  object_type text not null,
  /* The canonical stable identifier in the governing system. Text rather
     than uuid because not every governed identity is a uuid (an auction lot
     is addressed differently from a listing), and coercing them would invent
     an identifier shape the owning system does not use. */
  object_id text not null,

  source_room text,
  added_at timestamptz not null default now(),
  removed_at timestamptz,

  constraint ata_object_type_check check (object_type in (
    'listing',
    'physical_watch',
    'passport_bead',
    'auction_sale',
    'auction_lot',
    'seller',
    'dealer',
    'review_case'
  )),
  constraint ata_object_id_not_blank_check check (btrim(object_id) <> '')
);

/* One live anchor per object per thread. Re-adding a removed anchor is a new
   row, so the history of what was in the work and when stays legible. */
create unique index assistant_thread_anchors_live_unique_idx
  on public.assistant_thread_anchors (thread_id, object_type, object_id)
  where removed_at is null;

create index assistant_thread_anchors_thread_idx
  on public.assistant_thread_anchors (thread_id) where removed_at is null;

comment on table public.assistant_thread_anchors is
  'Governed objects a thread concerns: type plus canonical identifier and nothing else. There is deliberately no status, label, count or eligibility column — current meaning is re-read from the owning system on every turn, so a stale cached fact has nowhere to live.';

-- ═════ 4 · RELATIONSHIPS — why two anchors are one story ══════════════════

create table public.assistant_thread_anchor_relations (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null
    references public.assistant_operational_threads(id) on delete restrict,
  from_anchor_id uuid not null
    references public.assistant_thread_anchors(id) on delete restrict,
  to_anchor_id uuid not null
    references public.assistant_thread_anchors(id) on delete restrict,
  relation text not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,

  constraint atar_relation_check check (relation in (
    'concerns_physical_watch',
    'evidenced_by',
    'contains',
    'sold_by',
    'imported_owns'
  )),
  constraint atar_no_self_relation_check check (from_anchor_id <> to_anchor_id)
);

create unique index assistant_thread_relations_live_unique_idx
  on public.assistant_thread_anchor_relations (from_anchor_id, to_anchor_id, relation)
  where removed_at is null;

comment on table public.assistant_thread_anchor_relations is
  'Explicit meaning between two anchors in the same thread. Without this, two co-located anchors would be assumed to belong to the same story merely because they coexist.';

-- ═════ 5 · OPEN LOOPS — the obligation, never a stale fact ════════════════

create table public.assistant_open_loops (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null
    references public.assistant_operational_threads(id) on delete restrict,

  obligation_type text not null,
  /* What the founder undertook to resolve. Like intent, this remembers the
     obligation and may not assert the current state of the thing owed. */
  founder_intent text,
  source_room text not null,

  state text not null default 'OPEN',
  created_at timestamptz not null default now(),
  disposed_at timestamptz,
  disposed_by uuid references auth.users(id) on delete restrict,
  disposition text,

  constraint aol_state_check check (state in ('OPEN', 'RESOLVED', 'DISMISSED')),
  constraint aol_disposed_pairing_check
    check ((state = 'OPEN') = (disposed_at is null)),
  /* A loop leaving OPEN always records who decided and what they decided.
     A loop cannot be closed by nobody, for no stated reason. */
  constraint aol_disposition_requires_actor_check
    check (state = 'OPEN' or (disposed_by is not null and btrim(coalesce(disposition,'')) <> '')),
  constraint aol_source_room_check
    check (source_room in ('founder_review', 'marketplace_control'))
);

create index assistant_open_loops_thread_open_idx
  on public.assistant_open_loops (thread_id) where state = 'OPEN';

comment on table public.assistant_open_loops is
  'Unresolved operational obligations. Remembers the obligation, never a stale claim about its state — whether the obligation is genuinely satisfied is established by re-reading current truth, not by this row.';

/* Anchors an Open Loop concerns. Separate table so a loop may involve
   several governed objects without duplicating anchor identity. */
create table public.assistant_open_loop_anchors (
  loop_id uuid not null
    references public.assistant_open_loops(id) on delete restrict,
  anchor_id uuid not null
    references public.assistant_thread_anchors(id) on delete restrict,
  primary key (loop_id, anchor_id)
);

-- ═════ 6 · CLOSURE LAW — unresolved loops block COMPLETE ══════════════════

/* The rule that must survive the next writer who has not read this file.
   Application code enforcing it would be a convention; a trigger is a
   property. */
create or replace function public.assistant_thread_closure_guard()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_open int;
begin
  if new.status = 'COMPLETE' and coalesce(old.status, '') <> 'COMPLETE' then
    select count(*) into v_open
      from public.assistant_open_loops
     where thread_id = new.id and state = 'OPEN';
    if v_open > 0 then
      raise exception
        'assistant_thread_has_unresolved_open_loops: % open loop(s) must be resolved, dismissed, or carried forward before this thread can be completed',
        v_open;
    end if;
  end if;
  return new;
end
$fn$;

revoke all on function public.assistant_thread_closure_guard()
  from public, anon, authenticated, service_role;

create trigger assistant_thread_closure_blocks_open_loops
  before update on public.assistant_operational_threads
  for each row execute function public.assistant_thread_closure_guard();

-- ═════ 7 · ACCESS — server-only, same posture as the session table ════════

alter table public.assistant_operational_threads enable row level security;
alter table public.assistant_thread_events enable row level security;
alter table public.assistant_thread_anchors enable row level security;
alter table public.assistant_thread_anchor_relations enable row level security;
alter table public.assistant_open_loops enable row level security;
alter table public.assistant_open_loop_anchors enable row level security;

revoke all on public.assistant_operational_threads from public, anon, authenticated, service_role;
revoke all on public.assistant_thread_events from public, anon, authenticated, service_role;
revoke all on public.assistant_thread_anchors from public, anon, authenticated, service_role;
revoke all on public.assistant_thread_anchor_relations from public, anon, authenticated, service_role;
revoke all on public.assistant_open_loops from public, anon, authenticated, service_role;
revoke all on public.assistant_open_loop_anchors from public, anon, authenticated, service_role;

grant select, insert, update on public.assistant_operational_threads to service_role;
grant select, insert on public.assistant_thread_events to service_role;
grant select, insert, update on public.assistant_thread_anchors to service_role;
grant select, insert, update on public.assistant_thread_anchor_relations to service_role;
grant select, insert, update on public.assistant_open_loops to service_role;
grant select, insert, delete on public.assistant_open_loop_anchors to service_role;
