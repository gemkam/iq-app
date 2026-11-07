-- More activity in audit_log: clients, attachments, company details, logins, user management
create trigger audit_clients after insert or update or delete on clients for each row execute function write_audit();
create trigger audit_attachments after insert or update or delete on attachments for each row execute function write_audit();
-- write_audit_company(): logs company detail changes (ignores number counters)
-- log_activity(company, 'login'|'logout'): app events written by the signed-in user
-- (full SQL applied via Supabase migration "activity_log")
