-- Public Dealer Room identity.
--
-- The dealer owns the identity data; FairWatchTrade owns the surrounding
-- room. Inventory remains public.listings and is never mirrored here.

create table public.dealer_profiles (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  slug text not null unique,
  business_name text not null,
  logo_url text,
  logo_path text,
  location text,
  tagline text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_profiles_slug_shape check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 3 and 80
  ),
  constraint dealer_profiles_business_name_length check (
    char_length(btrim(business_name)) between 1 and 120
  ),
  constraint dealer_profiles_location_length check (
    location is null or char_length(btrim(location)) between 1 and 120
  ),
  constraint dealer_profiles_tagline_length check (
    tagline is null or char_length(btrim(tagline)) between 1 and 240
  ),
  constraint dealer_profiles_logo_pair check (
    (logo_url is null and logo_path is null)
    or (logo_url is not null and logo_path is not null)
  )
);

alter table public.dealer_profiles enable row level security;

create policy dealer_profiles_public_read
  on public.dealer_profiles
  for select
  to anon, authenticated
  using (true);

create policy dealer_profiles_owner_insert
  on public.dealer_profiles
  for insert
  to authenticated
  with check (seller_id = auth.uid());

create policy dealer_profiles_owner_update
  on public.dealer_profiles
  for update
  to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

grant select on public.dealer_profiles to anon, authenticated;
grant insert (
  seller_id, slug, business_name, logo_url, logo_path, location, tagline
) on public.dealer_profiles to authenticated;
grant update (
  slug, business_name, logo_url, logo_path, location, tagline, updated_at
) on public.dealer_profiles to authenticated;

-- Permanent Crash-Test Dealer. The logo remains data, selected privately;
-- this seed establishes only the canonical public identity and route.
insert into public.dealer_profiles (
  seller_id,
  slug,
  business_name,
  location,
  tagline
)
values (
  '524851b5-1eb5-45d2-92ad-533c2de8d465',
  'the-collector-identity',
  'The Collector Identity',
  'Sebring, Florida',
  'Controlled inventory. Public standards.'
)
on conflict (seller_id) do nothing;

-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
