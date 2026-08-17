-- ══════════════════════════════════════════════════════════════════════════
-- Dealer Accelerator — lifecycle notifications
--
-- The dealer never has to wonder what happened. Five moments, each derived
-- from committed durable state rather than announced by whatever code
-- happened to run:
--
--   preparation complete   <- dealer_accelerator_batches reaching a settled status
--   submitted for review   <- listings reaching pending_review
--   clarification / rejected / published
--                          <- listing_decision_events, which already carries
--                             the reviewer's own seller_message
--
-- ── Exactly once, structurally ────────────────────────────────────────────
-- notifications.dedupe_key already has a UNIQUE index, so "exactly once" is
-- enforced by the database and not by careful code. Every insert below is
-- ON CONFLICT DO NOTHING against a key derived from the fact itself, which is
-- what makes replay and retry safe: running any of these twice writes one row.
--
-- ── Fail OPEN, always ─────────────────────────────────────────────────────
-- Every trigger body is wrapped so that any fault loses the notification
-- rather than the event it describes. A dealer who cannot be told their
-- listing was published must still have their listing published. This mirrors
-- the deliberate choice already made for log_dealer_submission_event.
--
-- ── Scope: imported listings only, deliberately ───────────────────────────
-- These fire only for listings carrying dealer_import provenance. Ordinary
-- sellers' notification behaviour is unchanged. Extending submission and
-- publication notices to every seller would be an improvement, but it is a
-- separate product decision and not this flight's to make.
--
-- NOTE on search_path = '': pg_catalog is always implicitly searched, so
-- built-in functions resolve without qualification. NULLIF, COALESCE, EXTRACT
-- and CASE are SQL constructs rather than schema-qualifiable functions — an
-- earlier attempt to write pg_catalog.nullif() failed for exactly that reason.
--
-- ⚠ Every function below is revoked from anon/authenticated in the migration
-- immediately after this one. Creating a function in this schema publishes it
-- by default; see 20260817143020.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.dealer_accelerator_listing_is_imported(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.listing_media
     where listing_id = p_listing_id and capture_source = 'dealer_import'
  );
$fn$;

revoke all on function public.dealer_accelerator_listing_is_imported(uuid) from public, anon, authenticated;
grant execute on function public.dealer_accelerator_listing_is_imported(uuid) to service_role;

create or replace function public.dealer_accelerator_listing_label(p_listing public.listings)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select concat_ws(' ',
           nullif(btrim(coalesce(p_listing.brand, '')), ''),
           nullif(btrim(coalesce(p_listing.model, '')), '')
         )
         || coalesce(' · ' || nullif(btrim(coalesce(p_listing.public_code, '')), ''), '');
$fn$;

-- ── 1. Submitted for review ──────────────────────────────────────────────
create or replace function public.dealer_accelerator_notify_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.status = 'pending_review' and coalesce(old.status, '') <> 'pending_review' then
    begin
      if public.dealer_accelerator_listing_is_imported(new.id) then
        insert into public.notifications (user_id, type, message, listing_id, dedupe_key)
        values (
          new.seller_id,
          'listing_submitted',
          'Submitted for FairWatchTrade review. '
            || public.dealer_accelerator_listing_label(new)
            || ' is now pending review.',
          new.id,
          -- Keyed on the attestation instant, so a genuine resubmission after
          -- a rejection notifies again while a replay of the same transition
          -- does not.
          'da_submitted:' || new.id::text || ':'
            || coalesce(extract(epoch from new.dealer_attested_at)::text, 'na')
        )
        on conflict (dedupe_key) do nothing;
      end if;
    exception when others then
      null; -- never block a submission for a notification
    end;
  end if;
  return new;
end
$fn$;

drop trigger if exists dealer_accelerator_notify_submitted on public.listings;
create trigger dealer_accelerator_notify_submitted
  after update of status on public.listings
  for each row execute function public.dealer_accelerator_notify_submitted();

-- ── 2/3/4. Reviewer decisions: published, clarification, rejected ────────
create or replace function public.dealer_accelerator_notify_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_seller uuid;
  v_label text;
  v_type text;
  v_message text;
begin
  begin
    if not public.dealer_accelerator_listing_is_imported(new.listing_id) then
      return new;
    end if;

    select l.seller_id, public.dealer_accelerator_listing_label(l)
      into v_seller, v_label
      from public.listings l where l.id = new.listing_id;
    if v_seller is null then
      return new;
    end if;

    if new.decision = 'approved' and new.resulting_status = 'published' then
      v_type := 'listing_published';
      v_message := 'Your listing is live. ' || v_label
                   || ' has been approved and published.';
    elsif new.decision = 'clarification_requested' then
      v_type := 'listing_clarification';
      -- The reviewer's own words when there are any. Substituting a generic
      -- sentence for a specific message would hide the only useful part.
      v_message := 'FairWatchTrade needs one clarification. '
                   || coalesce(
                        nullif(btrim(new.seller_message), ''),
                        'Open the imported draft to see the exact item that needs your attention and resubmit when ready.'
                      );
    elsif new.decision = 'rejected' then
      v_type := 'listing_rejected';
      v_message := v_label || ' was not approved. '
                   || coalesce(
                        nullif(btrim(new.seller_message), ''),
                        'Open the imported draft to see what needs to change.'
                      );
    elsif new.decision = 'returned_to_draft' then
      v_type := 'listing_clarification';
      v_message := v_label || ' has been returned to draft. '
                   || coalesce(
                        nullif(btrim(new.seller_message), ''),
                        'Open the imported draft to continue.'
                      );
    else
      return new;
    end if;

    insert into public.notifications (user_id, type, message, listing_id, dedupe_key)
    values (
      v_seller, v_type, v_message, new.listing_id,
      -- The decision event's own id. One decision, one notice, forever.
      'da_decision:' || new.id::text
    )
    on conflict (dedupe_key) do nothing;
  exception when others then
    null; -- never block an adjudication for a notification
  end;
  return new;
end
$fn$;

drop trigger if exists dealer_accelerator_notify_decision on public.listing_decision_events;
create trigger dealer_accelerator_notify_decision
  after insert on public.listing_decision_events
  for each row execute function public.dealer_accelerator_notify_decision();

-- ── 5. Preparation complete ──────────────────────────────────────────────
create or replace function public.dealer_accelerator_notify_preparation_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_prepared int;
  v_attention int;
begin
  if new.status in ('completed', 'completed_with_exceptions', 'failed')
     and coalesce(old.status, '') not in ('completed', 'completed_with_exceptions', 'failed') then
    begin
      select
        count(*) filter (where bi.status = 'draft_created'),
        count(*) filter (where bi.status = 'blocked')
        into v_prepared, v_attention
        from public.dealer_accelerator_batch_items bi
       where bi.batch_id = new.id;

      insert into public.notifications (user_id, type, message, dedupe_key)
      values (
        new.dealer_profile_id,
        'dealer_accelerator_ready',
        'Your Dealer Accelerator drafts are ready. '
          || coalesce(v_prepared, 0)::text || ' private draft'
          || case when coalesce(v_prepared, 0) = 1 then '' else 's' end
          || ' ready for your confirmation'
          || case when coalesce(v_attention, 0) > 0
                  then ', and ' || v_attention::text || ' source item'
                       || case when v_attention = 1 then '' else 's' end
                       || ' need your attention.'
                  else '.' end,
        -- One notice per run, however many times the transition is replayed.
        'da_prep_complete:' || new.id::text
      )
      on conflict (dedupe_key) do nothing;
    exception when others then
      null; -- never block a batch transition for a notification
    end;
  end if;
  return new;
end
$fn$;

drop trigger if exists dealer_accelerator_notify_preparation_complete on public.dealer_accelerator_batches;
create trigger dealer_accelerator_notify_preparation_complete
  after update of status on public.dealer_accelerator_batches
  for each row execute function public.dealer_accelerator_notify_preparation_complete();
