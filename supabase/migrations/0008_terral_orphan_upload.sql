-- PlanDon Terral: Terral takes back its own orphan upload (Task 11).
-- The app uploads an evidence file first and writes the evidence row second. When the row write fails, the
-- uploader removes the file. Don can (evidence_delete in 0002); Terral could not, so a failed Terral attach left
-- a file nobody reads. Rule: Terral deletes a file only inside its own "<uid>/" folder, and only while no evidence
-- row points at it. The check runs as definer: a row Don hid from Terral still counts as in use.

-- True unless the path is in the caller's own folder and no evidence row uses it.
-- Answers only about the caller's own folder, so it reveals nothing about other people's files.
create function public.evidence_file_in_use(p_path text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not starts_with(p_path, auth.uid()::text || '/')
    or exists (select 1 from public.evidence e where e.storage_path = p_path)
$$;
revoke execute on function public.evidence_file_in_use(text) from public, anon;
grant execute on function public.evidence_file_in_use(text) to authenticated;

create policy evidence_terral_delete_orphan on storage.objects for delete to authenticated
using (
  bucket_id = 'evidence'
  and (select public.app_role()) = 'terral'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.evidence_file_in_use(name)
);
-- Storage deletes with RETURNING, so the row must also pass a select policy: the same own orphan file.
create policy evidence_terral_read_orphan on storage.objects for select to authenticated
using (
  bucket_id = 'evidence'
  and (select public.app_role()) = 'terral'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.evidence_file_in_use(name)
);
