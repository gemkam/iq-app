-- alter type member_role add value 'guest';  (applied separately, enum values need their own transaction)

-- Editors = owner, admin, staff. Guests can only read.
create or replace function is_editor(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members
                  where company_id = cid and user_id = auth.uid() and is_active and role <> 'guest');
$$;
grant execute on function is_editor(uuid) to authenticated;

-- Split "for all" policies into read (members) and write (editors)
do $$
declare t text;
begin
  foreach t in array array['clients', 'quotations', 'quotation_items', 'invoice_items', 'payments', 'attachments'] loop
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format('create policy %I on %I for select using (is_member(company_id))', t || '_read', t);
    execute format('create policy %I on %I for insert with check (is_editor(company_id))', t || '_insert', t);
    execute format('create policy %I on %I for update using (is_editor(company_id)) with check (is_editor(company_id))', t || '_update', t);
    execute format('create policy %I on %I for delete using (is_editor(company_id))', t || '_delete', t);
  end loop;
end $$;

drop policy if exists invoices_insert on invoices;
drop policy if exists invoices_update on invoices;
create policy invoices_insert on invoices for insert with check (is_editor(company_id));
create policy invoices_update on invoices for update using (is_editor(company_id) and status = 'draft') with check (is_editor(company_id));

drop policy if exists units_write on units;
create policy units_write on units for all using (company_id is not null and is_editor(company_id))
  with check (company_id is not null and is_editor(company_id));

drop policy if exists "attachments upload" on storage.objects;
drop policy if exists "attachments delete" on storage.objects;
create policy "attachments upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and is_editor(((storage.foldername(name))[1])::uuid));
create policy "attachments delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and is_editor(((storage.foldername(name))[1])::uuid));

-- Actions also require editor rights
create or replace function convert_quotation_to_invoice(
  p_quotation_id uuid, p_amount numeric default null,
  p_kind invoice_kind default 'standard', p_description text default null,
  p_due_date date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q quotations%rowtype;
  net_total numeric(14,3);
  invoiced_net numeric(14,3);
  amt numeric(14,3);
  iid uuid;
begin
  select * into q from quotations where id = p_quotation_id;
  if not found or not is_editor(q.company_id) then raise exception 'Quotation not found or no permission'; end if;
  if q.status = 'rejected' then raise exception 'Quotation is rejected'; end if;

  net_total := q.subtotal - q.discount_amount;
  select coalesce(sum(subtotal), 0) into invoiced_net from invoices
   where quotation_id = q.id and doc_type = 'invoice' and status <> 'cancelled';
  amt := coalesce(p_amount, net_total - invoiced_net);
  if amt <= 0 then raise exception 'Nothing left to invoice on this quotation'; end if;
  if invoiced_net + amt > net_total + 0.001 then
    raise exception 'Amount exceeds remaining balance of %', net_total - invoiced_net;
  end if;

  insert into invoices (company_id, quotation_id, client_id, kind, vat_rate, description, due_date, created_by)
  values (q.company_id, q.id, q.client_id,
          case when p_amount is null and invoiced_net = 0 then 'standard'::invoice_kind else p_kind end,
          q.vat_rate, p_description, p_due_date, auth.uid())
  returning id into iid;

  if p_amount is null and invoiced_net = 0 and q.discount_amount = 0 then
    insert into invoice_items (invoice_id, company_id, sort_order, description, quantity, unit, unit_rate)
    select iid, company_id, sort_order, description, quantity, unit, unit_rate
      from quotation_items where quotation_id = q.id;
  else
    insert into invoice_items (invoice_id, company_id, sort_order, description, quantity, unit, unit_rate)
    values (iid, q.company_id, 1,
      coalesce(p_description, initcap(p_kind::text) || ' against ' || q.code ||
               coalesce(' - ' || q.project_name, '')),
      1, 'ls', amt);
  end if;
  return iid;
end $$;

create or replace function issue_invoice(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices%rowtype; vatreg boolean;
begin
  select * into inv from invoices where id = p_invoice_id;
  if not found or not is_editor(inv.company_id) then raise exception 'Invoice not found or no permission'; end if;
  if inv.status <> 'draft' then raise exception 'Invoice already issued'; end if;
  select vat_registered into vatreg from companies where id = inv.company_id;
  update invoices set status = 'issued', issued_at = now(),
    einvoice_status = case when vatreg then 'pending'::einvoice_status else 'not_required'::einvoice_status end
  where id = p_invoice_id;
end $$;
