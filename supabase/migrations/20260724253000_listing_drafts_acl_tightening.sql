-- ════════════════════════════════════════════════════════════════════════
-- LISTING DRAFTS — ACL tightening  (security audit follow-up)
--
-- The 20260724250000 migration's function grants were narrower on paper than
-- in live truth: Supabase's default privileges grant EXECUTE to anon /
-- authenticated / service_role at CREATE FUNCTION time, and `revoke … from
-- public` does not remove those role-specific default grants. Every anonymous
-- call was still rejected internally (AUTH_REQUIRED — defense-in-depth held),
-- but the ACL should match the intent, not merely be caught by the guard.
--
-- Ruling implemented:
--   · anon loses EXECUTE on all nine functions — the sign-in callback flow
--     redirects signed-out visitors BEFORE any RPC fires, so no anonymous
--     caller legitimately needs even the controlled AUTH_REQUIRED response;
--   · authenticated + service_role keep EXECUTE on the eight state RPCs;
--   · listing_draft_handoff_ttl() — the NINTH function, a pure IMMUTABLE
--     `interval '2 hours'` calculation with no table access — is internal
--     only: called inside the definer RPCs (owner postgres executes by owner
--     right), so ALL client roles lose EXECUTE on it;
--   · listing_drafts sheds the unused TRUNCATE / REFERENCES / TRIGGER table
--     privileges for anon + authenticated. TRUNCATE in particular is NOT
--     gated by RLS, so sensitive unpublished drafts must not carry it.
--     SELECT remains (RLS listing_drafts_select_own scopes it to the owner).
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ════════════════════════════════════════════════════════════════════════

-- ── Table: strip unused privileges (RLS does not guard TRUNCATE) ──────────
revoke truncate, references, trigger on public.listing_drafts from anon, authenticated;
-- anon has no business reading drafts either; RLS already yields zero rows,
-- but the ACL should say so outright.
revoke select on public.listing_drafts from anon;

-- ── Functions: remove anon + re-assert the intended grants ────────────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.listing_draft_create(jsonb)',
    'public.listing_draft_save_content(uuid,jsonb,integer,text)',
    'public.listing_draft_issue_handoff(uuid,uuid)',
    'public.listing_draft_revoke_handoff(uuid)',
    'public.listing_draft_redeem_handoff(text)',
    'public.listing_draft_return_authority(uuid,jsonb,integer)',
    'public.listing_draft_status(uuid)',
    'public.listing_draft_mark_published(uuid,uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- The internal TTL helper: no client role executes it at all.
revoke all on function public.listing_draft_handoff_ttl() from public;
revoke all on function public.listing_draft_handoff_ttl() from anon;
revoke all on function public.listing_draft_handoff_ttl() from authenticated;
revoke all on function public.listing_draft_handoff_ttl() from service_role;

comment on function public.listing_draft_handoff_ttl() is
  'Internal-only handoff TTL (2 hours). IMMUTABLE, no table access; executed '
  'solely inside the listing_draft_* SECURITY DEFINER functions by their '
  'owner. No client role holds EXECUTE.';
