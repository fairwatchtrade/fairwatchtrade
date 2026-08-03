-- ════════════════════════════════════════════════════════════════════════
-- GALAXY CONCURRENCY PROOF — DISPOSABLE FIXTURE + TARGET-GUARD ROOT
-- scripts/galaxy-publication-concurrency/fixture.sql
--
-- THE ONLY FILE THAT CREATES THE DISPOSABLE-TARGET MARKER, and it does so
-- only after independently verifying, in this order:
--   1 · an explicit disposable branch identity supplied by the OPERATOR
--       (session setting galaxy_proof.declared_branch_ref — set it in the
--       same session before running this file);
--   2 · that this connected database is in the expected pre-fixture state
--       (no vault_brands — any production-shaped or unexpected pre-existing
--       state refuses BEFORE any write);
--   3 · that the declared identity is not the production project ref.
-- helpers.sql and negative-control.sql NEVER create the marker; they
-- require it. run.mjs requires the marker's stored identity to equal the
-- identity the operator supplies to IT via environment — two independent
-- declarations that must agree, which is what makes the guard non-circular
-- (no file trusts an identity it minted itself).
--
-- OPERATOR USAGE (same session):
--   set galaxy_proof.declared_branch_ref = '<disposable-branch-ref>';
--   \i fixture.sql        -- or paste the file after the SET
-- ════════════════════════════════════════════════════════════════════════

do $guard$
declare
  v_ref text;
begin
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
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'vault_brands') then
    raise exception 'REFUSED: vault_brands already exists — production-shaped or unexpected pre-existing state. This fixture only runs on an empty disposable branch.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'test_branch_marker') then
    raise exception 'REFUSED: a disposable-target marker already exists — this database has hosted a run; use a fresh branch.';
  end if;

  -- The marker: created ONLY here, ONLY after the checks above, and it
  -- stores the OPERATOR-declared identity so every later consumer can
  -- verify against an identity this file did not invent.
  execute format(
    'create function public.test_branch_marker() returns text language sql as %L',
    format('select %L::text', v_ref));
  execute 'grant execute on function public.test_branch_marker() to anon';
  raise notice 'Disposable-target marker created for declared branch %', v_ref;
end
$guard$;

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

select 'fixture ready (marker holds the declared identity): apply the Galaxy publication migration next' as next_step;
