-- PlanDon Terral: length limits the app already keeps, held by the database too; new public functions no longer
-- executable by every signed-in user; a temporary-password reset is logged as the Don who asked.

-- 1. Length limits (the UI caps: Comments 2000, Evidence slices the file name to 200, Signup 80) ------------------
alter table public.comment add constraint comment_body_length check (char_length(body) <= 2000);
alter table public.evidence add constraint evidence_file_name_length check (char_length(file_name) <= 200);
alter table public.profiles add constraint profiles_display_name_length check (char_length(display_name) <= 80);

-- 2. Functions created from now on (by postgres, in public) are executable by postgres and service_role only.
-- 0004's "in schema public revoke ... from public" could not remove PUBLIC: that grant is a global default, which
-- a per-schema rule only adds to. Every function since then was safe only through its own revoke. The global rule
-- below (postgres role, all schemas: migrations create only in public) removes it; the per-schema rule removes
-- authenticated (anon went in 0004). Existing functions keep their own grants: app_role, terral_visible,
-- confirm_date, record_decision, clear_must_change_password, evidence_file_in_use and is_reserved_display_name
-- stay executable by authenticated. A new function that signed-in users call needs an explicit
-- "grant execute ... to authenticated".
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from authenticated;

-- 3. set-temp-password sets the flag through this function, so the history row names the Don who asked
-- (the service role has no auth.uid() of its own). Never takes or stores the password.
create function public.set_must_change_password(p_id uuid, p_value boolean, p_by uuid)
returns void
language plpgsql set search_path = ''
as $$
begin
  -- log_history records auth.uid(): for this transaction only, that is the Don who asked.
  perform set_config('request.jwt.claim.sub', p_by::text, true);
  update public.profiles set must_change_password = p_value where id = p_id;
  if not found then
    raise exception 'profile % not found', p_id using errcode = 'P0002';
  end if;
end
$$;
