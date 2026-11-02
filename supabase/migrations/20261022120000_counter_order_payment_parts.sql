-- =============================================================================
-- Real designs (D4), follow-up: create_counter_order with split payments
-- =============================================================================
-- The first copy of 20261022000000_counter_design_orders.sql took the payment
-- as one part (p_payment). The final copy takes a list of parts (p_payments),
-- so a counter order can be paid in cash plus e-payments, like a POS sale.
-- Postgres won't rename a function's input in place, so a database that ran the
-- first copy refuses the final one ("cannot change name of input parameter").
-- This drops whichever version is there and creates the final one. Harmless on
-- a database that already has it. Safe to run more than once.
-- =============================================================================

drop function if exists public.create_counter_order(jsonb, jsonb, jsonb, jsonb, uuid);

create or replace function public.create_counter_order(
  p_items      jsonb,
  p_buyer      jsonb,
  p_details    jsonb,
  p_payments   jsonb,
  p_request_id uuid
)
returns public.custom_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_order   public.custom_orders;
  v_name    text := left(btrim(regexp_replace(coalesce(p_buyer ->> 'name', ''), '\s+', ' ', 'g')), 80);
  v_phone   text := left(btrim(coalesce(p_buyer ->> 'phone', '')), 20);
  v_team    text := nullif(left(btrim(coalesce(p_details ->> 'team', '')), 80), '');
  v_notes   text := nullif(left(btrim(coalesce(p_details ->> 'notes', '')), 2000), '');
  v_needed  date;
  v_part    jsonb;
  v_amount  numeric(12, 2);
  v_paying  numeric(12, 2) := 0;
  v_lines   integer;
  v_found   integer;
  v_pieces  integer;
  v_total   numeric(12, 2);
  v_designs text;
  v_payment public.payments;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff can take orders at the counter' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'This order is missing its key; reload the page and try again' using errcode = '22023';
  end if;

  -- Placed already (a retry after a lost reply): hand back that order.
  select * into v_order from public.custom_orders where counter_request_id = p_request_id;
  if found then
    return v_order;
  end if;

  if length(v_name) < 2 then
    raise exception 'Enter the buyer''s name' using errcode = '22023', detail = 'order:name';
  end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) not between 7 and 13 then
    raise exception 'Enter the buyer''s phone number' using errcode = '22023', detail = 'order:phone';
  end if;
  if nullif(p_details ->> 'needed_by', '') is not null then
    begin
      v_needed := (p_details ->> 'needed_by')::date;
    exception when others then
      raise exception 'That needed-by date isn''t a date' using errcode = '22023', detail = 'order:needed_by';
    end;
    if v_needed < (now() at time zone 'Asia/Manila')::date then
      raise exception 'The needed-by date has already passed' using errcode = '22023', detail = 'order:needed_by';
    end if;
  end if;

  -- The pieces: one line per design, style and size. Prices come from the catalog, never the request.
  create temp table _wanted (variant_id uuid primary key, quantity integer not null) on commit drop;
  begin
    insert into _wanted (variant_id, quantity)
    select (e ->> 'variant_id')::uuid, sum((e ->> 'quantity')::integer)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    group by 1;
  exception when others then
    raise exception 'The order''s pieces don''t look right; reload the page and try again' using errcode = '22023';
  end;
  select count(*), coalesce(sum(quantity), 0) into v_lines, v_pieces from _wanted;
  if v_lines = 0 then
    raise exception 'Add at least one piece' using errcode = '22023', detail = 'order:items';
  end if;
  if exists (select 1 from _wanted where quantity < 1 or quantity > 999) or v_pieces > 5000 then
    raise exception 'Each size takes 1 to 999 pieces' using errcode = '22023', detail = 'order:items';
  end if;

  select count(*), sum(w.quantity * v.price), string_agg(distinct p.name, ', ')
    into v_found, v_total, v_designs
  from _wanted w
  join public.product_variants v on v.id = w.variant_id and v.is_active
  join public.products p on p.id = v.product_id and p.is_active and p.made_to_order;
  if v_found <> v_lines then
    raise exception 'A design, style or size in this order isn''t offered anymore' using errcode = 'P0001', detail = 'order:unavailable';
  end if;

  -- What's paid now, in up to 10 parts with at most one in cash: at least half, at most everything.
  if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) not between 1 and 10
     or (select count(*) from jsonb_array_elements(p_payments) e where e ->> 'method' = 'cash') > 1
     or exists (select 1 from jsonb_array_elements(p_payments) e where coalesce(e ->> 'method', '') not in ('cash', 'e_payment')) then
    raise exception 'Take the payment in cash, by e-payment, or both' using errcode = '22023', detail = 'order:payment';
  end if;
  for v_part in select * from jsonb_array_elements(p_payments) loop
    begin
      v_amount := round((v_part ->> 'amount')::numeric, 2);
    exception when others then
      v_amount := null;
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Each payment needs its amount' using errcode = '22023', detail = 'order:payment';
    end if;
    v_paying := v_paying + v_amount;
  end loop;
  if v_paying < ceil(v_total / 2) then
    raise exception 'The down payment is at least ₱% (half of ₱%)', ceil(v_total / 2), v_total
      using errcode = 'P0001', detail = 'order:down_payment';
  end if;
  if v_paying > v_total then
    raise exception 'That''s more than the ₱% total', v_total using errcode = 'P0001', detail = 'order:over_total';
  end if;

  insert into public.custom_orders (
    customer_id, walk_in_name, walk_in_phone, team_name, needed_by, notes,
    description, total_price, status, created_via, counter_request_id
  )
  values (
    null, v_name, v_phone, v_team, v_needed, v_notes,
    left(v_designs, 500), v_total, 'pending', 'counter', p_request_id
  )
  returning * into v_order;

  insert into public.custom_order_items (order_id, garment, color, size, quantity, product_id, variant_id, unit_price)
  select v_order.id, p.name, v.color, v.size, w.quantity, p.id, v.id, v.price
  from _wanted w
  join public.product_variants v on v.id = w.variant_id
  join public.products p on p.id = v.product_id
  order by p.name, v.color, v.size;

  -- Priced and taken by the cashier, so it's accepted straight away (the history shows both steps).
  update public.custom_orders set status = 'accepted', accepted_by = v_uid where id = v_order.id;

  -- Each part follows the same rules as any payment the shop records: provider, reference,
  -- one transfer per reference. E-payments first, so cash makes up the rest.
  for v_part in
    select e from jsonb_array_elements(p_payments) e order by (e ->> 'method') = 'cash'
  loop
    v_payment := public.record_custom_order_payment(
      v_order.id,
      round((v_part ->> 'amount')::numeric, 2),
      (v_part ->> 'method')::public.payment_method,
      nullif(v_part ->> 'provider', ''),
      nullif(v_part ->> 'reference', ''),
      null,
      'Taken at the counter with the order'
    );
    if nullif(v_part ->> 'scan_id', '') is not null then
      update public.payments set receipt_scan_id = (v_part ->> 'scan_id')::uuid
      where id = v_payment.id
        and exists (select 1 from public.receipt_scans s where s.id = (v_part ->> 'scan_id')::uuid);
    end if;
  end loop;

  select * into v_order from public.custom_orders where id = v_order.id;
  return v_order;
end;
$$;

revoke execute on function public.create_counter_order(jsonb, jsonb, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.create_counter_order(jsonb, jsonb, jsonb, jsonb, uuid) to authenticated;
