-- PDF design per company (companies.pdf_template), saved by administrators and company owners
-- can_design(company), save_pdf_template(company, template), public 'branding' bucket for logo/stamp/signature
-- (full SQL applied via Supabase migration "pdf_template")
alter table companies add column if not exists pdf_template jsonb not null default '{}'::jsonb;
