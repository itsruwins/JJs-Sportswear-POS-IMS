-- =============================================================================
-- Safer role changes for the Staff screen
-- =============================================================================
-- 1. Role changes run one at a time (a transaction-level lock), so two owners
--    removing each other at the same moment can't both pass the "at least one
--    owner" check and leave the shop with none.
-- 2. An optional p_expected role: when given, the change only happens if the
--    account still has that role under the row lock, so a change someone else
--    made a moment earlier isn't silently overwritten.
-- The app falls back to the two-argument call until this has been run.
-- Safe to run more than once.
-- =============================================================================

drop function if exists public.set_user_role(uuid, public.user_role);

create or replace function public.set_user_role(
  p_user_id  uuid,
  p_role     public.user_role,
  p_expected public.user_role default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_owner() then
    raise exception 'Only owners can change user roles' using errcode = '42501';
  end if;

  -- One role change at a time, released when the transaction ends.
  perform pg_advisory_xact_lock(hashtext('public.set_user_role'));

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if p_expected is not null and v_profile.role <> p_expected then
    raise exception 'Role changed since it was read' using errcode = '40001';
  end if;

  if v_profile.role = 'owner' and p_role <> 'owner'
     and (select count(*) from public.profiles where role = 'owner') <= 1 then
    raise exception 'There must be at least one owner' using errcode = 'P0001';
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke execute on function public.set_user_role(uuid, public.user_role, public.user_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role, public.user_role) to authenticated;
