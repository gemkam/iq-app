-- Sample data for testing. Run once on an empty company (numbers start at Q-1001 / 1001).
do $$
declare
  cid uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid;
  q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid;
  i1 uuid; i2 uuid; i3 uuid;
begin
  select id into cid from companies order by created_at limit 1;

  -- Clients
  insert into clients (company_id, name, contact_person, mobile) values (cid, 'Al Noor Trading LLC', 'Mr. Salim Al Harthy', '+968 9123 4567') returning id into c1;
  insert into clients (company_id, name, contact_person, mobile) values (cid, 'Muscat Hills Construction', 'Eng. Rashid Al Balushi', '+968 9234 5678') returning id into c2;
  insert into clients (company_id, name, contact_person, mobile) values (cid, 'Gulf Star Logistics', 'Mr. Imran Sheikh', '+968 9345 6789') returning id into c3;
  insert into clients (company_id, name, contact_person, mobile) values (cid, 'Oman Fresh Foods SAOC', 'Ms. Maryam Al Lawati', '+968 9456 7890') returning id into c4;
  insert into clients (company_id, name, contact_person, mobile) values (cid, 'Seeb Auto Services', 'Mr. Faisal Al Amri', '+968 9567 8901') returning id into c5;

  -- Q-1001: negotiated from 1,000 to 800 (discount 200), then advance + milestone invoices
  insert into quotations (company_id, client_id, project_name, project_code, location, attention_to, mobile, quote_date, status, vat_rate, discount_type, discount_value, notes)
  values (cid, c1, 'Villa Painting', 'ANT-VP-01', 'Al Khoud, Muscat', 'Mr. Salim Al Harthy', '+968 9123 4567', current_date - 25, 'approved', 5, 'amount', 200,
          'Client agreed 800 OMR after negotiation (quoted 1,000).')
  returning id into q1;
  insert into quotation_items (quotation_id, company_id, sort_order, description, quantity, unit, unit_rate) values
    (q1, cid, 1, 'Interior wall painting, 2 coats emulsion', 30, 'sqm', 20),
    (q1, cid, 2, 'Painter labour', 4, 'days', 50),
    (q1, cid, 3, 'Material transport and site cleaning', 1, 'ls', 200);

  -- Q-1002: office fit-out, 5% discount, approved, not invoiced yet
  insert into quotations (company_id, client_id, project_name, project_code, location, attention_to, mobile, quote_date, status, vat_rate, discount_type, discount_value)
  values (cid, c2, 'Office Fit-Out Ground Floor', 'MHC-FO-12', 'Ghala Industrial, Muscat', 'Eng. Rashid Al Balushi', '+968 9234 5678', current_date - 12, 'approved', 5, 'percent', 5)
  returning id into q2;
  insert into quotation_items (quotation_id, company_id, sort_order, description, quantity, unit, unit_rate) values
    (q2, cid, 1, 'Gypsum board partition with frame', 85, 'sqm', 14.5),
    (q2, cid, 2, 'False ceiling 60x60 tiles', 120, 'sqm', 9.75),
    (q2, cid, 3, 'Concrete for equipment base', 2.5, 'cum', 48),
    (q2, cid, 4, 'Site supervisor', 10, 'days', 35),
    (q2, cid, 5, 'Mobilization and scaffolding', 1, 'ls', 150);

  -- Q-1003: submitted, waiting for client reply
  insert into quotations (company_id, client_id, project_name, project_code, location, attention_to, mobile, quote_date, status, vat_rate)
  values (cid, c3, 'Warehouse Epoxy Flooring', 'GSL-WH-03', 'Rusayl, Muscat', 'Mr. Imran Sheikh', '+968 9345 6789', current_date - 5, 'submitted', 5)
  returning id into q3;
  insert into quotation_items (quotation_id, company_id, sort_order, description, quantity, unit, unit_rate) values
    (q3, cid, 1, 'Floor grinding and crack repair', 450, 'sqm', 2.2),
    (q3, cid, 2, 'Epoxy coating 2 layers', 450, 'sqm', 6.8),
    (q3, cid, 3, 'Yellow line marking', 180, 'rm', 0.9);

  -- Q-1004: full invoice, no discount, unpaid (shows in receivables)
  insert into quotations (company_id, client_id, project_name, project_code, location, attention_to, mobile, quote_date, status, vat_rate)
  values (cid, c4, 'AC Maintenance (Quarterly)', 'OFF-AC-Q4', 'Al Rusayl Factory', 'Ms. Maryam Al Lawati', '+968 9456 7890', current_date - 20, 'approved', 5)
  returning id into q4;
  insert into quotation_items (quotation_id, company_id, sort_order, description, quantity, unit, unit_rate) values
    (q4, cid, 1, 'Split AC service and gas top-up', 12, 'nos', 15),
    (q4, cid, 2, 'Duct cleaning', 3, 'days', 60);

  -- Q-1005: rejected by client
  insert into quotations (company_id, client_id, project_name, location, attention_to, mobile, quote_date, status, vat_rate)
  values (cid, c5, 'Showroom Signage', 'Seeb, Muscat', 'Mr. Faisal Al Amri', '+968 9567 8901', current_date - 15, 'rejected', 5)
  returning id into q5;
  insert into quotation_items (quotation_id, company_id, sort_order, description, quantity, unit, unit_rate) values
    (q5, cid, 1, '3D acrylic letters with LED', 1, 'ls', 650),
    (q5, cid, 2, 'Installation crew', 2, 'days', 40);

  -- Invoices for Q-1001: advance 200 (paid in full), then milestone 600 (part paid)
  insert into invoices (company_id, quotation_id, client_id, kind, vat_rate, issue_date, due_date, description)
  values (cid, q1, c1, 'advance', 5, current_date - 22, current_date - 15, 'Advance to start work') returning id into i1;
  insert into invoice_items (invoice_id, company_id, sort_order, description, quantity, unit, unit_rate)
  values (i1, cid, 1, 'Advance against Q-1001 - Villa Painting', 1, 'ls', 200);
  update invoices set status = 'issued', issued_at = now() - interval '22 days' where id = i1;
  insert into payments (company_id, invoice_id, amount, paid_on, method, reference) values (cid, i1, 210, current_date - 20, 'bank', 'TRF 88213');

  insert into invoices (company_id, quotation_id, client_id, kind, vat_rate, issue_date, due_date, description)
  values (cid, q1, c1, 'milestone', 5, current_date - 7, current_date + 8, 'Balance after completion') returning id into i2;
  insert into invoice_items (invoice_id, company_id, sort_order, description, quantity, unit, unit_rate)
  values (i2, cid, 1, 'Milestone against Q-1001 - Villa Painting', 1, 'ls', 600);
  update invoices set status = 'issued', issued_at = now() - interval '7 days' where id = i2;
  insert into payments (company_id, invoice_id, amount, paid_on, method, reference) values (cid, i2, 300, current_date - 3, 'cash', 'Receipt 0045');

  -- Invoice for Q-1004: full amount, all lines copied, unpaid
  insert into invoices (company_id, quotation_id, client_id, kind, vat_rate, issue_date, due_date)
  values (cid, q4, c4, 'standard', 5, current_date - 18, current_date + 12) returning id into i3;
  insert into invoice_items (invoice_id, company_id, sort_order, description, quantity, unit, unit_rate)
  select i3, cid, sort_order, description, quantity, unit, unit_rate from quotation_items where quotation_id = q4;
  update invoices set status = 'issued', issued_at = now() - interval '18 days' where id = i3;

  -- Keep the intended statuses (invoicing marks quotations converted)
  update quotations set created_at = quote_date::timestamptz where company_id = cid;
end $$;
