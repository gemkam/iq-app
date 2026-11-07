-- Fix search_path and restrict who can call functions via the API

alter function enforce_lump_sum() set search_path = public;
alter function lock_issued_invoice_items() set search_path = public;
alter function trg_qi_recalc() set search_path = public;
alter function trg_q_recalc() set search_path = public;
alter function trg_ii_recalc() set search_path = public;
alter function trg_qi_recalc() security definer;
alter function trg_q_recalc() security definer;
alter function trg_ii_recalc() security definer;

-- Nobody calls internal functions directly
revoke execute on all functions in schema public from public, anon, authenticated;

-- Signed-in users may call only these
grant execute on function is_member(uuid) to authenticated;
grant execute on function create_company(text) to authenticated;
grant execute on function convert_quotation_to_invoice(uuid, numeric, invoice_kind, text, date) to authenticated;
grant execute on function issue_invoice(uuid) to authenticated;

-- New functions are private by default
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
