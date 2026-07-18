-- Add a buy link to saved looks.
--
-- "Get the Look" matches come from SerpAPI with a real product URL, but until
-- now that link was dropped at save time — a saved look had an image and a
-- title but no way back to the store. This column stores the retailer deep
-- link so Saved Looks and Virtual Try-on can offer a "Shop this look" action.
--
-- The app standardized on `source_url` (matching main's naming; the live DB
-- briefly grew a parallel `product_url` column during divergent development —
-- it is unused by the app and safe to ignore or drop).
--
-- Nullable: AI-generated stylist outfits are composites with no single buyable
-- product, so they legitimately have no source_url. Purely additive — safe to
-- run on the live project.

alter table public.outfits
  add column if not exists source_url text;

comment on column public.outfits.source_url is
  'Retailer deep link for shoppable saved looks (e.g. Get the Look matches). Null for AI-composed stylist outfits.';
