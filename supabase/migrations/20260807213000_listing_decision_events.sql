-- Listing decision history — the durable seller-facing adjudication record.
--
-- WHY THIS EXISTS. Three current-state stores each answer "what is true now",
-- and by design none of them answers "what was decided before":
--   · listings.rejection_reason and listings.seller_clarification_note are
--     single-slot and are NULLed on every other transition, so an earlier
--     reason is destroyed the moment the next decision lands;
--   · listing_integrity_reviews carries a UNIQUE index on listing_id and is
--     written by upsert — exactly one row per listing, overwritten each time;
--   · that table's only text field is admin_notes, which is founder-only and
--     must never reach a seller.
-- Return to Draft had no seller-facing storage at all.
--
-- Those rulings stay exactly as they were. This table is the history layer
-- beside them, not a replacement: current state keeps its home, and every
-- decision additionally leaves a permanent row that nothing rewrites.
--
-- Modelled on listing_currency_events (identity bigint, composite listing
-- index, RLS on with no policies, CHECK-enforced vocabulary, blank-text
-- refused at the constraint). Two deliberate divergences, both explained at
-- their constraint below.

create table public.listing_decision_events (
  id               bigint      generated always as identity,
  listing_id       uuid        not null,
  decision         text        not null,
  prior_status     text        not null,
  resulting_status text        not null,
  -- The seller-facing message for THIS decision. Never admin_notes: the
  -- internal reviewer note may carry evidence detail and stays founder-only.
  seller_message   text,
  actor_uid        uuid        not null,
  created_at       timestamptz not null default now(),

  constraint listing_decision_events_pkey primary key (id),

  -- DIVERGENCE 1 — cascade, where listing_currency_events restricts. A money
  -- attestation must outlive any attempt to erase it; an adjudication record
  -- has no subject once its listing is gone, and RESTRICT here would break the
  -- existing listings_delete_own path. This matches listing_integrity_reviews,
  -- the adjudication precedent, rather than the money one.
  constraint lde_listing_fk
    foreign key (listing_id) references public.listings (id) on delete cascade,
  constraint lde_actor_fk
    foreign key (actor_uid) references auth.users (id) on delete restrict,

  constraint lde_decision_check
    check (decision in ('approved','rejected','clarification_requested','returned_to_draft')),

  -- The product law in the database: no adverse listing decision without a
  -- seller-visible reason. Approval needs no message; the three adverse
  -- decisions cannot be recorded blank, so no UI can be the one that forgets.
  constraint lde_seller_message_required_check
    check (
      decision = 'approved'
      or (seller_message is not null and btrim(seller_message) <> '')
    ),

  -- An event records a real movement. A re-save of the same state is not a
  -- decision and must not become one, which is also what keeps one email per
  -- decision event rather than one per button press.
  constraint lde_real_transition_check
    check (btrim(prior_status) <> '' and btrim(resulting_status) <> ''
           and prior_status <> resulting_status)
);

create index listing_decision_events_listing_idx
  on public.listing_decision_events (listing_id, id);

alter table public.listing_decision_events enable row level security;

-- RLS on with no policies, exactly as the precedent: nothing reaches anon or
-- authenticated sessions. Seller-facing reasons are served through the
-- existing listing columns the Account surface already reads.
--
-- DIVERGENCE 2 — service_role also gets INSERT. listing_currency_events is
-- written by a SECURITY DEFINER function and needs only SELECT; this table is
-- written by the founder adjudication route through the service client, which
-- is already the single authorized transition boundary for status changes.
-- Adding a definer function purely to relay that write would be machinery
-- without a second caller.
revoke all on public.listing_decision_events from public, anon, authenticated, service_role;
grant select, insert on public.listing_decision_events to service_role;

comment on table public.listing_decision_events is
  'Append-only adjudication history. One row per real listing decision transition, carrying the seller-facing message for that event. Never rewritten; current-actionable state stays on listings.* and listing_integrity_reviews.';
comment on column public.listing_decision_events.seller_message is
  'Seller-visible reason for this decision. Required for rejected / clarification_requested / returned_to_draft. Never the founder-only reviewer note.';
