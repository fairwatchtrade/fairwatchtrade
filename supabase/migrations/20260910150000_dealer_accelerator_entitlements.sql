-- ════════════════════════════════════════════════════════════════════════
-- DEALER ACCELERATOR ENTITLEMENTS — designated dealers only
-- 20260910150000_dealer_accelerator_entitlements.sql
--
-- Founder lock (Jason, 2026-09-10): dealer identity and Dealer Accelerator
-- entitlement are separate facts. Dealer Accelerator exists only for seller
-- accounts FairWatchTrade explicitly designated. Absence of a live row here
-- means the capability does not exist for that account: not shown, not
-- navigable, not invokable through seller-facing Dealer Accelerator routes.
--
-- Semantics of one row: "Dealer Accelerator allowed for this seller
-- account." Granted by FairWatchTrade, never by the account. Revocation is a
-- deliberate act recorded in place (revoked_at / revoked_by), never a delete,
-- so the grant history survives.
--
-- Deliberately NOT built:
--   · no trigger, no backfill, no inheritance from dealer_profiles, batches,
--     sources, imported media, listing activity or prior use;
--   · no INSERT / UPDATE / DELETE for anon or authenticated — the only
--     writers are the service role and the founder acting in SQL;
--   · no RPC and no request-access path.
--
-- Reader: lib/dealerAcceleratorEntitlement.ts (session client, own live row
-- under the policy below, boolean only). Tax Time keeps its own derivation
-- in lib/dealerAccess.ts and is untouched by this migration.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.dealer_accelerator_entitlements (
  seller_id   uuid primary key references auth.users (id) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  text not null,
  grant_note  text,
  revoked_at  timestamptz,
  revoked_by  text,
  revoke_note text,
  constraint dealer_accelerator_entitlements_revocation_pair
    check ((revoked_at is null) = (revoked_by is null))
);

comment on table public.dealer_accelerator_entitlements is
  'Dealer Accelerator allowed for this seller account. Founder-designated only; never inferred from dealer_profiles or prior use. A row with revoked_at set is a closed entitlement.';
comment on column public.dealer_accelerator_entitlements.granted_by is
  'Provenance of the FairWatchTrade grant, e.g. founder:Jason.';
comment on column public.dealer_accelerator_entitlements.revoked_at is
  'Set to revoke. The row stays as history; the reader treats it as no entitlement.';

alter table public.dealer_accelerator_entitlements enable row level security;

-- Ordinary sessions may read their own live row and nothing else. No write
-- path exists for them at all.
revoke all on table public.dealer_accelerator_entitlements from anon, authenticated;
grant select on table public.dealer_accelerator_entitlements to authenticated;

drop policy if exists dealer_accelerator_entitlements_read_own on public.dealer_accelerator_entitlements;
create policy dealer_accelerator_entitlements_read_own
  on public.dealer_accelerator_entitlements
  for select
  to authenticated
  using (seller_id = auth.uid() and revoked_at is null);

-- ── Explicit founder designation (authorized by the founder order of
--    2026-09-10 v1) ────────────────────────────────────────────────────────
-- The Collector Identity is the first designated Dealer Accelerator seller.
-- Guarded by both the seller id and the business name so the row can only
-- land on that exact account; if either fails to match, nothing is written.
-- No other dealer profile is granted by this migration or by anything else.
insert into public.dealer_accelerator_entitlements (seller_id, granted_by, grant_note)
select dp.seller_id,
       'founder:Jason',
       'Explicit founder designation, founder order 2026-09-10 v1. First designated Dealer Accelerator seller.'
  from public.dealer_profiles dp
 where dp.seller_id = '524851b5-1eb5-45d2-92ad-533c2de8d465'
   and dp.business_name = 'The Collector Identity'
on conflict (seller_id) do nothing;
