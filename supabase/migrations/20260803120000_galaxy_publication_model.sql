-- ════════════════════════════════════════════════════════════════════════
-- GALAXY DESCENDANT-AWARE PUBLICATION MODEL
-- supabase/migrations/20260803120000_galaxy_publication_model.sql
--
-- Replaces the REJECTED Brand-only visibility gate
-- (20260731020000_galaxy_visibility_gate.sql, retired to
-- scripts/rejected/). That design gated only the two brand-listing
-- queries, so a new Collection / Family / Variant / Reference inserted
-- beneath an already-live Brand would have published itself the moment it
-- was written. Galaxy renders descendants; therefore publication state
-- must exist at every level Galaxy can render.
--
-- ── PRODUCT LAW ────────────────────────────────────────────────────────
-- Vault truth readiness ≠ Galaxy presentation readiness. A row may be
-- fully and truthfully ingested long before the renderer can draw it
-- honestly. This model withholds the debut and nothing else.
--
-- ── WHAT "UNPUBLISHED" MEANS HERE ──────────────────────────────────────
-- Not rendered, not counted, not searchable, not navigable, and not
-- reachable through any Galaxy-owned route — including by direct UUID.
-- It does NOT mean secret. RLS on the five hierarchy tables remains
-- unconditional public read and is deliberately NOT changed by this
-- migration. This is a presentation boundary, not a secrecy boundary.
-- Raw PostgREST access still sees every row. That is an accepted,
-- explicit property of this design, not an oversight.
--
-- ── THE ENFORCEMENT SEAM ───────────────────────────────────────────────
-- A boolean per row is the storage model; it is NOT the enforcement
-- model. Five independent booleans checked by five independent callers
-- reproduces exactly the fragility that sank the Brand-only gate — every
-- future retrieval path would have to remember all five, and remember to
-- walk the ancestor chain.
--
-- So the booleans are never read by application code. Five
-- ancestor-closed VIEWS are the only Galaxy read surface, each defined in
-- terms of the one above it:
--
--   vault_galaxy_brands      ← brands.galaxy_visible
--   vault_galaxy_collections ← self ∧ (brand ∈ vault_galaxy_brands)
--   vault_galaxy_families    ← self ∧ (collection ∈ vault_galaxy_collections)
--   vault_galaxy_variants    ← self ∧ (family ∈ vault_galaxy_families)
--   vault_galaxy_references  ← self ∧ (variant ∈ vault_galaxy_variants)
--
-- Ancestor closure is therefore transitive BY CONSTRUCTION. A child
-- incorrectly marked live beneath a hidden ancestor is absent because its
-- parent is absent from the parent view — no caller can get this wrong,
-- because no caller performs the check.
--
-- ── SCOPE ──────────────────────────────────────────────────────────────
-- Galaxy only. Seller intake (the Brand typeahead in app/sell/mobile and
-- the model suggestions in components/MobileWizard) deliberately continues
-- to read the BASE tables and is unaffected. A watch may be legitimate for
-- a seller to name before it is ready to be drawn.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Publication state at every Galaxy-renderable level ────────────
-- Default false: a row cannot debut by accident. Nothing in any ingest
-- path names this column, so every future insert — bulk Vault-lock v3.2
-- included — arrives unpublished without the ingester knowing this column
-- exists.

alter table public.vault_brands      add column if not exists galaxy_visible boolean not null default false;
alter table public.vault_collections add column if not exists galaxy_visible boolean not null default false;
alter table public.vault_families    add column if not exists galaxy_visible boolean not null default false;
alter table public.vault_variants    add column if not exists galaxy_visible boolean not null default false;
alter table public.vault_references  add column if not exists galaxy_visible boolean not null default false;

comment on column public.vault_brands.galaxy_visible is
  'Galaxy publication state. Presentation gate, not a truth flag and never a data-quality flag — a Brand with no variants is a mapped star awaiting enrichment, not a hidden one. Read through public.vault_galaxy_brands, never directly.';
comment on column public.vault_collections.galaxy_visible is
  'Galaxy publication state. Effective visibility also requires a live Brand — read through public.vault_galaxy_collections, never directly.';
comment on column public.vault_families.galaxy_visible is
  'Galaxy publication state. Effective visibility also requires a live Collection and Brand — read through public.vault_galaxy_families, never directly.';
comment on column public.vault_variants.galaxy_visible is
  'Galaxy publication state. Effective visibility also requires a live Family, Collection and Brand — read through public.vault_galaxy_variants, never directly.';
comment on column public.vault_references.galaxy_visible is
  'Galaxy publication state. Effective visibility also requires a live Variant, Family, Collection and Brand — read through public.vault_galaxy_references, never directly.';

-- ── 2 · Backfill — preserve the present Galaxy exactly ────────────────
-- Every row that exists at migration time is what the public sees today,
-- so every row becomes live. This deliberately includes the 51 Brands
-- with no descendants: they are intentional placeholders awaiting
-- Vault-lock v3.2 enrichment and must keep rendering as bare stars.

update public.vault_brands      set galaxy_visible = true where galaxy_visible = false;
update public.vault_collections set galaxy_visible = true where galaxy_visible = false;
update public.vault_families    set galaxy_visible = true where galaxy_visible = false;
update public.vault_variants    set galaxy_visible = true where galaxy_visible = false;
update public.vault_references  set galaxy_visible = true where galaxy_visible = false;

-- Refuse rather than dim the Vault. If any row would be left hidden the
-- backfill did not do what this migration claims, and the whole thing
-- rolls back.
do $$
declare v_b int; v_c int; v_f int; v_v int; v_r int;
begin
  select count(*) filter (where not galaxy_visible) into v_b from public.vault_brands;
  select count(*) filter (where not galaxy_visible) into v_c from public.vault_collections;
  select count(*) filter (where not galaxy_visible) into v_f from public.vault_families;
  select count(*) filter (where not galaxy_visible) into v_v from public.vault_variants;
  select count(*) filter (where not galaxy_visible) into v_r from public.vault_references;
  if (v_b + v_c + v_f + v_v + v_r) > 0 then
    raise exception
      'REFUSED: backfill left rows hidden — brands %, collections %, families %, variants %, references %',
      v_b, v_c, v_f, v_v, v_r;
  end if;
  raise notice 'Backfill complete — every existing row is live; present Galaxy preserved exactly.';
end $$;

-- ── 3 · Partial indexes ───────────────────────────────────────────────
-- The views filter on galaxy_visible at every level; index only the live
-- side, which is the side that is read.

create index if not exists vault_brands_galaxy_visible_idx      on public.vault_brands      (galaxy_visible) where galaxy_visible;
create index if not exists vault_collections_galaxy_visible_idx on public.vault_collections (galaxy_visible) where galaxy_visible;
create index if not exists vault_families_galaxy_visible_idx    on public.vault_families    (galaxy_visible) where galaxy_visible;
create index if not exists vault_variants_galaxy_visible_idx    on public.vault_variants    (galaxy_visible) where galaxy_visible;
create index if not exists vault_references_galaxy_visible_idx  on public.vault_references  (galaxy_visible) where galaxy_visible;

-- ── 4 · The ancestor-closed read surface ──────────────────────────────
-- Column lists are enumerated rather than `select *`. The Brand view is
-- exactly the nine columns the two Galaxy pages select, which encodes the
-- standing privacy law structurally: combined_score, significance_score
-- and score_state are not in the Galaxy contract and cannot leak through
-- it even if a future caller writes `select *`.

create or replace view public.vault_galaxy_brands as
  select id, slug, name, description, search_aliases,
         galaxy_x, galaxy_y, galaxy_z, cluster
    from public.vault_brands
   where galaxy_visible;

create or replace view public.vault_galaxy_collections as
  select c.id, c.brand_id, c.name, c.description, c.sort_order
    from public.vault_collections c
    join public.vault_galaxy_brands b on b.id = c.brand_id
   where c.galaxy_visible;

create or replace view public.vault_galaxy_families as
  select f.id, f.collection_id, f.name, f.description, f.sort_order
    from public.vault_families f
    join public.vault_galaxy_collections c on c.id = f.collection_id
   where f.galaxy_visible;

create or replace view public.vault_galaxy_variants as
  select v.id, v.family_id, v.name, v.description, v.notes,
         v.search_aliases, v.sort_order
    from public.vault_variants v
    join public.vault_galaxy_families f on f.id = v.family_id
   where v.galaxy_visible;

create or replace view public.vault_galaxy_references as
  select r.id, r.variant_id, r.reference, r.metadata, r.sort_order
    from public.vault_references r
    join public.vault_galaxy_variants v on v.id = r.variant_id
   where r.galaxy_visible;

-- security_invoker so the views respect the caller's RLS rather than the
-- owner's. Today every hierarchy policy is `using (true)` so this changes
-- nothing observable — it is set so that the views stay honest if that
-- ever tightens.
alter view public.vault_galaxy_brands      set (security_invoker = true);
alter view public.vault_galaxy_collections set (security_invoker = true);
alter view public.vault_galaxy_families    set (security_invoker = true);
alter view public.vault_galaxy_variants    set (security_invoker = true);
alter view public.vault_galaxy_references  set (security_invoker = true);

comment on view public.vault_galaxy_brands is
  'THE Galaxy read surface for Brands. Ancestor-closed. Galaxy code must never read vault_brands directly.';
comment on view public.vault_galaxy_collections is
  'THE Galaxy read surface for Collections — self live AND Brand live. Ancestor closure is structural, not a caller responsibility.';
comment on view public.vault_galaxy_families is
  'THE Galaxy read surface for Families — self live AND every ancestor live.';
comment on view public.vault_galaxy_variants is
  'THE Galaxy read surface for Variants — self live AND every ancestor live.';
comment on view public.vault_galaxy_references is
  'THE Galaxy read surface for References — self live AND every ancestor live.';

grant select on public.vault_galaxy_brands      to anon, authenticated;
grant select on public.vault_galaxy_collections to anon, authenticated;
grant select on public.vault_galaxy_families    to anon, authenticated;
grant select on public.vault_galaxy_variants    to anon, authenticated;
grant select on public.vault_galaxy_references  to anon, authenticated;

-- ── 5 · Audit log ─────────────────────────────────────────────────────
-- Required so an activation can be reviewed and reversed exactly. Append
-- only: no UPDATE or DELETE grant is ever issued, and RLS with no policy
-- makes it invisible to anon and authenticated entirely.

create table if not exists public.galaxy_publication_event (
  id                uuid primary key default gen_random_uuid(),
  -- occurred_at alone cannot order these: now() is the TRANSACTION
  -- timestamp, so a staged release that activates several manifests in one
  -- transaction writes rows that are indistinguishable by time. seq is the
  -- monotonic tiebreaker and the only safe ordering key.
  seq               bigint generated always as identity,
  occurred_at       timestamptz not null default now(),
  actor             text not null,
  operation         text not null check (operation in ('activate','rollback')),
  manifest          jsonb not null,
  before_state      jsonb not null,
  after_state       jsonb not null,
  changed_rows      int  not null,
  reverted_event_id uuid references public.galaxy_publication_event(id),
  note              text
);

comment on table public.galaxy_publication_event is
  'Append-only audit of every Galaxy publication change. before_state/after_state carry the exact per-row galaxy_visible values so an activation can be reverted precisely rather than approximately.';

create index if not exists galaxy_publication_event_occurred_at_idx
  on public.galaxy_publication_event (occurred_at desc);
create unique index if not exists galaxy_publication_event_reverted_once_idx
  on public.galaxy_publication_event (reverted_event_id) where reverted_event_id is not null;

alter table public.galaxy_publication_event enable row level security;
-- Intentionally NO policy: anon and authenticated see nothing. service_role
-- bypasses RLS and is the only caller of the functions below.

-- ── 6 · Galaxy subtree retrieval ──────────────────────────────────────
-- Replaces the nested PostgREST select in app/api/vault/[brandId]. Two
-- reasons it must be a function, not a filtered query:
--   · filtering happens before the response is assembled, in one
--     statement, rather than as four filters a caller must remember;
--   · a hidden Brand returns SQL NULL, letting the route answer 404
--     without ever assembling a body it would then have to suppress.

create or replace function public.galaxy_brand_subtree(p_brand_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.vault_galaxy_brands gb where gb.id = p_brand_id)
      then null
    else coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', c.id, 'name', c.name, 'description', c.description,
                 'sort_order', c.sort_order,
                 'vault_families', coalesce((
                   select jsonb_agg(
                            jsonb_build_object(
                              'id', f.id, 'name', f.name, 'description', f.description,
                              'sort_order', f.sort_order,
                              'vault_variants', coalesce((
                                select jsonb_agg(
                                         jsonb_build_object(
                                           'id', v.id, 'name', v.name,
                                           'description', v.description, 'notes', v.notes,
                                           'search_aliases', v.search_aliases,
                                           'sort_order', v.sort_order,
                                           'vault_references', coalesce((
                                             select jsonb_agg(
                                                      jsonb_build_object(
                                                        'id', r.id, 'reference', r.reference,
                                                        'metadata', r.metadata,
                                                        'sort_order', r.sort_order)
                                                      order by r.sort_order, r.id)
                                               from public.vault_galaxy_references r
                                              where r.variant_id = v.id), '[]'::jsonb))
                                         order by v.sort_order, v.id)
                                  from public.vault_galaxy_variants v
                                 where v.family_id = f.id), '[]'::jsonb))
                            order by f.sort_order, f.id)
                     from public.vault_galaxy_families f
                    where f.collection_id = c.id), '[]'::jsonb))
               order by c.sort_order, c.id)
        from public.vault_galaxy_collections c
       where c.brand_id = p_brand_id), '[]'::jsonb)
  end;
$$;

comment on function public.galaxy_brand_subtree(uuid) is
  'Galaxy drill-down. Returns the ancestor-closed live subtree of a live Brand as the nested shape the client already expects, or NULL if the Brand is not live. Knowing a UUID does not bypass publication state.';

grant execute on function public.galaxy_brand_subtree(uuid) to anon, authenticated;

-- ── 7 · Activation ────────────────────────────────────────────────────
-- The ONLY way a row becomes live after backfill. Named rows only; there
-- is no wildcard, no name matching, no subtree inference. A bounded
-- subtree release is expressible only by listing every UUID in it, which
-- is the point: the manifest IS the review artifact.

create or replace function public.galaxy_activate(
  p_manifest jsonb,
  p_actor    text,
  p_note     text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bad       text;
  v_missing   text;
  v_suppressed text;
  v_before    jsonb;
  v_after     jsonb;
  v_changed   int := 0;
  v_n         int;
  v_event_id  uuid;
begin
  -- ── SERIALIZATION (first statement, before anything is read) ────────
  -- All Galaxy publication mutations share ONE serial history. This is a
  -- transaction-scoped BLOCKING advisory lock on the stable namespaced key
  -- hashtextextended('fwt.galaxy_publication', 0); galaxy_rollback_event
  -- and the schema-retreat file acquire the identical key. Without it,
  -- validation reads, state writes, drift checks, descendant checks and
  -- the audit insert could interleave across concurrent calls — an
  -- ancestor check could pass against state another session changes
  -- before this one commits, and the audit log could record a sequence no
  -- serial execution would produce. The lock is released automatically at
  -- transaction completion (commit or rollback); there is no try-lock
  -- fallback and no session-scoped variant, deliberately.
  perform pg_advisory_xact_lock(hashtextextended('fwt.galaxy_publication', 0));

  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'REFUSED: an actor must be named for the audit record';
  end if;
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'array' or jsonb_array_length(p_manifest) = 0 then
    raise exception 'REFUSED: manifest must be a non-empty JSON array of {entity_type, entity_id} objects';
  end if;

  -- Requested set, de-duplicated. Shape is validated before anything is read.
  -- Dropped defensively so two calls inside one explicit transaction (a
  -- staged multi-manifest release) do not collide on the scratch names.
  drop table if exists pg_temp._m;
  drop table if exists pg_temp._req;
  drop table if exists pg_temp._all;

  create temp table _m on commit drop as
  select distinct e->>'entity_type' as entity_type, e->>'entity_id' as entity_id
    from jsonb_array_elements(p_manifest) e;

  select string_agg(distinct coalesce(entity_type,'<null>'), ', ')
    into v_bad
    from pg_temp._m
   where entity_type is null
      or entity_type not in ('brand','collection','family','variant','reference');
  if v_bad is not null then
    raise exception 'REFUSED: unknown entity_type(s): %', v_bad;
  end if;

  select string_agg(coalesce(entity_id,'<null>'), ', ')
    into v_bad
    from pg_temp._m
   where entity_id is null
      or entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad is not null then
    raise exception 'REFUSED: entity_id(s) are not UUIDs: %', v_bad;
  end if;

  create temp table _req on commit drop as
  select entity_type, entity_id::uuid as entity_id from pg_temp._m;

  -- Every governed row and its current state, in one shape.
  create temp table _all on commit drop as
  select 'brand'::text      as entity_type, id, galaxy_visible from public.vault_brands
  union all select 'collection', id, galaxy_visible from public.vault_collections
  union all select 'family',     id, galaxy_visible from public.vault_families
  union all select 'variant',    id, galaxy_visible from public.vault_variants
  union all select 'reference',  id, galaxy_visible from public.vault_references;

  -- Refuse missing targets by name. Never guess, never partially apply.
  select string_agg(format('%s %s', r.entity_type, r.entity_id), ', ')
    into v_missing
    from pg_temp._req r
    left join pg_temp._all a on a.entity_type = r.entity_type and a.id = r.entity_id
   where a.id is null;
  if v_missing is not null then
    raise exception 'REFUSED: target(s) do not exist: %', v_missing;
  end if;

  select jsonb_agg(jsonb_build_object('entity_type', a.entity_type,
                                      'entity_id', a.id,
                                      'galaxy_visible', a.galaxy_visible)
                   order by a.entity_type, a.id)
    into v_before
    from pg_temp._req r join pg_temp._all a on a.entity_type = r.entity_type and a.id = r.entity_id;

  -- Only the named rows. Siblings are never touched.
  update public.vault_brands t set galaxy_visible = true
    from pg_temp._req r where r.entity_type = 'brand' and r.entity_id = t.id and not t.galaxy_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  update public.vault_collections t set galaxy_visible = true
    from pg_temp._req r where r.entity_type = 'collection' and r.entity_id = t.id and not t.galaxy_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  update public.vault_families t set galaxy_visible = true
    from pg_temp._req r where r.entity_type = 'family' and r.entity_id = t.id and not t.galaxy_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  update public.vault_variants t set galaxy_visible = true
    from pg_temp._req r where r.entity_type = 'variant' and r.entity_id = t.id and not t.galaxy_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  update public.vault_references t set galaxy_visible = true
    from pg_temp._req r where r.entity_type = 'reference' and r.entity_id = t.id and not t.galaxy_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  -- Ancestor verification, done against the closed views AFTER the write:
  -- if a requested row is still not effectively visible, an ancestor is
  -- hidden and was not part of this manifest. Refusing here — inside the
  -- same transaction — is what makes a partial subtree release impossible
  -- to perform by accident.
  select string_agg(format('%s %s', r.entity_type, r.entity_id), ', ')
    into v_suppressed
    from pg_temp._req r
   where not exists (
     select 1 from public.vault_galaxy_brands x      where r.entity_type = 'brand'      and x.id = r.entity_id
     union all
     select 1 from public.vault_galaxy_collections x where r.entity_type = 'collection' and x.id = r.entity_id
     union all
     select 1 from public.vault_galaxy_families x    where r.entity_type = 'family'     and x.id = r.entity_id
     union all
     select 1 from public.vault_galaxy_variants x    where r.entity_type = 'variant'    and x.id = r.entity_id
     union all
     select 1 from public.vault_galaxy_references x  where r.entity_type = 'reference'  and x.id = r.entity_id
   );
  if v_suppressed is not null then
    raise exception
      'REFUSED: % would stay suppressed by a hidden ancestor not named in this manifest — add the ancestors or release nothing',
      v_suppressed;
  end if;

  select jsonb_agg(jsonb_build_object('entity_type', x.entity_type,
                                      'entity_id', x.entity_id,
                                      'galaxy_visible', true)
                   order by x.entity_type, x.entity_id)
    into v_after
    from pg_temp._req x;

  insert into public.galaxy_publication_event
    (actor, operation, manifest, before_state, after_state, changed_rows, note)
  values (p_actor, 'activate', p_manifest, v_before, v_after, v_changed, p_note)
  returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id,
    'operation', 'activate',
    'requested_rows', (select count(*) from pg_temp._req),
    'changed_rows', v_changed,
    'idempotent_noop', v_changed = 0,
    'before_state', v_before,
    'after_state', v_after
  );
end $$;

comment on function public.galaxy_activate(jsonb, text, text) is
  'The only path from unpublished to published. Atomic, idempotent, exact-UUID only. Refuses unknown types, missing targets, and any release that would leave a named row suppressed by an unnamed hidden ancestor. There is deliberately no wildcard form.';

-- ── 8 · Exact rollback ────────────────────────────────────────────────
-- Reverts one activation to the precise state recorded in its own event.
-- It refuses on drift rather than overwriting somebody else's later
-- decision, and refuses when reverting would silently suppress a
-- descendant released afterwards. Taxonomy content is never touched.

create or replace function public.galaxy_rollback_event(
  p_event_id uuid,
  p_actor    text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ev        public.galaxy_publication_event%rowtype;
  v_drift     text;
  v_orphan    text;
  v_changed   int := 0;
  v_n         int;
  v_before    jsonb;
  v_event_id  uuid;
begin
  -- ── SERIALIZATION (first statement) ─────────────────────────────────
  -- Identical transaction-scoped blocking advisory lock as galaxy_activate
  -- — same key, hashtextextended('fwt.galaxy_publication', 0) — so every
  -- publication mutation, forward or reverse, joins one serial history.
  -- Acquired before the event is even read: the drift check and the
  -- later-release check are only meaningful against a state no concurrent
  -- publication call can be mid-flight through. Held to transaction end.
  perform pg_advisory_xact_lock(hashtextextended('fwt.galaxy_publication', 0));

  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'REFUSED: an actor must be named for the audit record';
  end if;

  select * into v_ev from public.galaxy_publication_event where id = p_event_id;
  if not found then
    raise exception 'REFUSED: no publication event %', p_event_id;
  end if;
  if v_ev.operation <> 'activate' then
    raise exception 'REFUSED: event % is a % event, not an activation', p_event_id, v_ev.operation;
  end if;
  if exists (select 1 from public.galaxy_publication_event where reverted_event_id = p_event_id) then
    raise exception 'REFUSED: event % has already been rolled back', p_event_id;
  end if;
  -- An idempotent repeat changed nothing, so it owns no state to restore.
  -- Reverting it would silently no-op while consuming the audit slot and
  -- reading, to anyone later, as though the release had been undone.
  if v_ev.changed_rows = 0 then
    raise exception
      'REFUSED: event % changed no rows (idempotent repeat) — there is nothing to revert; roll back the activation that actually published',
      p_event_id;
  end if;

  drop table if exists pg_temp._tgt;
  drop table if exists pg_temp._now;

  create temp table _tgt on commit drop as
  select e->>'entity_type' as entity_type,
         (e->>'entity_id')::uuid as entity_id,
         (e->>'galaxy_visible')::boolean as prior_visible
    from jsonb_array_elements(v_ev.before_state) e;

  create temp table _now on commit drop as
  select 'brand'::text as entity_type, id, galaxy_visible from public.vault_brands
  union all select 'collection', id, galaxy_visible from public.vault_collections
  union all select 'family',     id, galaxy_visible from public.vault_families
  union all select 'variant',    id, galaxy_visible from public.vault_variants
  union all select 'reference',  id, galaxy_visible from public.vault_references;

  -- Drift: the row is not where this event left it. Somebody else has
  -- since decided something; reverting would erase that decision blindly.
  select string_agg(format('%s %s (expected live, found %s)',
                           t.entity_type, t.entity_id,
                           case when n.galaxy_visible then 'live' else 'hidden' end), ', ')
    into v_drift
    from pg_temp._tgt t
    left join pg_temp._now n on n.entity_type = t.entity_type and n.id = t.entity_id
   where n.id is null or n.galaxy_visible is distinct from true;
  if v_drift is not null then
    raise exception 'REFUSED: state has drifted since the activation — %', v_drift;
  end if;

  -- Unsafe to revert: hiding these rows again would suppress a descendant
  -- that is live today and was NOT part of this event. Reported exactly
  -- rather than performed quietly.
  select string_agg(format('%s %s would suppress live descendant(s)', t.entity_type, t.entity_id), ', ')
    into v_orphan
    from pg_temp._tgt t
   where not t.prior_visible
     and (
       (t.entity_type = 'brand' and exists (
          select 1 from public.vault_collections c
           where c.brand_id = t.entity_id and c.galaxy_visible
             and not exists (select 1 from pg_temp._tgt z where z.entity_type='collection' and z.entity_id=c.id)))
       or (t.entity_type = 'collection' and exists (
          select 1 from public.vault_families f
           where f.collection_id = t.entity_id and f.galaxy_visible
             and not exists (select 1 from pg_temp._tgt z where z.entity_type='family' and z.entity_id=f.id)))
       or (t.entity_type = 'family' and exists (
          select 1 from public.vault_variants v
           where v.family_id = t.entity_id and v.galaxy_visible
             and not exists (select 1 from pg_temp._tgt z where z.entity_type='variant' and z.entity_id=v.id)))
       or (t.entity_type = 'variant' and exists (
          select 1 from public.vault_references r
           where r.variant_id = t.entity_id and r.galaxy_visible
             and not exists (select 1 from pg_temp._tgt z where z.entity_type='reference' and z.entity_id=r.id)))
     );
  if v_orphan is not null then
    raise exception 'REFUSED: unsafe to revert — %', v_orphan;
  end if;

  select jsonb_agg(jsonb_build_object('entity_type', entity_type,
                                      'entity_id', entity_id,
                                      'galaxy_visible', true)
                   order by entity_type, entity_id)
    into v_before from pg_temp._tgt;

  update public.vault_brands t set galaxy_visible = g.prior_visible
    from pg_temp._tgt g where g.entity_type='brand' and g.entity_id=t.id and t.galaxy_visible is distinct from g.prior_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  update public.vault_collections t set galaxy_visible = g.prior_visible
    from pg_temp._tgt g where g.entity_type='collection' and g.entity_id=t.id and t.galaxy_visible is distinct from g.prior_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  update public.vault_families t set galaxy_visible = g.prior_visible
    from pg_temp._tgt g where g.entity_type='family' and g.entity_id=t.id and t.galaxy_visible is distinct from g.prior_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  update public.vault_variants t set galaxy_visible = g.prior_visible
    from pg_temp._tgt g where g.entity_type='variant' and g.entity_id=t.id and t.galaxy_visible is distinct from g.prior_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  update public.vault_references t set galaxy_visible = g.prior_visible
    from pg_temp._tgt g where g.entity_type='reference' and g.entity_id=t.id and t.galaxy_visible is distinct from g.prior_visible;
  get diagnostics v_n = ROW_COUNT; v_changed := v_changed + v_n;

  insert into public.galaxy_publication_event
    (actor, operation, manifest, before_state, after_state, changed_rows, reverted_event_id, note)
  values (p_actor, 'rollback', v_ev.manifest, v_before, v_ev.before_state, v_changed, p_event_id,
          format('exact revert of event %s', p_event_id))
  returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id,
    'operation', 'rollback',
    'reverted_event_id', p_event_id,
    'changed_rows', v_changed,
    'restored_state', v_ev.before_state
  );
end $$;

comment on function public.galaxy_rollback_event(uuid, text) is
  'Reverts one activation to the exact per-row state recorded in its event. Refuses on drift and refuses when reverting would suppress a descendant released later. Never touches taxonomy content.';

-- Activation is an operator action, not a public one.
--
-- Revoking from PUBLIC alone is NOT enough here, and this was caught by the
-- disposable proof rather than by reading: Supabase ships ALTER DEFAULT
-- PRIVILEGES granting EXECUTE on new functions in the public schema to anon
-- and authenticated *explicitly*. Those are direct grants, not inherited
-- from PUBLIC, so `revoke ... from public` leaves them in place and any
-- visitor with the anon key could have published taxonomy or reverted a
-- release. Both roles must be named.
revoke all on function public.galaxy_activate(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.galaxy_rollback_event(uuid, text) from public, anon, authenticated;
grant execute on function public.galaxy_activate(jsonb, text, text) to service_role;
grant execute on function public.galaxy_rollback_event(uuid, text) to service_role;

-- Same reasoning for the audit table. RLS with no policy already blocks
-- anon and authenticated, but table-level grants should not exist either —
-- the log is service_role's alone.
revoke all on table public.galaxy_publication_event from public, anon, authenticated;

commit;
