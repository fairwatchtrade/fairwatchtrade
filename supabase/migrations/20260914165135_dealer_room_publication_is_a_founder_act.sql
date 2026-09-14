-- Dealer admission and public Dealer Room publication are separate facts.
-- Existing public rooms are deliberately preserved; future admissions are private.
begin;

alter table public.dealer_profiles
  add column if not exists public_room_enabled boolean not null default false;

update public.dealer_profiles
set public_room_enabled = true
where slug in ('the-collector-identity', 'williams-watches');

drop policy if exists dealer_profiles_public_read on public.dealer_profiles;
create policy dealer_profiles_public_read
on public.dealer_profiles
for select
to anon, authenticated
using (public_room_enabled = true);

drop policy if exists dealer_profiles_owner_read on public.dealer_profiles;
create policy dealer_profiles_owner_read
on public.dealer_profiles
for select
to authenticated
using (seller_id = auth.uid());

-- Preserve the existing owner UPDATE policy and its identity-only column grants.
-- Publication is intentionally absent from authenticated UPDATE authority.
comment on column public.dealer_profiles.public_room_enabled is
  'Founder-controlled Dealer Room publication; admission and private workspace access remain independent.';

commit;
