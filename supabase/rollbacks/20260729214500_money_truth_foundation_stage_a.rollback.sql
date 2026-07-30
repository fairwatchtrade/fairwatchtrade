-- Marketplace Money Truth Foundation — STAGE A rollback.
-- Reverses only the objects introduced by the paired migration.
--
-- Repeatable Rollback Law: safe after complete application, partial
-- application, prior rollback, or no application at all. Missing targets are
-- treated as already clean; unexpected cleanup failures stay fatal and visible.
-- Existence is CHECKED, never swallowed — there is no blanket
-- `exception when others`, because that would hide a real cleanup failure
-- behind false resilience.

-- 1. Function EXECUTE revokes — `revoke ... on function` raises 42883 when the
--    function is absent, so each signature is checked with to_regprocedure,
--    which yields null instead of raising.
do $revoke$
declare
  fn text;
begin
  foreach fn in array array[
    'public.listing_attestation_fingerprint_v2(uuid)',
    'public.listing_currency_attest(uuid,text,text,uuid)'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from service_role', fn);
      execute format('revoke execute on function %s from public', fn);
      execute format('revoke execute on function %s from anon', fn);
      execute format('revoke execute on function %s from authenticated', fn);
    end if;
  end loop;
end
$revoke$;

drop function if exists public.listing_currency_attest(uuid, text, text, uuid);
drop function if exists public.listing_attestation_fingerprint_v2(uuid);

-- 2. Policies — `drop policy if exists` guards only the POLICY, not the table:
--    against a missing table it raises undefined_table (42P01). Check first.
do $policies$
declare
  rec record;
begin
  for rec in
    select *
      from (values
        ('supported_currencies_read', 'public.supported_currencies')
      ) as t(policy_name, table_name)
  loop
    if to_regclass(rec.table_name) is not null then
      execute format('drop policy if exists %I on %s', rec.policy_name, rec.table_name);
    end if;
  end loop;
end
$policies$;

-- 3. New tables (index drops with its table).
drop table if exists public.listing_currency_events;
drop table if exists public.supported_currencies;

-- 4. Added columns and their constraints. `alter table ... drop column if
--    exists` is a no-op for a missing column and drops the column's own CHECK
--    with it, but the table itself must exist first.
do $columns$
declare
  rec record;
begin
  for rec in
    select *
      from (values
        ('public.listings',          'asking_currency'),
        ('public.purchase_requests', 'proposed_currency'),
        ('public.purchase_requests', 'listing_currency'),
        ('public.profiles',          'preferred_listing_currency')
      ) as t(table_name, column_name)
  loop
    if to_regclass(rec.table_name) is not null then
      execute format('alter table %s drop column if exists %I', rec.table_name, rec.column_name);
    end if;
  end loop;
end
$columns$;

-- No role is created by the paired migration — every function is postgres-owned
-- — so there is no role to drop and no schema grant to revoke. Parity is
-- intentional, not an omission.
