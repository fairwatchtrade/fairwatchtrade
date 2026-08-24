/* ════════════════════════════════════════════════════════════════════════
   ROUND 17 — LISTING LIFECYCLE EVENT COMPLETENESS

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "listing_decision_events is the listing's lifecycle history."

   It is not, and it never claimed to be. That table records ADJUDICATION —
   what a reviewer decided about a listing's merit — with a vocabulary of
   approved / rejected / clarification_requested / returned_to_draft, a
   seller-visible message on every adverse row, and an RLS policy that
   deliberately shows it to the seller. It answers "what was decided".

   Three real state movements were therefore never durable anywhere:

     · a listing entering 'private_active' — a private listing is CREATED in
       that state by the conversation-led path, so there is no adjudication
       at all, and the founder-approval route that releases a held private
       row records the approval, not the visibility mode it landed in;
     · a listing leaving or re-entering public availability by way of the
       private mode;
     · a listing being REMOVED. Stage 6 ruled explicitly against putting the
       removal reason into listing_decision_events, and that ruling was
       right: a seller taking a watch off the market is not a decision about
       the listing's merit. But the ruling left the fact homeless.

   06F proved the cost in production: a Passport that correctly refuses to
   invent history had to say "no governed lifecycle event records how this
   listing got here" about a real published row.

   ── WHERE THE BEHAVIOUR ACTUALLY LIVES ─────────────────────────────────

   NOTHING IN THE APPLICATION EVER WRITES THIS TABLE. Not the founder status
   route, not triage, not remove_listing(), not the private creation path,
   not Marketplace Control. Searching the repository for the table name will
   find the README and the tests and no producer, and that is correct.

   The producer is the AFTER trigger at the bottom of this file, sitting on
   listings.status itself. That placement is the whole design:

     · listings.status has at least five distinct writers today — the
       founder adjudication route, the triage service, remove_listing(),
       accept_purchase_request(), and the create path — reached through
       three different privilege channels;
     · a sixth writer added next year inherits the history for free, and
       cannot forget to record it;
     · the event commits in the same transaction as the transition it
       describes, so history and state can never disagree.

   An application-side producer would have needed the same insert copied
   into every one of those seams, which is precisely the shape of defect
   the publication-gate extraction closed at v6.34.

   ── WHY NOT SIMPLY WIDEN listing_decision_events ───────────────────────

   Considered first, and refused for four separate reasons, any one of which
   would have been enough:

     1. Its decision CHECK is a closed adjudication vocabulary, and Stage 6
        already ruled that removal does not belong in it.
     2. lde_seller_message_required_check demands a seller-facing sentence
        for every adverse row. A removal has a governed REASON CODE and no
        message; relaxing that constraint would weaken the one rule that
        guarantees no seller is ever refused without an explanation.
     3. actor_kind is CHECKed to ('founder','triage') and paired against
        actor_uid. A seller's own removal fits neither.
     4. Decisively — the table is SELECTable by the seller through
        listing_decision_events_select_own, and app/account/page.tsx renders
        it as the seller's status-explanation feed. New row types would have
        appeared in a live seller surface, which this round is forbidden to
        change.

   The two tables are not competing authorities. One records the decision,
   the other records the movement. A decision table can never be complete
   about state, because a state can move without an adjudication — which is
   exactly the gap being closed.

   ── WHAT IS DELIBERATELY NOT BUILT ─────────────────────────────────────

   · No API, no route, no UI, no view. This round creates source truth, not
     a consumer. RLS is on with zero policies.
   · No backfill. See the note above the table.
   · No new transition. published → private_active and private_active →
     published are not reachable product paths today and this file does not
     make them so; the producer records them structurally if a governed path
     is ever built.
   · No reason-code vocabulary CHECK on the event. The taxonomy authority
     stays remove_listing(); duplicating it here would mean that widening
     the taxonomy later silently broke removals against the copy.
   · No 'became_reserved' or 'returned_to_draft' type. Those movements are
     already durable in listing_decision_events or in the accept RPC's own
     transaction record.

   PFC274 = 62 — Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

-- ═════ 1 · THE HISTORY ═══════════════════════════════════════════════════

create table if not exists public.listing_lifecycle_events (
  id bigint generated always as identity,

  /* NO FOREIGN KEY, and this is measured rather than assumed: in production
     listing_decision_events carries exactly one FK — actor_uid — and none on
     listing_id, which is why Stage 8 lists it among the "fully durable"
     tables its purge never touches. This table joins that group on purpose.

     "Why did this watch leave the market" must outlive the row it is about.
     delete_listing_permanently() writes an identity tombstone and physically
     deletes the listing; a CASCADE here would erase the removal event in the
     same statement, destroying the only record of the removal reason at the
     exact moment it becomes unrecoverable. A RESTRICT would be worse — it
     would break the governed purge, which this round may not change. */
  listing_id uuid not null,

  /* The order's vocabulary, verbatim, and kept semantically distinct:
     BECAME_PRIVATE is a visibility-mode transition, REMOVED is the governed
     removal operation. Becoming private is not removal. */
  event_type text not null,

  /* NULL means the listing was CREATED directly in this state — the private
     conversation-led path inserts 'private_active' with no prior state at
     all. A synthetic prior status ('none', 'draft') would be a fabrication
     of exactly the kind §6 forbids, so absence stays absence. */
  prior_status text,
  resulting_status text not null,

  /* Carried from listings.removal_reason_code as the governed removal seam
     recorded it, in the same transaction. Never re-derived, never prose. */
  removal_reason_code text,

  /* auth.uid() at the instant of the transition. NULL is honest and common:
     the founder adjudication route and the triage service both write through
     the service client, which carries no end-user identity into the
     database. WHO decided is recorded by listing_decision_events; this
     column records only what the transition itself could prove. */
  actor_uid uuid,

  /* The privilege CHANNEL the transition arrived through — the one actor
     fact the database can establish first-hand. Named as a channel, not as a
     role, because 'founder' would be an inference this table cannot make. */
  actor_source text not null,

  occurred_at timestamptz not null default now(),

  constraint listing_lifecycle_events_pkey primary key (id),

  constraint lle_event_type_check
    check (event_type in ('BECAME_PUBLIC', 'BECAME_PRIVATE', 'REMOVED')),

  constraint lle_actor_source_check
    check (actor_source in ('seller_session', 'other_session', 'service_role')),

  /* The type and the state it claims cannot drift apart. A 'REMOVED' row
     asserting resulting_status 'published' is not a typo to be cleaned up
     later — it is unfalsifiable history, so it never lands. */
  constraint lle_type_matches_state_check
    check (
      (event_type = 'BECAME_PUBLIC'  and resulting_status = 'published')
      or (event_type = 'BECAME_PRIVATE' and resulting_status = 'private_active')
      or (event_type = 'REMOVED'        and resulting_status = 'removed')
    ),

  /* A re-save of the same state is not a movement. Blank is not a state. */
  constraint lle_real_transition_check
    check (
      btrim(resulting_status) <> ''
      and (prior_status is null
           or (btrim(prior_status) <> '' and prior_status <> resulting_status))
    ),

  /* A reason belongs to a removal. Nothing else may carry one, so the column
     can never quietly become a general-purpose annotation slot. */
  constraint lle_reason_only_on_removal_check
    check (removal_reason_code is null or event_type = 'REMOVED')
);

/* Deterministic ordering per listing. The identity column is the tiebreak:
   two transitions inside one transaction share occurred_at exactly. */
create index if not exists listing_lifecycle_events_listing_idx
  on public.listing_lifecycle_events (listing_id, id);

create index if not exists listing_lifecycle_events_type_idx
  on public.listing_lifecycle_events (event_type, id);

-- ═════ 2 · APPEND-ONLY, ENFORCED RATHER THAN INTENDED ════════════════════

/* Not a convention and not a grant. UPDATE and DELETE are both refused at
   the row, including for the table owner and including for the service
   role, so no repair script, no migration and no future seam can revise a
   lifecycle fact after the event.

   Blocking DELETE is only safe BECAUSE there is no foreign key: nothing
   cascades into this table, so the governed purge never issues a delete
   here and cannot be broken by this trigger. Those two decisions are one
   decision. */
create or replace function public.listing_lifecycle_events_are_append_only()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception 'listing_lifecycle_history_is_append_only';
end
$fn$;

/* PUBLIC holds EXECUTE on a new function by default, and a trigger function
   is not exempt from that grant merely because calling it directly is
   useless. Revoked for the same reason 06E revokes its own: the guard set
   should be provable, not argued about. */
revoke all on function public.listing_lifecycle_events_are_append_only()
  from public, anon, authenticated, service_role;

drop trigger if exists listing_lifecycle_events_immutable
  on public.listing_lifecycle_events;
create trigger listing_lifecycle_events_immutable
  before update or delete on public.listing_lifecycle_events
  for each row execute function public.listing_lifecycle_events_are_append_only();

-- ═════ 3 · ACCESS — SOURCE TRUTH, NOT A CONSUMER ═════════════════════════

/* The listing_currency_events posture, chosen over the decision-events one
   on purpose: lifecycle history carries internal state movements and this
   round creates no reader for them. RLS on with zero policies means nothing
   reaches anon or authenticated no matter what a future route forgets.

   service_role gets SELECT and nothing else. It has no INSERT — history is
   PRODUCED by the definer trigger below and cannot be AUTHORED by anything,
   which is a stronger guarantee than append-only alone. */
alter table public.listing_lifecycle_events enable row level security;

revoke all on public.listing_lifecycle_events
  from public, anon, authenticated, service_role;
grant select on public.listing_lifecycle_events to service_role;

comment on table public.listing_lifecycle_events is
  'Append-only listing lifecycle history: BECAME_PUBLIC / BECAME_PRIVATE / REMOVED. Produced exclusively by the listings_lifecycle_event trigger on listings.status — no application code writes it. Records what state movement occurred and when; listing_decision_events records what a reviewer decided and why, and the two are never merged.';
comment on column public.listing_lifecycle_events.prior_status is
  'NULL means the listing was created directly in this state. Never a synthetic prior state.';
comment on column public.listing_lifecycle_events.actor_source is
  'The privilege channel the transition arrived through — the only actor fact the database can establish first-hand. Not a role claim.';
comment on column public.listing_lifecycle_events.removal_reason_code is
  'Carried verbatim from listings.removal_reason_code in the same transaction. remove_listing() remains the taxonomy authority; this column deliberately has no vocabulary CHECK of its own.';

-- ═════ 4 · THE PRODUCER ══════════════════════════════════════════════════

create or replace function public.record_listing_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_prior  text;
  v_type   text;
  v_source text;
begin
  /* The WHEN clause cannot compare OLD and NEW, because this one trigger
     serves INSERT as well and PostgreSQL forbids OLD in an INSERT WHEN.
     The re-save filter therefore lives here. */
  if TG_OP = 'UPDATE' then
    if OLD.status is not distinct from NEW.status then
      return null;
    end if;
    v_prior := OLD.status;
  else
    v_prior := null;
  end if;

  v_type := case NEW.status
    when 'published'      then 'BECAME_PUBLIC'
    when 'private_active' then 'BECAME_PRIVATE'
    when 'removed'        then 'REMOVED'
  end;
  if v_type is null then
    return null;
  end if;

  v_source := case
    when v_uid is null              then 'service_role'
    when v_uid = NEW.seller_id      then 'seller_session'
    else                                 'other_session'
  end;

  /* ── FAIL CLOSED, DELIBERATELY, AND AGAINST A LOCAL PRECEDENT ──────────
     log_dealer_submission_event() on this same table swallows its own
     exceptions, and that was right: it writes an optional audit line that
     REQUIRES a batch context two real listings do not have, so a missing
     context must not block a dealer from selling.

     This one is the opposite case. It is the durability primitive itself:
     an event silently dropped here reproduces the exact 06F defect this
     round exists to close, and does so invisibly. There is also nothing
     conditional left to fail on — every constraint above is satisfied
     deterministically by the four values computed in this function, and the
     table has no foreign key that could refuse the row.

     So a lifecycle transition that cannot be recorded does not happen. */
  insert into public.listing_lifecycle_events (
    listing_id, event_type, prior_status, resulting_status,
    removal_reason_code, actor_uid, actor_source
  ) values (
    NEW.id, v_type, v_prior, NEW.status,
    case when v_type = 'REMOVED' then NEW.removal_reason_code else null end,
    v_uid, v_source
  );

  return null;
end
$fn$;

revoke all on function public.record_listing_lifecycle_event()
  from public, anon, authenticated, service_role;

comment on function public.record_listing_lifecycle_event() is
  'Produces listing_lifecycle_events from listings.status movements. SECURITY DEFINER because the table grants INSERT to nobody. Fails closed: a transition whose history cannot be recorded is refused.';

/* AFTER, so the row is final — remove_listing() sets status and
   removal_reason_code in one UPDATE and the reason must be visible here.

   INSERT is included because the private conversation-led path CREATES a
   listing already in 'private_active'; without it, the single most common
   way a listing becomes private would leave no history at all. */
drop trigger if exists listings_lifecycle_event on public.listings;
create trigger listings_lifecycle_event
  after insert or update of status on public.listings
  for each row
  when (NEW.status in ('published', 'private_active', 'removed'))
  execute function public.record_listing_lifecycle_event();

/* ── NO BACKFILL. NOT ONE ROW. ────────────────────────────────────────────

   Every listing that became public before this migration already has that
   fact durably recorded in listing_decision_events with resulting_status
   'published' — the same source app/account/page.tsx uses to answer "when
   was this listed", and the same one 06F's Passport reads. Copying those
   rows into this table would manufacture a SECOND authority for a fact that
   is already durable, and the two copies could then disagree.

   For the movements that genuinely have no durable source — the existing
   private_active row and the existing removed row — there is nothing to
   copy. Their history could only be reconstructed from current status,
   removed_at, or updated_at, which is the precise inference §6 forbids.

   So legacy coverage is stated rather than fixed: history before this
   migration remains what listing_decision_events can prove, and the private
   and removal chapters of it stay honestly unknown. */
