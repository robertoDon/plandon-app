-- set_must_change_password overrides auth.uid(); it must only ever run as service_role.
-- 0011 relied on default privileges; make the revoke explicit.
revoke execute on function public.set_must_change_password(uuid, boolean, uuid) from public, anon, authenticated;
