-- ══════════════════════════════════════════════════════════════════════════
-- Dealer Accelerator notifications — match the partial index, and stop
-- swallowing faults in silence
--
-- ── The defect, proven in production 2026-08-17 ──────────────────────────
-- notifications_dedupe_key_uniq is a PARTIAL unique index:
--
--   CREATE UNIQUE INDEX ... ON public.notifications (dedupe_key)
--     WHERE (dedupe_key IS NOT NULL)
--
-- All three Dealer Accelerator notification triggers wrote a bare
-- `ON CONFLICT (dedupe_key) DO NOTHING`. Postgres requires a partial index's
-- predicate in the inference clause, so every one of those inserts raised
--
--   42P10  there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- and the fail-open handler turned it into `null`. Consequence: a real
-- dealer submission (Overholt OV-5-SS, l19943) completed perfectly —
-- transition, attestation, fingerprint and lifecycle event all correct and
-- verified — while the dealer was never told in-app. NONE of the five
-- section 14 messages could ever have been delivered.
--
-- Confirmed by probe rather than reasoning: the bare form fails 42P10, the
-- predicated form succeeds, against this exact index.
--
-- The repo already had the right shape in emit_listing_removal_notifications
-- and emit_listing_deletion_notifications. This aligns with that house
-- pattern rather than inventing a third convention — the original defect was
-- not following it.
--
-- ── Fail-open is PRESERVED, silence is not ───────────────────────────────
-- A notification failure must never block a submission, review, rejection,
-- clarification, or publication — unchanged, and every handler still
-- swallows the error rather than aborting the transaction.
--
-- What changes is that the handler RAISES WARNING first. A warning does not
-- abort anything and lands in the project's Postgres logs — the same durable
-- operational stream used to diagnose both this defect and the earlier
-- observation_hash_conflict. No new table, no new event type, no new
-- subsystem: an existing mechanism, used.
--
--   -- swallowed notification faults, if any:
--   select timestamp, event_message from logs
--    where source = 'postgres_logs'
--      and event_message like '%dealer_accelerator notification skipped%'
--    order by timestamp desc;
--
-- ── Not done here, deliberately ──────────────────────────────────────────
-- No lifecycle event is manufactured, and the historical Overholt miss is
-- NOT backfilled. No idempotent replay seam exists for submission notices —
-- the emit_* functions are keyed off purchase-request and removal events and
-- cover neither submissions nor decisions — and inventing one to fabricate a
-- notice for an event already past would write a false "we told you" into the
-- record. The miss stays documented; delivery is proven on the next genuine
-- founder action.
--
-- CREATE OR REPLACE with unchanged signatures preserves owner and ACL by
-- definition. Re-verified after applying anyway, because this schema has
-- already been bitten six times by the grant trap:
--   owner=postgres · search_path="" · no anon/authenticated EXECUTE · all
--   three triggers still attached.
-- ══════════════════════════════════════════════════════════════════════════

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
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      end if;
    exception when others then
      -- Fail OPEN: the submission must never be blocked by a notice. But say
      -- so, so a broken notification path cannot hide again.
      raise warning 'dealer_accelerator notification skipped [listing_submitted] listing=% sqlstate=% detail=%',
        new.id, sqlstate, sqlerrm;
    end;
  end if;
  return new;
end
$fn$;

-- ── 2. Reviewer decisions: published / clarification / rejected ──────────
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
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  exception when others then
    raise warning 'dealer_accelerator notification skipped [decision] listing=% event=% sqlstate=% detail=%',
      new.listing_id, new.id, sqlstate, sqlerrm;
  end;
  return new;
end
$fn$;

-- ── 3. Preparation complete ──────────────────────────────────────────────
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
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    exception when others then
      raise warning 'dealer_accelerator notification skipped [preparation_complete] batch=% sqlstate=% detail=%',
        new.id, sqlstate, sqlerrm;
    end;
  end if;
  return new;
end
$fn$;
