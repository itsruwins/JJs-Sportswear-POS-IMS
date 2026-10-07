  -- =============================================================================
  -- J&J Sportswear: SAMPLE notifications for ONE customer account (demo data only)
  -- =============================================================================
  -- Gives a customer who already has the sample orders
  -- (supabase/seed/sample-customer-orders.sql) a few notifications like the ones the
  -- database sends on its own, so the customer's bell can be tried: an order ready for
  -- pickup, an order accepted, a payment verified, and a payment rejected. Each points at
  -- that customer's real sample order or payment, so tapping it opens the right page.
  -- Change the username on the line marked CHANGE ME, then run it in the Supabase SQL
  -- editor. Every sample notification's message ends with "(sample)". Remove them with
  -- supabase/seed/remove-sample-customer-notifications.sql (same username).
  -- =============================================================================

  with me as (
    select id from public.profiles where lower(username) = lower('c3.test') and role = 'customer'   -- CHANGE ME
  ),
  ready as (
    select o.id, o.order_number from public.custom_orders o, me
    where o.customer_id = me.id and o.status = 'ready' order by o.created_at desc limit 1
  ),
  accepted as (
    select o.id, o.order_number, o.total_price from public.custom_orders o, me
    where o.customer_id = me.id and o.status = 'accepted' order by o.created_at desc limit 1
  ),
  verified as (
    select p.id, p.amount, o.order_number from public.payments p join public.custom_orders o on o.id = p.order_id, me
    where o.customer_id = me.id and p.status = 'verified' order by p.created_at desc limit 1
  ),
  rejected as (
    select p.id, o.order_number, p.rejection_reason from public.payments p join public.custom_orders o on o.id = p.order_id, me
    where o.customer_id = me.id and p.status = 'rejected' order by p.created_at desc limit 1
  )
  insert into public.notifications (user_id, title, message, type, reference_id, created_at)
  select me.id, n.title, n.message, n.type, n.ref, now() - n.ago
  from me, (
    select 'Payment rejected' as title,
          format('Your payment for order %s was rejected: %s (sample)', order_number, coalesce(rejection_reason, 'the reference didn''t match')) as message,
          'payment' as type, id as ref, interval '3 days' as ago from rejected
    union all
    select 'Order accepted', format('Your order %s was accepted. Total: ₱%s. (sample)', order_number, total_price), 'order_status', id, interval '2 days' from accepted
    union all
    select 'Payment verified', format('Your payment of ₱%s for order %s was verified. (sample)', amount, order_number), 'payment', id, interval '1 day' from verified
    union all
    select 'Order ready for pickup', format('Your order %s is ready for pickup. (sample)', order_number), 'order_status', id, interval '2 hours' from ready
  ) n;
