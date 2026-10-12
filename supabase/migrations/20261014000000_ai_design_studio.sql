-- =============================================================================
-- AI design studio (customer Phase C5)
-- =============================================================================
-- Customers design jerseys with FLUX.2 (or sample-art previews until the shop's
-- FLUX key is added):
--   * ai_designs keeps the studio picks (details), the design it refined (parent_id),
--     and whether it's a preview made from sample art (is_preview);
--   * at most 3 designs per customer per day (Asia/Manila), enforced here so the
--     limit holds whatever calls the database. The app only saves a design after it
--     was generated, so failed generations never count.
-- Every statement is safe to run again.
-- =============================================================================

alter table public.ai_designs add column if not exists details jsonb;
alter table public.ai_designs add column if not exists parent_id uuid references public.ai_designs (id) on delete set null;
alter table public.ai_designs add column if not exists is_preview boolean not null default false;

comment on column public.ai_designs.details is 'The studio picks: garment, sport, colors, style, team, player name and number, extra notes, logo path.';
comment on column public.ai_designs.parent_id is 'The design this one refined, when it was a refinement.';
comment on column public.ai_designs.is_preview is 'True for sample-art previews made before the AI service was connected.';

create index if not exists ai_designs_parent_id_idx on public.ai_designs (parent_id);


-- -----------------------------------------------------------------------------
-- 3 designs per customer per day
-- -----------------------------------------------------------------------------

create or replace function private.ai_design_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  -- One customer's inserts queue here, so two at once can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtext('ai_designs:' || new.customer_id::text));
  if (select count(*) from public.ai_designs where customer_id = new.customer_id and attempt_date = v_today) >= 3 then
    raise exception 'You’ve used today’s 3 designs. You can make more tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_designs_daily_limit on public.ai_designs;
create trigger ai_designs_daily_limit
  before insert on public.ai_designs
  for each row execute function private.ai_design_daily_limit();
