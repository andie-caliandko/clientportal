-- Onboarding: a "Share your account logins" step. Clients add logins on their
-- Logins page (encrypted in the vault); the step checks off with the first one.
alter table onboarding_steps drop constraint if exists onboarding_steps_kind_check;
alter table onboarding_steps add constraint onboarding_steps_kind_check
  check (kind in ('contract', 'questionnaire', 'upload_branding', 'upload_content', 'booking', 'custom', 'logins'));

insert into onboarding_steps (agency_id, position, kind, title, help, action_label)
select a.id,
       coalesce((select max(position) from onboarding_steps s where s.agency_id = a.id), 0) + 1,
       'logins',
       'Share your account logins',
       'Add the logins for the accounts we''ll manage, like Instagram, Facebook and your website. Passwords are encrypted and never sent by email or messages.',
       'Add logins'
from agencies a
where not exists (select 1 from onboarding_steps s where s.agency_id = a.id and s.kind = 'logins');
