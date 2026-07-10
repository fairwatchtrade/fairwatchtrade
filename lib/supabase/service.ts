import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/* ════════════════════════════════════════════════════════════════════════
   TRUSTED SERVER SUPABASE CLIENT — lib/supabase/service.ts

   Service-role client for trusted-server-only writes that must bypass RLS —
   listing_integrity_provider_results (no authenticated-user INSERT policy
   exists) and listing_integrity_evidence (founder-UUID RLS). No app-layer
   service-role pattern existed before this file (SERVICE_ROLE previously
   appeared only in standalone scripts), so this is a new, single home for it.

   DISTINCT from the two existing clients — do not confuse:
     · lib/supabase/client.ts  — browser, anon key
     · lib/supabase/server.ts  — SSR session client, anon key, cookie-bound

   HARD RULES (locked by chain ruling):
     · Server-only. NEVER import this from a client component.
     · Uses SUPABASE_SERVICE_ROLE_KEY — NEVER a NEXT_PUBLIC_ variable.
     · Fails visibly if configuration is missing. It must NEVER degrade to a
       weaker client or silently no-op: a missing key throws, loudly, so a
       caller can fail closed rather than fabricate a passed result.

   The URL is public (NEXT_PUBLIC_SUPABASE_URL); only the key is secret.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

let cached: SupabaseClient | null = null;

/**
 * Construct (or reuse) the trusted service-role client.
 * @throws if SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is absent.
 *         Callers MUST catch this and fail closed — never treat a config
 *         failure as a clean/passed integrity result.
 */
export function createServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "createServiceClient: missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL — " +
        "the trusted server client cannot be constructed. Trusted integrity writes must " +
        "fail closed; they must never fall back to an unprivileged client or a fabricated pass."
    );
  }

  cached = createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
