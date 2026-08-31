/* ════════════════════════════════════════════════════════════════════════
   ADMIN ASSISTANT — OPERATION CORRELATION + KNOWN-UNKNOWN MARKER   (v7.62)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The mutation failed, so retrying is safe."

   The dangerous case is the opposite one. The governed mutation SUCCEEDS and
   the receipt write fails afterwards. The action happened; the evidence of it
   did not. A founder looking at that state sees an operation with no record,
   and the instinctive repair — run it again to get the receipt — executes a
   real product mutation a second time.

   > Receipt repair may never become action replay by accident.

   ── CORRELATION IS THE PLAN ID, CARRIED THROUGH ─────────────────────────

   The confirmed plan already has a durable id. That id now travels onto the
   receipt, so request → preview → confirmation → execution → receipt write →
   retry all name the same operation. A partial unique index makes a second
   receipt for one operation impossible rather than merely unlikely.

   HISTORY IS NOT BACKFILLED. Receipts written before this migration carry no
   correlation id, and inventing one would assert a correlation nobody
   recorded. The index is partial for exactly that reason.

   ── THE MARKER IS EVIDENCE, NEVER AUTHORITY ─────────────────────────────

   assistant_unreceipted_operations records that a mutation is known to have
   happened while its receipt is known to be missing. It holds operation and
   evidence metadata only — correlation id, operation name, the ids that
   succeeded, when it executed, why the receipt write failed. It holds no
   product state and must never be read as any. The listings themselves
   remain the authority on what they are now.

   `thread_id` is NULLABLE on purpose: a confirmation can legitimately happen
   without an Operational Thread attached, and the known-unknown must survive
   that case rather than being dropped for want of somewhere to hang.

   It stays OPEN until one of exactly two things happens:
     · RECONCILED   — the receipt was successfully written afterwards;
     · ACCEPTED_GAP — the founder explicitly accepted a documented, permanent
                      evidence gap, with a note saying so.

   It never resolves because a later query stopped noticing it.

   Verify current state:
     select state, count(*) from public.assistant_unreceipted_operations group by 1;
     select count(*) from public.assistant_operation_receipts where correlation_id is null;
   ════════════════════════════════════════════════════════════════════════ */

-- ═════ 1 · CORRELATION ON THE RECEIPT ═════════════════════════════════════

alter table public.assistant_operation_receipts
  add column correlation_id uuid;

/* Partial: pre-correlation history is legitimately null and is never
   backfilled. Where a correlation id IS present, it is unique — one
   operation can produce exactly one receipt. */
create unique index assistant_operation_receipts_correlation_unique_idx
  on public.assistant_operation_receipts (correlation_id)
  where correlation_id is not null;

comment on column public.assistant_operation_receipts.correlation_id is
  'The confirmed plan id, carried through execution to the receipt so one operation is identifiable across request, confirmation, execution, receipt write and retry. NULL on receipts written before correlation existed — never backfilled.';

-- ═════ 2 · THE KNOWN-UNKNOWN MARKER ═══════════════════════════════════════

create table public.assistant_unreceipted_operations (
  id uuid primary key default gen_random_uuid(),

  /* One marker per operation. A retry that fails again updates this row
     rather than accumulating a second claim about the same event. */
  correlation_id uuid not null unique,

  /* Nullable: a confirmation without an attached thread still produces a
     known-unknown, and it must not be discarded for want of a home. */
  thread_id uuid references public.assistant_operational_threads(id) on delete restrict,
  session_id uuid not null
    references public.assistant_work_sessions(id) on delete restrict,

  operation text not null,
  authorized_by uuid not null references auth.users(id) on delete restrict,

  /* Evidence metadata only. There is deliberately no status, eligibility or
     current-state column: this row says an action happened and its receipt
     did not, and nothing more. */
  succeeded_listing_ids uuid[] not null default '{}'::uuid[],
  executed_at timestamptz not null default now(),
  receipt_error text,

  state text not null default 'OPEN',
  reconciled_at timestamptz,
  reconciled_receipt_id uuid references public.assistant_operation_receipts(id),
  accepted_by uuid references auth.users(id) on delete restrict,
  acceptance_note text,

  constraint auo_state_check check (state in ('OPEN', 'RECONCILED', 'ACCEPTED_GAP')),
  constraint auo_operation_check
    check (operation in ('approve_listings', 'remove_listing')),

  /* Leaving OPEN always records HOW it left. A marker cannot quietly become
     resolved: reconciliation names the receipt that closed it, and an
     accepted gap names the person who accepted it and what they said. */
  constraint auo_reconciled_pairing_check
    check ((state = 'RECONCILED') = (reconciled_receipt_id is not null and reconciled_at is not null)),
  constraint auo_accepted_pairing_check
    check ((state = 'ACCEPTED_GAP') = (accepted_by is not null and btrim(coalesce(acceptance_note, '')) <> ''))
);

create index assistant_unreceipted_open_idx
  on public.assistant_unreceipted_operations (authorized_by, executed_at desc)
  where state = 'OPEN';

create index assistant_unreceipted_thread_idx
  on public.assistant_unreceipted_operations (thread_id)
  where state = 'OPEN';

comment on table public.assistant_unreceipted_operations is
  'ACTION HAPPENED — RECEIPT NOT YET RECORDED. Operation and evidence metadata for a governed mutation that succeeded while its receipt write failed. Never product-state authority. Stays OPEN until the receipt is reconciled or the founder explicitly accepts a documented evidence gap.';

alter table public.assistant_unreceipted_operations enable row level security;
revoke all on public.assistant_unreceipted_operations
  from public, anon, authenticated, service_role;
grant select, insert, update on public.assistant_unreceipted_operations to service_role;
