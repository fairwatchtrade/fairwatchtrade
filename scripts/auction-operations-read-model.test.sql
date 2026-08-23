-- Auction Operations — database ACL and read-model assertions.
-- Run against the live database after the 20260823160000 migration:
-- every SELECT must return the expected value or the deployment is wrong.

-- 1 · the run store is unreachable from every client role
select 'run_store_client_privileges_must_be_zero' as check,
       count(*) as value
  from information_schema.role_table_grants
 where table_name = 'auction_operations_run'
   and grantee in ('anon', 'authenticated', 'PUBLIC');
-- expect: 0

select 'run_store_service_role_grants' as check,
       array_agg(privilege_type order by privilege_type) as value
  from information_schema.role_table_grants
 where table_name = 'auction_operations_run' and grantee = 'service_role';
-- expect: {INSERT,SELECT,UPDATE} — no DELETE: runs are history

-- 2 · the read-model functions execute for service_role only
select 'read_model_client_execute_must_be_zero' as check,
       count(*) as value
  from information_schema.role_routine_grants
 where routine_name in ('auction_operations_results_read_model', 'auction_operations_sale_detail')
   and grantee in ('anon', 'authenticated', 'PUBLIC');
-- expect: 0

-- 3 · the controlled result writer is untouched: still no direct result
--     mutation for ANY role, service_role included
select 'direct_result_write_privileges_must_be_zero' as check,
       count(*) as value
  from information_schema.role_table_grants
 where table_name = 'auction_evidence_result'
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
   and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC');
-- expect: 0

-- 4 · the staging bucket exists and is private
select 'staging_bucket_private' as check,
       (public = false) as value
  from storage.buckets where id = 'auction-operations-staging';
-- expect: true

-- 5 · read-model semantics: every sale row's counts are internally coherent
select 'read_model_coherence_violations' as check, count(*) as value
  from auction_operations_results_read_model()
 where current_result_count > lot_count
    or sold_count + passed_count + withdrawn_count + unsold_count <> current_result_count
    or priced_result_count > sold_count
    or fresh_exact_count + fresh_nonexact_count + stale_decision_count > lot_count
    or no_case_count > lot_count;
-- expect: 0

-- 6 · a stale exact decision is never counted fresh (definitional: the two
--     buckets are disjoint by the fingerprint comparison itself)
select 'stale_never_fresh' as check, count(*) as value
  from auction_operations_results_read_model()
 where stale_decision_count > 0 and lot_count = fresh_exact_count;
-- expect: 0
