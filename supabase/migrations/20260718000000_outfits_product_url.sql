-- Add a buy link to saved looks.
--
-- "Get the Look" matches come from SerpAPI with a real product URL, but until
-- now that link was dropped at save time — a saved look had an image and a
-- title but no way back to the store. This column stores the retailer deep
-- link so Saved Looks and Virtual Try-on can offer a "Shop this look" action.
--
-- Naming note: the app-facing field is `source_url` (see src/lib/api.ts), and
-- saveOutfit/listOutfits bridge it to THIS `product_url` column — the column
-- the deployed backend uses. The live DB also briefly grew an unused
-- `source_url` column during divergent development; it is safe to ignore/drop.
--
-- Nullable: AI-generated stylist outfits are composites with no single buyable
-- product, so they legitimately have no product_url. Purely additive — safe to
-- run on the live project.

alter table public.outfits
  add column if not exists product_url text;

comment on column public.outfits.product_url is
  'Retailer deep link for shoppable saved looks (e.g. Get the Look matches). Null for AI-composed stylist outfits.';
