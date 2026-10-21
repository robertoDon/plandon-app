-- PlanDon Terral: nobody changes their own role or status (Task 11 review).
-- Any approved Don administers accounts (profiles don_update in 0002), which also let a Don block or demote
-- themselves, and with it possibly the last Don. Acessos hides those controls; this makes the rule hold for API
-- callers too. The service role (seed, loader, edge function) has no auth.uid() and passes; so do the user's own
-- person_id and must_change_password changes.
create function public.guard_own_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and old.id = auth.uid()
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'cannot change own role or status' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke execute on function public.guard_own_profile() from public, anon, authenticated;

create trigger guard_own_profile before update on public.profiles
for each row execute function public.guard_own_profile();
