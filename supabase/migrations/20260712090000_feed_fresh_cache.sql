-- Cache table for the `feed-fresh` edge function (NON-AI SerpAPI product search).
--
-- feed-fresh pulls live Google Shopping results per (brand, style) and stores
-- them here so repeated feed pulls within CACHE_TTL_HOURS are free — no
-- repeat SerpAPI spend, no repeat latency. Rows older than the TTL are just
-- treated as stale by the edge function and refetched; nothing here expires
-- them automatically.
--
-- RLS is enabled with NO policies on purpose: only the service-role key
-- (used by edge functions) can read/write this table. Anon/authenticated
-- clients — including this app — never query it directly; they call the
-- feed-fresh edge function, which reads the cache and returns just the
-- product list.
--
-- Safe to run on the live project: purely additive, brand-new table.

create table if not exists public.feed_fresh_cache (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  style text not null default '',
  items jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (brand, style)
);

alter table public.feed_fresh_cache enable row level security;
-- No policies defined: service-role (edge functions) only, by design.

comment on table public.feed_fresh_cache is
  'TTL-based cache of SerpAPI Google Shopping results per (brand, style), written by the feed-fresh edge function. Service-role access only (no RLS policies) — clients never read this table directly.';
