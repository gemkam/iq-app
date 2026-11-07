-- Multi-company: one person can own and switch between several companies.
-- Each company keeps its own clients, quotations (Q-1001...), invoices (1001...), users and settings.

create or replace function create_company(
  p_name text,
  p_cr_number text default null,
  p_vatin text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_vat_registered boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  me record;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Company name is required'; end if;
  -- Only owners/admins (of any company) can create companies; guests and normal users cannot
  if not exists (select 1 from company_members where user_id = auth.uid() and is_active and role in ('owner', 'admin')) then
    raise exception 'Only owners and admins can create companies';
  end if;
  select username, email, full_name into me from company_members where user_id = auth.uid() order by created_at limit 1;

  insert into companies (name, cr_number, vatin, phone, email, address, vat_registered, default_terms)
  values (trim(p_name), p_cr_number, p_vatin, p_phone, p_email, coalesce(p_address, 'Muscat, Oman'), p_vat_registered,
          E'1. Prices are in Omani Rial (OMR).\n2. Validity as stated above.\n3. Payment as per agreed milestones.')
  returning id into cid;

  insert into company_members (company_id, user_id, role, username, email, full_name)
  values (cid, auth.uid(), 'owner', me.username, me.email, me.full_name);

  -- Guest (if it exists) can view the new company too
  insert into company_members (company_id, user_id, role, username, email, full_name, is_active)
  select distinct on (user_id) cid, user_id, 'guest', username, email, full_name, is_active
    from company_members where role = 'guest'
  on conflict do nothing;

  return cid;
end $$;

-- old one-argument version is replaced by the version above
drop function if exists create_company(text);
revoke execute on function create_company(text, text, text, text, text, text, boolean) from public, anon;
grant execute on function create_company(text, text, text, text, text, text, boolean) to authenticated;

-- usernames are per person, not per company: allow the same username in several companies
drop index if exists company_members_username_key;
create index if not exists company_members_username_idx on company_members (lower(username));
