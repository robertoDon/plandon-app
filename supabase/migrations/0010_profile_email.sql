-- PlanDon Terral: Acessos shows each account's sign-up e-mail and date, so Don never approves a name blind.
-- Both are copied from auth.users by the signup trigger. They sit under the profiles policies of 0002
-- (own row, or any row for an approved Don): Terral and pending users still read only their own row.

alter table public.profiles
  add column email text,
  add column created_at timestamptz not null default now();

-- Same signature and grants as 0002 (create or replace keeps the revoke). Role and status still never come from
-- signup metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, created_at)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.created_at, now())
  );
  return new;
end
$$;

-- Existing accounts. Not user history: the audit trigger stays off for the backfill.
alter table public.profiles disable trigger log_history;
update public.profiles p set email = u.email, created_at = coalesce(u.created_at, p.created_at)
from auth.users u where u.id = p.id;
alter table public.profiles enable trigger log_history;
