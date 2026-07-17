-- ═══════════════════════════════════════════════════════════════════════
-- v2.25 — Saved Searches foundation (Collector's Drawer quick links)
-- A saved search is a user-named browse query string (browse state lives
-- entirely in the URL — verified in recon). Ranking for the Drawer's three
-- quick links needs no extra machinery: open_count (frequency) DESC,
-- last_opened_at (recency tie-break) DESC NULLS LAST, created_at (newest
-- fallback when usage history is absent) DESC. Reopening a search bumps
-- open_count + last_opened_at under saved_searches_update_own.
-- Owner-scoped RLS mirrors the proven saved_watches pattern, plus UPDATE
-- for the usage bump. No founder/service special-casing — this is purely
-- the collector's own data.
-- Rollback: DROP TABLE public.saved_searches;
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE public.saved_searches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text NOT NULL
    CONSTRAINT saved_searches_name_len CHECK (char_length(name) BETWEEN 1 AND 60),
  query_string   text NOT NULL
    CONSTRAINT saved_searches_query_len CHECK (char_length(query_string) <= 2000),
  open_count     integer NOT NULL DEFAULT 0
    CONSTRAINT saved_searches_open_count_nonneg CHECK (open_count >= 0),
  last_opened_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_searches_user_name_unique UNIQUE (user_id, name)
);

CREATE INDEX saved_searches_user_idx ON public.saved_searches (user_id);

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_searches_select_own ON public.saved_searches
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY saved_searches_insert_own ON public.saved_searches
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY saved_searches_update_own ON public.saved_searches
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY saved_searches_delete_own ON public.saved_searches
  FOR DELETE USING (auth.uid() = user_id);
