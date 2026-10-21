-- PlanDon Terral: roles, row-level security, RPCs, storage, realtime.
-- Terral must never read Don-internal data, and never by calling the API directly (spec §4).

-- Role of the caller -----------------------------------------------------------

-- The role when the account is approved; null for pending, blocked or anonymous callers.
create function public.app_role() returns text
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.status = 'approved'
$$;

-- True when Terral may see things attached to this entity (comments, evidence, dependencies).
-- Security invoker on purpose: under Terral it only sees what Terral's RLS already lets it read.
create function public.terral_visible(p_kind text, p_ref text) returns boolean
language sql stable set search_path = ''
as $$
  select case p_kind
    when 'deliverable' then exists (select 1 from public.deliverable where code = p_ref)
    when 'decision' then exists (select 1 from public.decision where code = p_ref)
    when 'to_schedule' then exists (select 1 from public.to_schedule where id = p_ref)
    when 'goal' then exists (select 1 from public.goal where id::text = p_ref)
    when 'open_item' then exists (select 1 from public.open_item where code = p_ref and visible_to_terral)
    else false -- task, block, ritual, person, ...: Don-only
  end
$$;

-- Profiles: created pending at signup ------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Only the display name comes from signup metadata; role and status never do.
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)));
  return new;
end
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS ----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'person', 'task', 'block', 'to_schedule_plan', 'open_item_internal', 'traceability', 'manual_risk', 'history',
    'deliverable', 'ritual', 'ritual_occurrence', 'decision', 'to_schedule', 'open_item', 'goal', 'dependency',
    'comment', 'evidence', 'profiles'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Anonymous callers get nothing, not even an empty RLS answer.
    execute format('revoke all on public.%I from anon', t);
  end loop;

  -- Don: everything on the domain tables (comment and evidence below, history read-only below).
  foreach t in array array[
    'person', 'task', 'block', 'to_schedule_plan', 'open_item_internal', 'traceability', 'manual_risk',
    'deliverable', 'ritual', 'ritual_occurrence', 'decision', 'to_schedule', 'open_item', 'goal', 'dependency'
  ] loop
    execute format(
      'create policy don_all on public.%I for all to authenticated '
      'using ((select public.app_role()) = ''don'') with check ((select public.app_role()) = ''don'')', t);
  end loop;

  -- Terral: read-only, whole table. These tables carry no hours and no Don people.
  foreach t in array array['deliverable', 'ritual', 'ritual_occurrence', 'decision', 'to_schedule', 'goal'] loop
    execute format(
      'create policy terral_read on public.%I for select to authenticated using ((select public.app_role()) = ''terral'')', t);
  end loop;
end
$$;

-- Terral: only open items flagged visible (never X-items or Don-only P-items).
create policy terral_read on public.open_item for select to authenticated
using ((select public.app_role()) = 'terral' and visible_to_terral);

-- Terral: a dependency only when both ends are Terral-visible
-- (an open_item dependency of a hidden item would reveal it).
create policy terral_read on public.dependency for select to authenticated
using (
  (select public.app_role()) = 'terral'
  and public.terral_visible(from_kind, from_ref)
  and public.terral_visible('deliverable', to_code)
);

-- Comments -------------------------------------------------------------------------

create policy don_read on public.comment for select to authenticated
using ((select public.app_role()) = 'don');
create policy don_insert on public.comment for insert to authenticated
with check ((select public.app_role()) = 'don' and author_id = (select auth.uid()) and author_role = 'don');
create policy don_update on public.comment for update to authenticated
using ((select public.app_role()) = 'don') with check ((select public.app_role()) = 'don');
create policy don_delete on public.comment for delete to authenticated
using ((select public.app_role()) = 'don');

create policy terral_read on public.comment for select to authenticated
using ((select public.app_role()) = 'terral' and visible_to_terral and public.terral_visible(entity_kind, entity_ref));
create policy terral_insert on public.comment for insert to authenticated
with check (
  (select public.app_role()) = 'terral'
  and author_id = (select auth.uid()) and author_role = 'terral'
  and visible_to_terral and public.terral_visible(entity_kind, entity_ref)
);

-- Evidence -------------------------------------------------------------------------

create policy don_read on public.evidence for select to authenticated
using ((select public.app_role()) = 'don');
create policy don_insert on public.evidence for insert to authenticated
with check ((select public.app_role()) = 'don' and uploader_id = (select auth.uid()) and uploader_role = 'don');
create policy don_update on public.evidence for update to authenticated
using ((select public.app_role()) = 'don') with check ((select public.app_role()) = 'don');
create policy don_delete on public.evidence for delete to authenticated
using ((select public.app_role()) = 'don');

create policy terral_read on public.evidence for select to authenticated
using ((select public.app_role()) = 'terral' and visible_to_terral and public.terral_visible(entity_kind, entity_ref));
-- storage_path must sit in the caller's own folder: an evidence row pointing at a Don file
-- would otherwise unlock that file through the storage read policy.
create policy terral_insert on public.evidence for insert to authenticated
with check (
  (select public.app_role()) = 'terral'
  and uploader_id = (select auth.uid()) and uploader_role = 'terral'
  and starts_with(storage_path, (select auth.uid())::text || '/')
  and visible_to_terral and public.terral_visible(entity_kind, entity_ref)
);

-- History: Don reads; nobody writes through the API (only the trigger, see 0003) ------

create policy don_read on public.history for select to authenticated
using ((select public.app_role()) = 'don');
revoke insert, update, delete, truncate on public.history from authenticated;
revoke all on sequence public.history_id_seq from anon, authenticated;

-- Profiles ---------------------------------------------------------------------------
-- Rows come only from the signup trigger. Only an approved Don changes role, status, person_id;
-- a user's own must_change_password is cleared only through clear_must_change_password().

create policy own_or_don_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.app_role()) = 'don');
create policy don_update on public.profiles for update to authenticated
using ((select public.app_role()) = 'don') with check ((select public.app_role()) = 'don');
revoke insert, delete, truncate on public.profiles from authenticated;

-- RPCs --------------------------------------------------------------------------------

-- Board decision recorded in the meeting, by Don or Terral.
create function public.record_decision(p_code text, p_outcome text, p_decided_by text, p_decided_at date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(public.app_role(), '') not in ('don', 'terral') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.decision
  set status = 'decided', outcome = p_outcome, decided_by = p_decided_by, decided_at = p_decided_at
  where code = p_code;
  if not found then
    raise exception 'decision % not found', p_code using errcode = 'P0002';
  end if;
end
$$;

-- Terral (or Don) confirms an agreed date. It never marks a deliverable built or in use.
create function public.confirm_date(p_kind text, p_ref text, p_date date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(public.app_role(), '') not in ('don', 'terral') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'date required' using errcode = '22004';
  end if;
  if p_kind = 'deliverable' then
    update public.deliverable
    set in_use_start = p_date, in_use_end = p_date, in_use_confirmed = true
    where code = p_ref;
  elsif p_kind = 'to_schedule' then
    update public.to_schedule set confirmed_date = p_date where id = p_ref;
  else
    raise exception 'unknown kind %', p_kind using errcode = '22023';
  end if;
  if not found then
    raise exception '% % not found', p_kind, p_ref using errcode = 'P0002';
  end if;
end
$$;

-- After a temporary password: the user clears their own flag, nothing else.
create function public.clear_must_change_password()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.app_role() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.profiles set must_change_password = false where id = auth.uid();
end
$$;

revoke execute on function
  public.app_role(),
  public.terral_visible(text, text),
  public.record_decision(text, text, text, date),
  public.confirm_date(text, text, date),
  public.clear_must_change_password()
from public, anon;
grant execute on function
  public.app_role(),
  public.terral_visible(text, text),
  public.record_decision(text, text, text, date),
  public.confirm_date(text, text, date),
  public.clear_must_change_password()
to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Storage: evidence files ----------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence', 'evidence', false, 25 * 1024 * 1024,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Read: Don, or Terral when a Terral-visible evidence row points at the file
-- (the evidence subquery runs under Terral's RLS, so the target entity must be Terral-visible too).
create policy evidence_read on storage.objects for select to authenticated
using (
  bucket_id = 'evidence' and (
    (select public.app_role()) = 'don'
    or (
      (select public.app_role()) = 'terral'
      and exists (select 1 from public.evidence e where e.storage_path = objects.name and e.visible_to_terral)
    )
  )
);
-- Upload: Don anywhere; Terral only into "<own uid>/".
create policy evidence_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'evidence' and (
    (select public.app_role()) = 'don'
    or ((select public.app_role()) = 'terral' and (storage.foldername(name))[1] = (select auth.uid())::text)
  )
);
create policy evidence_update on storage.objects for update to authenticated
using (bucket_id = 'evidence' and (select public.app_role()) = 'don')
with check (bucket_id = 'evidence' and (select public.app_role()) = 'don');
create policy evidence_delete on storage.objects for delete to authenticated
using (bucket_id = 'evidence' and (select public.app_role()) = 'don');

-- Realtime (postgres_changes respects the select policies above) --------------------------

alter publication supabase_realtime add table
  public.block, public.deliverable, public.decision, public.open_item, public.comment, public.evidence,
  public.to_schedule, public.dependency, public.task, public.manual_risk, public.profiles;
