-- Add a buy link to saved looks.
--
-- "Get the Look" matches come from SerpAPI with a real product URL, but until
-- now that link was dropped at save time — a saved look had an image and a
-- title but no way back to the store. These columns store the retailer deep
-- link so Saved Looks and Virtual Try-on can offer a "Shop this look" action.
--
-- Naming note: the app-facing field is `source_url` (see src/lib/api.ts).
-- Divergent development briefly split the link across two columns, so the
-- bridge in saveOutfit/rowToOutfit WRITES BOTH and reads whichever is set.
-- Both columns are therefore load-bearing — do NOT drop either one.
--
-- Nullable: AI-generated stylist outfits are composites with no single buyable
-- product, so they legitimately have no link. Purely additive — safe to run on
-- the live project.

alter table public.outfits
  add column if not exists product_url text;
alter table public.outfits
  add column if not exists source_url text;

comment on column public.outfits.product_url is
  'Retailer deep link for shoppable saved looks (e.g. Get the Look matches). Written in tandem with source_url; null for AI-composed stylist outfits.';
comment on column public.outfits.source_url is
  'Retailer deep link for shoppable saved looks (e.g. Get the Look matches). Written in tandem with product_url; null for AI-composed stylist outfits.';
