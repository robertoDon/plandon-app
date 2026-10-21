-- PlanDon Terral: security review fixes (Task 4, round 1).

-- 1. record_decision: complete decisions only; Terral cannot re-decide ------------------

create or replace function public.record_decision(p_code text, p_outcome text, p_decided_by text, p_decided_at date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := public.app_role();
  v_status text;
begin
  if coalesce(v_role, '') not in ('don', 'terral') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(p_outcome), '') is null or nullif(btrim(p_decided_by), '') is null or p_decided_at is null then
    raise exception 'outcome, decided_by and decided_at are required' using errcode = '22023';
  end if;
  select status into v_status from public.decision where code = p_code for update;
  if not found then
    raise exception 'decision % not found', p_code using errcode = 'P0002';
  end if;
  if v_status = 'decided' and v_role <> 'don' then
    raise exception 'decision % is already decided', p_code using errcode = '42501';
  end if;
  update public.decision
  set status = 'decided', outcome = btrim(p_outcome), decided_by = btrim(p_decided_by), decided_at = p_decided_at
  where code = p_code;
end
$$;

-- 2. Comment and evidence authors -------------------------------------------------------
-- Terral reads author_name / uploader_name (the Terral author's display name, or "Equipe Don").
-- The author's user id moves to Don-only side tables, written only by a trigger.

drop policy don_insert on public.comment;
drop policy terral_insert on public.comment;
drop policy don_insert on public.evidence;
drop policy terral_insert on public.evidence;

create table public.comment_author (
  comment_id uuid primary key references public.comment (id) on delete cascade,
  author_id uuid not null
);
create table public.evidence_uploader (
  evidence_id uuid primary key references public.evidence (id) on delete cascade,
  uploader_id uuid not null
);
insert into public.comment_author select id, author_id from public.comment;
insert into public.evidence_uploader select id, uploader_id from public.evidence;

alter table public.comment add column author_name text;
update public.comment c
set author_name = case when c.author_role = 'don' then 'Equipe Don'
  else coalesce((select p.display_name from public.profiles p where p.id = c.author_id), 'Terral') end;
alter table public.comment drop column author_id, alter column author_name set not null;

alter table public.evidence add column uploader_name text;
update public.evidence e
set uploader_name = case when e.uploader_role = 'don' then 'Equipe Don'
  else coalesce((select p.display_name from public.profiles p where p.id = e.uploader_id), 'Terral') end;
alter table public.evidence drop column uploader_id, alter column uploader_name set not null;

-- Display name shown for an author: Don people are always "Equipe Don" (spec §7).
create function public.author_display_name(p_role text, p_given text) returns text
language sql stable security definer set search_path = ''
as $$
  select case when p_role = 'don' then 'Equipe Don'
    else coalesce((select p.display_name from public.profiles p where p.id = auth.uid()), p_given, 'Terral') end
$$;

-- API callers cannot choose id, created_at or the author name, nor change them later.
-- The service role (loader, tests) may set id and created_at.
create function public.stamp_comment() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
    new.author_role := old.author_role;
    new.author_name := old.author_name;
    return new;
  end if;
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    new.id := gen_random_uuid();
    new.created_at := now();
  end if;
  new.author_name := public.author_display_name(new.author_role, new.author_name);
  return new;
end
$$;

create function public.stamp_evidence() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
    new.uploader_role := old.uploader_role;
    new.uploader_name := old.uploader_name;
    return new;
  end if;
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    new.id := gen_random_uuid();
    new.created_at := now();
  end if;
  new.uploader_name := public.author_display_name(new.uploader_role, new.uploader_name);
  return new;
end
$$;

-- Records the signed-in caller as author. Trigger argument: the side table.
create function public.record_author() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    execute format('insert into public.%I values ($1, $2)', tg_argv[0]) using new.id, auth.uid();
  end if;
  return null;
end
$$;

create trigger stamp before insert or update on public.comment for each row execute function public.stamp_comment();
create trigger stamp before insert or update on public.evidence for each row execute function public.stamp_evidence();
create trigger record_author after insert on public.comment for each row execute function public.record_author('comment_author');
create trigger record_author after insert on public.evidence for each row execute function public.record_author('evidence_uploader');

create policy don_insert on public.comment for insert to authenticated
with check ((select public.app_role()) = 'don' and author_role = 'don');
create policy terral_insert on public.comment for insert to authenticated
with check (
  (select public.app_role()) = 'terral' and author_role = 'terral'
  and visible_to_terral and public.terral_visible(entity_kind, entity_ref)
);
create policy don_insert on public.evidence for insert to authenticated
with check ((select public.app_role()) = 'don' and uploader_role = 'don');
-- storage_path must sit in the caller's own folder (see 0002).
create policy terral_insert on public.evidence for insert to authenticated
with check (
  (select public.app_role()) = 'terral' and uploader_role = 'terral'
  and starts_with(storage_path, (select auth.uid())::text || '/')
  and visible_to_terral and public.terral_visible(entity_kind, entity_ref)
);

alter table public.comment_author enable row level security;
alter table public.evidence_uploader enable row level security;
create policy don_read on public.comment_author for select to authenticated using ((select public.app_role()) = 'don');
create policy don_read on public.evidence_uploader for select to authenticated using ((select public.app_role()) = 'don');
revoke all on public.comment_author, public.evidence_uploader from anon;
revoke insert, update, delete on public.comment_author, public.evidence_uploader from authenticated;

revoke execute on function public.author_display_name(text, text), public.stamp_comment(), public.stamp_evidence(), public.record_author()
from public, anon, authenticated;

-- 3. Open items are never deleted through the API -------------------------------------
-- Realtime sends DELETE events without RLS filtering, so a deleted hidden item would leak its code.
-- Don resolves (status) or hides (visible_to_terral) instead.

drop policy don_all on public.open_item;
create policy don_read on public.open_item for select to authenticated using ((select public.app_role()) = 'don');
create policy don_insert on public.open_item for insert to authenticated with check ((select public.app_role()) = 'don');
create policy don_update on public.open_item for update to authenticated
using ((select public.app_role()) = 'don') with check ((select public.app_role()) = 'don');

-- 4. Ritual occurrences no longer point at their (Don-only, person-keyed) block ----------

alter table public.ritual_occurrence drop column block_id;

-- 5. Table privileges -----------------------------------------------------------------

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

-- 6. Profile changes are audited (profiles holds no password material) -------------------

create trigger log_history after insert or update or delete on public.profiles
for each row execute function public.log_history('id');

-- 7. Foreign-key indexes ----------------------------------------------------------------

create index dependency_to_code_idx on public.dependency (to_code);
create index to_schedule_code_idx on public.to_schedule (code);
create index task_person_idx on public.task (person_id);
create index manual_risk_person_idx on public.manual_risk (person_id);
create index traceability_deliverable_idx on public.traceability (deliverable_code);
create index profiles_person_idx on public.profiles (person_id);
create index to_schedule_plan_person_idx on public.to_schedule_plan (person_id);

-- 8. Realtime for the rest of Don's screens (RLS still applies) ---------------------------

alter publication supabase_realtime add table
  public.to_schedule_plan, public.person, public.goal, public.ritual, public.ritual_occurrence,
  public.comment_author, public.evidence_uploader;
