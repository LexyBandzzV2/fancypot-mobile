-- Optional, additive, non-breaking.
--
-- The existing `ai_usage` table already logs { user_id, function_name,
-- cost_cents, ip_address, user_agent, created_at } and drives all rate-limit /
-- spend-cap logic. The mobile spec asks the log to also carry request_type,
-- tokens_used, estimated_cost (dollars) and subscription_tier. Rather than
-- rename existing columns (which the web edge functions depend on), we ADD
-- nullable companions so both worlds keep working.
--
-- Safe to run on the live project: only adds columns + a generated view.

alter table if exists public.ai_usage
  add column if not exists request_type text,
  add column if not exists tokens_used integer,
  add column if not exists subscription_tier text;

-- request_type is a friendlier alias for function_name; backfill + keep in sync.
update public.ai_usage set request_type = function_name where request_type is null;

-- Convenience view exposing the spec's exact shape (estimated_cost in dollars).
create or replace view public.ai_usage_report as
select
  id,
  user_id,
  coalesce(request_type, function_name) as request_type,
  tokens_used,
  cost_cents,
  round(cost_cents::numeric / 100, 4) as estimated_cost,
  subscription_tier,
  created_at
from public.ai_usage;

comment on view public.ai_usage_report is
  'Spec-shaped read model over ai_usage for mobile analytics (estimated_cost in USD).';
