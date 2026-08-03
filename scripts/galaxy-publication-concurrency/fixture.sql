-- ════════════════════════════════════════════════════════════════════════
-- GALAXY CONCURRENCY PROOF — DISPOSABLE FIXTURE
-- scripts/galaxy-publication-concurrency/fixture.sql
--
-- Production-shaped vault hierarchy for a DISPOSABLE Supabase branch (a
-- branch cannot replay the pre-v2.21 base schema, so the five tables are
-- rebuilt column-for-column from production's live catalog). Seeded to
-- production's exact shape: 192/396/579/710/388 with 51 empty brands.
--
-- NOT-PRODUCTION GUARD: refuses wherever vault_brands already exists.
-- ════════════════════════════════════════════════════════════════════════

do $$ begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'vault_brands') then
    raise exception 'REFUSED: vault_brands already exists — this fixture only runs on an empty disposable branch, never on production or a restore.';
  end if;
end $$;

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

-- Flight A uniqueness, verbatim
create unique index vault_collections_brand_id_name_key on public.vault_collections (brand_id, name);
create unique index vault_families_collection_id_name_key on public.vault_families (collection_id, name);
create unique index vault_variants_family_id_name_key on public.vault_variants (family_id, name);
create unique index vault_references_variant_id_reference_key on public.vault_references (variant_id, reference);

-- production RLS shape: unconditional public read
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

-- seed to production's exact shape
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

select 'fixture ready: apply the Galaxy publication migration next' as next_step;
