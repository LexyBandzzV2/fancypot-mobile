-- Feed refresh scheduling via pg_cron + pg_net
--
-- Before applying this migration, store the Supabase service role key in Vault:
--
--   select vault.create_secret('<your-supabase-service-role-key>', 'feed_refresh_service_key');
--
-- This migration schedules the feed-refresh edge function to run every Monday at 06:00 UTC,
-- replacing any existing daily refresh cadence. The shopping feed will update ONLY on
-- Mondays at 06:00 UTC (cron expression: '0 6 * * 1').
--
-- The service-role key must already be in Vault before this migration runs.

-- Enable required extensions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Defensively unschedule any existing feed refresh job
do $$
begin
  perform cron.unschedule('feed-weekly-refresh');
exception when others then
  null;  -- Job doesn't exist yet, that's fine
end $$;

-- Schedule the feed refresh to run every Monday at 06:00 UTC
select cron.schedule(
  'feed-weekly-refresh',
  '0 6 * * 1',
  $$
    select net.http_post(
      url := 'https://gizqpfbmqgwhbalywkqv.supabase.co/functions/v1/feed-refresh',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'feed_refresh_service_key' limit 1)
      ),
      body := '{}'::jsonb
    );
  $$
);
