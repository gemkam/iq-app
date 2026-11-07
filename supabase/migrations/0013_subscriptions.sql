-- Subscriptions: 30-day free trial, then paid months. When a company's trial/payment ends it becomes
-- view only for its owners (administrators can still edit). Data is never deleted.

alter table companies add column plan text not null default 'trial';           -- trial | basic | pro
alter table companies add column trial_ends_at timestamptz not null default (now() + interval '30 days');
alter table companies add column paid_until timestamptz;
alter table companies add column suspended boolean not null default false;

-- Existing companies start their 30-day trial today
update companies set trial_ends_at = now() + interval '30 days';

create or replace function company_is_active(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from companies
     where id = cid and not suspended
       and (trial_ends_at > now() or (paid_until is not null and paid_until > now()))
  );
$$;
grant execute on function company_is_active(uuid) to authenticated;

-- Editors: administrators always; company owners/users only while the subscription is active
create or replace function is_editor(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from company_members m
     where m.company_id = cid and m.user_id = auth.uid() and m.is_active
       and (m.role = 'admin' or (m.role in ('owner', 'staff') and company_is_active(cid)))
  );
$$;

-- Payment records (kept for history)
create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan text not null,
  months int not null check (months > 0),
  amount numeric(14,3) not null default 0,
  method text,
  reference text,
  period_from timestamptz not null,
  period_to timestamptz not null,
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on subscription_payments (company_id, created_at desc);
alter table subscription_payments enable row level security;
create policy sub_payments_read on subscription_payments for select using (is_admin(company_id));

-- Administrator records a payment: extends paid_until by N months from today or from the current end date
create or replace function record_subscription_payment(
  p_company uuid, p_months int, p_amount numeric, p_plan text default 'basic',
  p_method text default null, p_reference text default null
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; start_at timestamptz; end_at timestamptz;
begin
  if not is_admin(p_company) then raise exception 'Only administrators can record payments'; end if;
  if p_months is null or p_months < 1 then raise exception 'Months must be 1 or more'; end if;
  select * into c from companies where id = p_company;
  start_at := greatest(now(), coalesce(c.paid_until, now()), case when c.plan = 'trial' then c.trial_ends_at else now() end);
  end_at := start_at + make_interval(months => p_months);
  insert into subscription_payments (company_id, plan, months, amount, method, reference, period_from, period_to)
  values (p_company, coalesce(p_plan, 'basic'), p_months, coalesce(p_amount, 0), p_method, p_reference, start_at, end_at);
  update companies set paid_until = end_at, plan = coalesce(p_plan, 'basic'), suspended = false where id = p_company;
  insert into audit_log (company_id, table_name, record_id, action, new_data, changed_by)
  values (p_company, 'subscription', p_company, 'payment_recorded',
          jsonb_build_object('months', p_months, 'amount', p_amount, 'plan', p_plan, 'method', p_method, 'paid_until', end_at), auth.uid());
  return end_at;
end $$;

create or replace function extend_trial(p_company uuid, p_days int) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare end_at timestamptz;
begin
  if not is_admin(p_company) then raise exception 'Only administrators can extend trials'; end if;
  update companies set trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => p_days)
   where id = p_company returning trial_ends_at into end_at;
  insert into audit_log (company_id, table_name, record_id, action, new_data, changed_by)
  values (p_company, 'subscription', p_company, 'trial_extended', jsonb_build_object('days', p_days, 'trial_ends_at', end_at), auth.uid());
  return end_at;
end $$;

create or replace function set_company_suspended(p_company uuid, p_suspended boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_company) then raise exception 'Only administrators can suspend companies'; end if;
  update companies set suspended = p_suspended where id = p_company;
  insert into audit_log (company_id, table_name, record_id, action, new_data, changed_by)
  values (p_company, 'subscription', p_company, case when p_suspended then 'suspended' else 'unsuspended' end, null, auth.uid());
end $$;

revoke execute on function record_subscription_payment(uuid, int, numeric, text, text, text) from public, anon;
revoke execute on function extend_trial(uuid, int) from public, anon;
revoke execute on function set_company_suspended(uuid, boolean) from public, anon;
grant execute on function record_subscription_payment(uuid, int, numeric, text, text, text) to authenticated;
grant execute on function extend_trial(uuid, int) to authenticated;
grant execute on function set_company_suspended(uuid, boolean) to authenticated;

-- Company detail changes: do not log plan/trial/paid fields here (logged as 'subscription' instead)
create or replace function write_audit_company() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  skip text[] := array['next_quotation_no', 'next_invoice_no', 'plan', 'trial_ends_at', 'paid_until', 'suspended'];
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - skip) = (to_jsonb(old) - skip) then
    return null;
  end if;
  insert into audit_log (company_id, table_name, record_id, action, old_data, new_data, changed_by)
  values (coalesce(new.id, old.id), 'companies', coalesce(new.id, old.id), lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return null;
end $$;

-- Owners must not change their own subscription fields through a normal company update
create or replace function protect_subscription_fields() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  -- Direct edits from the app run as "authenticated"; admin buttons run through security definer functions
  if current_user = 'authenticated' and
     (new.plan is distinct from old.plan or new.trial_ends_at is distinct from old.trial_ends_at
      or new.paid_until is distinct from old.paid_until or new.suspended is distinct from old.suspended) then
    raise exception 'Subscription can only be changed by an administrator from Admin → Subscriptions';
  end if;
  return new;
end $$;
create trigger companies_protect_subscription before update on companies
  for each row execute function protect_subscription_fields();
