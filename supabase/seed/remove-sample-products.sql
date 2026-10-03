-- =============================================================================
-- Remove the SAMPLE catalog loaded by sample-products.sql
-- =============================================================================
-- Deletes every product tagged 'sample', with its images, tags, variants, and
-- their inventory history. Real products (no 'sample' tag) are untouched.
-- Run in the Supabase SQL editor.
-- =============================================================================

begin;

do $$
begin
  -- POS sales keep a permanent record of what was sold; samples that were sold can't be erased.
  if exists (
    select 1
    from public.sale_items si
    join public.product_variants pv on pv.id = si.variant_id
    join public.product_tags t on t.product_id = pv.product_id and lower(t.tag) = 'sample'
  ) then
    raise exception 'Some sample products appear in POS sales. Archive them in the admin instead of deleting them.';
  end if;
end;
$$;

delete from public.inventory_transactions it
using public.product_variants pv, public.product_tags t
where it.variant_id = pv.id
  and t.product_id = pv.product_id
  and lower(t.tag) = 'sample';

-- Images, tags, and variants are removed with their product (on delete cascade).
delete from public.products p
where exists (
  select 1 from public.product_tags t
  where t.product_id = p.id and lower(t.tag) = 'sample'
);

commit;
