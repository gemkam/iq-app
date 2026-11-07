-- Extra password to open the Admin section. Stored encrypted (bcrypt), checked in the database.
create table if not exists app_settings (key text primary key, value text not null);
alter table app_settings enable row level security; -- no policies: nobody reads it directly

-- The PIN itself was set directly in the database (not stored in this file)

create or replace function verify_admin_pin(p_pin text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from app_settings where key = 'admin_pin' and value = extensions.crypt(p_pin, value))
     and exists (select 1 from company_members where user_id = auth.uid() and is_active and role in ('owner', 'admin'));
$$;
revoke execute on function verify_admin_pin(text) from public, anon;
grant execute on function verify_admin_pin(text) to authenticated;
