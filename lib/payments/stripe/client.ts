import "server-only";
import Stripe from "stripe";

/* ════════════════════════════════════════════════════════════════════════
   STRIPE CLIENT — server-only construction, sandbox-only in Step 1
   (Stripe Step 1 of 4, 2026-09-10)

   Secrets never leave this module: no export returns a key, nothing here is
   importable from a client component (the "server-only" import above makes
   that a build error, not a review comment).

   Environment (documented in app/api/stripe/README.md):
     STRIPE_SECRET_KEY                    sandbox secret key, `sk_test_…`
     STRIPE_WEBHOOK_SECRET                signing secret of the sandbox
                                          webhook endpoint, `whsec_…`
     STRIPE_SANDBOX_CONNECTED_ACCOUNT_ID  the one controlled connected
                                          account the Step 1 proof charges
                                          against, `acct_…`

   Step 1 refuses a live key outright. The production rail is Step 4; until
   then a `sk_live_` key in this environment is a misconfiguration, and the
   safe answer to a misconfiguration is to do nothing.
   ════════════════════════════════════════════════════════════════════════ */

export const PAYMENT_ENVIRONMENT = "sandbox" as const;

export const STRIPE_ENV = Object.freeze({
  secretKey: "STRIPE_SECRET_KEY",
  webhookSecret: "STRIPE_WEBHOOK_SECRET",
  connectedAccount: "STRIPE_SANDBOX_CONNECTED_ACCOUNT_ID",
});

let cached: Stripe | null = null;

/** @throws stripe_not_configured | stripe_live_key_refused */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env[STRIPE_ENV.secretKey];
  if (!key) throw new Error("stripe_not_configured");
  if (!key.startsWith("sk_test_")) throw new Error("stripe_live_key_refused");
  cached = new Stripe(key, { typescript: true });
  return cached;
}

/** @throws stripe_webhook_not_configured */
export function getWebhookSecret(): string {
  const secret = process.env[STRIPE_ENV.webhookSecret];
  if (!secret) throw new Error("stripe_webhook_not_configured");
  return secret;
}

/** The controlled Step 1 connected account, or null when not configured. */
export function getSandboxConnectedAccount(): string | null {
  const id = process.env[STRIPE_ENV.connectedAccount]?.trim();
  return id && id.startsWith("acct_") ? id : null;
}
