-- Questionnaires by project: social media (the original one), website and branding.
-- Each client gets the ones the team sends them, at onboarding or any time after.

alter table questions add column if not exists form text not null default 'social'
  check (form in ('social', 'website', 'branding'));
alter table questions drop constraint if exists questions_agency_id_position_key;
alter table questions add constraint questions_agency_form_position_key unique (agency_id, form, position);

-- Which questionnaires a client has been sent, and when they sent their answers back.
create table if not exists client_questionnaires (
  client_id uuid not null references clients on delete cascade,
  form text not null check (form in ('social', 'website', 'branding')),
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users,
  submitted_at timestamptz,
  drive_file_id text,                   -- their answers as a PDF in the client's Drive folder
  primary key (client_id, form)
);
alter table client_questionnaires enable row level security;
drop policy if exists client_questionnaires_read on client_questionnaires;
create policy client_questionnaires_read on client_questionnaires for select using (can_see_client(client_id));
drop policy if exists client_questionnaires_staff_write on client_questionnaires;
create policy client_questionnaires_staff_write on client_questionnaires for all
  using (can_edit_client(client_id)) with check (can_edit_client(client_id));

-- Every client so far got the social media questionnaire; carry over whether they've sent it.
insert into client_questionnaires (client_id, form, sent_at, submitted_at, drive_file_id)
select c.id, 'social', c.created_at, s.completed_at, c.drive_questionnaire_id
from clients c
left join onboarding_steps st on st.agency_id = c.agency_id and st.kind = 'questionnaire'
left join client_step_status s on s.client_id = c.id and s.step_id = st.id
on conflict do nothing;

-- The step now covers whichever questionnaires they were sent.
update onboarding_steps set title = 'Fill out your questionnaire', help = 'You can stop and come back any time. Your answers save as you go.'
where kind = 'questionnaire' and title = 'Fill out your onboarding questionnaire';

-- Branding: the new logo questionnaire.
insert into questions (agency_id, form, position, prompt, hint, required)
select a.id, 'branding', q.position, q.prompt, q.hint, q.required
from agencies a, (values
  (1,  'What is your business name?', 'Exactly as it should appear in your logo.', true),
  (2,  'Do you have a tagline?', 'Leave it blank if you don''t have one.', false),
  (3,  'Briefly describe your business and what you offer.', '', true),
  (4,  'What makes your brand unique? What sets you apart from competitors?', '', true),
  (5,  'Who are your main competitors? Please list their websites.', 'This helps us create a logo identity that sets you apart.', true),
  (6,  'Who is your target audience?', 'Age, gender, interests, location and anything else that describes them.', true),
  (7,  'What emotions or feelings do you want your logo to convey?', 'For example trust, excitement, luxury, creativity or professionalism.', true),
  (8,  'If your brand had a personality, how would you describe it in three words?', '', true),
  (9,  'Which words fit your brand best?', 'Traditional or modern? Friendly or serious? High end or affordable? Pick one from each pair.', true),
  (10, 'Do you have any specific colors in mind? Why do they represent your brand?', '', false),
  (11, 'Are there any colors you absolutely do NOT want in your logo?', '', false),
  (12, 'Do you prefer a specific type of logo?', 'Wordmark (your name in a styled font), lettermark (initials or a monogram), a symbol or icon, a combination of a symbol and your name, or an emblem (your name inside a badge or crest).', true),
  (13, 'Are there any symbols or imagery you''d like included in the design?', '', false),
  (14, 'Do you have any fonts or typography preferences?', 'Bold, elegant, handwritten, modern, clean and so on.', false),
  (15, 'Are there any existing logos you admire? What do you like about them?', '', false),
  (16, 'Are there any logos or design styles you dislike? Why?', '', false),
  (17, 'What do you want your new logo to achieve?', '', true),
  (18, 'Is there anything else you''d like us to know before we begin the design process?', '', false),
  (19, 'Do you have any other files or links that would help with this project?', 'Paste links here. You can also send files to your team in Messages.', false)
) as q(position, prompt, hint, required)
on conflict do nothing;

-- Website: a starting set. Swap in your own questions any time.
insert into questions (agency_id, form, position, prompt, hint, required)
select a.id, 'website', q.position, q.prompt, q.hint, q.required
from agencies a, (values
  (1,  'Briefly describe your business and what you offer.', '', true),
  (2,  'What is the main goal of your new website?', 'For example booking calls, selling products, getting quote requests or building trust.', true),
  (3,  'Who is your ideal website visitor?', 'Who they are, what they''re looking for and what would make them reach out.', true),
  (4,  'Do you have a current website? What do you like and dislike about it?', 'Paste the link if you have one.', false),
  (5,  'Do you own your domain name? Where is it registered, and where is your site hosted?', 'For example GoDaddy, Squarespace, Wix or WordPress. You can add the logins on the Logins page.', true),
  (6,  'Which pages do you need?', 'For example Home, About, Services, Contact, Blog, FAQ, Shop or a booking page.', true),
  (7,  'What should visitors do when they land on your site?', 'Your main call to action: call, book, buy, sign up or fill out a form.', true),
  (8,  'Do you need any special features?', 'Online booking, payments, a shop, forms, a blog, a client login, an email signup, a chat widget and so on.', false),
  (9,  'Please list two or three websites you love, and what you like about each.', '', true),
  (10, 'Are there any websites or styles you don''t like?', '', false),
  (11, 'Who are your main competitors? Please list their websites.', '', false),
  (12, 'Do you have a logo, brand colors and fonts?', 'Paste links, or upload them in your portal under Branding.', true),
  (13, 'Who will write the words for the site, and do you have photos and videos to use?', 'Tell us what''s ready and what you''ll need help with.', true),
  (14, 'Which tools should the site connect to?', 'Email marketing, your CRM, scheduling, Google Analytics, social accounts and so on.', false),
  (15, 'Do you have a launch date or deadline in mind?', '', false),
  (16, 'Is there anything else you''d like us to know before we start?', '', false)
) as q(position, prompt, hint, required)
on conflict do nothing;
