-- ════════════════════════════════════════════════════════════════════════
-- v2.61 — Auction Evidence Preservation Layer (forward migration)
--
-- Governing inputs (both hash-pinned by the 2026-07-23 authorization):
--   • Brief-AuctionEvidence-Implementation-FINAL-2026-07-22 (6).md  (impl v6)
--   • Auction_Evidence_Lot_Fact_History_Bounded_Correction_v1.md    (Design Duck)
-- Stop checks (function-owner + column-level privileges): PASSED on live
-- project aqgjcezhdoianqmoknnu, proven transactionally.
--
-- SEVEN entities: house · sale · source_artifact · lot · result ·
-- source_artifact_events · lot_fact_events. Structurally separate from
-- auction_events. NO Vault reference/variant column anywhere — the
-- unresolved-identity boundary is enforced by that absence.
-- resolveListingReference.ts is untouched.
--
-- Authority: founder-UID gate at the server route (NOT in RLS). RLS denies
-- anon/authenticated categorically.
--   • auction_evidence_result — function-only writes; INSERT/UPDATE/DELETE
--     revoked from anon/authenticated/service_role; sole writer is
--     auction_evidence_create_or_correct_result (SECURITY DEFINER, owned by
--     auction_evidence_result_writer).
--   • auction_evidence_source_artifact — COLUMN-level split: service_role may
--     write ordinary fields directly; the six rights/state columns change ONLY
--     via auction_evidence_update_artifact_rights_state (owned by
--     auction_evidence_rights_writer), which also writes the append-only event.
--   • auction_evidence_lot — COLUMN-level split (Lot-fact amendment): the five
--     reported-fact columns (brand_text, model_text, reference_text,
--     description, source_artifact_id) change ONLY via
--     auction_evidence_correct_lot_facts (owned by auction_evidence_lot_writer),
--     which appends the before/after evidence event atomically. Initial lot
--     creation remains a direct service_role INSERT via the gated route.
--   • auction_evidence_source_artifact_events / auction_evidence_lot_fact_events
--     — append-only; no application UPDATE/DELETE, ever.
--
-- Owner-role decision (the v6 open question, resolved): one dedicated
-- non-superuser owner role PER RPC DOMAIN — result_writer, rights_writer,
-- lot_writer. Sharing an owner would bleed one function's write surface into
-- another's; three narrow roles is the smallest arrangement in which each
-- RPC's privileges are exactly its own contract.
--
-- Paired guarded rollback:
--   supabase/rollbacks/20260723214500_auction_evidence_preservation_layer.down.sql
--
-- PFC274 = 62 — the evaluate route is untouched by this migration.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Three dedicated non-superuser owner roles ──
-- Each needs (proven by stop check): GRANT role TO postgres WITH SET  (to
-- reassign ownership) + GRANT USAGE,CREATE ON SCHEMA public (to own an object
-- in public and resolve objects from inside its SECURITY DEFINER function).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'auction_evidence_result_writer') then
    create role auction_evidence_result_writer nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'auction_evidence_rights_writer') then
    create role auction_evidence_rights_writer nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'auction_evidence_lot_writer') then
    create role auction_evidence_lot_writer nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;

grant auction_evidence_result_writer to postgres with set true;
grant auction_evidence_rights_writer to postgres with set true;
grant auction_evidence_lot_writer    to postgres with set true;
grant usage, create on schema public to auction_evidence_result_writer;
grant usage, create on schema public to auction_evidence_rights_writer;
grant usage, create on schema public to auction_evidence_lot_writer;

-- ── 1. updated_at trigger function (domain-local) ──
create or replace function public.auction_evidence_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

-- ── 2. Tables ──

-- 2.1 House
create table public.auction_evidence_house (
  id          uuid        not null default gen_random_uuid(),
  name        text        not null,
  slug        text        not null,
  website_url text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint auction_evidence_house_pkey primary key (id),
  constraint auction_evidence_house_slug_key unique (slug)
);

-- 2.2 Sale
create table public.auction_evidence_sale (
  id         uuid        not null default gen_random_uuid(),
  house_id   uuid        not null,
  sale_name  text        not null,
  sale_date  date,
  location   text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auction_evidence_sale_pkey primary key (id),
  constraint auction_evidence_sale_house_fk
    foreign key (house_id) references public.auction_evidence_house (id) on delete restrict
);
create index auction_evidence_sale_house_idx on public.auction_evidence_sale (house_id);

-- 2.3 Source Artifact (five split permission fields; content_hash format; retention CHECK)
create table public.auction_evidence_source_artifact (
  id                         uuid        not null default gen_random_uuid(),
  sale_id                    uuid        not null,
  source_url                 text        not null,
  retrieved_at               timestamptz not null,
  content_hash               text,
  intake_method              text        not null,
  permission_status          text        not null default 'unresolved',
  automation_status          text        not null default 'not_applicable',
  publication_status         text        not null default 'unresolved',
  artifact_retention_scope   text        not null default 'metadata_only',
  attribution_note           text,
  price_basis_statement      text,
  omission_statement         text,
  full_artifact_storage_path text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint auction_evidence_source_artifact_pkey primary key (id),
  -- composite unique is the FK target for the Lot cross-sale composite FK
  constraint auction_evidence_source_artifact_id_sale_key unique (id, sale_id),
  constraint auction_evidence_source_artifact_sale_fk
    foreign key (sale_id) references public.auction_evidence_sale (id) on delete restrict,
  constraint asa_content_hash_check
    check (content_hash is null or content_hash ~ '^[0-9a-fA-F]{64}$'),
  constraint asa_intake_method_check
    check (intake_method in ('automated','public_file','founder_supplied_file','manual_entry')),
  constraint asa_permission_status_check
    check (permission_status in ('permitted','authorized_or_licensed','restricted','unresolved')),
  constraint asa_automation_status_check
    check (automation_status in ('allowed','disabled','not_applicable')),
  constraint asa_publication_status_check
    check (publication_status in ('allowed','internal_only','blocked','unresolved')),
  constraint asa_retention_scope_check
    check (artifact_retention_scope in ('metadata_only','full_artifact_private','full_artifact_publishable')),
  constraint asa_retention_path_check
    check (
      (artifact_retention_scope = 'metadata_only' and full_artifact_storage_path is null)
      or
      (artifact_retention_scope in ('full_artifact_private','full_artifact_publishable') and full_artifact_storage_path is not null)
    )
);
create index auction_evidence_source_artifact_sale_idx on public.auction_evidence_source_artifact (sale_id);

-- 2.4 Lot (composite FK to Source Artifact prevents cross-sale attachment)
create table public.auction_evidence_lot (
  id                 uuid        not null default gen_random_uuid(),
  sale_id            uuid        not null,
  lot_number         text        not null,
  brand_text         text,
  model_text         text,
  reference_text     text,
  description        text,
  source_artifact_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint auction_evidence_lot_pkey primary key (id),
  constraint auction_evidence_lot_sale_fk
    foreign key (sale_id) references public.auction_evidence_sale (id) on delete restrict,
  -- (source_artifact_id, sale_id) must jointly match a real artifact in the SAME sale
  constraint auction_evidence_lot_source_artifact_same_sale_fk
    foreign key (source_artifact_id, sale_id)
    references public.auction_evidence_source_artifact (id, sale_id) on delete restrict,
  constraint auction_evidence_lot_sale_lotnumber_key unique (sale_id, lot_number)
);
create index auction_evidence_lot_source_artifact_idx on public.auction_evidence_lot (source_artifact_id);

-- 2.5 Result (correction chain; per-lot & per-chain single-current; no branching)
create table public.auction_evidence_result (
  id                   uuid        not null default gen_random_uuid(),
  chain_root_id        uuid        not null,
  supersedes_result_id uuid,
  is_current           boolean     not null default true,
  lot_id               uuid        not null,
  price_realized       numeric,
  currency             text,
  price_basis          text,
  sale_outcome         text        not null,
  result_date          date,
  source_artifact_id   uuid,
  reviewed_by          uuid        not null,
  reviewed_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint auction_evidence_result_pkey primary key (id),
  constraint auction_evidence_result_id_chain_key unique (id, chain_root_id),
  constraint auction_evidence_result_lot_fk
    foreign key (lot_id) references public.auction_evidence_lot (id) on delete restrict,
  constraint auction_evidence_result_source_artifact_fk
    foreign key (source_artifact_id) references public.auction_evidence_source_artifact (id) on delete restrict,
  constraint auction_evidence_result_supersedes_same_chain_fk
    foreign key (supersedes_result_id, chain_root_id)
    references public.auction_evidence_result (id, chain_root_id),
  -- the original row of a chain is self-rooted; corrections carry a supersede pointer
  constraint auction_evidence_result_chain_root_wellformed_check
    check ((supersedes_result_id is null and chain_root_id = id) or (supersedes_result_id is not null)),
  constraint aer_price_realized_nonneg_check
    check (price_realized is null or price_realized >= 0),
  constraint aer_currency_format_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint aer_price_basis_check
    check (price_basis is null or price_basis in ('hammer','hammer_plus_premium','other')),
  constraint aer_sale_outcome_check
    check (sale_outcome in ('sold','passed','withdrawn')),
  -- price/currency/basis are all-present or all-absent together
  constraint aer_price_triplet_check
    check (
      (price_realized is null and currency is null and price_basis is null)
      or
      (price_realized is not null and currency is not null and price_basis is not null)
    ),
  -- only 'sold' may carry a price at all; passed/withdrawn must have all three null
  constraint aer_price_only_when_sold_check
    check (sale_outcome = 'sold' or (price_realized is null and currency is null and price_basis is null))
);
create unique index auction_evidence_result_one_current_per_chain on public.auction_evidence_result (chain_root_id) where is_current;
create unique index auction_evidence_result_one_current_per_lot   on public.auction_evidence_result (lot_id)        where is_current;
create unique index auction_evidence_result_no_branching          on public.auction_evidence_result (supersedes_result_id) where supersedes_result_id is not null;
create index auction_evidence_result_lot_idx             on public.auction_evidence_result (lot_id);
create index auction_evidence_result_source_artifact_idx on public.auction_evidence_result (source_artifact_id);

-- 2.6 Source Artifact Events (append-only rights/takedown history)
create table public.auction_evidence_source_artifact_events (
  id                 uuid        not null default gen_random_uuid(),
  source_artifact_id uuid        not null,
  event_type         text        not null,
  prior_state        jsonb       not null,
  resulting_state    jsonb       not null,
  reason             text,
  actor_uid          uuid        not null,
  created_at         timestamptz not null default now(),
  constraint auction_evidence_source_artifact_events_pkey primary key (id),
  constraint aesae_source_artifact_fk
    foreign key (source_artifact_id) references public.auction_evidence_source_artifact (id) on delete restrict,
  constraint aesae_event_type_check
    check (event_type in ('rights_state_change','takedown','restriction','blocking')),
  -- reason required (non-null, non-whitespace) for withdrawal-class events
  constraint aesae_reason_required_check
    check (event_type not in ('takedown','restriction','blocking') or (reason is not null and btrim(reason) <> ''))
);
create index auction_evidence_source_artifact_events_artifact_idx on public.auction_evidence_source_artifact_events (source_artifact_id);

-- 2.7 Lot Fact Events (append-only reported-fact correction history — Design
-- Duck's bounded amendment). auction_evidence_lot stays the stable identity and
-- current accepted projection; every protected-fact correction appends the
-- complete before/after snapshot here. Structural/locator fields (id, sale_id,
-- lot_number, created_at, updated_at) are NOT corrected through this mechanism.
create table public.auction_evidence_lot_fact_events (
  id                            uuid        not null default gen_random_uuid(),
  lot_id                        uuid        not null,
  prior_state                   jsonb       not null,
  resulting_state               jsonb       not null,
  prior_source_artifact_id      uuid,
  resulting_source_artifact_id  uuid        not null,
  correction_reason             text        not null,
  reviewer_uid                  uuid        not null,
  created_at                    timestamptz not null default now(),
  constraint auction_evidence_lot_fact_events_pkey primary key (id),
  constraint aelfe_lot_fk
    foreign key (lot_id) references public.auction_evidence_lot (id) on delete restrict,
  constraint aelfe_reason_nonblank_check
    check (btrim(correction_reason) <> '')
);
create index auction_evidence_lot_fact_events_lot_idx on public.auction_evidence_lot_fact_events (lot_id);

-- ── 3. updated_at triggers (five mutable tables; both event tables are append-only) ──
create trigger auction_evidence_house_touch           before update on public.auction_evidence_house           for each row execute function public.auction_evidence_touch_updated_at();
create trigger auction_evidence_sale_touch            before update on public.auction_evidence_sale            for each row execute function public.auction_evidence_touch_updated_at();
create trigger auction_evidence_source_artifact_touch before update on public.auction_evidence_source_artifact for each row execute function public.auction_evidence_touch_updated_at();
create trigger auction_evidence_lot_touch             before update on public.auction_evidence_lot             for each row execute function public.auction_evidence_touch_updated_at();
create trigger auction_evidence_result_touch          before update on public.auction_evidence_result          for each row execute function public.auction_evidence_touch_updated_at();

-- ── 4. RLS: deny anon/authenticated; scoped policies for the two owner roles ──
alter table public.auction_evidence_house                  enable row level security;
alter table public.auction_evidence_sale                   enable row level security;
alter table public.auction_evidence_source_artifact        enable row level security;
alter table public.auction_evidence_lot                    enable row level security;
alter table public.auction_evidence_result                 enable row level security;
alter table public.auction_evidence_source_artifact_events enable row level security;
alter table public.auction_evidence_lot_fact_events        enable row level security;

-- result_writer: its function reads lot + source_artifact (same-sale check) and writes result
create policy aer_result_writer_lot_select    on public.auction_evidence_lot             for select to auction_evidence_result_writer using (true);
create policy aer_result_writer_artifact_select on public.auction_evidence_source_artifact for select to auction_evidence_result_writer using (true);
create policy aer_result_writer_result_all    on public.auction_evidence_result          for all    to auction_evidence_result_writer using (true) with check (true);

-- rights_writer: its function reads+updates source_artifact and appends events
create policy aer_rights_writer_artifact_select on public.auction_evidence_source_artifact for select to auction_evidence_rights_writer using (true);
create policy aer_rights_writer_artifact_update on public.auction_evidence_source_artifact for update to auction_evidence_rights_writer using (true) with check (true);
create policy aer_rights_writer_events_select   on public.auction_evidence_source_artifact_events for select to auction_evidence_rights_writer using (true);
create policy aer_rights_writer_events_insert   on public.auction_evidence_source_artifact_events for insert to auction_evidence_rights_writer with check (true);

-- lot_writer: its function reads+updates lot facts, reads artifacts (same-sale
-- check), and appends lot-fact events
create policy aer_lot_writer_lot_select      on public.auction_evidence_lot             for select to auction_evidence_lot_writer using (true);
create policy aer_lot_writer_lot_update      on public.auction_evidence_lot             for update to auction_evidence_lot_writer using (true) with check (true);
create policy aer_lot_writer_artifact_select on public.auction_evidence_source_artifact for select to auction_evidence_lot_writer using (true);
create policy aer_lot_writer_events_select   on public.auction_evidence_lot_fact_events for select to auction_evidence_lot_writer using (true);
create policy aer_lot_writer_events_insert   on public.auction_evidence_lot_fact_events for insert to auction_evidence_lot_writer with check (true);

-- ── 5. Grants / revokes ──
-- Supabase default privileges auto-GRANT ALL to anon/authenticated/service_role
-- on new public tables; strip anon/authenticated everywhere.
revoke all on public.auction_evidence_house                  from anon, authenticated;
revoke all on public.auction_evidence_sale                   from anon, authenticated;
revoke all on public.auction_evidence_source_artifact        from anon, authenticated;
revoke all on public.auction_evidence_lot                    from anon, authenticated;
revoke all on public.auction_evidence_result                 from anon, authenticated;
revoke all on public.auction_evidence_source_artifact_events from anon, authenticated;
revoke all on public.auction_evidence_lot_fact_events        from anon, authenticated;

-- House/Sale: direct service_role SELECT/INSERT/UPDATE via the gated route
-- (service_role keeps its default grant — nothing to add).

-- Lot: COLUMN-level split (Lot-fact amendment). Initial creation stays a direct
-- service_role INSERT; the five reported-fact columns change ONLY through the
-- lot-facts RPC. Structural/locator columns (sale_id, lot_number) remain
-- directly updatable through the gated route.
revoke update on public.auction_evidence_lot from service_role;
grant  update (sale_id, lot_number) on public.auction_evidence_lot to service_role;
-- lot_writer: SELECT + UPDATE only on the five protected fact columns; reads
-- artifacts for the same-sale check; SELECT+INSERT on its append-only events.
grant select on public.auction_evidence_lot             to auction_evidence_lot_writer;
grant update (brand_text, model_text, reference_text, description, source_artifact_id)
  on public.auction_evidence_lot to auction_evidence_lot_writer;
grant select on public.auction_evidence_source_artifact to auction_evidence_lot_writer;

-- Source Artifact: COLUMN-level split for service_role. Drop table-level UPDATE
-- and DELETE, then re-grant UPDATE only on ordinary descriptive columns. The six
-- rights columns + id/sale_id/created_at/updated_at stay non-updatable by
-- service_role. SELECT + INSERT remain (default).
revoke update, delete on public.auction_evidence_source_artifact from service_role;
grant update (source_url, content_hash, attribution_note, price_basis_statement, omission_statement) on public.auction_evidence_source_artifact to service_role;
-- rights_writer: SELECT + UPDATE only on the six protected columns
grant select on public.auction_evidence_source_artifact to auction_evidence_rights_writer;
grant update (intake_method, permission_status, automation_status, publication_status, artifact_retention_scope, full_artifact_storage_path) on public.auction_evidence_source_artifact to auction_evidence_rights_writer;

-- Result: function-only. Revoke all app-facing DML from service_role; keep SELECT.
revoke insert, update, delete on public.auction_evidence_result from service_role;
grant  select                  on public.auction_evidence_result to   service_role;
-- result_writer: reads lot + artifact, writes result
grant select on public.auction_evidence_lot                    to auction_evidence_result_writer;
grant select on public.auction_evidence_source_artifact        to auction_evidence_result_writer;
grant select, insert, update on public.auction_evidence_result to auction_evidence_result_writer;

-- Events: append-only via RPC. Revoke all DML from service_role; keep SELECT.
revoke insert, update, delete on public.auction_evidence_source_artifact_events from service_role;
grant  select                  on public.auction_evidence_source_artifact_events to   service_role;
-- rights_writer: SELECT + INSERT only (never update/delete — append-only)
grant select, insert on public.auction_evidence_source_artifact_events to auction_evidence_rights_writer;

-- Lot Fact Events: append-only via RPC. Revoke all DML from service_role; keep SELECT.
revoke insert, update, delete on public.auction_evidence_lot_fact_events from service_role;
grant  select                  on public.auction_evidence_lot_fact_events to   service_role;
-- lot_writer: SELECT + INSERT only (never update/delete — append-only)
grant select, insert on public.auction_evidence_lot_fact_events to auction_evidence_lot_writer;

-- ── 6. Result RPC ──
create or replace function public.auction_evidence_create_or_correct_result(
  p_lot_id               uuid,
  p_price_realized       numeric,
  p_currency             text,
  p_price_basis          text,
  p_sale_outcome         text,
  p_result_date          date,
  p_source_artifact_id   uuid,
  p_supersedes_result_id uuid,
  p_reviewer_uid         uuid
)
returns public.auction_evidence_result
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_target   public.auction_evidence_result;
  v_row      public.auction_evidence_result;
  v_new_id   uuid := gen_random_uuid();
  v_lot_sale uuid;
  v_art_sale uuid;
begin
  if p_reviewer_uid is null then raise exception 'reviewer_uid is required'; end if;
  if p_sale_outcome is null then raise exception 'sale_outcome is required'; end if;

  if p_supersedes_result_id is null then
    -- NEW CHAIN
    select sale_id into v_lot_sale from public.auction_evidence_lot where id = p_lot_id;
    if p_lot_id is null or v_lot_sale is null then
      raise exception 'lot % does not exist', p_lot_id;
    end if;
    if exists (select 1 from public.auction_evidence_result where lot_id = p_lot_id) then
      raise exception 'lot % already has a result chain; corrections must supersede the current row, not start a new chain', p_lot_id;
    end if;
    if p_source_artifact_id is not null then
      select sale_id into v_art_sale from public.auction_evidence_source_artifact where id = p_source_artifact_id;
      if v_art_sale is distinct from v_lot_sale then
        raise exception 'source artifact % belongs to a different sale than lot %', p_source_artifact_id, p_lot_id;
      end if;
    end if;
    insert into public.auction_evidence_result (
      id, chain_root_id, supersedes_result_id, is_current, lot_id,
      price_realized, currency, price_basis, sale_outcome, result_date,
      source_artifact_id, reviewed_by, reviewed_at
    ) values (
      v_new_id, v_new_id, null, true, p_lot_id,
      p_price_realized, p_currency, p_price_basis, p_sale_outcome, p_result_date,
      p_source_artifact_id, p_reviewer_uid, now()
    ) returning * into v_row;
    return v_row;
  end if;

  -- CORRECTION
  select * into v_target from public.auction_evidence_result where id = p_supersedes_result_id for update;
  if not found then raise exception 'supersedes target % does not exist', p_supersedes_result_id; end if;
  if not v_target.is_current then
    raise exception 'target % is not current; corrections may only supersede the current row in a chain', p_supersedes_result_id;
  end if;

  if p_source_artifact_id is not null then
    select sale_id into v_art_sale from public.auction_evidence_source_artifact where id = p_source_artifact_id;
    select sale_id into v_lot_sale from public.auction_evidence_lot where id = v_target.lot_id;
    if v_art_sale is distinct from v_lot_sale then
      raise exception 'source artifact % belongs to a different sale than lot %', p_source_artifact_id, v_target.lot_id;
    end if;
  end if;

  update public.auction_evidence_result set is_current = false, updated_at = now() where id = v_target.id;

  insert into public.auction_evidence_result (
    id, chain_root_id, supersedes_result_id, is_current, lot_id,
    price_realized, currency, price_basis, sale_outcome, result_date,
    source_artifact_id, reviewed_by, reviewed_at
  ) values (
    v_new_id, v_target.chain_root_id, v_target.id, true, v_target.lot_id,
    p_price_realized, p_currency, p_price_basis, p_sale_outcome, p_result_date,
    p_source_artifact_id, p_reviewer_uid, now()
  ) returning * into v_row;
  return v_row;
end;
$fn$;

alter function public.auction_evidence_create_or_correct_result(uuid, numeric, text, text, text, date, uuid, uuid, uuid) owner to auction_evidence_result_writer;
revoke all     on function public.auction_evidence_create_or_correct_result(uuid, numeric, text, text, text, date, uuid, uuid, uuid) from public;
revoke all     on function public.auction_evidence_create_or_correct_result(uuid, numeric, text, text, text, date, uuid, uuid, uuid) from anon;
revoke all     on function public.auction_evidence_create_or_correct_result(uuid, numeric, text, text, text, date, uuid, uuid, uuid) from authenticated;
grant  execute on function public.auction_evidence_create_or_correct_result(uuid, numeric, text, text, text, date, uuid, uuid, uuid) to   service_role;

-- ── 7. Rights-state RPC (atomic state change + append-only event) ──
create or replace function public.auction_evidence_update_artifact_rights_state(
  p_source_artifact_id                uuid,
  p_change_intake_method              boolean,
  p_new_intake_method                 text,
  p_change_permission_status          boolean,
  p_new_permission_status             text,
  p_change_automation_status          boolean,
  p_new_automation_status             text,
  p_change_publication_status         boolean,
  p_new_publication_status            text,
  p_change_artifact_retention_scope   boolean,
  p_new_artifact_retention_scope      text,
  p_change_full_artifact_storage_path boolean,
  p_new_full_artifact_storage_path    text,
  p_event_type                        text,
  p_reason                            text,
  p_actor_uid                         uuid
)
returns public.auction_evidence_source_artifact
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_art   public.auction_evidence_source_artifact;
  v_after public.auction_evidence_source_artifact;
  n_intake text; n_perm text; n_auto text; n_pub text; n_ret text; n_path text;
  v_prior jsonb; v_result jsonb;
  v_any_change boolean;
  pub_to_blocked boolean; perm_withdrawn boolean; more_restrictive boolean;
begin
  if p_actor_uid is null then raise exception 'actor_uid is required'; end if;
  if p_event_type is null or p_event_type not in ('rights_state_change','takedown','restriction','blocking') then
    raise exception 'invalid event_type: %', coalesce(p_event_type,'NULL');
  end if;
  if not (p_change_intake_method or p_change_permission_status or p_change_automation_status
          or p_change_publication_status or p_change_artifact_retention_scope or p_change_full_artifact_storage_path) then
    raise exception 'no-op: at least one field change is required';
  end if;
  if p_event_type in ('takedown','restriction','blocking') and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'reason is required (non-empty) for a % event', p_event_type;
  end if;

  select * into v_art from public.auction_evidence_source_artifact where id = p_source_artifact_id for update;
  if not found then raise exception 'source artifact % does not exist', p_source_artifact_id; end if;

  -- compute resulting values (change flag true => new value applied, even NULL)
  n_intake := case when p_change_intake_method then p_new_intake_method else v_art.intake_method end;
  n_perm   := case when p_change_permission_status then p_new_permission_status else v_art.permission_status end;
  n_auto   := case when p_change_automation_status then p_new_automation_status else v_art.automation_status end;
  n_pub    := case when p_change_publication_status then p_new_publication_status else v_art.publication_status end;
  n_ret    := case when p_change_artifact_retention_scope then p_new_artifact_retention_scope else v_art.artifact_retention_scope end;
  n_path   := case when p_change_full_artifact_storage_path then p_new_full_artifact_storage_path else v_art.full_artifact_storage_path end;

  v_any_change := (n_intake is distinct from v_art.intake_method)
    or (n_perm is distinct from v_art.permission_status)
    or (n_auto is distinct from v_art.automation_status)
    or (n_pub is distinct from v_art.publication_status)
    or (n_ret is distinct from v_art.artifact_retention_scope)
    or (n_path is distinct from v_art.full_artifact_storage_path);
  if not v_any_change then
    raise exception 'no-op: supplied changes leave every field identical';
  end if;

  -- transition classification vs the CLAIMED event_type
  pub_to_blocked := (n_pub = 'blocked' and v_art.publication_status is distinct from 'blocked');
  perm_withdrawn := (n_perm in ('restricted','unresolved') and v_art.permission_status not in ('restricted','unresolved'));
  more_restrictive :=
       (case n_perm when 'restricted' then 3 when 'unresolved' then 2 else 0 end) > (case v_art.permission_status when 'restricted' then 3 when 'unresolved' then 2 else 0 end)
    or (case n_pub when 'blocked' then 3 when 'internal_only' then 2 when 'unresolved' then 1 else 0 end) > (case v_art.publication_status when 'blocked' then 3 when 'internal_only' then 2 when 'unresolved' then 1 else 0 end)
    or (case n_auto when 'disabled' then 2 when 'not_applicable' then 1 else 0 end) > (case v_art.automation_status when 'disabled' then 2 when 'not_applicable' then 1 else 0 end)
    or (case n_ret when 'metadata_only' then 2 when 'full_artifact_private' then 1 else 0 end) > (case v_art.artifact_retention_scope when 'metadata_only' then 2 when 'full_artifact_private' then 1 else 0 end);

  if p_event_type = 'blocking' and not pub_to_blocked then
    raise exception 'event_type blocking requires publication_status to become blocked';
  elsif p_event_type = 'takedown' and not (pub_to_blocked or perm_withdrawn) then
    raise exception 'event_type takedown requires publication blocked or permission withdrawn';
  elsif p_event_type = 'restriction' and not more_restrictive then
    raise exception 'event_type restriction requires a move to a more restrictive state';
  end if;
  -- rights_state_change: any real change qualifies (already guaranteed by v_any_change)

  v_prior := jsonb_build_object(
    'intake_method', v_art.intake_method, 'permission_status', v_art.permission_status,
    'automation_status', v_art.automation_status, 'publication_status', v_art.publication_status,
    'artifact_retention_scope', v_art.artifact_retention_scope, 'full_artifact_storage_path', v_art.full_artifact_storage_path);

  -- Only the six protected columns are set here: rights_writer holds column-level
  -- UPDATE on exactly those. updated_at is set by the BEFORE UPDATE trigger, so it
  -- is deliberately NOT in this SET list (rights_writer has no grant on it).
  update public.auction_evidence_source_artifact set
    intake_method = n_intake, permission_status = n_perm, automation_status = n_auto,
    publication_status = n_pub, artifact_retention_scope = n_ret, full_artifact_storage_path = n_path
  where id = v_art.id
  returning * into v_after;

  v_result := jsonb_build_object(
    'intake_method', v_after.intake_method, 'permission_status', v_after.permission_status,
    'automation_status', v_after.automation_status, 'publication_status', v_after.publication_status,
    'artifact_retention_scope', v_after.artifact_retention_scope, 'full_artifact_storage_path', v_after.full_artifact_storage_path);

  insert into public.auction_evidence_source_artifact_events (
    source_artifact_id, event_type, prior_state, resulting_state, reason, actor_uid
  ) values (
    v_art.id, p_event_type, v_prior, v_result, p_reason, p_actor_uid
  );

  return v_after;
end;
$fn$;

alter function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) owner to auction_evidence_rights_writer;
revoke all     on function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) from public;
revoke all     on function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) from anon;
revoke all     on function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) from authenticated;
grant  execute on function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) to   service_role;

-- ── 8. Lot-facts RPC (atomic projection update + append-only event) ──
-- Design Duck's bounded amendment: auction_evidence_lot stays the current
-- accepted projection; this is the ONLY application path that corrects the five
-- protected reported-fact columns, and it cannot do so without appending the
-- complete before/after evidence in the same transaction.
--
-- Presence semantics: paired p_set_<field> booleans. flag=false carries the
-- field forward unchanged; flag=true applies the value exactly, INCLUDING null
-- — so "clear the reference" and "leave the reference alone" are two different,
-- representable calls (the amendment's explicit requirement).
create or replace function public.auction_evidence_correct_lot_facts(
  p_lot_id                       uuid,
  p_set_brand_text               boolean,
  p_new_brand_text               text,
  p_set_model_text               boolean,
  p_new_model_text               text,
  p_set_reference_text           boolean,
  p_new_reference_text           text,
  p_set_description              boolean,
  p_new_description              text,
  p_resulting_source_artifact_id uuid,
  p_correction_reason            text,
  p_reviewer_uid                 uuid
)
returns public.auction_evidence_lot
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_lot      public.auction_evidence_lot;
  v_after    public.auction_evidence_lot;
  v_art_sale uuid;
  n_brand text; n_model text; n_ref text; n_desc text;
  v_prior jsonb; v_result jsonb;
  v_any_change boolean;
begin
  if p_reviewer_uid is null then raise exception 'reviewer_uid is required'; end if;
  if p_correction_reason is null or btrim(p_correction_reason) = '' then
    raise exception 'correction_reason is required (non-blank)';
  end if;
  if p_resulting_source_artifact_id is null then
    raise exception 'resulting_source_artifact_id is required: every lot-fact correction must anchor to source evidence';
  end if;

  select * into v_lot from public.auction_evidence_lot where id = p_lot_id for update;
  if not found then raise exception 'lot % does not exist', p_lot_id; end if;

  -- same-sale verification (explicit, ahead of the composite FK, for a clear error)
  select sale_id into v_art_sale from public.auction_evidence_source_artifact
   where id = p_resulting_source_artifact_id;
  if v_art_sale is distinct from v_lot.sale_id then
    raise exception 'source artifact % does not belong to the same sale as lot %',
      p_resulting_source_artifact_id, p_lot_id;
  end if;

  n_brand := case when p_set_brand_text     then p_new_brand_text     else v_lot.brand_text     end;
  n_model := case when p_set_model_text     then p_new_model_text     else v_lot.model_text     end;
  n_ref   := case when p_set_reference_text then p_new_reference_text else v_lot.reference_text end;
  n_desc  := case when p_set_description    then p_new_description    else v_lot.description    end;

  v_any_change := (n_brand is distinct from v_lot.brand_text)
    or (n_model is distinct from v_lot.model_text)
    or (n_ref   is distinct from v_lot.reference_text)
    or (n_desc  is distinct from v_lot.description)
    or (p_resulting_source_artifact_id is distinct from v_lot.source_artifact_id);
  if not v_any_change then
    raise exception 'no-op: this correction changes nothing; refusing to record misleading history';
  end if;

  -- prior_state: every protected fact field, built from the LOCKED row.
  v_prior := jsonb_build_object(
    'brand_text', v_lot.brand_text, 'model_text', v_lot.model_text,
    'reference_text', v_lot.reference_text, 'description', v_lot.description,
    'source_artifact_id', v_lot.source_artifact_id);

  -- Only the five protected columns are set here: lot_writer holds column-level
  -- UPDATE on exactly those. updated_at is set by the BEFORE UPDATE trigger, so
  -- it is deliberately NOT in this SET list (lot_writer has no grant on it).
  update public.auction_evidence_lot set
    brand_text = n_brand, model_text = n_model, reference_text = n_ref,
    description = n_desc, source_artifact_id = p_resulting_source_artifact_id
  where id = v_lot.id
  returning * into v_after;

  v_result := jsonb_build_object(
    'brand_text', v_after.brand_text, 'model_text', v_after.model_text,
    'reference_text', v_after.reference_text, 'description', v_after.description,
    'source_artifact_id', v_after.source_artifact_id);

  insert into public.auction_evidence_lot_fact_events (
    lot_id, prior_state, resulting_state,
    prior_source_artifact_id, resulting_source_artifact_id,
    correction_reason, reviewer_uid
  ) values (
    v_lot.id, v_prior, v_result,
    v_lot.source_artifact_id, p_resulting_source_artifact_id,
    p_correction_reason, p_reviewer_uid
  );

  return v_after;
end;
$fn$;

alter function public.auction_evidence_correct_lot_facts(uuid, boolean, text, boolean, text, boolean, text, boolean, text, uuid, text, uuid) owner to auction_evidence_lot_writer;
revoke all     on function public.auction_evidence_correct_lot_facts(uuid, boolean, text, boolean, text, boolean, text, boolean, text, uuid, text, uuid) from public;
revoke all     on function public.auction_evidence_correct_lot_facts(uuid, boolean, text, boolean, text, boolean, text, boolean, text, uuid, text, uuid) from anon;
revoke all     on function public.auction_evidence_correct_lot_facts(uuid, boolean, text, boolean, text, boolean, text, boolean, text, uuid, text, uuid) from authenticated;
grant  execute on function public.auction_evidence_correct_lot_facts(uuid, boolean, text, boolean, text, boolean, text, boolean, text, uuid, text, uuid) to   service_role;

-- PFC274 = 62 — the evaluate route is untouched by this migration.
