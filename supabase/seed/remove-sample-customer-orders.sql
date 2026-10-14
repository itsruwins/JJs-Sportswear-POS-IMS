-- =============================================================================
-- Remove the SAMPLE orders loaded by sample-customer-orders.sql
-- =============================================================================
-- Deletes the orders whose description starts with "Sample order:" for one
-- customer account, with their items, steps, photos, payments, refunds, history,
-- chats about them, and notifications. The account and its real orders stay.
-- Use the same username as the seed. Run in the Supabase SQL editor.
-- =============================================================================

begin;

create temp table _cfg on commit drop as
select 'c3.test'::text as username;   -- CHANGE ME: the same username the seed used

create temp table _orders on commit drop as
select o.id
from public.custom_orders o
join public.profiles p on p.id = o.customer_id
where lower(p.username) = lower((select username from _cfg))
  and o.description like 'Sample order:%';

delete from public.notifications where reference_id in (select id from _orders);
delete from public.notifications where reference_id in (select id from public.payments where order_id in (select id from _orders));
-- Payments and refunds keep their order; clear them first so the orders can go.
delete from public.payments where order_id in (select id from _orders);
do $$
begin
  if to_regclass('public.custom_order_refunds') is not null then
    delete from public.custom_order_refunds where order_id in (select id from _orders);
  end if;
end;
$$;
delete from public.chat_messages where order_id in (select id from _orders);
delete from public.custom_orders where id in (select id from _orders);

commit;
