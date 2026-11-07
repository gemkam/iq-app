-- Share links (read-only, no login) and file attachments

alter table quotations add column share_token uuid not null default gen_random_uuid();
alter table invoices add column share_token uuid not null default gen_random_uuid();
create unique index quotations_share_token_key on quotations(share_token);
create unique index invoices_share_token_key on invoices(share_token);

-- Public read-only view of one document by its secret link
create or replace function get_shared_document(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q quotations%rowtype;
  i invoices%rowtype;
  co jsonb;
begin
  select * into q from quotations where share_token = p_token;
  if found then
    select to_jsonb(c) - 'next_quotation_no' - 'next_invoice_no' - 'whatsapp_number' into co from companies c where c.id = q.company_id;
    return jsonb_build_object(
      'type', 'quotation',
      'company', co,
      'doc', to_jsonb(q) - 'created_by' - 'share_token',
      'client', (select to_jsonb(cl) from clients cl where cl.id = q.client_id),
      'items', coalesce((select jsonb_agg(to_jsonb(it) order by it.sort_order) from quotation_items it where it.quotation_id = q.id), '[]'::jsonb)
    );
  end if;

  select * into i from invoices where share_token = p_token and status <> 'draft';
  if found then
    select to_jsonb(c) - 'next_quotation_no' - 'next_invoice_no' - 'whatsapp_number' into co from companies c where c.id = i.company_id;
    return jsonb_build_object(
      'type', 'invoice',
      'company', co,
      'doc', to_jsonb(i) - 'created_by' - 'share_token',
      'client', (select to_jsonb(cl) from clients cl where cl.id = i.client_id),
      'quotation', (select jsonb_build_object('code', qq.code, 'project_name', qq.project_name, 'project_code', qq.project_code,
                           'location', qq.location, 'attention_to', qq.attention_to, 'mobile', qq.mobile)
                    from quotations qq where qq.id = i.quotation_id),
      'items', coalesce((select jsonb_agg(to_jsonb(it) order by it.sort_order) from invoice_items it where it.invoice_id = i.id), '[]'::jsonb)
    );
  end if;
  return null;
end $$;
grant execute on function get_shared_document(uuid) to anon, authenticated;

-- Attachments
create table attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  quotation_id uuid references quotations(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (quotation_id is not null or invoice_id is not null)
);
create index on attachments(quotation_id);
create index on attachments(invoice_id);
alter table attachments enable row level security;
create policy attachments_all on attachments for all using (is_member(company_id)) with check (is_member(company_id));

-- Private bucket, 10 MB per file. Path: <company_id>/<record_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;

create policy "attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and is_member(((storage.foldername(name))[1])::uuid));
create policy "attachments upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and is_member(((storage.foldername(name))[1])::uuid));
create policy "attachments delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and is_member(((storage.foldername(name))[1])::uuid));
