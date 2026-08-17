-- ══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — the unattended worker's heartbeat
--
-- READ THIS BEFORE RUNNING IT. Unscheduling the worker makes a promise in the
-- product false. The preparation progress screen tells the dealer:
--
--   "You can leave this page. The run continues and FairWatchTrade will tell
--    you when your drafts are ready…"
--
-- That sentence is only true because of the schedule this rollback removes.
-- Without it, a run advances only while a dealer's browser is open on the
-- room. If you roll this back, weaken that copy in
-- components/DealerAcceleratorRoom.tsx in the same change — a standing promise
-- the system no longer keeps is worse than the weaker wording it replaced.
--
-- Nothing durable is lost: batches, items, evidence, photographs and drafts
-- are untouched, and every run remains resumable by the dealer's own start
-- action.
--
-- The extensions are deliberately NOT dropped. Other work may come to depend
-- on them, and dropping pg_net would discard net._http_response history that
-- is useful evidence. Drop them by hand only if you have checked.
-- ══════════════════════════════════════════════════════════════════════════

select cron.unschedule('dealer-accelerator-worker')
where exists (select 1 from cron.job where jobname = 'dealer-accelerator-worker');

drop function if exists public.dealer_accelerator_worker_tick();
drop function if exists public.dealer_accelerator_worker_token_valid(text);

-- The credential is dropped last. Recreating this migration mints a NEW
-- secret, which is correct: a rolled-back credential should never come back.
drop table if exists public.dealer_accelerator_worker_credential;
