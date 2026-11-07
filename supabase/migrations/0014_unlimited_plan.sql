-- 'unlimited' plan for administrators' own companies: never expires, no trial.
-- company_is_active(): plan = 'unlimited' counts as active.
-- create_company() (used by administrators) now creates unlimited companies.
-- set_company_unlimited(company, bool): administrators switch a company to/from unlimited.
-- All companies existing at this point were set to unlimited (no customer sign-ups yet).
-- (full SQL applied via Supabase migration "unlimited_plan")
update companies set plan = 'unlimited';
