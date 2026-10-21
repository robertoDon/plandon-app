-- PlanDon Terral: reserved name, simpler and complete (Task 7 review, round 2).
-- 0006 listed invisible ranges by hand and missed some (U+1D173, U+1BCA0, U+0600, U+093C, U+0E31, U+1D167),
-- and the sign-up mirror did not match it on Hangul fillers. Rule now, on both sides (src/auth/reservedName.ts):
-- NFKD, lower-case, delete EVERY non-ASCII character, then the 0005 fold (non-alphanumerics -> space) and the
-- "equipe don" / "equipedon" word test. Accents decompose to a base letter plus a mark, and the mark goes;
-- fullwidth letters fold to ASCII; any invisible character inside a word simply disappears.
-- Same signature: the profiles CHECK constraint keeps using it.
-- ponytail: letters from other scripts are deleted, not mapped. A Cyrillic "o" in "D<o>n" leaves "Dn", which is
-- allowed. Don approves every account by name, which is the second check. A confusables table would close it.
create or replace function public.is_reserved_display_name(p_name text) returns boolean
language sql immutable set search_path = ''
as $$
  select ' ' || btrim(regexp_replace(
    regexp_replace(lower(normalize(coalesce(p_name, ''), NFKD)), '[^\x01-\x7f]', '', 'g'),
    '[^a-z0-9]+', ' ', 'g')) || ' ' ~ ' equipe ?don '
$$;
