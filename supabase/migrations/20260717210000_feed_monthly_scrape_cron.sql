-- Monthly schedule for the feed-scrape edge function via pg_cron + pg_net.
--
-- Reuses the `feed_refresh_service_key` Vault secret created for the weekly
-- feed refresh (see 20260707140000_feed_weekly_refresh_cron.sql). If that
-- migration hasn't run yet, store the service-role key in Vault first:
--
--   select vault.create_secret('<your-supabase-service-role-key>', 'feed_refresh_service_key');
--
-- Runs at 05:00 UTC on the 1st of every month — before the weekly Monday
-- refresh, so a shared window never doubles up load.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('feed-monthly-scrape');
exception when others then
  null;  -- job doesn't exist yet, that's fine
end $$;

select cron.schedule(
  'feed-monthly-scrape',
  '0 5 1 * *',
  $$
    select net.http_post(
      url := 'https://gizqpfbmqgwhbalywkqv.supabase.co/functions/v1/feed-scrape',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'feed_refresh_service_key' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    );
  $$
);
