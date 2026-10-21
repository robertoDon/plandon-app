-- PlanDon Terral: carry-over guards (Task 7).

-- 1. Nobody takes the name "Equipe Don" ---------------------------------------------------
-- Don authors appear to Terral as "Equipe Don" (0004). A user who picked that display name at signup
-- (or was renamed to it) would read as Don in comments and evidence.
-- Rule: after folding case and accents and splitting on anything that is not a letter or digit,
-- the words "equipe don" (or "equipedon") appear anywhere. "Equipe Donizete" stays allowed.
-- ponytail: Latin accents only; look-alike letters from other scripts (Cyrillic "о") are not folded. Don approves
-- every account by name, which is the second check.
create function public.is_reserved_display_name(p_name text) returns boolean
language sql immutable set search_path = ''
as $$
  select ' ' || btrim(regexp_replace(
    lower(translate(coalesce(p_name, ''),
      'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
      'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN')),
    '[^a-z0-9]+', ' ', 'g')) || ' ' ~ ' equipe ?don '
$$;
revoke execute on function public.is_reserved_display_name(text) from public, anon;

-- Covers signup (handle_new_user inserts the row, so the signup fails as a whole: no auth user is left behind),
-- the e-mail fallback name, and later renames, Don's included.
alter table public.profiles
  add constraint display_name_not_reserved check (not public.is_reserved_display_name(display_name));

-- 2. A divergência (X-item) is Don-only, always ---------------------------------------------
alter table public.open_item
  add constraint divergencia_never_terral check (kind <> 'divergencia' or not visible_to_terral);
