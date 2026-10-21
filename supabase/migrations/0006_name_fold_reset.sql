-- PlanDon Terral: Task 7 review fixes.

-- 1. Reserved name: fold compatibility forms and drop invisible characters first --------------
-- 0005 split on non-letters, so a character hidden inside a word ("Equipe D<zero-width space>on",
-- a soft hyphen, a fullwidth "D" (U+FF24), a combining accent) broke the word and slipped through.
-- Now: NFKD (fullwidth -> ASCII, accents -> base letter + combining mark), then delete combining marks,
-- format characters (zero-width, soft hyphen, word joiner, BOM, bidi controls, tags) and invisible fillers,
-- then the 0005 fold. The CHECK constraint on profiles keeps calling this function.
-- ponytail: look-alike letters from other scripts (Cyrillic or Greek "o") are not folded. Don approves
-- every account by name, which is the second check. A confusables table would close it.
create or replace function public.is_reserved_display_name(p_name text) returns boolean
language sql immutable set search_path = ''
as $$
  select ' ' || btrim(regexp_replace(
    lower(regexp_replace(normalize(coalesce(p_name, ''), NFKD),
      E'[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u0610-\u061a\u064b-\u065f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f'
      || E'\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164'
      || E'\ufe00-\ufe0f\ufeff\uffa0\ufff9-\ufffb\U000e0000-\U000e007f]',
      '', 'g')),
    '[^a-z0-9]+', ' ', 'g')) || ' ' ~ ' equipe ?don '
$$;

-- 2. Reset without per-row DELETE events ------------------------------------------------------
-- Realtime sends a DELETE event (with the primary key) to every subscriber, and RLS does not filter it.
-- A row-by-row reset would broadcast Don-only keys (open_item_internal "X-04", person "david", ...).
-- TRUNCATE emits no per-row events. Only the loader calls this (service role).
-- person is kept: truncating it would need CASCADE, which would also empty profiles (profiles.person_id).
-- The loader upserts people, so person rows are never deleted and accounts keep their person link.
-- No CASCADE on purpose: if a new table references one of these, the truncate fails instead of
-- silently emptying it.
-- App code never deletes rows of person, open_item_internal, to_schedule_plan or traceability
-- (src/ has only the generic useMutate delete, with no caller yet). Task, block and manual_risk deletes
-- (Don, with undo) carry opaque uuids only (accepted in Task 4).
create function public.reset_domain() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  truncate table
    public.comment_author, public.evidence_uploader, public.comment, public.evidence, public.manual_risk,
    public.dependency, public.traceability, public.goal, public.open_item_internal, public.open_item,
    public.to_schedule_plan, public.to_schedule, public.decision, public.ritual_occurrence, public.ritual,
    public.block, public.task, public.deliverable, public.history;
end
$$;
revoke execute on function public.reset_domain() from public, anon, authenticated;
grant execute on function public.reset_domain() to service_role;
