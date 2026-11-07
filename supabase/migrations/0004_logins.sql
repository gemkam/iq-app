-- Logins: access only for active members of the company. No open access.

alter table company_members add column email text;
alter table company_members add column full_name text;
alter table company_members add column is_active boolean not null default true;

create or replace function is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = cid and user_id = auth.uid() and is_active);
$$;

create or replace function is_admin(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members
                  where company_id = cid and user_id = auth.uid() and is_active and role in ('owner', 'admin'));
$$;

drop policy if exists companies_update on companies;
create policy companies_update on companies for update using (is_admin(id)) with check (is_admin(id));

-- Remove open access
revoke execute on function is_member(uuid) from anon;
revoke execute on function convert_quotation_to_invoice(uuid, numeric, invoice_kind, text, date) from anon;
revoke execute on function issue_invoice(uuid) from anon;
grant execute on function is_member(uuid) to authenticated;
grant execute on function is_admin(uuid) to authenticated;

alter table companies drop column is_demo;

update companies set name = 'Your Company LLC', cr_number = null, phone = null, email = null, address = 'Muscat, Oman';
