/* ════════════════════════════════════════════════════════════════════════
   PIN notify_on_listing_publish's SEARCH PATH

   Found by the Trade cancellation test, not by inspection.

   Cancelling a trade releases both listings back to 'published'. That fires
   on_listing_published → notify_on_listing_publish(), which inserts into
   `notifications` and reads `profiles` — both UNQUALIFIED. The function is
   SECURITY DEFINER but sets no search_path of its own, so it inherits the
   CALLER's. Every caller so far has had a normal search_path and it worked.

   cancel_trade_deal() is hardened with `SET search_path TO ''`, as every
   governed writer in this repo is. The trigger inherited the empty path, the
   unqualified names resolved to nothing, and the whole cancellation aborted:

     ERROR 42P01: relation "notifications" does not exist

   It is the ONLY unpinned one of the four publish triggers — verified:

     collector_dossier_on_listing_publish   search_path=""
     record_listing_lifecycle_event         search_path=""
     evaluate_saved_searches_on_publish     search_path=public
     notify_on_listing_publish              (none)          ← this file

   WHY PIN RATHER THAN WORK AROUND IT

   The alternative was to widen the search path inside cancel_trade_deal for
   the length of one UPDATE. That hides a landmine instead of removing it:
   the NEXT hardened definer that publishes a listing hits the same wall, and
   the failure would look like a bug in that new writer rather than here.

   `public` is not a new behaviour. It is precisely what the function has been
   resolving against all along, borrowed from whichever caller happened to
   invoke it. This makes that dependency explicit and stops it depending on a
   stranger. Existing callers see no change whatsoever.

   A SECURITY DEFINER function without a pinned search_path is also the
   textbook search-path-injection shape, so this is the safer state on its own
   terms, independent of the bug that surfaced it.

   NO BEHAVIOUR CHANGE. Nothing about which notifications are written, to
   whom, or when is touched — only where the names resolve.

   PFC274 = 62 — Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

ALTER FUNCTION public.notify_on_listing_publish() SET search_path TO 'public';
