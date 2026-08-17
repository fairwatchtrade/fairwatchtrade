/* ════════════════════════════════════════════════════════════════════════
   LEAST PRIVILEGE — purchase_requests and notifications

   WHAT THIS IS, STATED ACCURATELY

   Both tables carry table-level TRUNCATE and DELETE for anon and
   authenticated. Nothing in the application uses either. This is an
   excessive-privilege defect: it widens blast radius for no benefit.

   ⚠ IT IS NOT A DEMONSTRATED EXPLOIT. An earlier version of this finding
   claimed anyone loading the site could wipe these tables. That was wrong and
   is corrected here so the record does not carry it: the browser-facing Data
   API exposes GET / POST / PATCH / DELETE and RPC, and there is no TRUNCATE
   verb. Holding a Postgres privilege is not the same as having a path to
   invoke it, and no such path was shown. DELETE likewise remains subject to
   RLS, so that grant alone never made rows deletable either.

   The reason to revoke is least privilege — grants and RLS are two
   independent layers, and a privilege the product never exercises should not
   be sitting there waiting for a future path to be built.

   DEPENDENCY PROOF TAKEN BEFORE WRITING THIS

   purchase_requests
     policies ........ insert own, select own. No UPDATE policy, no DELETE
                       policy — a DELETE was already RLS-denied.
     app mutations ... none direct. Every write goes through a SECURITY
                       DEFINER RPC: withdraw_purchase_request, remove_listing,
                       dismiss_purchase_request, restore_purchase_request.
                       Zero .delete() and zero .update() calls in the entire
                       codebase against this table.
     verdict ......... TRUNCATE and DELETE unused.

   notifications
     policies ........ read own, update own. No INSERT policy (v2.89: client
                       inserts have been RLS-denied since birth; the bells are
                       written by definer functions), no DELETE policy.
     app mutations ... app/api/notifications/route.ts marks read via
                       .update({ read: true }) — twice, and it is policy-
                       backed. Nothing deletes a notification anywhere.
     verdict ......... TRUNCATE and DELETE unused. UPDATE IS USED AND STAYS.

   ⚠ DO NOT "TIDY" notifications.UPDATE INTO THIS REVOKE. It is the read
   receipt on the bell. Removing it silently breaks marking notifications as
   read, and the failure is invisible: the route's error path already degrades
   quietly, so the badge would simply never clear.

   SCOPE IS TWO TABLES. A broader public-schema privilege audit exists as a
   separate finding and is deliberately not touched here. INSERT, SELECT,
   REFERENCES and TRIGGER are all left exactly as they are on both tables —
   this migration removes two privileges and adds nothing.

   PFC274 = 62 — app/api/evaluate/route.ts is untouched.
   ════════════════════════════════════════════════════════════════════════ */

REVOKE TRUNCATE, DELETE ON TABLE public.purchase_requests FROM anon, authenticated;
REVOKE TRUNCATE, DELETE ON TABLE public.notifications     FROM anon, authenticated;
