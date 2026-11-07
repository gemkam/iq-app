# IQ - Quotations & Invoices

Multi-company quotation and invoicing app for Oman SMEs. Built by KS Tech LLC.

Stack: Next.js + Supabase (project `iq-app`, region ap-south-1) + Vercel.

## Database (supabase/migrations)
- companies, company_members: each customer company is a separate tenant (RLS)
- clients, units (Square Meter, Cubic Meter, Days, Lump Sum ...)
- quotations + quotation_items: Q-1001 numbering, Qty x Rate = Amount, discount (fixed or %), VAT after discount
- invoices + invoice_items: 1001, 1001-1, 1001-2 per job; advance / milestone / final
- payments: updates paid amount, balance and status
- audit_log: full change history
- Reports: report_summary, report_receivables

## Rules enforced in the database
- Lump Sum items: quantity locked to 1
- Invoices for a quotation cannot exceed the quotation total
- Issued invoices cannot be edited (use credit/debit notes) - Fawtara ready
- Quotation becomes "converted" when invoiced

## RPC functions
- create_company(name)
- convert_quotation_to_invoice(quotation_id, amount?, kind?, description?, due_date?)
- issue_invoice(invoice_id)

## Demo mode (current)
No login. The app works on the company flagged `is_demo = true` ("Demo Contracting LLC").
Anyone with the link can view and edit demo data, so use sample data only.
Later: add Supabase Auth, set is_demo = false, and link users through company_members.

## Run
npm install
npm run dev

Deploy: import this repo in Vercel. No environment variables needed (defaults are in lib/supabase.ts).
