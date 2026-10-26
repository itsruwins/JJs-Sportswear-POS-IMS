-- =============================================================================
-- Real designs (D2): made-to-order products
-- =============================================================================
-- A made-to-order product (the shop's sublimated jersey designs) is printed and
-- sewn after it's ordered, so it never holds stock. Its variants are style ×
-- size (the style, like "NBA cut · Set", is kept in the color column) and stay
-- at 0 stock for good:
--   - no variant of a made-to-order product can go above 0, whatever the path
--     (opening stock, adjust_stock, a returned sale), and
--   - a product can only switch to made to order while every variant is at 0.
-- Nothing reads 0 as "sold out" for these products; the app leaves them out of
-- stock counts, restock lists, and low-stock alerts. Safe to run more than once.
-- =============================================================================

alter table public.products add column if not exists made_to_order boolean not null default false;

comment on column public.products.made_to_order is
  'Made after it''s ordered (custom-printed designs): no stock is kept, and every variant stays at 0. Variants are style × size, the style in product_variants.color.';

create index if not exists products_made_to_order_idx on public.products (made_to_order) where made_to_order;


-- Variants of a made-to-order product never hold stock.
create or replace function private.made_to_order_keeps_no_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stock_quantity > 0
     and exists (select 1 from public.products p where p.id = new.product_id and p.made_to_order) then
    raise exception 'Made-to-order products don''t keep stock'
      using errcode = 'P0001', detail = 'made_to_order:' || new.product_id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists product_variants_made_to_order_stock on public.product_variants;
create trigger product_variants_made_to_order_stock
  before insert or update of stock_quantity, product_id on public.product_variants
  for each row execute function private.made_to_order_keeps_no_stock();


-- Switching to made to order is only allowed with nothing in stock, so no stock is silently ignored.
create or replace function private.made_to_order_switch_needs_zero()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pieces bigint;
begin
  if new.made_to_order and not old.made_to_order then
    select coalesce(sum(stock_quantity), 0) into v_pieces
    from public.product_variants
    where product_id = new.id and stock_quantity > 0;
    if v_pieces > 0 then
      raise exception 'Set every size to 0 before making this product made to order (% still in stock)', v_pieces
        using errcode = 'P0001', detail = 'made_to_order_stock:' || v_pieces::text;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_made_to_order_switch on public.products;
create trigger products_made_to_order_switch
  before update of made_to_order on public.products
  for each row execute function private.made_to_order_switch_needs_zero();
