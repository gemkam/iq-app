-- Roles: admin = Administrator (everything, Admin tab), owner = Company owner (full work in own companies, no Admin),
-- staff = User, guest = view only. Existing owners become Administrators.
-- (applied via Supabase: update roles, is_admin(), verify_admin_pin(), create_company() now admin-only)
update company_members set role = 'admin' where role = 'owner';
