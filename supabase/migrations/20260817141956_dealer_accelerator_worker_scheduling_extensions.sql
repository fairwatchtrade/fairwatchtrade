-- Unattended preparation needs a heartbeat that does not come from a browser.
-- pg_cron supplies the schedule; pg_net supplies the outbound call. Both are
-- available on this project and are enabled here rather than by hand, so a
-- rebuilt environment gets them from the migration history.
--
-- Where they land, which matters because every function in the next migration
-- pins search_path = '' and must therefore schema-qualify everything:
--   pg_cron -> schema `cron`  (cron.schedule, cron.unschedule, cron.job)
--   pg_net  -> schema `net`   (net.http_post, net._http_response)
create extension if not exists pg_cron;
create extension if not exists pg_net;
