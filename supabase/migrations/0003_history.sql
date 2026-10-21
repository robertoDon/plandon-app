-- PlanDon Terral: every insert, update and delete on a domain table writes a history row (spec §10).
-- Security definer: the write happens even though no API role may insert into history,
-- and it logs auth.uid() of the caller (also inside the security-definer RPCs).

create function public.log_history() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return null; -- a save without changes is not history
  end if;
  insert into public.history (table_name, row_ref, action, old, new, user_id)
  values (
    tg_table_name,
    coalesce(to_jsonb(new), to_jsonb(old)) ->> tg_argv[0], -- trigger argument: the primary key column
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    auth.uid()
  );
  return null;
end
$$;

revoke execute on function public.log_history() from public, anon, authenticated;

create trigger log_history after insert or update or delete on public.person for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.deliverable for each row execute function public.log_history('code');
create trigger log_history after insert or update or delete on public.task for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.block for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.ritual for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.ritual_occurrence for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.decision for each row execute function public.log_history('code');
create trigger log_history after insert or update or delete on public.to_schedule for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.to_schedule_plan for each row execute function public.log_history('to_schedule_id');
create trigger log_history after insert or update or delete on public.open_item for each row execute function public.log_history('code');
create trigger log_history after insert or update or delete on public.open_item_internal for each row execute function public.log_history('code');
create trigger log_history after insert or update or delete on public.goal for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.traceability for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.dependency for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.manual_risk for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.comment for each row execute function public.log_history('id');
create trigger log_history after insert or update or delete on public.evidence for each row execute function public.log_history('id');
