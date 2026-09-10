-- ════════════════════════════════════════════════════════════════════════
-- STRIPE STEP 1 · correction S1-C1 — provider payment internals are
-- server-only
-- 20260910220000_stripe_step1_c1_server_only_reads.sql
--
-- The Step 1 migration let an authenticated buyer or seller SELECT their own
-- rows of stripe_payment_attempts and stripe_refunds directly. Those rows
-- carry provider-operational identifiers — checkout_url, the connected
-- account id, PaymentIntent and Charge ids, the idempotency key, raw
-- provider status — none of which a browser has any business reading.
--
-- After this migration no client role can read either table at all. The
-- buyer receives only the public-safe payment truth the product needs
-- (lifecycle, refund state, dispute state, timestamps) through the narrow
-- server read at /api/stripe/payment-state, which reads with the service
-- role and returns an allowlist of fields. stripe_events was already
-- server-only and is unchanged.
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists stripe_payment_attempts_read_own on public.stripe_payment_attempts;
drop policy if exists stripe_refunds_read_own on public.stripe_refunds;

revoke all on table public.stripe_payment_attempts from anon, authenticated;
revoke all on table public.stripe_refunds from anon, authenticated;

comment on table public.stripe_payment_attempts is
  'One Stripe payment attempt for a FairWatchTrade transaction. lifecycle / refund_state / dispute_state are independent truth axes. amount_minor is the provider minor-unit integer. Server-only: no client role may read or write; the product reads it through /api/stripe/payment-state, which returns public-safe fields only.';
