-- =============================================================================
-- Remove the SAMPLE custom orders loaded by sample-custom-orders.sql
-- =============================================================================
-- Deletes every order placed by a sample customer (accounts marked "sample" in
-- their account metadata by the seed), with their items, steps, photos, payments,
-- history, chats, and notifications, then the sample customer accounts. Real customers and
-- orders are untouched. Photos uploaded to sample orders stay in the order-photos
-- bucket; remove those folders in Storage if any were added. Run in the Supabase SQL
-- editor.
-- =============================================================================

begin;

create temp table _sample_users on commit drop as
select id from auth.users where raw_app_meta_data ->> 'sample' = 'true';

create temp table _sample_orders on commit drop as
select id from public.custom_orders where customer_id in (select id from _sample_users);

delete from public.notifications where reference_id in (select id from _sample_orders);
delete from public.notifications where reference_id in (select id from public.payments where order_id in (select id from _sample_orders));
-- Payments and refunds keep their order; clear them first so the orders can go.
delete from public.payments where order_id in (select id from _sample_orders);
do $$
begin
  if to_regclass('public.custom_order_refunds') is not null then
    delete from public.custom_order_refunds where order_id in (select id from _sample_orders);
  end if;
end;
$$;
-- Chats with the sample customers (the owner's replies would otherwise stay behind with no recipient),
-- and the owners' alerts about them.
delete from public.chat_messages where sender_id in (select id from _sample_users) or receiver_id in (select id from _sample_users);
delete from public.notifications where type = 'chat' and reference_id in (select id from _sample_users);
delete from public.custom_orders where id in (select id from _sample_orders);
delete from auth.users where id in (select id from _sample_users);

commit;
