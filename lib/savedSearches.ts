import { createClient } from "@/lib/supabase/client";

/* ────────────────────────────────────────────────────────────────────────
   SAVED SEARCHES — SHARED BEHAVIOR — lib/savedSearches.ts  (v2.25a)

   One home for the two behaviors every saved-search surface shares, so the
   Collector's Drawer quick links and the buyer-dashboard card cannot
   drift (chain ruling):

   · THE LOCKED RANKING — frequency (open_count DESC), recency tie-break
     (last_opened_at DESC NULLS LAST), newest-saved fallback (created_at
     DESC). Expressed once, applied by every reader.
   · REOPEN + USAGE BUMP — bump open_count/last_opened_at (best-effort,
     RLS update_own; the counter is bookkeeping), then navigate to the
     saved browse query. The navigation is the promise: a failed bump
     never blocks the reopen the collector asked for.

   A saved search IS a user-named browse query string — browse state lives
   entirely in the URL, so reopening is pure navigation.

   Client-side module: session Supabase client, RLS-scoped throughout.
   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

export type SavedSearchRow = {
  id: string;
  name: string;
  query_string: string;
};

/** The locked ranking, applied to any saved_searches select builder. */
export async function fetchRankedSavedSearches(limit?: number): Promise<SavedSearchRow[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  let query = supabase
    .from("saved_searches")
    .select("id, name, query_string")
    .order("open_count", { ascending: false })
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (typeof limit === "number") query = query.limit(limit);
  const { data } = await query;
  return Array.isArray(data) ? data : [];
}

/** Bump usage (best-effort), then return the /browse href to navigate to. */
export async function bumpAndHref(search: SavedSearchRow): Promise<string> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: current } = await supabase
        .from("saved_searches")
        .select("open_count")
        .eq("id", search.id)
        .maybeSingle();
      await supabase
        .from("saved_searches")
        .update({
          open_count: (current?.open_count ?? 0) + 1,
          last_opened_at: new Date().toISOString(),
        })
        .eq("id", search.id);
    }
  } catch {
    // Never block the reopen over telemetry.
  }
  const qs = search.query_string.replace(/^\?/, "");
  return `/browse${qs ? `?${qs}` : ""}`;
}
