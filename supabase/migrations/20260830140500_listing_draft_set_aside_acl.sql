/* ════════════════════════════════════════════════════════════════════════
   LISTING DRAFT — SET ASIDE, ACL correction                       (v7.58)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "`revoke all ... from public` removes the anon grant."

   It does not. Supabase's default privileges grant EXECUTE to anon,
   authenticated and service_role at CREATE FUNCTION time, and revoking from
   PUBLIC does not touch those role-specific grants. Migration
   20260724253000 established exactly this ruling for the original nine
   listing_draft_* functions after a security audit.

   listing_draft_set_aside (v7.56) revoked from public and granted to
   authenticated, but never revoked from anon — so it shipped holding the
   precise ACL defect that ruling exists to prevent.

   NOT A LIVE VULNERABILITY, AND SAID PLAINLY SO NOBODY OVER-READS IT: the
   function returns AUTH_REQUIRED when auth.uid() is null, so every
   anonymous call was already refused. Defense-in-depth held. What was wrong
   is that the ACL did not match the intent, and an ACL that relies on the
   guard inside the function is one refactor away from mattering.

   This grants nothing. It only removes a privilege that should never have
   been present, so no authenticated caller's behaviour changes.
   ════════════════════════════════════════════════════════════════════════ */

revoke all on function public.listing_draft_set_aside(uuid) from anon;
