alter table company_members add column username text;
create unique index company_members_username_key on company_members (lower(username));
