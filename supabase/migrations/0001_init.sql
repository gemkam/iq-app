-- IQ (Quotations & Invoices) - initial schema
-- Multi-company SaaS. Money in OMR with 3 decimals.

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type member_role as enum ('owner', 'admin', 'staff');
create type quotation_status as enum ('draft', 'submitted', 'approved', 'rejected', 'converted');
create type discount_type as enum ('none', 'amount', 'percent');
create type invoice_kind as enum ('standard', 'advance', 'milestone', 'final');
create type document_type as enum ('invoice', 'credit_note', 'debit_note');
create type invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'cancelled');
create type einvoice_status as enum ('not_required', 'pending', 'reported', 'rejected');

-- ---------- Companies (tenants) ----------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  cr_number text,
  vatin text,
  address text,
  phone text,
  email text,
  logo_url text,
  currency text not null default 'OMR',
  vat_rate numeric(5,2) not null default 5,
  vat_registered boolean not null default false,
  default_terms text,
  default_validity_days int not null default 30,
  next_quotation_no int not null default 1001,
  next_invoice_no int not null default 1001,
  whatsapp_number text unique,
  created_at timestamptz not null default now()
);

create table company_members (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index on company_members(user_id);

-- Helper used by RLS
create or replace function is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = cid and user_id = auth.uid());
$$;

-- ---------- Units ----------
create table units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade, -- null = global default
  code text not null,
  label text not null,
  is_lump_sum boolean not null default false,
  sort_order int not null default 0
);
insert into units (code, label, is_lump_sum, sort_order) values
  ('sqm', 'Square Meter', false, 1),
  ('cum', 'Cubic Meter', false, 2),
  ('rm', 'Running Meter', false, 3),
  ('nos', 'Numbers', false, 4),
  ('days', 'Days', false, 5),
  ('hrs', 'Hours', false, 6),
  ('kg', 'Kilogram', false, 7),
  ('ton', 'Ton', false, 8),
  ('ltr', 'Liter', false, 9),
  ('trip', 'Trip', false, 10),
  ('month', 'Month', false, 11),
  ('ls', 'Lump Sum', true, 12);

-- ---------- Clients ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  contact_person text,
  mobile text,
  email text,
  address text,
  cr_number text,
  vatin text,
  created_at timestamptz not null default now()
);
create index on clients(company_id);

-- ---------- Quotations ----------
create table quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  number int not null,
  code text generated always as ('Q-' || number::text) stored,
  project_name text,
  project_code text,
  location text,
  attention_to text,
  mobile text,
  quote_date date not null default current_date,
  validity_days int not null default 30,
  status quotation_status not null default 'draft',
  subtotal numeric(14,3) not null default 0,
  discount_type discount_type not null default 'none',
  discount_value numeric(14,3) not null default 0,
  discount_amount numeric(14,3) not null default 0,
  vat_rate numeric(5,2) not null default 5,
  vat_amount numeric(14,3) not null default 0,
  total numeric(14,3) not null default 0,
  notes text,
  terms text,
  source text not null default 'app', -- app | whatsapp
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, number)
);
create index on quotations(company_id, status);

create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  sort_order int not null default 1,
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit text not null default 'nos',
  unit_rate numeric(14,3) not null default 0,
  amount numeric(14,3) generated always as (round(quantity * unit_rate, 3)) stored
);
create index on quotation_items(quotation_id);

-- ---------- Invoices ----------
-- Numbering: first invoice of a job = 1001, next ones for same quotation = 1001-1, 1001-2 ...
create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  quotation_id uuid references quotations(id) on delete restrict,
  client_id uuid references clients(id) on delete set null,
  related_invoice_id uuid references invoices(id), -- for credit/debit notes
  base_no int not null default 0,
  seq int not null default 0,
  code text generated always as (
    case when seq = 0 then base_no::text else base_no::text || '-' || seq::text end
  ) stored,
  kind invoice_kind not null default 'standard',
  doc_type document_type not null default 'invoice',
  issue_date date not null default current_date,
  due_date date,
  description text,
  subtotal numeric(14,3) not null default 0,
  vat_rate numeric(5,2) not null default 5,
  vat_amount numeric(14,3) not null default 0,
  total numeric(14,3) not null default 0,
  amount_paid numeric(14,3) not null default 0,
  balance numeric(14,3) generated always as (total - amount_paid) stored,
  status invoice_status not null default 'draft',
  einvoice_status einvoice_status not null default 'not_required',
  einvoice_ref text,
  issued_at timestamptz,
  source text not null default 'app',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, base_no, seq)
);
create index on invoices(company_id, status);
create index on invoices(quotation_id);
create index on invoices(client_id);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  sort_order int not null default 1,
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit text not null default 'ls',
  unit_rate numeric(14,3) not null default 0,
  amount numeric(14,3) generated always as (round(quantity * unit_rate, 3)) stored
);
create index on invoice_items(invoice_id);

-- ---------- Payments ----------
create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric(14,3) not null check (amount > 0),
  paid_on date not null default current_date,
  method text, -- cash | bank | cheque
  reference text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on payments(invoice_id);

-- ---------- Audit history ----------
create table audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  table_name text not null,
  record_id uuid not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index on audit_log(company_id, table_name, record_id);

-- =====================================================
-- Functions and triggers
-- =====================================================

-- Lump sum items: quantity locked to 1
create or replace function enforce_lump_sum() returns trigger language plpgsql as $$
begin
  if new.unit = 'ls' then new.quantity := 1; end if;
  return new;
end $$;
create trigger qi_lump_sum before insert or update on quotation_items for each row execute function enforce_lump_sum();
create trigger ii_lump_sum before insert or update on invoice_items for each row execute function enforce_lump_sum();

-- Quotation number from company counter
create or replace function assign_quotation_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.number is null or new.number = 0 then
    update companies set next_quotation_no = next_quotation_no + 1
      where id = new.company_id returning next_quotation_no - 1 into new.number;
  end if;
  return new;
end $$;
create trigger q_number before insert on quotations for each row execute function assign_quotation_number();

-- Recalculate quotation totals: subtotal -> discount -> VAT -> total
create or replace function recalc_quotation(qid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  q quotations%rowtype;
  sub numeric(14,3);
  disc numeric(14,3);
  vat numeric(14,3);
begin
  select * into q from quotations where id = qid;
  if not found then return; end if;
  select coalesce(sum(amount), 0) into sub from quotation_items where quotation_id = qid;
  disc := case q.discount_type
            when 'amount' then least(q.discount_value, sub)
            when 'percent' then round(sub * least(q.discount_value, 100) / 100, 3)
            else 0 end;
  vat := round((sub - disc) * q.vat_rate / 100, 3);
  update quotations set subtotal = sub, discount_amount = disc, vat_amount = vat,
         total = sub - disc + vat, updated_at = now()
   where id = qid;
end $$;

create or replace function trg_qi_recalc() returns trigger language plpgsql as $$
begin
  perform recalc_quotation(coalesce(new.quotation_id, old.quotation_id));
  return null;
end $$;
create trigger qi_recalc after insert or update or delete on quotation_items
  for each row execute function trg_qi_recalc();

create or replace function trg_q_recalc() returns trigger language plpgsql as $$
begin
  if new.discount_type is distinct from old.discount_type
     or new.discount_value is distinct from old.discount_value
     or new.vat_rate is distinct from old.vat_rate then
    perform recalc_quotation(new.id);
  end if;
  return null;
end $$;
create trigger q_recalc after update on quotations for each row execute function trg_q_recalc();

-- Invoice numbering: new job -> new base number; same quotation -> next suffix
create or replace function assign_invoice_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  existing_base int;
begin
  if new.base_no is not null and new.base_no > 0 then return new; end if;
  if new.quotation_id is not null then
    select base_no into existing_base from invoices
     where quotation_id = new.quotation_id and company_id = new.company_id
     order by seq limit 1;
  end if;
  if existing_base is not null then
    new.base_no := existing_base;
    select coalesce(max(seq), -1) + 1 into new.seq from invoices
     where company_id = new.company_id and base_no = existing_base;
  else
    update companies set next_invoice_no = next_invoice_no + 1
      where id = new.company_id returning next_invoice_no - 1 into new.base_no;
    new.seq := 0;
  end if;
  return new;
end $$;
create trigger inv_number before insert on invoices for each row execute function assign_invoice_number();

-- Recalculate invoice totals
create or replace function recalc_invoice(iid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  sub numeric(14,3);
  rate numeric(5,2);
begin
  select vat_rate into rate from invoices where id = iid;
  if not found then return; end if;
  select coalesce(sum(amount), 0) into sub from invoice_items where invoice_id = iid;
  update invoices set subtotal = sub, vat_amount = round(sub * rate / 100, 3),
         total = sub + round(sub * rate / 100, 3), updated_at = now()
   where id = iid;
end $$;

create or replace function trg_ii_recalc() returns trigger language plpgsql as $$
begin
  perform recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end $$;
create trigger ii_recalc after insert or update or delete on invoice_items
  for each row execute function trg_ii_recalc();

-- Block editing items of an issued invoice (corrections = credit/debit note)
create or replace function lock_issued_invoice_items() returns trigger language plpgsql as $$
declare st invoice_status;
begin
  select status into st from invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if st is not null and st <> 'draft' then
    raise exception 'Invoice is issued and cannot be edited. Create a credit or debit note instead.';
  end if;
  return coalesce(new, old);
end $$;
create trigger ii_lock before insert or update or delete on invoice_items
  for each row execute function lock_issued_invoice_items();

-- Milestone check: invoices for one quotation cannot exceed quotation total
create or replace function check_invoice_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  qtotal numeric(14,3);
  invoiced numeric(14,3);
begin
  if new.quotation_id is null or new.doc_type <> 'invoice' or new.status = 'cancelled' then
    return new;
  end if;
  select total into qtotal from quotations where id = new.quotation_id;
  select coalesce(sum(case when doc_type = 'credit_note' then -total else total end), 0)
    into invoiced from invoices
   where quotation_id = new.quotation_id and id <> new.id and status <> 'cancelled';
  if invoiced + new.total > qtotal + 0.001 then
    raise exception 'Invoices for % would exceed the quotation total (% of % already invoiced)',
      new.quotation_id, invoiced, qtotal;
  end if;
  return new;
end $$;
create trigger inv_cap before update of total, status on invoices
  for each row execute function check_invoice_cap();

-- Payments update amount_paid and status
create or replace function apply_payments() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  iid uuid := coalesce(new.invoice_id, old.invoice_id);
  paid numeric(14,3);
  tot numeric(14,3);
begin
  select coalesce(sum(amount), 0) into paid from payments where invoice_id = iid;
  select total into tot from invoices where id = iid;
  update invoices set amount_paid = paid,
    status = case
      when status in ('draft', 'cancelled') then status
      when paid >= tot then 'paid'::invoice_status
      when paid > 0 then 'partially_paid'::invoice_status
      else 'issued'::invoice_status end,
    updated_at = now()
  where id = iid;
  return null;
end $$;
create trigger pay_apply after insert or update or delete on payments
  for each row execute function apply_payments();

-- Mark quotation converted once it gets an invoice
create or replace function mark_quotation_converted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.quotation_id is not null then
    update quotations set status = 'converted', updated_at = now()
     where id = new.quotation_id and status <> 'converted';
  end if;
  return new;
end $$;
create trigger inv_mark_converted after insert on invoices
  for each row execute function mark_quotation_converted();

-- Audit history for quotations, items, invoices, payments
create or replace function write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (company_id, table_name, record_id, action, old_data, new_data, changed_by)
  values (
    coalesce(new.company_id, old.company_id),
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    auth.uid()
  );
  return null;
end $$;
create trigger audit_quotations after insert or update or delete on quotations for each row execute function write_audit();
create trigger audit_quotation_items after insert or update or delete on quotation_items for each row execute function write_audit();
create trigger audit_invoices after insert or update or delete on invoices for each row execute function write_audit();
create trigger audit_invoice_items after insert or update or delete on invoice_items for each row execute function write_audit();
create trigger audit_payments after insert or update or delete on payments for each row execute function write_audit();

-- Create company + make caller the owner (used at signup)
create or replace function create_company(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into companies (name) values (p_name) returning id into cid;
  insert into company_members (company_id, user_id, role) values (cid, auth.uid(), 'owner');
  return cid;
end $$;

-- Convert quotation to invoice. p_amount null = full remaining amount (net of VAT).
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
  if not found or not is_member(q.company_id) then raise exception 'Quotation not found'; end if;
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
    -- Full invoice with no discount: copy all lines
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

-- Issue invoice (locks it)
create or replace function issue_invoice(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices%rowtype; vatreg boolean;
begin
  select * into inv from invoices where id = p_invoice_id;
  if not found or not is_member(inv.company_id) then raise exception 'Invoice not found'; end if;
  if inv.status <> 'draft' then raise exception 'Invoice already issued'; end if;
  select vat_registered into vatreg from companies where id = inv.company_id;
  update invoices set status = 'issued', issued_at = now(),
    einvoice_status = case when vatreg then 'pending'::einvoice_status else 'not_required'::einvoice_status end
  where id = p_invoice_id;
end $$;

-- =====================================================
-- Reports
-- =====================================================
create or replace view report_receivables with (security_invoker = true) as
select i.company_id, i.client_id, c.name as client_name,
       count(*) filter (where i.balance > 0) as open_invoices,
       sum(i.total) as invoiced,
       sum(i.amount_paid) as received,
       sum(i.balance) as balance
  from invoices i left join clients c on c.id = i.client_id
 where i.status in ('issued', 'partially_paid', 'paid') and i.doc_type = 'invoice'
 group by i.company_id, i.client_id, c.name;

create or replace view report_summary with (security_invoker = true) as
select co.id as company_id,
  (select count(*) from quotations q where q.company_id = co.id and q.status <> 'draft') as quotations_submitted,
  (select coalesce(sum(total), 0) from quotations q where q.company_id = co.id and q.status <> 'draft') as quotations_value,
  (select count(*) from quotations q where q.company_id = co.id and q.status in ('approved', 'converted')) as quotations_approved,
  (select coalesce(sum(total), 0) from quotations q where q.company_id = co.id and q.status in ('approved', 'converted')) as approved_value,
  (select count(*) from invoices i where i.company_id = co.id and i.status <> 'draft' and i.status <> 'cancelled' and i.doc_type = 'invoice') as invoices_issued,
  (select coalesce(sum(total), 0) from invoices i where i.company_id = co.id and i.status <> 'draft' and i.status <> 'cancelled' and i.doc_type = 'invoice') as invoiced_value,
  (select coalesce(sum(balance), 0) from invoices i where i.company_id = co.id and i.status in ('issued', 'partially_paid') and i.doc_type = 'invoice') as receivable
from companies co;

-- =====================================================
-- Row Level Security
-- =====================================================
alter table companies enable row level security;
alter table company_members enable row level security;
alter table units enable row level security;
alter table clients enable row level security;
alter table quotations enable row level security;
alter table quotation_items enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;
alter table audit_log enable row level security;

create policy companies_select on companies for select using (is_member(id));
create policy companies_update on companies for update using (
  exists (select 1 from company_members m where m.company_id = id and m.user_id = auth.uid() and m.role in ('owner','admin')));

create policy members_select on company_members for select using (is_member(company_id));

create policy units_select on units for select using (company_id is null or is_member(company_id));
create policy units_write on units for all using (company_id is not null and is_member(company_id))
  with check (company_id is not null and is_member(company_id));

create policy clients_all on clients for all using (is_member(company_id)) with check (is_member(company_id));
create policy quotations_all on quotations for all using (is_member(company_id)) with check (is_member(company_id));
create policy quotation_items_all on quotation_items for all using (is_member(company_id)) with check (is_member(company_id));
create policy invoices_select on invoices for select using (is_member(company_id));
create policy invoices_insert on invoices for insert with check (is_member(company_id));
create policy invoices_update on invoices for update using (is_member(company_id) and status = 'draft')
  with check (is_member(company_id));
create policy invoice_items_all on invoice_items for all using (is_member(company_id)) with check (is_member(company_id));
create policy payments_all on payments for all using (is_member(company_id)) with check (is_member(company_id));
create policy audit_select on audit_log for select using (is_member(company_id));
