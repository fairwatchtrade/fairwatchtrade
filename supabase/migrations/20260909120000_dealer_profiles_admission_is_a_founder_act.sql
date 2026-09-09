-- ═══════════════════════════════════════════════════════════════════════
-- DEALER ADMISSION IS A FOUNDER ACT  (v8.31 · Tax Time authority repair)
--
-- THE MISCONCEPTION THIS MIGRATION EXISTS TO KILL:
--
--   "A dealer_profiles row is the dealer's own data, so the dealer creates it."
--
-- Half right. The 2026-08-12 dealer_room_identity migration said "the dealer
-- owns the identity data; FairWatchTrade owns the surrounding room", and it
-- SEEDED the first dealer row itself — a founder act. What it also did, by
-- default Supabase grants plus an owner INSERT policy, was let ANY
-- authenticated account mint its own row through a direct client insert,
-- bypassing /api/account/dealer-profile entirely. Once Tax Time (v8.30) keyed
-- dealer-only access to that row, self-minting became self-admission.
--
-- The governing truth, made durable here:
--
--   · A dealer identity row is MINTED only by FairWatchTrade, through
--     public.dealer_profile_admit(), executable by service_role alone and
--     reached only from a founder-gated route. Never by the account holder,
--     never by a client, never by inference from listings, sales, imported
--     media or a typed business name.
--   · Once admitted, the dealer OWNS the identity data — business name,
--     slug, logo, location, tagline — and edits it through the same
--     session-client path as before. Nothing about editing changes.
--   · Nobody re-keys a row: the identity columns (seller_id, created_at,
--     admitted_at, admitted_by) are outside the client UPDATE grant.
--   · Admission is recorded (admitted_at / admitted_by). The two rows that
--     already exist were admitted by migration seed and by founder action;
--     their admitted_by is left NULL — unknown is not invented.
--
-- No new role. No hard-coded dealer list. The founder gate is the one the
-- product already has (the admin route's session check); this migration only
-- makes the database refuse what that gate never admitted.
-- ═══════════════════════════════════════════════════════════════════════

-- 1 · Admission provenance. Backfilled from created_at; actor unknown.
alter table public.dealer_profiles
  add column if not exists admitted_at timestamptz,
  add column if not exists admitted_by uuid references public.profiles(id) on delete set null;

update public.dealer_profiles set admitted_at = created_at where admitted_at is null;

alter table public.dealer_profiles
  alter column admitted_at set not null,
  alter column admitted_at set default now();

-- 2 · The client may READ every row (public dealer identity) and a dealer may
--     UPDATE the identity data of its own row. Nothing else. Default grants
--     handed anon and authenticated INSERT/DELETE/TRUNCATE/REFERENCES/TRIGGER
--     on the table; all of it goes.
revoke all on table public.dealer_profiles from anon;
revoke all on table public.dealer_profiles from authenticated;
grant select on table public.dealer_profiles to anon, authenticated;
grant update (slug, business_name, logo_url, logo_path, location, tagline, updated_at)
  on table public.dealer_profiles to authenticated;

-- 3 · The self-mint door closes. The owner UPDATE policy stays exactly as it
--     was (using + with check seller_id = auth.uid()); the public read policy
--     stays. No INSERT policy exists for any client role after this.
drop policy if exists dealer_profiles_owner_insert on public.dealer_profiles;

-- 4 · The one governed writer. SECURITY DEFINER so it may insert where no
--     client may; service_role-only so it is reachable solely from a
--     server route that has already applied the founder gate.
create or replace function public.dealer_profile_admit(
  p_seller_id     uuid,
  p_business_name text,
  p_slug          text default null,
  p_admitted_by   uuid default null
)
returns public.dealer_profiles
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_name text := btrim(coalesce(p_business_name, ''));
  v_slug text;
  v_row  public.dealer_profiles;
begin
  if p_seller_id is null then
    raise exception 'seller_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_seller_id) then
    raise exception 'unknown_account' using errcode = '22023';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'business_name_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from public.dealer_profiles where seller_id = p_seller_id) then
    raise exception 'already_admitted' using errcode = '23505';
  end if;

  /* Slug: the caller's, or derived from the business name; the shape CHECK
     on the table remains the authority and a collision is refused, never
     silently suffixed — admission is deliberate enough to pick a slug. */
  v_slug := lower(btrim(coalesce(p_slug, '')));
  if v_slug = '' then
    v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    v_slug := left(v_slug, 80);
  end if;
  if exists (select 1 from public.dealer_profiles where slug = v_slug) then
    raise exception 'slug_taken' using errcode = '23505';
  end if;

  insert into public.dealer_profiles (seller_id, slug, business_name, admitted_at, admitted_by)
  values (p_seller_id, v_slug, v_name, now(), p_admitted_by)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.dealer_profile_admit(uuid, text, text, uuid) from public;
revoke all on function public.dealer_profile_admit(uuid, text, text, uuid) from anon;
revoke all on function public.dealer_profile_admit(uuid, text, text, uuid) from authenticated;
grant execute on function public.dealer_profile_admit(uuid, text, text, uuid) to service_role;

comment on function public.dealer_profile_admit(uuid, text, text, uuid) is
  'The only way a dealer identity row is minted. service_role only; the founder gate lives in the calling route. Clients edit the row afterwards through the owner UPDATE policy; they never create one.';
