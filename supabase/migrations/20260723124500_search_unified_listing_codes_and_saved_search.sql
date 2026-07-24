-- ============================================================================
-- Search Flight 1 — public listing codes + saved Search watcher
--
-- Two things ship here:
--   1. listings.public_code — the human listing code (q15932). Unique,
--      immutable, never reused, consumed by drafts.
--   2. saved_searches state + saved_search_matches — so "we'll keep watching
--      for your watch" is a promise the database actually keeps.
--
-- CODE ALLOCATION — governed keyed permutation, not a random loop.
-- A sequence gives a monotonic index; a keyed Feistel network permutes that
-- index into the code space. Because a Feistel network is a BIJECTION, two
-- different sequence values can never collide — uniqueness is structural, not
-- probabilistic, and needs no retry loop. The unique index is the backstop,
-- not the mechanism. Sequential issuance is therefore not guessable-in-order:
-- consecutive listings receive unrelated codes.
--
-- Code space: one lowercase letter + five digits = 26 * 100000 = 2,600,000.
-- The Feistel runs over 2^22 (4,194,304) and CYCLE-WALKS: re-permute until the
-- result lands inside 2,600,000. Cycle-walking preserves bijectivity.
--
-- THE SECRET IS NOT IN THIS REPOSITORY. This migration creates a locked
-- private container; the key VALUE is inserted once, outside the repo, by the
-- operator (Supabase's postgres role is not superuser, so a database-level
-- GUC is not available — verified against the platform):
--
--   insert into private.search_secrets (name, value)
--   values ('listing_code_key', '<long random secret>');
--
-- The private schema has no grants to anon/authenticated/service_role; only
-- the SECURITY DEFINER allocation path (owned by postgres) can read it. If
-- the key is absent, allocation raises loudly rather than silently falling
-- back to a guessable ordering.
-- ============================================================================

-- ── 1. Keyed permutation ────────────────────────────────────────────────────

create schema if not exists private;

create table if not exists private.search_secrets (
  name  text primary key,
  value text not null
);

revoke all on schema private from public, anon, authenticated, service_role;
revoke all on private.search_secrets from public, anon, authenticated, service_role;

create or replace function public.listing_code_key()
returns text
language plpgsql
stable
security definer
set search_path = private, pg_temp
as $$
declare
  k text;
begin
  select value into k from private.search_secrets where name = 'listing_code_key';
  if k is null or length(k) < 16 then
    raise exception using
      errcode = '55000',
      message = 'listing_code_key secret is not set (or is too short)',
      hint    = 'Outside the repository: insert into private.search_secrets (name, value) values (''listing_code_key'', ''<long random secret>'');';
  end if;
  return k;
end;
$$;

-- The key must never be readable through the helper by a client role.
revoke all on function public.listing_code_key() from public, anon, authenticated;

-- One Feistel round. 28 bits of HMAC-SHA256 keeps the cast unambiguously
-- positive; only 11 bits are consumed. hmac() is schema-qualified because
-- Supabase installs pgcrypto in `extensions`, and the SECURITY DEFINER
-- trigger path pins search_path to `public` — unqualified, this fails on the
-- very first insert (caught on the verification branch).
create or replace function public.listing_code_round(p_key text, p_round int, p_value int)
returns int
language sql
immutable
as $$
  select (
    ('x' || substr(encode(extensions.hmac(p_round::text || ':' || p_value::text, p_key, 'sha256'), 'hex'), 1, 7))::bit(28)::int
  ) % 2048;
$$;

-- 4-round Feistel over 2^22, then cycle-walk into the 2,600,000 code space.
create or replace function public.listing_code_permute(p_index bigint)
returns bigint
language plpgsql
stable
as $$
declare
  k  text := public.listing_code_key();
  x  bigint;
  l  int;
  r  int;
  t  int;
  i  int;
  guard int := 0;
begin
  if p_index < 0 or p_index >= 2600000 then
    raise exception 'listing code space exhausted (index %)', p_index;
  end if;

  x := p_index;
  loop
    l := (x >> 11)::int;
    r := (x & 2047)::int;
    for i in 1..4 loop
      t := r;
      r := (l # public.listing_code_round(k, i, r));  -- '#' is bitwise XOR
      l := t;
    end loop;
    x := ((l::bigint) << 11) | r::bigint;

    exit when x < 2600000;

    guard := guard + 1;
    if guard > 64 then
      raise exception 'listing code cycle-walk failed to converge';
    end if;
  end loop;

  return x;
end;
$$;

-- Clients can never run the permutation as an oracle; allocation happens only
-- inside the SECURITY DEFINER trigger path.
revoke all on function public.listing_code_permute(bigint) from public, anon, authenticated;

-- Encode a permuted value as the public code: letter + five digits.
create or replace function public.listing_code_encode(p_value bigint)
returns text
language sql
immutable
as $$
  select chr(97 + (p_value / 100000)::int) || lpad((p_value % 100000)::text, 5, '0');
$$;

-- ── 2. The column, the sequence, the allocation ─────────────────────────────

create sequence if not exists public.listing_public_code_seq
  as bigint start with 0 minvalue 0 maxvalue 2599999 no cycle;

alter table public.listings
  add column if not exists public_code text;

-- Uniqueness is a database constraint, per the locked law.
create unique index if not exists listings_public_code_key
  on public.listings (public_code)
  where public_code is not null;

create or replace function public.assign_listing_public_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Drafts consume codes: allocation happens at INSERT regardless of status.
  if NEW.public_code is null then
    NEW.public_code := public.listing_code_encode(
      public.listing_code_permute(nextval('public.listing_public_code_seq'))
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_assign_listing_public_code on public.listings;
create trigger trg_assign_listing_public_code
  before insert on public.listings
  for each row execute function public.assign_listing_public_code();

-- Immutable after issuance, and never reused.
create or replace function public.protect_listing_public_code()
returns trigger
language plpgsql
as $$
begin
  if OLD.public_code is not null and NEW.public_code is distinct from OLD.public_code then
    raise exception 'listing public_code is immutable (listing %)', OLD.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_listing_public_code on public.listings;
create trigger trg_protect_listing_public_code
  before update on public.listings
  for each row execute function public.protect_listing_public_code();

-- Backfill the existing prelaunch rows. Oldest first so issuance order is
-- stable and meaningful. No dual-write, no staged rollout — there is no
-- issued-code population to preserve.
do $$
declare
  row_id uuid;
begin
  for row_id in select id from public.listings where public_code is null order by created_at asc
  loop
    update public.listings
       set public_code = public.listing_code_encode(
             public.listing_code_permute(nextval('public.listing_public_code_seq'))
           )
     where id = row_id;
  end loop;
end;
$$;

alter table public.listings
  alter column public_code set not null;

-- ── 3. Saved Search state ───────────────────────────────────────────────────
-- saved_searches already exists (quick-links). It gains the structured meaning
-- needed to re-evaluate a Search later, plus pause/resume.

alter table public.saved_searches
  add column if not exists search_state    jsonb,
  add column if not exists meaning_version integer not null default 1,
  add column if not exists paused          boolean not null default false;

-- ── 4. Matches ──────────────────────────────────────────────────────────────

create table if not exists public.saved_search_matches (
  id              uuid primary key default gen_random_uuid(),
  saved_search_id uuid not null references public.saved_searches(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  listing_id      uuid not null references public.listings(id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- Deduplication is a constraint, not application politeness: re-evaluating
  -- the same listing against the same saved Search can never double-report.
  unique (saved_search_id, listing_id)
);

alter table public.saved_search_matches enable row level security;

-- Matches are visible only to the collector who owns the saved Search.
-- No client INSERT policy: matches are created only by the SECURITY DEFINER
-- watcher below, so a client cannot forge a match.
create policy saved_search_matches_select_own
  on public.saved_search_matches for select
  using (auth.uid() = user_id);

create policy saved_search_matches_delete_own
  on public.saved_search_matches for delete
  using (auth.uid() = user_id);

create index if not exists saved_search_matches_user_idx
  on public.saved_search_matches (user_id, created_at desc);

-- ── 5. The watcher ──────────────────────────────────────────────────────────
-- Evaluates a stored search_state against one listing. The meaning vocabulary
-- here is the SAME small allowlist the TypeScript parser emits (lib/search/
-- parse.ts) — kinds: brand, collection, caseMaterial, excludeCaseMaterial,
-- complication, movement, beatRateMin, powerReserveMinDays,
-- powerReservePresent, caseSizeMaxMm, reference, code, text.
create or replace function public.saved_search_matches_listing(p_state jsonb, p_listing public.listings)
returns boolean
language plpgsql
stable
as $$
declare
  m        jsonb;
  d        jsonb := coalesce(p_listing.details, '{}'::jsonb);
  kind     text;
  val      text;
  num      numeric;
  hay      text;
begin
  if p_state is null then
    return false;
  end if;

  -- Exact identity first, mirroring the resolution order in the product.
  if coalesce(p_state->>'code', '') <> '' then
    return lower(p_state->>'code') = lower(coalesce(p_listing.public_code, ''));
  end if;

  if coalesce(p_state->>'reference', '') <> '' then
    return lower(p_state->>'reference') = lower(coalesce(p_listing.reference, ''));
  end if;

  for m in select * from jsonb_array_elements(coalesce(p_state->'meanings', '[]'::jsonb))
  loop
    kind := m->>'kind';
    val  := m->>'value';

    if kind = 'brand' then
      if lower(coalesce(p_listing.brand, '')) <> lower(val) then return false; end if;

    elsif kind = 'collection' then
      if position(lower(val) in lower(coalesce(p_listing.model, ''))) = 0 then return false; end if;

    elsif kind = 'caseMaterial' then
      -- Exact identity: Gold Filled is not Gold (mirrors parse.ts).
      if lower(coalesce(d->>'caseMaterial', '')) <> lower(val) then return false; end if;

    elsif kind = 'excludeCaseMaterial' then
      if lower(coalesce(d->>'caseMaterial', '')) = lower(val) then return false; end if;

    elsif kind = 'complication' then
      if not exists (
        select 1 from jsonb_array_elements_text(
          case when jsonb_typeof(d->'complications') = 'array'
               then d->'complications' else '[]'::jsonb end
        ) c where lower(c) = lower(val)
      ) then return false; end if;

    elsif kind = 'movement' then
      if lower(coalesce(d->>'movementType', '')) <> lower(val) then return false; end if;

    elsif kind = 'beatRateMin' then
      num := nullif(regexp_replace(coalesce(d->>'movementFrequency', ''), '[^0-9.]', '', 'g'), '')::numeric;
      if num is null or num < (val)::numeric then return false; end if;

    elsif kind = 'powerReserveMinDays' then
      num := nullif(regexp_replace(coalesce(d->>'powerReserve', ''), '[^0-9.]', '', 'g'), '')::numeric;
      -- powerReserve is stored in hours; compare in hours.
      if num is null or num <= (val)::numeric * 24 then return false; end if;

    elsif kind = 'powerReservePresent' then
      if coalesce(d->>'powerReserve', '') = '' then return false; end if;

    elsif kind = 'caseSizeMaxMm' then
      num := nullif(regexp_replace(coalesce(d->>'caseSizeMm', ''), '[^0-9.]', '', 'g'), '')::numeric;
      if num is null or num >= (val)::numeric then return false; end if;

    elsif kind = 'text' then
      -- Every word must appear, matching matchesMeaning('text') in
      -- lib/search/parse.ts. A whole-phrase substring test would silently
      -- disagree with live Browse results.
      hay := lower(concat_ws(' ',
        p_listing.brand, p_listing.model, p_listing.reference,
        d->>'caseMaterial', d->>'dialColorType', d->>'movementType', p_listing.description));
      if exists (
        select 1 from unnest(regexp_split_to_array(lower(val), '\s+')) w
         where w <> '' and position(w in hay) = 0
      ) then return false; end if;
    end if;
  end loop;

  return true;
end;
$$;

-- On publish, record a match for every active saved Search that this listing
-- satisfies. SECURITY DEFINER so the watcher can write rows no client may
-- write; the unique constraint makes repeat evaluation a no-op.
create or replace function public.evaluate_saved_searches_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'published'
     and (TG_OP = 'INSERT' or OLD.status is distinct from 'published') then

    insert into public.saved_search_matches (saved_search_id, user_id, listing_id)
    select s.id, s.user_id, NEW.id
      from public.saved_searches s
     where s.paused = false
       and s.search_state is not null
       and s.user_id <> NEW.seller_id
       and public.saved_search_matches_listing(s.search_state, NEW)
    on conflict (saved_search_id, listing_id) do nothing;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_evaluate_saved_searches_on_publish on public.listings;
create trigger trg_evaluate_saved_searches_on_publish
  after insert or update on public.listings
  for each row execute function public.evaluate_saved_searches_on_publish();
