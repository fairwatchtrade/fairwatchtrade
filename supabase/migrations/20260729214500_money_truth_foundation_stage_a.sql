-- ============================================================================
-- Marketplace Money Truth Foundation — STAGE A (database foundation only)
--
-- Governing: FairWatchTrade_Marketplace_Money_Truth_Foundation_Implementation_
-- Order_2026-07-29_v1, §13 Stage A, derived from the locked Master Record.
--
-- Stage A adds nullable currency fields, supported-currency metadata, the
-- append-only attestation event structure, the founder-gated attestation RPC,
-- and the v2 fingerprint SQL. It writes NO currency value to any row, performs
-- NO attestation, adds NO amount/currency pairing enforcement (that is Stage D,
-- NOT VALID -> VALIDATE, satisfiable only after Stage C), and does NOT modify
-- submit_listing_for_review — the v2 fingerprint is DEFINED, NOT ACTIVATED.
--
-- Ownership note (the v2.94 lesson): every function here is postgres-owned,
-- matching submit_listing_for_review and dealer_import_one_listing. A dedicated
-- nologin owner would be subject to public.listings' RLS and would see zero
-- rows, and any auth-schema grant to such a role silently no-ops because
-- postgres cannot grant there. Do not "tidy" these into a dedicated role.
--
-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Supported currencies (§6.1) — migration-controlled, client-readable
-- --------------------------------------------------------------------------

create table public.supported_currencies (
  code            text     not null,
  exponent        smallint not null,
  display_prefix  text     not null,
  display_name    text     not null,
  active          boolean  not null default true,

  constraint supported_currencies_pkey primary key (code),
  constraint supported_currencies_code_format_check
    check (code ~ '^[A-Z]{3}$'),
  -- ISO 4217 minor units in real use are 0..4; JPY is 0, the rest here are 2.
  constraint supported_currencies_exponent_check
    check (exponent between 0 and 4),
  constraint supported_currencies_nonblank_check
    check (btrim(display_prefix) <> '' and btrim(display_name) <> '')
);

-- The curated nine. display_prefix is concatenated verbatim by formatMoney,
-- so CHF carries its own separating space by design.
insert into public.supported_currencies (code, exponent, display_prefix, display_name) values
  ('USD', 2, 'US$',  'United States Dollar'),
  ('CAD', 2, 'C$',   'Canadian Dollar'),
  ('EUR', 2, '€',    'Euro'),
  ('GBP', 2, '£',    'Pound Sterling'),
  ('CHF', 2, 'CHF ', 'Swiss Franc'),
  ('JPY', 0, '¥',    'Japanese Yen'),
  ('AUD', 2, 'A$',   'Australian Dollar'),
  ('SGD', 2, 'S$',   'Singapore Dollar'),
  ('HKD', 2, 'HK$',  'Hong Kong Dollar');

alter table public.supported_currencies enable row level security;

-- Supabase default privileges grant ALL on new public tables to the app roles;
-- revoke first, then grant back only SELECT. Writes are migration-only.
revoke all on public.supported_currencies from public, anon, authenticated, service_role;
grant select on public.supported_currencies to anon, authenticated, service_role;

create policy supported_currencies_read
  on public.supported_currencies
  for select to anon, authenticated, service_role using (true);

-- --------------------------------------------------------------------------
-- 2. Nullable currency columns (§6.2, §6.3, §6.4)
--
-- Curated-set CHECK rather than an FK to supported_currencies, matching the
-- evidence-enum pattern (aer_price_basis_check). All four are NULLABLE in
-- Stage A: no row carries a currency until the Stage C attestation session.
-- --------------------------------------------------------------------------

alter table public.listings
  add column asking_currency text,
  add constraint listings_asking_currency_check
    check (asking_currency is null or asking_currency in
      ('USD','CAD','EUR','GBP','CHF','JPY','AUD','SGD','HKD'));

alter table public.purchase_requests
  add column proposed_currency text,
  add column listing_currency  text,
  add constraint purchase_requests_proposed_currency_check
    check (proposed_currency is null or proposed_currency in
      ('USD','CAD','EUR','GBP','CHF','JPY','AUD','SGD','HKD')),
  add constraint purchase_requests_listing_currency_check
    check (listing_currency is null or listing_currency in
      ('USD','CAD','EUR','GBP','CHF','JPY','AUD','SGD','HKD'));

alter table public.profiles
  add column preferred_listing_currency text,
  add constraint profiles_preferred_listing_currency_check
    check (preferred_listing_currency is null or preferred_listing_currency in
      ('USD','CAD','EUR','GBP','CHF','JPY','AUD','SGD','HKD'));

-- --------------------------------------------------------------------------
-- 3. Append-only founder currency-attestation history (§6.5)
--
-- Shape mirrors auction_evidence_source_artifact_events (the Phillips
-- rights-transition pattern). prior_state/resulting_state carry amount AND
-- currency together, so the record proves which amount was on the row at the
-- moment its currency was attested — material for the H. Moser row, whose
-- amount was itself in question.
--
-- Append-only is a PRIVILEGE guarantee (no update/delete grants), not a
-- trigger guarantee: the table owner can still mutate. Stated honestly.
-- --------------------------------------------------------------------------

-- id is a MONOTONIC identity, not a uuid, and that is load-bearing. now() is
-- transaction-frozen, so two events written in one transaction share a
-- created_at to the microsecond; with a random uuid there is no tiebreaker and
-- the history cannot be ordered — a correction can sort before the attestation
-- it corrects. Proven on a disposable target: 2 events, 1 distinct timestamp,
-- `order by created_at desc` returned the wrong row. Order this table by id.
-- (The dealer_accelerator_lifecycle_events table uses identity for the same
-- reason; the auction_evidence_*_events tables use a uuid and carry the same
-- latent flaw — noted, out of scope here.)
create table public.listing_currency_events (
  id                 bigint generated always as identity,
  listing_id         uuid        not null,
  event_type         text        not null,
  prior_state        jsonb       not null,
  resulting_state    jsonb       not null,
  attestation_basis  text        not null,
  actor_uid          uuid        not null,
  created_at         timestamptz not null default now(),

  constraint listing_currency_events_pkey primary key (id),
  constraint lce_listing_fk
    foreign key (listing_id) references public.listings (id) on delete restrict,
  constraint lce_actor_fk
    foreign key (actor_uid) references auth.users (id) on delete restrict,
  constraint lce_event_type_check
    check (event_type in ('currency_attested','currency_corrected')),
  -- §11 forbids inference from '$' text alone: the basis must be positively
  -- recorded, never blank.
  constraint lce_basis_required_check
    check (btrim(attestation_basis) <> ''),
  constraint lce_state_shape_check
    check (jsonb_typeof(prior_state) = 'object' and jsonb_typeof(resulting_state) = 'object')
);

create index listing_currency_events_listing_idx
  on public.listing_currency_events (listing_id, id);

alter table public.listing_currency_events enable row level security;

revoke all on public.listing_currency_events from public, anon, authenticated, service_role;
grant select on public.listing_currency_events to service_role;

-- --------------------------------------------------------------------------
-- 4. v2 attestation fingerprint — DEFINED, NOT ACTIVATED (§10)
--
-- v1 (submit_listing_for_review, v2.24) is 13 length-prefixed frames:
--   frame(s) = octet_length_utf8(s) ':' s, concatenated, no separator.
-- v2 is a leading version frame + the same 13 fields + currency as field 14,
-- i.e. 15 frames total.
--
-- NON-COLLISION: length-prefixed concatenation is uniquely decodable — read
-- decimal digits to ':', then exactly that many bytes, repeat. A given byte
-- string therefore parses to exactly one frame count. v1 always yields 13
-- frames and v2 always yields 15, so no v1 string can equal any v2 string.
-- The leading 'v2' frame additionally makes the version self-describing.
--
-- submit_listing_for_review is deliberately UNCHANGED and still emits v1.
-- Activating v2 is Stage B, in lockstep with lib/attestation.ts, because a v2
-- fingerprint computed before Stage C would assert a NULL currency — exactly
-- the amount-without-currency state the staged sequence exists to prevent.
-- --------------------------------------------------------------------------

create or replace function public.listing_attestation_fingerprint_v2(p_listing_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  l public.listings%rowtype;
  v_canonical text;
begin
  select * into l from public.listings where id = p_listing_id;
  if not found then raise exception 'listing_not_found'; end if;

  v_canonical :=
       -- field 0: explicit version frame
       pg_catalog.octet_length(pg_catalog.convert_to('v2','UTF8'))::text || ':' || 'v2'
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(l.brand,''),'UTF8'))::text || ':' || coalesce(l.brand,'')
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(l.model,''),'UTF8'))::text || ':' || coalesce(l.model,'')
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(l.reference,''),'UTF8'))::text || ':' || coalesce(l.reference,'')
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(l.year,''),'UTF8'))::text || ':' || coalesce(l.year,'')
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(l.condition,''),'UTF8'))::text || ':' || coalesce(l.condition,'')
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(pg_catalog.trim_scale(l.asking_price)::text,''),'UTF8'))::text || ':' || coalesce(pg_catalog.trim_scale(l.asking_price)::text,'')
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(l.provenance_note,''),'UTF8'))::text || ':' || coalesce(l.provenance_note,'')
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(l.description,''),'UTF8'))::text || ':' || coalesce(l.description,'')
    || pg_catalog.octet_length(pg_catalog.convert_to(case when l.has_bracelet then 'true' else 'false' end,'UTF8'))::text || ':' || case when l.has_bracelet then 'true' else 'false' end
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(l.details->>'availability',''),'UTF8'))::text || ':' || coalesce(l.details->>'availability','')
    || (select pg_catalog.octet_length(pg_catalog.convert_to(s,'UTF8'))::text || ':' || s from (
          select coalesce(pg_catalog.string_agg(
            pg_catalog.octet_length(pg_catalog.convert_to(x.v,'UTF8'))::text || ':' || x.v, '' order by x.o), '') as s
          from pg_catalog.jsonb_array_elements_text(
            coalesce(l.details->'includedWithWatch','[]'::jsonb)
          ) with ordinality as x(v,o)) t)
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(l.details->>'includedNotes',''),'UTF8'))::text || ':' || coalesce(l.details->>'includedNotes','')
    || (select pg_catalog.octet_length(pg_catalog.convert_to(s,'UTF8'))::text || ':' || s from (
          select coalesce(pg_catalog.string_agg(
            pg_catalog.octet_length(pg_catalog.convert_to(p.e->'photo'->>'url','UTF8'))::text || ':' || (p.e->'photo'->>'url'), '' order by p.o), '') as s
          from pg_catalog.jsonb_array_elements(coalesce(l.photos,'[]'::jsonb))
          with ordinality as p(e,o)
          where p.e->'photo'->>'url' ~ '\S') t)
       -- field 14: currency — the v2 addition
    || pg_catalog.octet_length(pg_catalog.convert_to(coalesce(l.asking_currency,''),'UTF8'))::text || ':' || coalesce(l.asking_currency,'');

  return pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_canonical,'UTF8')),'hex');
end
$fn$;

-- --------------------------------------------------------------------------
-- 5. Founder-gated currency attestation RPC (§11)
--
-- Atomic currency write + append-only event, one transaction. Never infers
-- from '$' text: the caller supplies the currency and a written basis.
-- Idempotent — re-attesting the same currency returns unchanged and appends
-- no second event, so a re-run of the Stage C session cannot double-write.
-- --------------------------------------------------------------------------

create or replace function public.listing_currency_attest(
  p_listing_id        uuid,
  p_currency          text,
  p_attestation_basis text,
  p_actor_uid         uuid
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  l      public.listings%rowtype;
  v_cur  text := pg_catalog.btrim(coalesce(p_currency,''));
  v_bas  text := pg_catalog.btrim(coalesce(p_attestation_basis,''));
  v_prior jsonb;
  v_type  text;
begin
  -- Founder gate at the database layer, defense-in-depth with the calling
  -- route's own gate. Hardcoded literal by repo convention, deliberately not
  -- an imported constant.
  if p_actor_uid is null or p_actor_uid <> '77a6893a-54fe-4373-9bf7-3327d0ba69cf'::uuid then
    raise exception 'founder_only';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_uid) then
    raise exception 'actor_not_found';
  end if;
  if v_bas = '' then raise exception 'attestation_basis_required'; end if;
  if not exists (
    select 1 from public.supported_currencies
     where code = v_cur and active
  ) then
    raise exception 'unsupported_currency:%', v_cur;
  end if;

  select * into l from public.listings where id = p_listing_id for update;
  if not found then raise exception 'listing_not_found'; end if;

  -- Idempotent: same currency, already attested -> no-op, no second event.
  if l.asking_currency is not distinct from v_cur then
    return l;
  end if;

  v_type := case when l.asking_currency is null
                 then 'currency_attested' else 'currency_corrected' end;

  v_prior := pg_catalog.jsonb_build_object(
    'asking_currency', l.asking_currency,
    'asking_price',    pg_catalog.trim_scale(l.asking_price)::text,
    'asking_price_raw', l.asking_price_raw
  );

  update public.listings
     set asking_currency = v_cur
   where id = l.id
  returning * into l;

  insert into public.listing_currency_events (
    listing_id, event_type, prior_state, resulting_state, attestation_basis, actor_uid
  ) values (
    l.id, v_type, v_prior,
    pg_catalog.jsonb_build_object(
      'asking_currency', l.asking_currency,
      'asking_price',    pg_catalog.trim_scale(l.asking_price)::text,
      'asking_price_raw', l.asking_price_raw
    ),
    v_bas, p_actor_uid
  );

  return l;
end
$fn$;

-- --------------------------------------------------------------------------
-- 6. Execution boundary — service_role only, per repo convention
-- --------------------------------------------------------------------------

revoke all on function public.listing_attestation_fingerprint_v2(uuid) from public;
revoke all on function public.listing_attestation_fingerprint_v2(uuid) from anon;
revoke all on function public.listing_attestation_fingerprint_v2(uuid) from authenticated;
grant execute on function public.listing_attestation_fingerprint_v2(uuid) to service_role;

revoke all on function public.listing_currency_attest(uuid, text, text, uuid) from public;
revoke all on function public.listing_currency_attest(uuid, text, text, uuid) from anon;
revoke all on function public.listing_currency_attest(uuid, text, text, uuid) from authenticated;
grant execute on function public.listing_currency_attest(uuid, text, text, uuid) to service_role;

comment on table public.supported_currencies is
  'Curated launch currency set. Migration-controlled writes only; clients read.';
comment on table public.listing_currency_events is
  'Append-only founder currency-attestation history. Privilege-backed, not trigger-backed.';
comment on function public.listing_attestation_fingerprint_v2(uuid) is
  'v2 attestation fingerprint (15 frames incl. version + currency). DEFINED, NOT ACTIVATED — submit_listing_for_review still emits v1 until Stage B.';
