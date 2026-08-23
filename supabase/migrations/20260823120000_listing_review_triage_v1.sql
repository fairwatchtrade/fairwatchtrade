/* ════════════════════════════════════════════════════════════════════════
   FOUNDER REVIEW TRIAGE V1 — the listing-level disposition record

   THE MISCONCEPTION THIS TABLE EXISTS TO KILL:
   `listing_integrity_provider_results.classification` is NOT a listing
   decision. Those values ('passed', 'review_suggested',
   'high_confidence_match') live per provider, per photograph, and several of
   them can disagree inside one listing. They are EVIDENCE INPUTS. This table
   is the one place a listing-level PASS / FAIL / ESCALATE is recorded.

   WHY IT IS SEPARATE FROM listing_integrity_reviews:
   that table answers "did the FOUNDER look, and what did they conclude" —
   one upserted row per listing, resolved_by pointing at a real person. A
   machine disposition must never be written there, because it would answer
   the founder question with a non-founder answer. Triage keeps its own
   record and its own history.

   WHAT IS DELIBERATELY NOT BUILT:
     · no score, no confidence band, no threshold column. The outcome is
       reached by an explicit reason code or it is not reached at all.
     · no copy of provider payloads. evidence_summary holds a handful of
       counts and the hold reason — enough to explain the disposition,
       never enough to become a second evidence warehouse.
     · nothing here writes listings.status. The disposition seam does that,
       and only through the shared publication law.

   Verify current state:
     select outcome, reason_code, count(*)
       from public.listing_review_triage
      where superseded_at is null
      group by 1, 2 order by 1, 2;
   ════════════════════════════════════════════════════════════════════════ */

create table if not exists public.listing_review_triage (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings(id) on delete cascade,

  /* The three semantic outcomes. There is no fourth, and no NULL: a triage
     row exists only because the policy reached a conclusion. */
  outcome        text not null check (outcome in ('pass', 'fail', 'escalate')),

  /* The durable structured reason. A machine disposition that cannot name
     its rule is not admissible, so this is NOT NULL for every outcome —
     including PASS, which names the rule that cleared it. */
  reason_code    text not null,
  /* One internal sentence for a human reading the record later. Never
     seller-facing: the seller's words live on listing_decision_events. */
  reason_detail  text,

  /* Source/version identity. A later policy revision produces a different
     value, so an old disposition stays attributable to the rules that
     actually made it rather than to whatever the code says today. */
  policy_version text not null,

  /* Tiny, bounded: hold reason, counts, whether authenticity coverage was
     required. Explains the disposition; does not reproduce the evidence. */
  evidence_summary jsonb,

  /* What triage actually did. NULL for escalate — an escalation moves
     nothing, which is exactly why it stays visible to Founder Review. */
  resulting_status  text,
  decision_event_id bigint references public.listing_decision_events(id) on delete set null,

  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  /* One authoritative CURRENT result per listing; earlier cycles are kept,
     not overwritten. Structurally the same idiom as the one-active-completed
     provider indexes — the partial unique index below is the enforcement. */
  superseded_at timestamptz
);

create unique index if not exists listing_review_triage_one_current
  on public.listing_review_triage (listing_id)
  where (superseded_at is null);

create index if not exists listing_review_triage_listing_created_idx
  on public.listing_review_triage (listing_id, created_at desc);

alter table public.listing_review_triage enable row level security;

/* RLS on with no policies — the precedent set by listing_decision_events.
   Nothing reaches anon or authenticated. This is internal marketplace
   governance; no seller and no buyer reads it, and no browser client can
   write it. The seam runs server-side on the trusted client only. */
revoke all on public.listing_review_triage from public, anon, authenticated, service_role;
grant select, insert, update on public.listing_review_triage to service_role;

comment on table public.listing_review_triage is
  'Listing-level PASS / FAIL / ESCALATE triage results. One current row per listing (partial unique index on superseded_at is null); earlier cycles retained. Never a substitute for listing_integrity_reviews, which records FOUNDER adjudication.';
comment on column public.listing_review_triage.reason_code is
  'Structured V1 reason vocabulary. Required for every outcome including pass — a disposition that cannot name its rule is not admissible.';
comment on column public.listing_review_triage.policy_version is
  'Identity of the policy that produced this outcome, so a historical disposition stays attributable to the rules that made it.';

/* ════════════════════════════════════════════════════════════════════════
   DECISION HISTORY — telling a machine disposition from a founder one

   listing_decision_events.actor_uid was NOT NULL with a foreign key into
   auth.users, which left exactly two options for a machine decision: forge
   a founder's UUID, or record no history. Both are wrong. This is the
   smallest additive change that makes the third option true.

   Existing rows all default to 'founder', which is accurate — every
   decision recorded before this migration was Jason's.
   ════════════════════════════════════════════════════════════════════════ */

alter table public.listing_decision_events
  add column if not exists actor_kind text not null default 'founder';

alter table public.listing_decision_events
  drop constraint if exists lde_actor_kind_check;
alter table public.listing_decision_events
  add constraint lde_actor_kind_check check (actor_kind in ('founder', 'triage'));

alter table public.listing_decision_events
  alter column actor_uid drop not null;

/* The pairing is enforced, not conventional: a founder decision must carry a
   real person, and a triage decision must carry none. Neither can be
   mislabelled after the fact without failing this check. */
alter table public.listing_decision_events
  drop constraint if exists lde_actor_identity_check;
alter table public.listing_decision_events
  add constraint lde_actor_identity_check check (
    (actor_kind = 'founder' and actor_uid is not null)
    or (actor_kind = 'triage' and actor_uid is null)
  );

comment on column public.listing_decision_events.actor_kind is
  'founder = a person adjudicated (actor_uid required). triage = automatic listing-level triage disposed (actor_uid must be NULL — no forged actor).';
