/* ════════════════════════════════════════════════════════════════════════
   CURATION REVIEW V1 — a collector can ask for a listing to be double-checked

   ONE small object: the collector's request, and the PUBLIC-SAFE summary the
   listing renders when it completes. Raw provider rows
   (listing_integrity_provider_results) stay internal and are never read by
   the public client — this table IS the presentation boundary.

   Publication is untouched: nothing here writes listing status. Curation
   Review is POST-publication commentary, not marketplace admission.
   ════════════════════════════════════════════════════════════════════════ */

create table if not exists public.listing_curation_requests (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'completed', 'cancelled')),
  /* The public-safe Curation Review. Written by the server on completion;
     holds ONLY the collector-facing shape (per-category results, short
     comments, updated). Never provider payloads, scores, or raw detail. */
  summary      jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

/* Dedupe, copied structurally from purchase_requests_one_pending_per_buyer:
   one ACTIVE request per (listing, requester). A completed review does not
   block a future one — that stays a later product decision, not a schema
   accident. */
create unique index if not exists listing_curation_requests_one_pending_per_requester
  on public.listing_curation_requests (listing_id, requester_id)
  where (status = 'pending');

create index if not exists listing_curation_requests_listing_completed_idx
  on public.listing_curation_requests (listing_id, completed_at desc)
  where (status = 'completed');

alter table public.listing_curation_requests enable row level security;

/* A completed review is public commentary on a public listing — anyone
   viewing the listing may read it. Pending rows are REQUESTER-ONLY by
   founder ruling: no one else may learn that a listing is being checked, so
   a request can never be used to mark a competitor's watch. */
drop policy if exists lcr_select_completed_or_own on public.listing_curation_requests;
create policy lcr_select_completed_or_own
  on public.listing_curation_requests for select
  using (status = 'completed' or requester_id = auth.uid());

/* Writes are server-side only (service role bypasses RLS). No client insert
   or update policy exists, so the browser cannot manufacture a review or
   forge a summary. */

create or replace function public.touch_listing_curation_requests_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_listing_curation_requests_updated_at on public.listing_curation_requests;
create trigger trg_listing_curation_requests_updated_at
  before update on public.listing_curation_requests
  for each row execute function public.touch_listing_curation_requests_updated_at();

/* ── triggered_by gains ONE additive value ────────────────────────────────
   Existing values keep their exact meaning; a collector-triggered pass is
   distinguishable in the audit trail from a founder recheck. */
alter table public.listing_integrity_provider_results
  drop constraint if exists listing_integrity_provider_results_triggered_by_check;
alter table public.listing_integrity_provider_results
  add constraint listing_integrity_provider_results_triggered_by_check
  check (
    triggered_by is null
    or triggered_by = any (array[
      'system_upload'::text,
      'admin_recheck'::text,
      'retry'::text,
      'collector_requested'::text
    ])
  );
