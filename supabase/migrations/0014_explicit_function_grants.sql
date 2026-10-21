-- Hosted projects have no default function privileges (the local stack does). Make them explicit and equal to local.
-- Nobody but authenticated and service_role may execute; trigger functions and Don-only RPCs stay off authenticated.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to service_role;
revoke execute on all functions in schema public from authenticated;
grant execute on function
  public.app_role(),
  public.clear_must_change_password(),
  public.confirm_date(text, text, date),
  public.evidence_file_in_use(text),
  public.is_reserved_display_name(text),
  public.record_decision(text, text, text, date),
  public.terral_visible(text, text)
to authenticated;
