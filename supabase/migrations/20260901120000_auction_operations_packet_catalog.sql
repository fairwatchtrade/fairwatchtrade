-- ═══════════════════════════════════════════════════════════════════════
-- AUCTION OPERATIONS — GOVERNED PACKET CATALOG
--
-- THE MISCONCEPTION THIS FILE EXISTS TO KILL:
--
--   "Packets and adapters are the same kind of thing, so both belong in
--    code."
--
-- They are not. An ADAPTER is executable parsing logic and stays a finite
-- server-side code allowlist — adding one is a code change, and should be.
-- A PACKET is an approved *instance*: this sale, this descriptor, these
-- hashes. Today both live hardcoded in two mirrored places
-- (lib/auction-operations/registry.ts and, again, in the browser), so a new
-- sale that fits an already-proven adapter still needs a programmer and a
-- deployment. That is the defect. This table ends it for instances only.
--
-- ── WHY NOT SECURITY DEFINER RPCs ──────────────────────────────────────
-- The order permits "bounded SECURITY DEFINER RPCs OR the repository's
-- equivalent protected server-side mechanism", and the repository's
-- equivalent is stricter than the default reading. auction_operations_run
-- already establishes it: revoke everything from every client role, grant
-- only service_role, and let founder-gated server routes do the writing
-- after resolving identity from the session themselves.
--
-- A SECURITY DEFINER function granted to `authenticated` would be a NEW
-- door reachable by any signed-in browser, defended only by a check inside
-- the function. The posture below has no door at all: anon and
-- authenticated cannot INSERT, UPDATE, DELETE or even SELECT here, so
-- there is nothing for a forged actor id, a spoofed header or a claimed
-- founder flag to aim at. Fewer doors beats better locks.
--
-- ── WHAT IS DELIBERATELY NOT BUILT ─────────────────────────────────────
-- No mutable singleton packet row. No "current packet" pointer that a
-- later edit can move under a run already in flight. No adapter registry
-- in data. No cron, no job runner, no ingestion trigger — this table
-- describes what MAY be ingested and never ingests anything itself.
--
-- Verify current state:
--   select packet_id, revision, adapter_id, validation_state,
--          approval_state, activation_state
--     from public.auction_operations_packet_revision
--    order by display_order, packet_id, revision;
--
--   -- the three seeded instances, and nothing else, should be active:
--   select count(*) from public.auction_operations_packet_revision
--    where activation_state = 'active';
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1 · The catalog ─────────────────────────────────────────────────────
-- One row per REVISION. A revision is immutable once approved; a material
-- change is a new revision, never an edit. That is the whole point: an
-- approved run must be able to prove which mechanics produced it, and it
-- cannot do that if the mechanics can be rewritten underneath it.
create table if not exists public.auction_operations_packet_revision (
  id                     uuid        primary key default gen_random_uuid(),

  -- Stable instance identity, and the immutable revision within it.
  packet_id              text        not null check (packet_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  revision               integer     not null check (revision >= 1),

  title                  text        not null check (length(btrim(title)) > 0),
  description            text        not null default '',
  house_slug             text,
  sale_scope             jsonb       not null default '{}'::jsonb,

  -- ADAPTER = CODE. The CHECK below deliberately mirrors the TypeScript
  -- allowlist, and that mirroring is correct here in a way the packet list
  -- never was: adding an adapter already requires shipping a parser, so
  -- requiring a migration alongside it costs nothing and buys a second
  -- refusal if a route is ever compromised. Adding a PACKET requires
  -- neither.
  adapter_id             text        not null
                         check (adapter_id in ('phillips-sale','monaco-legend','monaco-layer2')),
  adapter_schema_version text        not null check (length(btrim(adapter_schema_version)) > 0),

  acquisition_mode       text        not null
                         check (acquisition_mode in ('staged_upload','registered_fetch','mixed')),

  -- The governed descriptor, kept BOTH ways on purpose. `descriptor` is the
  -- queryable value; `descriptor_bytes` is the exact serialization the hash
  -- was taken over, because re-serializing jsonb does not reproduce byte
  -- order and a hash that cannot be recomputed is not evidence.
  descriptor             jsonb       not null,
  descriptor_bytes       text        not null check (length(descriptor_bytes) > 0),
  descriptor_sha256      text        not null check (descriptor_sha256 ~ '^[0-9a-f]{64}$'),

  upload_specs           jsonb       not null default '[]'::jsonb,
  source_urls            jsonb       not null default '[]'::jsonb,
  semantic_gates         jsonb       not null default '{}'::jsonb,

  -- Three separate acts, three separate columns. Structural validation is
  -- not approval; approval is not activation.
  validation_state       text        not null default 'pending'
                         check (validation_state in ('pending','validated','rejected')),
  approval_state         text        not null default 'unapproved'
                         check (approval_state in ('unapproved','approved')),
  activation_state       text        not null default 'inactive'
                         check (activation_state in ('inactive','active','retired')),

  display_order          integer     not null default 1000,

  created_by             uuid        not null references auth.users (id) on delete restrict,
  created_at             timestamptz not null default now(),
  validated_at           timestamptz,
  approved_by            uuid        references auth.users (id) on delete restrict,
  approved_at            timestamptz,
  activated_by           uuid        references auth.users (id) on delete restrict,
  activated_at           timestamptz,
  retired_at             timestamptz,

  provenance             jsonb       not null default '{}'::jsonb,

  -- Identity is unique per revision, and duplicate/conflicting registration
  -- is refused by the database rather than by whoever happens to be asking.
  constraint auction_operations_packet_revision_identity
    unique (packet_id, revision),

  -- The gates, as constraints rather than as intentions.
  constraint approved_requires_validated
    check (approval_state <> 'approved' or validation_state = 'validated'),
  constraint active_requires_approved
    check (activation_state <> 'active' or approval_state = 'approved'),
  constraint approval_is_attributed
    check ((approval_state = 'approved') = (approved_by is not null and approved_at is not null)),
  constraint activation_is_attributed
    check ((activation_state = 'active') = (activated_by is not null and activated_at is not null))
);

-- At most ONE active revision per packet. A newer revision cannot quietly
-- coexist as a second answer to "which mechanics does this packet use".
create unique index if not exists auction_operations_packet_revision_one_active_idx
  on public.auction_operations_packet_revision (packet_id)
  where activation_state = 'active';

create index if not exists auction_operations_packet_revision_catalog_idx
  on public.auction_operations_packet_revision (display_order, packet_id, revision);

-- ── 2 · Creation may never also approve or activate ─────────────────────
-- The order requires that the request which registers a revision cannot
-- activate it. A constraint cannot express "not in the same request", but a
-- trigger on INSERT can: a row is BORN unapproved and inactive, always, and
-- reaching either later state costs a separate statement by a separate act.
create or replace function public.auction_operations_packet_revision_birth()
returns trigger
language plpgsql
as $$
begin
  if new.approval_state <> 'unapproved' then
    raise exception 'packet_revision_insert_cannot_approve: a revision is born unapproved (packet %, revision %)',
      new.packet_id, new.revision
      using errcode = 'check_violation';
  end if;
  if new.activation_state <> 'inactive' then
    raise exception 'packet_revision_insert_cannot_activate: a revision is born inactive (packet %, revision %)',
      new.packet_id, new.revision
      using errcode = 'check_violation';
  end if;
  if new.approved_by is not null or new.approved_at is not null
     or new.activated_by is not null or new.activated_at is not null then
    raise exception 'packet_revision_insert_cannot_attribute: approval/activation attribution is set by the act, not by the insert'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists auction_operations_packet_revision_birth_trg
  on public.auction_operations_packet_revision;
create trigger auction_operations_packet_revision_birth_trg
  before insert on public.auction_operations_packet_revision
  for each row execute function public.auction_operations_packet_revision_birth();

-- ── 3 · An approved revision's mechanics are frozen ─────────────────────
-- Not "should not be edited" — cannot be. Once approved, the governed
-- mechanics are the thing runs are bound to, and rewriting them in place
-- would silently change what an already-approved run meant. Lifecycle
-- columns stay writable so a revision can still be activated or retired.
create or replace function public.auction_operations_packet_revision_freeze()
returns trigger
language plpgsql
as $$
begin
  if old.approval_state = 'approved' then
    if new.packet_id             is distinct from old.packet_id
    or new.revision              is distinct from old.revision
    or new.adapter_id            is distinct from old.adapter_id
    or new.adapter_schema_version is distinct from old.adapter_schema_version
    or new.acquisition_mode      is distinct from old.acquisition_mode
    or new.descriptor            is distinct from old.descriptor
    or new.descriptor_bytes      is distinct from old.descriptor_bytes
    or new.descriptor_sha256     is distinct from old.descriptor_sha256
    or new.upload_specs          is distinct from old.upload_specs
    or new.source_urls           is distinct from old.source_urls
    or new.semantic_gates        is distinct from old.semantic_gates then
      raise exception 'packet_revision_approved_is_immutable: change the mechanics by creating a new revision (packet %, revision %)',
        old.packet_id, old.revision
        using errcode = 'check_violation';
    end if;
  end if;

  -- Un-approving is not a repair either; it would strand any run already
  -- bound to this revision behind a revision that no longer claims to be
  -- approved. Retire it and supersede it instead.
  if old.approval_state = 'approved' and new.approval_state <> 'approved' then
    raise exception 'packet_revision_approval_is_not_revocable: retire and supersede rather than un-approve (packet %, revision %)',
      old.packet_id, old.revision
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists auction_operations_packet_revision_freeze_trg
  on public.auction_operations_packet_revision;
create trigger auction_operations_packet_revision_freeze_trg
  before update on public.auction_operations_packet_revision
  for each row execute function public.auction_operations_packet_revision_freeze();

-- ── 3b · The revision switch is ONE transaction ─────────────────────────
-- THE DEFECT THIS FUNCTION EXISTS TO KILL:
--
--   Retiring the incumbent and activating the successor as two independent
--   requests. Between them there is a window where the first has committed
--   and the second has not, and in that window the packet has NO active
--   revision — it silently disappears from the room. A crash, a dropped
--   connection or a constraint error at the wrong instant is enough.
--
-- Either the whole switch commits or nothing changes.
--
-- ── LOCK ORDER, DELIBERATELY ───────────────────────────────────────────
-- The family is locked FIRST, in id order, before the target is re-read.
-- Locking the target and then the family would let two concurrent switches
-- on the same packet grab rows in opposite orders and deadlock. Reading
-- packet_id without a lock, then locking the whole family deterministically,
-- then re-reading and re-checking the target UNDER that lock, is what makes
-- the one-active-revision invariant hold under concurrency rather than only
-- under politeness.
--
-- ── WHY SECURITY DEFINER IS SAFE HERE ──────────────────────────────────
-- Because it is not a door. EXECUTE is revoked from public, anon and
-- authenticated and granted only to service_role — the same role that
-- already holds the table's write grants — so this adds no reachability
-- that did not exist. Founder authority is still established by the server
-- route from the session; the actor arrives as a function argument the
-- route resolved, never as a request field.
create or replace function public.auction_operations_activate_packet_revision(
  p_revision_id uuid,
  p_actor       uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_packet_id text;
  v_row       public.auction_operations_packet_revision%rowtype;
  v_retired   uuid;
begin
  select packet_id into v_packet_id
    from public.auction_operations_packet_revision
   where id = p_revision_id;
  if v_packet_id is null then
    raise exception 'unknown_revision' using errcode = 'no_data_found';
  end if;

  -- Serialize every concurrent switch on this packet, in a fixed order.
  perform 1
     from public.auction_operations_packet_revision
    where packet_id = v_packet_id
    order by id
      for update;

  -- Re-read under the lock: what was true before it is not evidence.
  select * into v_row
    from public.auction_operations_packet_revision
   where id = p_revision_id;

  if v_row.approval_state <> 'approved' then
    raise exception 'not_approved' using errcode = 'check_violation';
  end if;
  if v_row.activation_state = 'active' then
    raise exception 'already_active' using errcode = 'unique_violation';
  end if;

  update public.auction_operations_packet_revision
     set activation_state = 'retired',
         retired_at       = now()
   where packet_id = v_packet_id
     and activation_state = 'active'
  returning id into v_retired;

  update public.auction_operations_packet_revision
     set activation_state = 'active',
         activated_by     = p_actor,
         activated_at     = now()
   where id = p_revision_id;

  return jsonb_build_object(
    'activated', p_revision_id,
    'retired',   v_retired,
    'packet_id', v_packet_id
  );
end;
$$;

revoke all on function public.auction_operations_activate_packet_revision(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.auction_operations_activate_packet_revision(uuid, uuid)
  to service_role;

comment on function public.auction_operations_activate_packet_revision(uuid, uuid) is
  'Atomic packet revision switch: retires the incumbent and activates the target in ONE transaction, under a deterministic family lock. Never leaves a packet with zero or two active revisions.';

-- ── 4 · Grants — the trust boundary ─────────────────────────────────────
-- Identical posture to auction_operations_run. No browser role has any
-- route to this table, read or write. The founder reaches it only through
-- founder-gated server routes that resolve identity from the session and
-- then use the trusted client.
alter table public.auction_operations_packet_revision enable row level security;
revoke all on public.auction_operations_packet_revision
  from public, anon, authenticated, service_role;
grant select, insert, update on public.auction_operations_packet_revision to service_role;

revoke all on function public.auction_operations_packet_revision_birth()  from public, anon, authenticated;
revoke all on function public.auction_operations_packet_revision_freeze() from public, anon, authenticated;

comment on table public.auction_operations_packet_revision is
  'Governed catalog of approved auction packet INSTANCES, as immutable revisions. Adapters remain a code allowlist; this table never selects or executes parsing logic.';

-- ── 5 · Bind every run to the exact revision that produced it ───────────
-- The time-of-check/time-of-use gap: without this, a run created from
-- revision 1 could be replanned against revision 2 and nothing would show
-- that the mechanics moved. ON DELETE RESTRICT because a run's provenance
-- outranks the convenience of deleting a catalog row.
alter table public.auction_operations_run
  add column if not exists packet_revision_id uuid
    references public.auction_operations_packet_revision (id) on delete restrict,
  add column if not exists packet_revision integer,
  add column if not exists descriptor_sha256 text
    check (descriptor_sha256 is null or descriptor_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists adapter_schema_version text;

create index if not exists auction_operations_run_packet_revision_idx
  on public.auction_operations_run (packet_revision_id);

comment on column public.auction_operations_run.packet_revision_id is
  'The exact approved packet revision this run was created from. Planning resolves through it; a later revision cannot change an existing run.';

-- ── 6 · Seed the three existing instances ───────────────────────────────
-- Migration, not invention: these are the packets registry.ts already
-- serves, carried across so the room keeps working while the hardcoded
-- lists go away. Their descriptors intentionally record manifest_paths —
-- the legacy repo-held acquisition route stays truthful for the two
-- families not yet proven runtime-registerable, rather than being cosmetically
-- broadened into something they have not earned.
--
-- Note the sequence below: INSERT, then validate, then approve, then
-- activate. Four statements because they are four acts. The birth trigger
-- would reject any attempt to shortcut it, including here.
do $seed$
declare
  founder uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  rec record;
begin
  if not exists (select 1 from auth.users where id = founder) then
    raise notice 'auction packet catalog seed skipped: founder uid not present in this database';
    return;
  end if;

  for rec in
    select * from (values
      (
        'NY080126', 'phillips-sale', 'phillips-sale-manifest-v1', 'staged_upload',
        'Phillips — The New York Watch Auction: XIV',
        '156 results from the pinned official Results PDF and auction-page PDF you supply. Both hashes must match the registered manifest exactly.',
        'phillips',
        jsonb_build_object(
          'kind','legacy_repo_manifest',
          'manifest_paths', jsonb_build_array('scripts/phillips/ny080126.sale.json'),
          'runtime_registerable', false,
          'note','Descriptor is the repo-held manifest path. This family is not yet proven runtime-registerable; see the flight return.'
        ),
        jsonb_build_array(
          jsonb_build_object('kind','results_pdf','label','Official Results PDF','required',true,'magicPrefix','%PDF','maxBytes',52428800),
          jsonb_build_object('kind','auction_page_pdf','label','Auction-page / catalogue PDF','required',true,'magicPrefix','%PDF','maxBytes',52428800),
          jsonb_build_object('kind','sale_page_html','label','Saved sale-page HTML (optional — otherwise the registered page is fetched)','required',false,'magicPrefix','<','maxBytes',20971520)
        ),
        10
      ),
      (
        'sales-38-40-41', 'monaco-legend', 'monaco-landing-semantic-v1', 'registered_fetch',
        'Monaco Legend — Exclusive Timepieces 38 / 40 / 41',
        '724 results re-verified from the registered Monaco pages and pinned PDFs. Nothing to upload — the server fetches only the allowlisted registered URLs.',
        'monaco-legend-auctions',
        jsonb_build_object(
          'kind','legacy_repo_manifest',
          'manifest_paths', jsonb_build_array(
            'scripts/monaco-legend/sale-38.sale.json',
            'scripts/monaco-legend/sale-40.sale.json',
            'scripts/monaco-legend/sale-41.sale.json'),
          'runtime_registerable', false,
          'note','Descriptor is the repo-held manifest set. This family is not yet proven runtime-registerable; see the flight return.'
        ),
        '[]'::jsonb,
        20
      ),
      (
        'et33-et35-et36', 'monaco-layer2', 'monaco-layer2-v1', 'staged_upload',
        'Monaco Legend — Exclusive Timepieces 33 / 35 / 36 (Layer 2 corpus)',
        '821 historically-acquired lots from the independently verified Layer 2 corpus. Supply the exact corpus JSONL — its SHA-256 is pinned. ET36 sold prices stay quarantined (outcomes ingest; prices are withheld pending the semantics ruling).',
        'monaco-legend-auctions',
        jsonb_build_object(
          'kind','legacy_repo_manifest',
          'manifest_paths', jsonb_build_array('scripts/monaco-legend/layer2-et33-et35-et36.manifest.json'),
          'runtime_registerable', true,
          'flight','monaco-layer2-et33-et35-et36',
          'note','The flight label is carried in the descriptor so the generated plan bytes for THIS packet stay byte-identical to the pre-catalog output, while a new same-family packet supplies its own.'
        ),
        jsonb_build_array(
          jsonb_build_object('kind','corpus_jsonl','label','Layer 2 corpus JSONL (Monaco_ET33_ET35_ET36_821_Layer2_FINAL_2026-08-21.jsonl)','required',true,'magicPrefix','{','maxBytes',52428800)
        ),
        30
      )
    ) as t(packet_id, adapter_id, schema_version, acq, title, description, house, descriptor, uploads, ord)
  loop
    if exists (
      select 1 from public.auction_operations_packet_revision
       where packet_id = rec.packet_id and revision = 1
    ) then
      continue;
    end if;

    insert into public.auction_operations_packet_revision (
      packet_id, revision, title, description, house_slug,
      adapter_id, adapter_schema_version, acquisition_mode,
      descriptor, descriptor_bytes, descriptor_sha256,
      upload_specs, display_order, created_by, provenance
    ) values (
      rec.packet_id, 1, rec.title, rec.description, rec.house,
      rec.adapter_id, rec.schema_version, rec.acq,
      rec.descriptor,
      rec.descriptor::text,
      -- Built-in sha256, not pgcrypto's digest(): Supabase keeps pgcrypto in
      -- the `extensions` schema, so a bare digest() call fails here. The
      -- hash is taken over EXACTLY the text stored in descriptor_bytes on
      -- the line above, so it stays recomputable.
      encode(pg_catalog.sha256(convert_to(rec.descriptor::text, 'UTF8')), 'hex'),
      rec.uploads, rec.ord, founder,
      jsonb_build_object('origin','migration_20260901120000','migrated_from','lib/auction-operations/registry.ts')
    );

    -- validated → approved → activated, as three further acts.
    update public.auction_operations_packet_revision
       set validation_state = 'validated', validated_at = now()
     where packet_id = rec.packet_id and revision = 1;

    update public.auction_operations_packet_revision
       set approval_state = 'approved', approved_by = founder, approved_at = now()
     where packet_id = rec.packet_id and revision = 1;

    update public.auction_operations_packet_revision
       set activation_state = 'active', activated_by = founder, activated_at = now()
     where packet_id = rec.packet_id and revision = 1;
  end loop;
end
$seed$;
