-- Free trial shortened to 7 days for new companies
alter table companies alter column trial_ends_at set default (now() + interval '7 days');
