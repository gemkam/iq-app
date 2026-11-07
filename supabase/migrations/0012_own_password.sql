-- log_activity() also accepts 'own_password_changed' (a user changed their own password)
create or replace function log_activity(p_company uuid, p_action text, p_details jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_member(p_company) then return; end if;
  if p_action not in ('login', 'logout', 'own_password_changed') then raise exception 'Unknown activity'; end if;
  insert into audit_log (company_id, table_name, record_id, action, new_data, changed_by)
  values (p_company, 'session', auth.uid(), p_action, p_details, auth.uid());
end $$;
