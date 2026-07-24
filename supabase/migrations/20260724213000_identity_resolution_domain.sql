-- ════════════════════════════════════════════════════════════════════════
-- v2.64 — Identity Resolution Domain (forward migration)
--
-- Governing law (hash-pinned by the 2026-07-24 authorization):
--   FairWatchTrade_Identity_Resolution_Architecture_2026-07-24_v1.md
--   (SHA-256 521442ae…de526)
--
-- ONE source-neutral identity domain shared by marketplace Listings and
-- Auction Evidence Lots. The source claim is never rewritten; candidates
-- suggest; a human decides; every correction appends; only a current,
-- fingerprint-valid, reviewed EXACT decision is Vault-attachable.
--
-- Three entities:
--   identity_resolution_case      — one stable container per source subject
--   identity_resolution_decision  — append-only reviewed decision chain
--   identity_resolution_candidate — immutable Vault targets under a decision
--
-- One controlled RPC owns every decision write:
--   public.identity_resolution_review_case(text, uuid, uuid, text, jsonb, text, uuid, uuid)
-- plus one shared fingerprint function (the single canonical implementation):
--   public.identity_resolution_claim_fingerprint(text, uuid)
--
-- Dedicated NOLOGIN owner role: identity_resolution_writer — same proven
-- pattern as the v2.61 Auction Evidence writer roles.
--
-- PFC274 = 62 — the evaluate route is untouched by this migration.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Dedicated non-superuser owner role ──
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'identity_resolution_writer') then
    create role identity_resolution_writer nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;

grant identity_resolution_writer to postgres with set true;
grant usage, create on schema public to identity_resolution_writer;
-- The fingerprint function reaches extensions.digest (pgcrypto lives in the
-- extensions schema on Supabase); the SECURITY DEFINER owner needs USAGE
-- there or every call fails with 42501 (caught during acceptance testing).
grant usage on schema extensions to identity_resolution_writer;

-- ── 1. Tables ──

-- 1.1 Case — one per source subject; exactly one real FK, matching its type.
create table public.identity_resolution_case (
  id             uuid        not null default gen_random_uuid(),
  subject_type   text        not null,
  listing_id     uuid,
  auction_lot_id uuid,
  created_at     timestamptz not null default now(),
  constraint identity_resolution_case_pkey primary key (id),
  constraint irc_subject_type_check
    check (subject_type in ('listing','auction_lot')),
  constraint irc_exactly_one_subject_check
    check (
      (subject_type = 'listing'     and listing_id is not null and auction_lot_id is null)
      or
      (subject_type = 'auction_lot' and auction_lot_id is not null and listing_id is null)
    ),
  constraint irc_listing_fk
    foreign key (listing_id) references public.listings (id) on delete restrict,
  constraint irc_auction_lot_fk
    foreign key (auction_lot_id) references public.auction_evidence_lot (id) on delete restrict
);
create unique index identity_resolution_case_one_per_listing
  on public.identity_resolution_case (listing_id) where listing_id is not null;
create unique index identity_resolution_case_one_per_auction_lot
  on public.identity_resolution_case (auction_lot_id) where auction_lot_id is not null;

-- 1.2 Decision — append-only reviewed chain. Same structural chain law as
-- auction_evidence_result: self-rooted first decision, composite self-FKs make
-- BOTH cross-chain AND cross-case supersession structurally impossible,
-- partial unique indexes enforce one-current-per-case and no-branching.
create table public.identity_resolution_decision (
  id                     uuid        not null default gen_random_uuid(),
  case_id                uuid        not null,
  chain_root_id          uuid        not null,
  supersedes_decision_id uuid,
  is_current             boolean     not null default true,
  outcome                text        not null,
  claim_fingerprint      text        not null,
  review_reason          text        not null,
  reviewed_by            uuid        not null,
  reviewed_at            timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  constraint identity_resolution_decision_pkey primary key (id),
  constraint ird_case_fk
    foreign key (case_id) references public.identity_resolution_case (id) on delete restrict,
  constraint ird_outcome_check
    check (outcome in ('exact','related','probable','ambiguous','unresolved','rejected')),
  constraint ird_reason_nonblank_check
    check (btrim(review_reason) <> ''),
  constraint ird_fingerprint_shape_check
    check (claim_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint identity_resolution_decision_id_chain_key unique (id, chain_root_id),
  constraint identity_resolution_decision_id_case_key  unique (id, case_id),
  constraint ird_supersedes_same_chain_fk
    foreign key (supersedes_decision_id, chain_root_id)
    references public.identity_resolution_decision (id, chain_root_id),
  constraint ird_supersedes_same_case_fk
    foreign key (supersedes_decision_id, case_id)
    references public.identity_resolution_decision (id, case_id),
  constraint ird_chain_root_wellformed_check
    check ((supersedes_decision_id is null and chain_root_id = id) or (supersedes_decision_id is not null))
);
create unique index identity_resolution_decision_one_current_per_case
  on public.identity_resolution_decision (case_id) where is_current;
create unique index identity_resolution_decision_no_branching
  on public.identity_resolution_decision (supersedes_decision_id) where supersedes_decision_id is not null;
create index identity_resolution_decision_case_idx on public.identity_resolution_decision (case_id);

-- 1.3 Candidate — immutable evidence targets of one decision. Exactly one
-- Vault target each; stable deterministic ordering.
create table public.identity_resolution_candidate (
  id                 uuid        not null default gen_random_uuid(),
  decision_id        uuid        not null,
  vault_reference_id uuid,
  vault_variant_id   uuid,
  candidate_role     text        not null,
  evidence           text        not null,
  ordinal            integer     not null,
  created_at         timestamptz not null default now(),
  constraint identity_resolution_candidate_pkey primary key (id),
  constraint irk_decision_fk
    foreign key (decision_id) references public.identity_resolution_decision (id) on delete restrict,
  constraint irk_exactly_one_target_check
    check (
      (vault_reference_id is not null and vault_variant_id is null)
      or
      (vault_reference_id is null and vault_variant_id is not null)
    ),
  constraint irk_vault_reference_fk
    foreign key (vault_reference_id) references public.vault_references (id) on delete restrict,
  constraint irk_vault_variant_fk
    foreign key (vault_variant_id) references public.vault_variants (id) on delete restrict,
  constraint irk_role_check
    check (candidate_role in ('selected','alternative','related','rejected')),
  constraint irk_evidence_nonblank_check
    check (btrim(evidence) <> ''),
  constraint irk_ordinal_positive_check
    check (ordinal >= 1),
  constraint identity_resolution_candidate_decision_ordinal_key unique (decision_id, ordinal)
);
create index identity_resolution_candidate_decision_idx on public.identity_resolution_candidate (decision_id);

-- ── 2. RLS ──
alter table public.identity_resolution_case      enable row level security;
alter table public.identity_resolution_decision  enable row level security;
alter table public.identity_resolution_candidate enable row level security;

-- writer: its function creates cases, reads/flips/inserts decisions, inserts
-- candidates, and reads the source + Vault tables it must validate against.
create policy irw_case_select      on public.identity_resolution_case      for select to identity_resolution_writer using (true);
create policy irw_case_insert     on public.identity_resolution_case      for insert to identity_resolution_writer with check (true);
-- UPDATE privilege + policy exist ONLY so the RPC's SELECT ... FOR UPDATE can
-- lock the case row (Postgres demands UPDATE rights for a row lock). The
-- function never actually updates a case.
create policy irw_case_lock       on public.identity_resolution_case      for update to identity_resolution_writer using (true) with check (true);
create policy irw_decision_select on public.identity_resolution_decision  for select to identity_resolution_writer using (true);
create policy irw_decision_insert on public.identity_resolution_decision  for insert to identity_resolution_writer with check (true);
create policy irw_decision_update on public.identity_resolution_decision  for update to identity_resolution_writer using (true) with check (true);
create policy irw_candidate_select on public.identity_resolution_candidate for select to identity_resolution_writer using (true);
create policy irw_candidate_insert on public.identity_resolution_candidate for insert to identity_resolution_writer with check (true);

create policy irw_listings_select   on public.listings              for select to identity_resolution_writer using (true);
create policy irw_auction_lot_select on public.auction_evidence_lot for select to identity_resolution_writer using (true);
create policy irw_vault_refs_select on public.vault_references      for select to identity_resolution_writer using (true);
create policy irw_vault_vars_select on public.vault_variants        for select to identity_resolution_writer using (true);

-- ── 3. Grants / revokes ──
revoke all on public.identity_resolution_case      from anon, authenticated;
revoke all on public.identity_resolution_decision  from anon, authenticated;
revoke all on public.identity_resolution_candidate from anon, authenticated;

-- service_role: read-only on the domain. Every mutation goes through the RPC.
revoke insert, update, delete on public.identity_resolution_case      from service_role;
revoke insert, update, delete on public.identity_resolution_decision  from service_role;
revoke insert, update, delete on public.identity_resolution_candidate from service_role;
grant  select on public.identity_resolution_case      to service_role;
grant  select on public.identity_resolution_decision  to service_role;
grant  select on public.identity_resolution_candidate to service_role;

grant select, insert, update on public.identity_resolution_case      to identity_resolution_writer; -- update = row-lock only (see policy note)
grant select, insert, update on public.identity_resolution_decision  to identity_resolution_writer;
grant select, insert         on public.identity_resolution_candidate to identity_resolution_writer;
grant select on public.listings              to identity_resolution_writer;
grant select on public.auction_evidence_lot  to identity_resolution_writer;
grant select on public.vault_references      to identity_resolution_writer;
grant select on public.vault_variants        to identity_resolution_writer;

-- ── 4. Shared claim fingerprint (the ONE canonical implementation) ──
-- Derived from the current identity-bearing source facts. Callers never
-- supply it; read helpers call this same function to test staleness.
create or replace function public.identity_resolution_claim_fingerprint(
  p_subject_type text,
  p_subject_id   uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_payload text;
begin
  if p_subject_type = 'listing' then
    select 'listing|brand=' || lower(btrim(coalesce(brand,'')))
        || '|model=' || lower(btrim(coalesce(model,'')))
        || '|reference=' || lower(btrim(coalesce(reference,'')))
      into v_payload
      from public.listings where id = p_subject_id;
  elsif p_subject_type = 'auction_lot' then
    select 'auction_lot|brand=' || lower(btrim(coalesce(brand_text,'')))
        || '|model=' || lower(btrim(coalesce(model_text,'')))
        || '|reference=' || lower(btrim(coalesce(reference_text,'')))
      into v_payload
      from public.auction_evidence_lot where id = p_subject_id;
  else
    raise exception 'invalid subject_type: %', coalesce(p_subject_type,'NULL');
  end if;

  if v_payload is null then
    raise exception '% % does not exist', p_subject_type, p_subject_id;
  end if;

  return encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex');
end;
$fn$;

alter function public.identity_resolution_claim_fingerprint(text, uuid) owner to identity_resolution_writer;
revoke all     on function public.identity_resolution_claim_fingerprint(text, uuid) from public;
revoke all     on function public.identity_resolution_claim_fingerprint(text, uuid) from anon;
revoke all     on function public.identity_resolution_claim_fingerprint(text, uuid) from authenticated;
grant  execute on function public.identity_resolution_claim_fingerprint(text, uuid) to service_role;

-- ── 5. The controlled review RPC ──
-- p_candidates: jsonb array of
--   { "role": "selected"|"alternative"|"related"|"rejected",
--     "vault_reference_id": uuid | null,
--     "vault_variant_id":   uuid | null,
--     "evidence": text }
-- Ordinals are assigned from array position (deterministic ordering).
-- p_expected_current_decision_id: null on an initial review (the case must
-- have no current decision); on a correction it must equal the live current
-- decision id or the call fails as stale.
create or replace function public.identity_resolution_review_case(
  p_subject_type                 text,
  p_listing_id                   uuid,
  p_auction_lot_id               uuid,
  p_outcome                      text,
  p_candidates                   jsonb,
  p_review_reason                text,
  p_reviewer_uid                 uuid,
  p_expected_current_decision_id uuid
)
returns public.identity_resolution_decision
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_case      public.identity_resolution_case;
  v_current   public.identity_resolution_decision;
  v_row       public.identity_resolution_decision;
  v_new_id    uuid := gen_random_uuid();
  v_subject   uuid;
  v_fp        text;
  v_cands     jsonb;
  v_cand      jsonb;
  v_n         int;
  v_selected  int := 0;
  v_related   int := 0;
  v_rejected  int := 0;
  v_alt       int := 0;
  v_role      text;
  v_ref       uuid;
  v_var       uuid;
  i           int;
begin
  -- authority + basic validation
  if p_reviewer_uid is null then raise exception 'reviewer_uid is required'; end if;
  if p_review_reason is null or btrim(p_review_reason) = '' then
    raise exception 'review_reason is required (non-blank)';
  end if;
  if p_outcome is null or p_outcome not in ('exact','related','probable','ambiguous','unresolved','rejected') then
    raise exception 'invalid outcome: %', coalesce(p_outcome,'NULL');
  end if;
  if p_subject_type = 'listing' then
    if p_listing_id is null or p_auction_lot_id is not null then
      raise exception 'subject_type listing requires exactly listing_id';
    end if;
    v_subject := p_listing_id;
  elsif p_subject_type = 'auction_lot' then
    if p_auction_lot_id is null or p_listing_id is not null then
      raise exception 'subject_type auction_lot requires exactly auction_lot_id';
    end if;
    v_subject := p_auction_lot_id;
  else
    raise exception 'invalid subject_type: %', coalesce(p_subject_type,'NULL');
  end if;

  -- candidate cardinality by outcome
  v_cands := coalesce(p_candidates, '[]'::jsonb);
  if jsonb_typeof(v_cands) <> 'array' then raise exception 'p_candidates must be a json array'; end if;
  v_n := jsonb_array_length(v_cands);
  for i in 0 .. v_n - 1 loop
    v_role := v_cands -> i ->> 'role';
    if v_role is null or v_role not in ('selected','alternative','related','rejected') then
      raise exception 'candidate %: invalid role %', i + 1, coalesce(v_role,'NULL');
    end if;
    if v_role = 'selected'  then v_selected := v_selected + 1; end if;
    if v_role = 'related'   then v_related  := v_related  + 1; end if;
    if v_role = 'rejected'  then v_rejected := v_rejected + 1; end if;
    if v_role = 'alternative' then v_alt    := v_alt      + 1; end if;
  end loop;

  if p_outcome = 'exact' and not (v_n = 1 and v_selected = 1) then
    raise exception 'exact requires exactly one selected candidate';
  elsif p_outcome = 'related' and not (v_n = 1 and v_related = 1) then
    raise exception 'related requires exactly one related candidate';
  elsif p_outcome = 'probable' and not (v_selected = 1 and v_n >= 1 and v_selected + v_alt = v_n) then
    raise exception 'probable requires one selected candidate plus optional alternatives';
  elsif p_outcome = 'ambiguous' and not (v_n >= 2 and v_selected = 0 and v_alt = v_n) then
    raise exception 'ambiguous requires at least two candidates and no selection';
  elsif p_outcome = 'unresolved' and v_n <> 0 then
    raise exception 'unresolved takes no candidates';
  elsif p_outcome = 'rejected' and not (v_n = 1 and v_rejected = 1) then
    raise exception 'rejected requires exactly the one rejected target, preserved';
  end if;

  -- server-built fingerprint from the CURRENT source facts (also validates
  -- that the subject actually exists)
  v_fp := public.identity_resolution_claim_fingerprint(p_subject_type, v_subject);

  -- find-or-create the case, then lock it
  select * into v_case from public.identity_resolution_case
   where (p_subject_type = 'listing'     and listing_id = v_subject)
      or (p_subject_type = 'auction_lot' and auction_lot_id = v_subject)
   for update;
  if not found then
    if p_expected_current_decision_id is not null then
      raise exception 'no case exists for this subject; expected-current must be null on an initial review';
    end if;
    insert into public.identity_resolution_case (subject_type, listing_id, auction_lot_id)
    values (p_subject_type,
            case when p_subject_type = 'listing' then v_subject end,
            case when p_subject_type = 'auction_lot' then v_subject end)
    returning * into v_case;
  end if;

  -- lock the current decision (if any) and enforce expected-current
  select * into v_current from public.identity_resolution_decision
   where case_id = v_case.id and is_current
   for update;
  if found then
    if p_expected_current_decision_id is null then
      raise exception 'case % already has a current decision; corrections must name it', v_case.id;
    end if;
    if v_current.id <> p_expected_current_decision_id then
      raise exception 'stale expected-current: live current decision is %, caller expected %',
        v_current.id, p_expected_current_decision_id;
    end if;
    update public.identity_resolution_decision
       set is_current = false where id = v_current.id;
  else
    if p_expected_current_decision_id is not null then
      raise exception 'case % has no current decision; expected-current must be null', v_case.id;
    end if;
  end if;

  insert into public.identity_resolution_decision (
    id, case_id, chain_root_id, supersedes_decision_id, is_current,
    outcome, claim_fingerprint, review_reason, reviewed_by, reviewed_at
  ) values (
    v_new_id, v_case.id,
    case when v_current.id is null then v_new_id else v_current.chain_root_id end,
    v_current.id, true,
    p_outcome, v_fp, p_review_reason, p_reviewer_uid, now()
  ) returning * into v_row;

  -- immutable candidates, ordinal = array position (deterministic)
  for i in 0 .. v_n - 1 loop
    v_cand := v_cands -> i;
    v_ref := nullif(v_cand ->> 'vault_reference_id', '')::uuid;
    v_var := nullif(v_cand ->> 'vault_variant_id', '')::uuid;
    if (v_ref is null) = (v_var is null) then
      raise exception 'candidate %: exactly one Vault target is required', i + 1;
    end if;
    if v_ref is not null and not exists (select 1 from public.vault_references where id = v_ref) then
      raise exception 'candidate %: vault reference % does not exist', i + 1, v_ref;
    end if;
    if v_var is not null and not exists (select 1 from public.vault_variants where id = v_var) then
      raise exception 'candidate %: vault variant % does not exist', i + 1, v_var;
    end if;
    if v_cand ->> 'evidence' is null or btrim(v_cand ->> 'evidence') = '' then
      raise exception 'candidate %: evidence is required (non-blank)', i + 1;
    end if;
    insert into public.identity_resolution_candidate (
      decision_id, vault_reference_id, vault_variant_id, candidate_role, evidence, ordinal
    ) values (
      v_row.id, v_ref, v_var, v_cand ->> 'role', v_cand ->> 'evidence', i + 1
    );
  end loop;

  return v_row;
end;
$fn$;

alter function public.identity_resolution_review_case(text, uuid, uuid, text, jsonb, text, uuid, uuid) owner to identity_resolution_writer;
revoke all     on function public.identity_resolution_review_case(text, uuid, uuid, text, jsonb, text, uuid, uuid) from public;
revoke all     on function public.identity_resolution_review_case(text, uuid, uuid, text, jsonb, text, uuid, uuid) from anon;
revoke all     on function public.identity_resolution_review_case(text, uuid, uuid, text, jsonb, text, uuid, uuid) from authenticated;
grant  execute on function public.identity_resolution_review_case(text, uuid, uuid, text, jsonb, text, uuid, uuid) to service_role;

-- PFC274 = 62 — the evaluate route is untouched by this migration.
