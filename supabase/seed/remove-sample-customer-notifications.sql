-- Removes the sample notifications added by supabase/seed/sample-customer-notifications.sql.
delete from public.notifications n
using public.profiles p
where p.id = n.user_id
  and lower(p.username) = lower('c3.test')   -- CHANGE ME (same username)
  and n.message like '%(sample)';
