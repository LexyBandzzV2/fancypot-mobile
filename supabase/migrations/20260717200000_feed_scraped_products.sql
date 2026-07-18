-- Store for the monthly feed scraper (supabase/functions/feed-scrape).
--
-- Real, currently listed products pulled once a month per catalog brand via
-- SerpAPI Google Shopping. The mobile app reads this table DIRECTLY (unlike
-- feed_fresh_cache) — signed-in users get read-only access via RLS; all
-- writes come from the feed-scrape edge function using the service role.
--
-- Safe to run on the live project: purely additive, brand-new table.

create table if not exists public.feed_scraped_products (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  -- normalized brand key (lowercase alphanumeric), matches
  -- normalizeBrand in src/lib/brands.ts for exact store filtering
  brand_key text not null,
  name text,
  price numeric,
  image_url text not null,
  product_url text not null unique,
  category text,
  style_tags text[] not null default '{}',
  budget_tier text not null,
  scraped_at timestamptz not null default now()
);

create index if not exists feed_scraped_products_brand_key_idx
  on public.feed_scraped_products (brand_key);
create index if not exists feed_scraped_products_budget_tier_idx
  on public.feed_scraped_products (budget_tier);
create index if not exists feed_scraped_products_scraped_at_idx
  on public.feed_scraped_products (scraped_at desc);

alter table public.feed_scraped_products enable row level security;

-- Signed-in users can browse the scraped feed; nobody but service role writes.
drop policy if exists "feed_scraped_products_read" on public.feed_scraped_products;
create policy "feed_scraped_products_read"
  on public.feed_scraped_products
  for select
  to authenticated
  using (true);

comment on table public.feed_scraped_products is
  'Monthly-scraped real product listings per catalog brand (SerpAPI Google Shopping), written by the feed-scrape edge function. Authenticated users read-only; service-role writes only.';
