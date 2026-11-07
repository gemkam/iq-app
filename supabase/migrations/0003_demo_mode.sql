-- Demo mode: no login. A company flagged is_demo is open to everyone.
-- Later: set is_demo = false and use logins + company_members.

alter table companies add column is_demo boolean not null default false;

create or replace function is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from companies where id = cid and is_demo)
      or exists (select 1 from company_members where company_id = cid and user_id = auth.uid());
$$;

-- Demo company can be edited without login
drop policy if exists companies_update on companies;
create policy companies_update on companies for update using (
  is_demo or exists (select 1 from company_members m where m.company_id = id and m.user_id = auth.uid() and m.role in ('owner','admin')));

grant execute on function is_member(uuid) to anon;
grant execute on function convert_quotation_to_invoice(uuid, numeric, invoice_kind, text, date) to anon;
grant execute on function issue_invoice(uuid) to anon;

insert into companies (name, cr_number, address, phone, email, is_demo, vat_registered, default_terms)
values ('Demo Contracting LLC', '1234567', 'Al Khuwair, Muscat, Oman', '+968 9000 0000', 'info@demo.om', true, true,
        E'1. Prices are in Omani Rial (OMR).\n2. Validity as stated above.\n3. Payment as per agreed milestones.');
