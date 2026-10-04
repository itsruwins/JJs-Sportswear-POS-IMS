-- =============================================================================
-- Live stock updates for the admin
-- =============================================================================
-- Streams changes to products, product variants (stock counts), and the stock
-- history to signed-in clients, so the admin's counts and history update the
-- moment stock moves. postgres_changes respects RLS: subscribers only receive
-- rows they're already allowed to read (staff read all of these).
-- Safe to run more than once.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['products', 'product_variants', 'inventory_transactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
