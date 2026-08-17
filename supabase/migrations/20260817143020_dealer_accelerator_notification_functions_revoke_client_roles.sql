-- ══════════════════════════════════════════════════════════════════════════
-- Revoke client EXECUTE on the notification functions.
--
-- Third occurrence of the same trap in this flight, so it is written down as a
-- rule rather than a note: on this project, EVERY function created in the
-- public schema inherits EXECUTE for anon and authenticated from Supabase's
-- ALTER DEFAULT PRIVILEGES. Creating a function is therefore an act of
-- publishing it, unless the same migration revokes those roles explicitly.
-- Revoking from PUBLIC does not do it — anon and authenticated are real roles,
-- not the PUBLIC pseudo-role.
--
-- The three notify_* functions are TRIGGER functions. PostgREST cannot
-- usefully invoke a trigger function, so the practical risk here is lower than
-- it was for authorize_source — but "cannot usefully be called" is not a
-- security boundary, and this is exactly the shape the platform's own
-- advisors flag as anon_security_definer_function_executable. They are
-- SECURITY DEFINER because they must write notifications regardless of who
-- performed the underlying transition; they are not an API.
--
-- dealer_accelerator_listing_label is SECURITY INVOKER and merely formats a
-- row into a sentence, so exposure would leak nothing a caller could not
-- already read. It is revoked anyway: the rule is worth more than the
-- exception, and an inventory of "which of these is safe to expose" is a
-- worse thing to maintain than a blanket revoke.
--
-- Verification, which must return zero rows:
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname like 'dealer_accelerator%'
--      and (p.proacl::text like '%anon=%' or p.proacl::text like '%authenticated=%');
-- ══════════════════════════════════════════════════════════════════════════

revoke all on function public.dealer_accelerator_notify_submitted() from public, anon, authenticated;
revoke all on function public.dealer_accelerator_notify_decision() from public, anon, authenticated;
revoke all on function public.dealer_accelerator_notify_preparation_complete() from public, anon, authenticated;
revoke all on function public.dealer_accelerator_listing_label(public.listings) from public, anon, authenticated;
