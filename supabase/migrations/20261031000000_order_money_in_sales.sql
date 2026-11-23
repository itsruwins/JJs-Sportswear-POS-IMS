-- =============================================================================
-- Custom-order money in the sales report
-- =============================================================================
-- Orders taken on the POS Designs tab (and every other custom order) are paid
-- through public.payments, not public.sales, so the sales report never saw them.
-- From now on the report counts:
--
--   * shelf sales, as before (voided sales left out)
--   * every verified custom-order payment, on the day it was verified: a counter
--     payment is verified the moment it's recorded; a customer's online payment
--     when staff verify it. Pending, submitted, and rejected payments never count.
--   * less every refund on a custom order, on the day it was given back.
--
-- rpc('sales_report', { p_from, p_to, p_bucket })   owner only
--   Same as 20261016120000_e_payments.sql, with:
--     totals.revenue              shelf sales + order payments - refunds
--     totals.shelf_revenue        shelf sales only (the old revenue)
--     totals.order_payments       verified order payments (sum)
--     totals.order_payment_count  how many
--     totals.refunds              refunds given (sum)
--     totals.refund_count         how many
--     totals.cash / e_payment / providers   include order payments, less refunds
--                                 (a refund that isn't cash went back by GCash)
--     series[].revenue            the bucket's net total, shelf and orders
--     series[].orders             the bucket's order payments less refunds
--   totals.sales, totals.pieces, products, variants, and cashiers stay shelf only.
--
-- Safe to run more than once.
-- =============================================================================

create index if not exists payments_verified_at_idx
  on public.payments (verified_at)
  where status = 'verified';

create index if not exists custom_order_refunds_created_at_idx
  on public.custom_order_refunds (created_at);

create or replace function public.sales_report(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text default 'day'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_owner() then
    raise exception 'Only owners can see sales reports' using errcode = '42501';
  end if;
  if p_to is null or (p_from is not null and p_from >= p_to) then
    raise exception 'The period needs an end after its start' using errcode = '22023';
  end if;
  if p_bucket not in ('hour', 'day', 'month') then
    raise exception 'Bucket must be hour, day, or month' using errcode = '22023';
  end if;

  with period as (
    select s.*
    from public.sales s
    where s.created_at < p_to
      and (p_from is null or s.created_at >= p_from)
  ),
  live as (
    select * from period where voided_at is null
  ),
  lines as (
    select i.quantity, i.subtotal, v.id as variant_id, v.size, v.color, p.id as product_id, p.name
    from live
    join public.sale_items i on i.sale_id = live.id
    join public.product_variants v on v.id = i.variant_id
    join public.products p on p.id = v.product_id
  ),
  pays as (
    select sp.provider, sp.amount
    from live
    join public.sale_payments sp on sp.sale_id = live.id
    where sp.method = 'e_payment'
  ),
  order_pays as (
    select p.amount, p.verified_at as at,
           case when p.method = 'cash' then null else coalesce(p.provider, 'gcash') end as provider
    from public.payments p
    where p.status = 'verified'
      and p.verified_at < p_to
      and (p_from is null or p.verified_at >= p_from)
  ),
  refunds as (
    select r.amount, r.created_at as at,
           case when r.method = 'cash' then null else 'gcash' end as provider
    from public.custom_order_refunds r
    where r.created_at < p_to
      and (p_from is null or r.created_at >= p_from)
  ),
  -- Every e-payment in, less e-payment refunds, by provider.
  provider_money as (
    select provider, amount from pays
    union all
    select provider, amount from order_pays where provider is not null
    union all
    select provider, -amount from refunds where provider is not null
  ),
  -- One row per thing that moved money, for the series.
  events as (
    select created_at as at, subtotal as amount, 0::numeric as orders, 1 as sale from live
    union all
    select at, amount, amount, 0 from order_pays
    union all
    select at, -amount, -amount, 0 from refunds
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'sales',               (select count(*) from live),
        'shelf_revenue',       (select coalesce(sum(subtotal), 0) from live),
        'order_payments',      (select coalesce(sum(amount), 0) from order_pays),
        'order_payment_count', (select count(*) from order_pays),
        'refunds',             (select coalesce(sum(amount), 0) from refunds),
        'refund_count',        (select count(*) from refunds),
        'revenue',             (select coalesce(sum(amount), 0) from events),
        'pieces',              (select coalesce(sum(quantity), 0) from lines),
        'cash',                (select coalesce(sum(amount), 0) from events) - (select coalesce(sum(amount), 0) from provider_money),
        'e_payment',           (select coalesce(sum(amount), 0) from provider_money),
        'voided',              (select count(*) from period where voided_at is not null),
        'voided_revenue',      (select coalesce(sum(subtotal), 0) from period where voided_at is not null),
        'providers', coalesce((
          select jsonb_agg(jsonb_build_object('code', pr.code, 'name', pr.name, 'revenue', t.revenue) order by pr.sort_order, pr.name)
          from (select provider, sum(amount) as revenue from provider_money group by provider) t
          join public.payment_providers pr on pr.code = t.provider
          where t.revenue <> 0
        ), '[]'::jsonb)
      )
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'sales', sales, 'revenue', revenue, 'orders', orders) order by bucket)
      from (
        select
          case p_bucket
            when 'hour'  then to_char(at at time zone 'Asia/Manila', 'HH24')
            when 'month' then to_char(at at time zone 'Asia/Manila', 'YYYY-MM')
            else              to_char(at at time zone 'Asia/Manila', 'YYYY-MM-DD')
          end as bucket,
          sum(sale) as sales,
          sum(amount) as revenue,
          sum(orders) as orders
        from events
        group by 1
      ) b
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.revenue desc, t.pieces desc, t.name, t.product_id)
      from (
        select product_id, name, sum(quantity) as pieces, sum(subtotal) as revenue
        from lines
        group by product_id, name
        order by revenue desc, pieces desc, name, product_id
        limit 10
      ) t
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.pieces desc, t.revenue desc, t.name, t.variant_id)
      from (
        select variant_id, product_id, name, size, color, sum(quantity) as pieces, sum(subtotal) as revenue
        from lines
        group by variant_id, product_id, name, size, color
        order by pieces desc, revenue desc, name, variant_id
        limit 10
      ) t
    ), '[]'::jsonb),
    'cashiers', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.revenue desc, t.username)
      from (
        select pr.id, pr.username, pr.full_name, count(*) as sales, sum(live.subtotal) as revenue
        from live
        join public.profiles pr on pr.id = live.cashier_id
        group by pr.id, pr.username, pr.full_name
      ) t
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.sales_report(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.sales_report(timestamptz, timestamptz, text) to authenticated;
