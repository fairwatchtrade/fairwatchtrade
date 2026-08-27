/* ════════════════════════════════════════════════════════════════════════
   PERSISTENT ADMIN ASSISTANT V1 — attribution, receipts, work sessions

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "actor_uid already says who did it, so nothing new is needed."

   actor_uid says whose AUTHORITY a decision carried. It has never been able
   to say whether the founder's own hand performed the write or whether the
   founder's Assistant performed it on his instruction inside his session.
   Both are the founder's decision; only one is the founder's keystroke.
   These columns separate authority from execution without touching either
   existing truth system.

   ── THE THREE COLUMNS, ON BOTH ADJUDICATION TABLES ──────────────────────

     · authorized_by — who DECIDED. Populated by every live writer going
       forward. NULL on history, deliberately: an old row predates the
       separation of authority from execution, and that is true. Setting it
       to actor_uid would assert that someone recorded an authorization
       decision that was never recorded. NO BACKFILL. NOT ONE ROW.
     · executed_via — 'direct' or 'assistant'. Text + CHECK, matching the
       live actor_kind pattern; no enum type. DEFAULT 'direct' is safe on
       history because no other execution path has ever existed — it is the
       one of the three that history can honestly answer.
     · machinery — the exact code seam that performed the write
       ('status_route' | 'assistant_approve_listings'). NULL on history and
       on writers that predate the vocabulary (the triage seam is not
       touched by this round). No vocabulary CHECK: the authority for these
       names is lib/listingStatusTransition.ts, and duplicating it here
       would break the next honest writer against a stale copy.

   The value of executed_via is NEVER read from a request body, header,
   query parameter, or cookie. It is a hardcoded function argument at each
   call site of the shared transition handler — that is what makes it
   non-forgeable by anything holding the founder's session.

   ── WHAT IS DELIBERATELY NOT BUILT ──────────────────────────────────────

     · No backfill of authorized_by or machinery (see above).
     · No change to actor_uid, actor_kind, or their pairing CHECK.
     · No new status, decision vocabulary, or review action.
     · No multi-listing operation anywhere in the schema — a receipt stores
       the IDs of N independent single-listing calls, never a batch write.

   PFC274 = 62 — Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

-- ═════ 1 · ATTRIBUTION — listing_decision_events ══════════════════════════

alter table public.listing_decision_events
  add column authorized_by uuid,
  add column executed_via text not null default 'direct',
  add column machinery text;

/* Same FK posture as the sibling actor column (lde_actor_fk): auth.users,
   ON DELETE RESTRICT — an authorizer on record cannot be quietly deleted. */
alter table public.listing_decision_events
  add constraint lde_authorized_by_fk
    foreign key (authorized_by) references auth.users(id) on delete restrict;

alter table public.listing_decision_events
  add constraint lde_executed_via_check
    check (executed_via in ('direct', 'assistant'));

/* The pairing that makes assistant execution honest: an assistant-executed
   row without a recorded authorizer is not representable. */
alter table public.listing_decision_events
  add constraint lde_assistant_requires_authorizer_check
    check (executed_via <> 'assistant' or authorized_by is not null);

comment on column public.listing_decision_events.authorized_by is
  'Who decided. NULL on rows that predate the authority/execution separation — never backfilled.';
comment on column public.listing_decision_events.executed_via is
  'How the decision was executed: direct (the founder''s own hand) or assistant. A hardcoded function argument at each call site — never read from a request.';
comment on column public.listing_decision_events.machinery is
  'The exact code seam that performed the write. Vocabulary authority is lib/listingStatusTransition.ts.';

-- ═════ 2 · ATTRIBUTION — listing_integrity_reviews ════════════════════════

/* Written CONDITIONALLY — only when a review_action accompanies the
   transition. When the row IS written by an assistant-executed approve it
   must carry the same attribution; when no row is written, nothing here is
   populated and listing_decision_events alone carries the attribution.
   Attribution follows the write. It does not manufacture one. */

alter table public.listing_integrity_reviews
  add column authorized_by uuid,
  add column executed_via text not null default 'direct',
  add column machinery text;

/* Same FK target as the sibling resolved_by column: profiles. */
alter table public.listing_integrity_reviews
  add constraint lir_authorized_by_fk
    foreign key (authorized_by) references public.profiles(id);

alter table public.listing_integrity_reviews
  add constraint lir_executed_via_check
    check (executed_via in ('direct', 'assistant'));

alter table public.listing_integrity_reviews
  add constraint lir_assistant_requires_authorizer_check
    check (executed_via <> 'assistant' or authorized_by is not null);

comment on column public.listing_integrity_reviews.authorized_by is
  'Who decided. NULL on rows that predate the authority/execution separation — never backfilled.';
comment on column public.listing_integrity_reviews.executed_via is
  'How the decision was executed: direct or assistant. Hardcoded function argument — never read from a request.';
comment on column public.listing_integrity_reviews.machinery is
  'The exact code seam that performed the write. Vocabulary authority is lib/listingStatusTransition.ts.';

-- ═════ 3 · ASSISTANT WORK SESSIONS — working context, never Room Memory ═══

/* Carries the CONVERSATION between founder and Assistant, and at most one
   pending (unconfirmed) plan. It deliberately does NOT persist room state:
   no listing statuses, no queue contents, no counts. Resume is always a
   re-read from production — a resumed session that trusted its own stored
   picture of the room would report a room that no longer exists. */
create table public.assistant_work_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references auth.users(id) on delete restrict,
  status text not null default 'open',
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,

  constraint aws_status_check check (status in ('open', 'closed')),
  constraint aws_closed_pairing_check
    check ((status = 'closed') = (closed_at is not null))
);

create index assistant_work_sessions_owner_open_idx
  on public.assistant_work_sessions (owner_uid, updated_at desc)
  where status = 'open';

alter table public.assistant_work_sessions enable row level security;

/* Server-only surface: the Assistant route reads and writes through the
   trusted client after its own founder gate. No browser-facing policy. */
revoke all on public.assistant_work_sessions
  from public, anon, authenticated, service_role;
grant select, insert, update on public.assistant_work_sessions to service_role;

comment on table public.assistant_work_sessions is
  'Founder Assistant conversations: working context only (messages, at most one pending plan). Room state is never persisted here — resume re-reads production. Server-only; the Assistant route gates and writes through the trusted client.';

-- ═════ 4 · OPERATION RECEIPTS — append-only, IDs stored, counts derived ═══

/* One receipt per confirmed-and-executed operation. Stores the listing IDs
   the founder confirmed, the IDs that succeeded, and the per-listing
   failures — never a stored count. A stored count can drift from the IDs
   beside it; a derived one cannot. */
create table public.assistant_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.assistant_work_sessions(id) on delete restrict,

  /* Bucket B is exactly one operation in this release, and the receipt
     table refuses to record anything the allowlist does not contain. */
  operation text not null,
  constraint aor_operation_check check (operation = 'approve_listings'),

  authorized_by uuid not null references auth.users(id) on delete restrict,
  requested_listing_ids uuid[] not null,
  succeeded_listing_ids uuid[] not null default '{}'::uuid[],
  failed_listings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),

  constraint aor_requested_not_empty_check
    check (cardinality(requested_listing_ids) > 0)
);

create index assistant_operation_receipts_session_idx
  on public.assistant_operation_receipts (session_id, id);

/* Append-only, enforced rather than intended — the listing_lifecycle_events
   posture: UPDATE and DELETE are refused at the row for everyone, including
   the table owner and the service role. A receipt is an account of what
   actually happened; nothing may revise it afterward. */
create or replace function public.assistant_operation_receipts_are_append_only()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception 'assistant_operation_receipts_are_append_only';
end
$fn$;

revoke all on function public.assistant_operation_receipts_are_append_only()
  from public, anon, authenticated, service_role;

create trigger assistant_operation_receipts_immutable
  before update or delete on public.assistant_operation_receipts
  for each row execute function public.assistant_operation_receipts_are_append_only();

alter table public.assistant_operation_receipts enable row level security;

revoke all on public.assistant_operation_receipts
  from public, anon, authenticated, service_role;
grant select, insert on public.assistant_operation_receipts to service_role;

comment on table public.assistant_operation_receipts is
  'Append-only account of each confirmed Assistant operation: the listing IDs requested, succeeded, and failed. Counts are always derived from the IDs, never stored. Enforced immutable by trigger.';
