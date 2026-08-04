-- ════════════════════════════════════════════════════════════════════════
-- GALAXY CONCURRENCY PROOF — DISPOSABLE FIXTURE + TARGET-GUARD ROOT
-- scripts/galaxy-publication-concurrency/fixture.sql
--
-- THE ONLY FILE THAT MINTS THE DISPOSABLE-TARGET IDENTITY ARTIFACTS, and
-- it mints them LAST: the marker certifies a COMPLETED, VALIDATED fixture,
-- never an in-progress attempt. The entire build runs in ONE transaction —
-- any failure anywhere rolls back every table, every row, and the marker
-- itself, leaving the branch exactly as found.
--
-- Sequence, in one transaction:
--   1 · full pre-write inspection: refuses ANY pre-existing hierarchy
--       table, Galaxy publication table/view/function, visibility column,
--       test helper, target artifact, or marker;
--   2 · operator-identity verification (session setting
--       galaxy_proof.declared_branch_ref): plausible ref, not production;
--   3 · build the five-table fixture + seed;
--   4 · validate the FINISHED shape (exact counts, parent-child joins);
--   5 · only then mint the two identity artifacts:
--         · public.test_branch_marker()  (function)
--         · public.galaxy_proof_target   (one-row table)
--       both storing the operator-declared identity, giving downstream
--       guards two independently-readable channels to cross-check against
--       a fresh operator declaration.
--
-- OPERATOR USAGE (same session):
--   set galaxy_proof.declared_branch_ref = '<disposable-branch-ref>';
--   -- then execute this file
-- ════════════════════════════════════════════════════════════════════════

begin;

do $pre$
declare
  v_ref text;
  v_bad text;
begin
  -- ── operator identity first: nothing proceeds without it ──
  begin
    v_ref := current_setting('galaxy_proof.declared_branch_ref');
  exception when others then
    v_ref := null;
  end;
  if v_ref is null or btrim(v_ref) = '' then
    raise exception 'REFUSED: no declared branch identity. Run: set galaxy_proof.declared_branch_ref = ''<disposable-branch-ref>''; in THIS session first.';
  end if;
  if v_ref !~ '^[a-z]{20}$' then
    raise exception 'REFUSED: % is not a plausible Supabase branch ref', v_ref;
  end if;
  if v_ref = 'aqgjcezhdoianqmoknnu' then
    raise exception 'REFUSED: that is the PRODUCTION project ref. This fixture never runs on production.';
  end if;

  -- ── full pre-write inspection: any of these existing = refusal ──
  -- Swept through pg_class, NOT information_schema. information_schema.tables
  -- and .views between them omit materialized views, sequences, foreign
  -- tables, partitioned tables and composite types entirely — so a
  -- contaminating object of any of those kinds would have passed an
  -- information_schema sweep unseen. Every relkind is named here:
  --   r ordinary · p partitioned · v view · m matview · S sequence
  --   f foreign · c composite type · t TOAST · I partitioned index · i index
  select string_agg(format('%s (relkind %s)', c.relname, c.relkind), ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = any (array['r','p','v','m','S','f','c','i','I']::"char"[])
     and (c.relname in ('vault_brands', 'vault_collections', 'vault_families',
                        'vault_variants', 'vault_references',
                        'galaxy_publication_event', 'galaxy_proof_target')
          or c.relname like 'vault\_galaxy\_%'
          or c.relname like 'galaxy\_publication\_event%'   -- incl. its identity sequence
          or c.relname like '%\_galaxy\_visible\_idx'
          or c.relname like 'galaxy\_proof\_%');
  if v_bad is not null then
    raise exception 'REFUSED: pre-existing hierarchy / publication / proof relation(s) of some kind: % — production-shaped or already-used state; use a fresh disposable branch.', v_bad;
  end if;

  -- functions and procedures, by name, including every overload
  select string_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname in ('galaxy_activate', 'galaxy_rollback_event', 'galaxy_brand_subtree',
                        'test_branch_marker')
          or p.proname like 'test\_%'
          or p.proname like 'galaxy\_%');
  if v_bad is not null then
    raise exception 'REFUSED: pre-existing publication function / test helper / marker: %', v_bad;
  end if;

  select string_agg(c.table_name || '.' || c.column_name, ', ') into v_bad
    from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'galaxy_visible';
  if v_bad is not null then
    raise exception 'REFUSED: pre-existing galaxy_visible column(s): %', v_bad;
  end if;

  -- policies left behind by a previous fixture would silently change what
  -- anon can read, so they are contamination too
  select string_agg(format('%s on %s', pol.policyname, pol.tablename), ', ') into v_bad
    from pg_policies pol
   where pol.schemaname = 'public'
     and (pol.tablename like 'vault\_%' or pol.tablename like 'galaxy\_%');
  if v_bad is not null then
    raise exception 'REFUSED: pre-existing RLS policy/policies on hierarchy or publication tables: %', v_bad;
  end if;

  -- a stale session setting from a previous target is contamination of the
  -- one channel this whole guard chain rests on
  if current_setting('galaxy_proof.declared_branch_ref', true) is distinct from v_ref then
    raise exception 'REFUSED: declared identity changed underfoot during inspection';
  end if;

  raise notice 'Pre-write inspection clean for declared branch % — building fixture.', v_ref;
end
$pre$;

-- ── the five-table fixture, production-shaped ─────────────────────────────
create table public.vault_brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  search_aliases text[] default '{}'::text[],
  description text,
  galaxy_x numeric, galaxy_y numeric, galaxy_z numeric,
  cluster text,
  created_at timestamptz default now(),
  country_of_origin text, independent_status text,
  cluster_staging text, cluster_reviewed boolean default false,
  region text, cluster_rationale text,
  region_staging text, cluster_rationale_staging text
);
create table public.vault_collections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.vault_brands(id) on delete cascade,
  name text not null, description text, sort_order integer default 0
);
create table public.vault_families (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid references public.vault_collections(id) on delete cascade,
  name text not null, description text, sort_order integer default 0
);
create table public.vault_variants (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.vault_families(id) on delete cascade,
  name text not null, description text,
  search_aliases text[] default '{}'::text[], notes text, sort_order integer default 0
);
create table public.vault_references (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references public.vault_variants(id) on delete cascade,
  reference text, metadata jsonb default '{}'::jsonb, sort_order integer default 0
);

create unique index vault_collections_brand_id_name_key on public.vault_collections (brand_id, name);
create unique index vault_families_collection_id_name_key on public.vault_families (collection_id, name);
create unique index vault_variants_family_id_name_key on public.vault_variants (family_id, name);
create unique index vault_references_variant_id_reference_key on public.vault_references (variant_id, reference);

alter table public.vault_brands enable row level security;
alter table public.vault_collections enable row level security;
alter table public.vault_families enable row level security;
alter table public.vault_variants enable row level security;
alter table public.vault_references enable row level security;
create policy "Public read vault_brands" on public.vault_brands for select to anon, authenticated using (true);
create policy "Public read vault_collections" on public.vault_collections for select to anon, authenticated using (true);
create policy "Public read vault_families" on public.vault_families for select to anon, authenticated using (true);
create policy "Public read vault_variants" on public.vault_variants for select to anon, authenticated using (true);
create policy "Public read vault_references" on public.vault_references for select to anon, authenticated using (true);
grant select on public.vault_brands, public.vault_collections, public.vault_families,
  public.vault_variants, public.vault_references to anon, authenticated;

insert into public.vault_brands (slug, name)
select 'tb-'||lpad(i::text,3,'0'), 'TB-'||lpad(i::text,3,'0') from generate_series(1,192) i;
insert into public.vault_collections (brand_id, name, sort_order)
select b.id, 'C-'||lpad(i::text,3,'0'), i from generate_series(1,396) i
  join lateral (select id from public.vault_brands where name='TB-'||lpad((((i-1)%141)+1)::text,3,'0')) b on true;
insert into public.vault_families (collection_id, name, sort_order)
select c.id, 'F-'||lpad(i::text,3,'0'), i from generate_series(1,579) i
  join lateral (select id from public.vault_collections where name='C-'||lpad((((i-1)%396)+1)::text,3,'0')) c on true;
insert into public.vault_variants (family_id, name, sort_order)
select f.id, 'V-'||lpad(i::text,3,'0'), i from generate_series(1,710) i
  join lateral (select id from public.vault_families where name='F-'||lpad((((i-1)%579)+1)::text,3,'0')) f on true;
insert into public.vault_references (variant_id, reference, sort_order)
select v.id, 'R-'||lpad(i::text,3,'0'), i from generate_series(1,388) i
  join lateral (select id from public.vault_variants where name='V-'||lpad((((i-1)%322)+1)::text,3,'0')) v on true;

-- ── validate the FINISHED fixture, then mint the identity artifacts LAST ──
do $post$
declare
  v_ref text := current_setting('galaxy_proof.declared_branch_ref');
  b int; c int; f int; v int; r int;
  cj int; fj int; vj int; rj int;
  v_rows int;
begin
  -- ── re-validate the identity AT MINT TIME, not just at inspection time ──
  -- "Marker last" only certifies a validated fixture if the identity being
  -- minted is itself revalidated here. current_setting is session state and
  -- can be reassigned between the two blocks; minting whatever it says now
  -- would let a re-declared (or production) ref be stamped into the marker
  -- on the strength of a check performed against a different value.
  if v_ref is null or btrim(v_ref) = '' then
    raise exception 'REFUSED: declared identity vanished before minting';
  end if;
  if v_ref !~ '^[a-z]{20}$' then
    raise exception 'REFUSED: % is not a plausible Supabase branch ref (re-checked at mint time)', v_ref;
  end if;
  if v_ref = 'aqgjcezhdoianqmoknnu' then
    raise exception 'REFUSED: that is the PRODUCTION project ref (re-checked at mint time).';
  end if;

  select count(*) into b from public.vault_brands;
  select count(*) into c from public.vault_collections;
  select count(*) into f from public.vault_families;
  select count(*) into v from public.vault_variants;
  select count(*) into r from public.vault_references;
  if (b, c, f, v, r) is distinct from (192, 396, 579, 710, 388) then
    raise exception 'FIXTURE INVALID: counts %/%/%/%/% (expected 192/396/579/710/388) — rolling back everything', b, c, f, v, r;
  end if;
  -- parent-child shape: every child joins a real parent, losslessly
  select count(*) into cj from public.vault_collections x join public.vault_brands p on p.id = x.brand_id;
  select count(*) into fj from public.vault_families x join public.vault_collections p on p.id = x.collection_id;
  select count(*) into vj from public.vault_variants x join public.vault_families p on p.id = x.family_id;
  select count(*) into rj from public.vault_references x join public.vault_variants p on p.id = x.variant_id;
  if (cj, fj, vj, rj) is distinct from (396, 579, 710, 388) then
    raise exception 'FIXTURE INVALID: parent-child joins %/%/%/% — rolling back everything', cj, fj, vj, rj;
  end if;

  -- identity artifacts: minted ONLY now, inside the same transaction.
  execute format(
    'create function public.test_branch_marker() returns text language sql as %L',
    format('select %L::text', v_ref));
  execute 'grant execute on function public.test_branch_marker() to anon';

  -- The target artifact is the root every downstream guard reads its
  -- expected identity from, so its CARDINALITY is load-bearing. A
  -- `create table … as select` carries no constraints at all: a later
  -- insert could add a second, disagreeing row, and a delete could empty it
  -- — and an empty table yields NULL, which makes `<>` comparisons NULL and
  -- silently satisfies every downstream `if … then raise` guard. Exactly
  -- one row is therefore enforced structurally, and the column is NOT NULL
  -- and shape-checked so no null or malformed identity can ever be stored.
  execute '
    create table public.galaxy_proof_target (
      singleton              boolean     not null default true,
      declared_branch_ref    text        not null,
      fixture_validated_at   timestamptz not null default now(),
      constraint galaxy_proof_target_pkey primary key (singleton),
      constraint galaxy_proof_target_singleton_check check (singleton),
      constraint galaxy_proof_target_ref_shape_check
        check (declared_branch_ref ~ ''^[a-z]{20}$''))';
  execute format(
    'insert into public.galaxy_proof_target (declared_branch_ref) values (%L)', v_ref);
  execute 'alter table public.galaxy_proof_target enable row level security';
  execute 'revoke all on table public.galaxy_proof_target from public, anon, authenticated';

  -- prove the cardinality invariant holds on the row just written
  select count(*) into v_rows from public.galaxy_proof_target;
  if v_rows <> 1 then
    raise exception 'FIXTURE INVALID: target artifact holds % row(s), expected exactly 1 — rolling back everything', v_rows;
  end if;
  if (select t.declared_branch_ref from public.galaxy_proof_target t) is distinct from v_ref then
    raise exception 'FIXTURE INVALID: target artifact identity does not equal the declared identity — rolling back everything';
  end if;
  if public.test_branch_marker() is distinct from v_ref then
    raise exception 'FIXTURE INVALID: marker identity does not equal the declared identity — rolling back everything';
  end if;

  raise notice 'Fixture validated; marker + single-row target artifact minted for declared branch %', v_ref;
end
$post$;

commit;

select public.test_branch_marker() as marker,
       'fixture complete and validated: apply the Galaxy publication migration next' as next_step;
