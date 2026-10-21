-- PlanDon Terral: domain tables. Column names equal the src/domain/types.ts fields.
-- Hours and Don people live only in Don-only tables (person, task, block, to_schedule_plan):
-- the shared tables carry no hours column at all (spec §12, split-table option).

-- Don-only ------------------------------------------------------------------

create table public.person (
  id text primary key,
  name text not null,
  net_capacity_h numeric,
  reserved_h numeric not null default 0,
  daily_cap_h numeric not null default 8,
  weekly_cap_h numeric not null default 40
);

-- Shared --------------------------------------------------------------------

create table public.deliverable (
  code text primary key,
  name text not null,
  front text not null,
  origin text not null check (origin in ('escopo2', 'instrumento')),
  built_date date,
  in_use_start date,
  in_use_end date,
  in_use_text text,
  in_use_confirmed boolean not null default false,
  built_at date,
  in_use_at date,
  target_ritual text,
  terral_owner text,
  published_flag text,
  sort int not null default 0
);

create table public.ritual (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cadence text not null,
  first_date date,
  last_date date,
  sort int not null default 0
);

create table public.decision (
  code text primary key,
  title text not null,
  date date,
  prepared_on date,
  status text not null default 'pending' check (status in ('pending', 'decided')),
  outcome text,
  decided_by text,
  decided_at date
);

create table public.to_schedule (
  id text primary key,
  code text not null references public.deliverable (code) on update cascade on delete cascade,
  what text not null,
  window_start date,
  window_end date,
  window_text text,
  confirmed_date date
);

create table public.open_item (
  code text primary key,
  kind text not null check (kind in ('pendencia', 'divergencia')),
  text text not null,
  owner_public text not null,
  due date,
  due_text text,
  effect text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  visible_to_terral boolean not null default false
);

create table public.goal (
  id uuid primary key default gen_random_uuid(),
  sort int not null default 0,
  level text not null,
  position text not null,
  metric text not null,
  baseline text,
  state text not null,
  target text
);

create table public.dependency (
  id uuid primary key default gen_random_uuid(),
  from_kind text not null check (from_kind in ('deliverable', 'decision', 'open_item', 'to_schedule')),
  from_ref text not null,
  to_code text not null references public.deliverable (code) on update cascade on delete cascade,
  suggested boolean not null default false,
  unique (from_kind, from_ref, to_code)
);

-- Don-only ------------------------------------------------------------------

create table public.task (
  id uuid primary key default gen_random_uuid(),
  sort int not null default 0,
  due date,
  kind text not null check (kind in ('task', 'with_terral')),
  front text not null,
  code text not null, -- a deliverable or decision code
  description text not null,
  person_id text references public.person (id) on update cascade on delete set null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done'))
);

create table public.block (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  week text not null,
  type text not null,
  front text not null,
  code text,
  description text not null,
  person_id text references public.person (id) on update cascade on delete set null,
  hours numeric not null default 0,
  due date,
  task_id uuid references public.task (id) on delete set null,
  done boolean not null default false,
  done_at timestamptz
);
create index block_date_idx on public.block (date);
create index block_person_idx on public.block (person_id);
create index block_task_idx on public.block (task_id);

create table public.to_schedule_plan (
  to_schedule_id text primary key references public.to_schedule (id) on update cascade on delete cascade,
  person_id text references public.person (id) on update cascade on delete set null,
  hours numeric not null default 0,
  distributed boolean not null default false
);

create table public.open_item_internal (
  code text primary key references public.open_item (code) on update cascade on delete cascade,
  owner_raw text not null
);

create table public.traceability (
  id uuid primary key default gen_random_uuid(),
  annex_tab text not null,
  field text not null,
  col text not null,
  n int not null default 0,
  deliverable_code text references public.deliverable (code) on update cascade on delete set null,
  task_description text not null,
  filled_by text not null
);

create table public.manual_risk (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  severity text not null check (severity in ('high', 'medium', 'low')),
  links text[] not null default '{}',
  person_id text references public.person (id) on update cascade on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  note text,
  created_by uuid default auth.uid()
);

-- Shared (ritual_occurrence points at its Don-only block) ---------------------

create table public.ritual_occurrence (
  id uuid primary key default gen_random_uuid(),
  ritual_id uuid not null references public.ritual (id) on delete cascade,
  date date not null,
  week text not null,
  block_id uuid not null references public.block (id) on delete cascade
);
create index ritual_occurrence_ritual_idx on public.ritual_occurrence (ritual_id);
create index ritual_occurrence_block_idx on public.ritual_occurrence (block_id);

-- Written in the app ---------------------------------------------------------

-- entity_kind: deliverable | decision | to_schedule | open_item | goal | task | block | ...
create table public.comment (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null,
  entity_ref text not null,
  author_id uuid not null default auth.uid(),
  author_role text not null check (author_role in ('don', 'terral')),
  body text not null check (length(body) > 0),
  visible_to_terral boolean not null default false, -- Don comments are internal unless marked
  created_at timestamptz not null default now()
);
create index comment_entity_idx on public.comment (entity_kind, entity_ref);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null,
  entity_ref text not null,
  storage_path text not null unique,
  file_name text not null,
  uploader_id uuid not null default auth.uid(),
  uploader_role text not null check (uploader_role in ('don', 'terral')),
  visible_to_terral boolean not null default false,
  created_at timestamptz not null default now()
);
create index evidence_entity_idx on public.evidence (entity_kind, entity_ref);

-- Accounts --------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text check (role in ('don', 'terral')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  person_id text references public.person (id) on update cascade on delete set null,
  must_change_password boolean not null default false
);

-- Audit -------------------------------------------------------------------------

create table public.history (
  id bigserial primary key,
  table_name text not null,
  row_ref text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old jsonb,
  new jsonb,
  user_id uuid,
  at timestamptz not null default now()
);
create index history_row_idx on public.history (table_name, row_ref);
create index history_at_idx on public.history (at desc);
