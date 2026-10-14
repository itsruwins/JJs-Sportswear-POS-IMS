-- =============================================================================
-- Sales report, follow-up: stable top-10 lists
-- =============================================================================
-- When two products (or sizes and colors) tie on sales total or pieces, the top-10
-- lists end on name and id, so the page and its CSV always list the same rows.
-- Same function as 20261008000000_sales_report.sql otherwise. Safe to run more than once.
-- =============================================================================

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
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'sales',          (select count(*) from live),
        'revenue',        (select coalesce(sum(subtotal), 0) from live),
        'pieces',         (select coalesce(sum(quantity), 0) from lines),
        'cash',           (select coalesce(sum(subtotal), 0) from live where payment_method = 'cash'),
        'gcash',          (select coalesce(sum(subtotal), 0) from live where payment_method = 'gcash'),
        'voided',         (select count(*) from period where voided_at is not null),
        'voided_revenue', (select coalesce(sum(subtotal), 0) from period where voided_at is not null)
      )
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'sales', sales, 'revenue', revenue) order by bucket)
      from (
        select
          case p_bucket
            when 'hour'  then to_char(created_at at time zone 'Asia/Manila', 'HH24')
            when 'month' then to_char(created_at at time zone 'Asia/Manila', 'YYYY-MM')
            else              to_char(created_at at time zone 'Asia/Manila', 'YYYY-MM-DD')
          end as bucket,
          count(*) as sales,
          sum(subtotal) as revenue
        from live
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
