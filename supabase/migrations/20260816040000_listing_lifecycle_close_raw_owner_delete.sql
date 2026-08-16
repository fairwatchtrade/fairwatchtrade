/* ════════════════════════════════════════════════════════════════════════
   PRE-STAGE-5 SAFETY GATE — close every raw client path to physical
   listing deletion, BEFORE any foreign key is allowed to move.

   WHY THIS MUST PRECEDE STAGE 5

   FK RESTRICT was never a security control; it was an accident that
   happened to block some deletes. Relaxing constraints is precisely what
   would make the existing raw path start succeeding, so the path closes
   first.

   MEASURED BEFORE (three surfaces, per the order — not one policy):

     1. RLS   : policy `listings_delete_own` granted DELETE to {public}
                on `auth.uid() = seller_id`
     2. GRANTS: anon          -> INSERT, REFERENCES, SELECT, TRIGGER,
                                 TRUNCATE, UPDATE
                authenticated -> INSERT, REFERENCES, SELECT, TRIGGER,
                                 TRUNCATE
     3. CODE  : no application route and no SQL function deletes a listing.
                The bypass was entirely at the RLS + grant layer.

   ⚠ TRUNCATE IS THE ONE THAT MATTERED MOST. Revoking DELETE alone would
   have been cosmetic: TRUNCATE removes every row in the table and RLS does
   not apply to it at all. Reachability today is low (PostgREST exposes no
   TRUNCATE verb) but "no HTTP verb currently maps to it" is not the same
   guarantee as "exactly one governed authority can destroy listing rows".

   ⚠ REPORTED, NOT FIXED HERE: 31 tables in public carry the same default
   TRUNCATE grant to anon/authenticated. Supabase's GRANT ALL pattern assumes
   RLS is the protection, which holds for SELECT/INSERT/UPDATE/DELETE and
   fails for TRUNCATE. A separate bounded security pass — §21 forbids folding
   unrelated work into this flight.

   ⚠ service_role and postgres RETAIN delete privilege, deliberately:
     · the Stage 9 purge RPC will be SECURITY DEFINER owned by postgres and
       does not need caller privilege;
     · revoking service_role now would leave NO path to delete any listing,
       including the disposable fixture Stage 5's own destructive proof needs.
   Recommend revoking service_role at Stage 5 once the governed purge RPC is
   the proven single authority. A ruling for Layout, not a decision made here.

   RUNTIME PROOF (authenticated session carrying the seller's own uid):
     DELETE FROM public.listings ... -> "permission denied for table listings"
   Executed against a UUID matching zero rows, so the privilege check was
   exercised with no possibility of destroying data had the guard failed.
   ════════════════════════════════════════════════════════════════════════ */

DROP POLICY IF EXISTS listings_delete_own ON public.listings;

REVOKE DELETE   ON public.listings FROM anon;
REVOKE DELETE   ON public.listings FROM authenticated;
REVOKE TRUNCATE ON public.listings FROM anon;
REVOKE TRUNCATE ON public.listings FROM authenticated;
REVOKE UPDATE   ON public.listings FROM anon;

COMMENT ON TABLE public.listings IS
  'Marketplace inventory. Physical deletion is NOT available to client sessions: the owner DELETE policy was dropped and DELETE/TRUNCATE revoked from anon/authenticated as the pre-Stage-5 safety gate. Sellers use the governed Remove lifecycle; physical purge occurs only through server-authoritative purge machinery after eligibility is proven.';
