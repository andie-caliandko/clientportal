-- Cali & Ko Marketing: the first agency on the platform.

insert into agencies (slug, name, portal_domain, timezone, brand, notify_emails)
values (
  'cali-ko',
  'Cali & Ko Marketing',
  'portal.cali-ko.com',
  'America/New_York',
  '{
    "shortName": "Cali & Ko",
    "colors": {
      "cream": "#F6F0EA", "sage": "#D0E1DD", "stone": "#B3BDBB",
      "khaki": "#CDCB9F", "primary": "#364E4A", "accent": "#724708"
    },
    "fonts": { "heading": "Instrument Serif", "label": "Poppins", "body": "Instrument Sans" },
    "logo": "/brand/cali-ko/logo-green.png",
    "logoOnDark": "/brand/cali-ko/logo-cream.png",
    "mark": "/brand/cali-ko/mark-green.png",
    "markOnDark": "/brand/cali-ko/mark-cream.png"
  }'::jsonb,
  '{}'
)
on conflict (slug) do nothing;

update agencies set monthly_rhythm = '[
  {"week": 1, "title": "Plan and gather", "items": [
    {"title": "Schedule strategy calls", "detail": "With each client, for the month ahead"},
    {"title": "Gather content", "detail": "Photos, videos and updates from every client"},
    {"title": "Content shoots for local clients", "detail": "Book and shoot on site"},
    {"title": "Plan next month''s content calendar", "detail": "Themes, key dates and post ideas"}]},
  {"week": 2, "title": "Build", "items": [
    {"title": "Build all content in the content calendar", "detail": "Captions, graphics and video for every post"}]},
  {"week": 3, "title": "Review and send", "items": [
    {"title": "Send content calendars for internal review", "detail": "The team checks every calendar first"},
    {"title": "Send content calendars to clients", "detail": "Paste the Rella link on each client''s page to start the 48-hour window"},
    {"title": "Make client revisions", "detail": "Revisions are due 48 hours after sending, weekends skipped"}]},
  {"week": 4, "title": "Schedule and report", "items": [
    {"title": "Make sure all content is scheduled", "detail": "Every post for next month is queued in Rella"},
    {"title": "Put together analytics reports", "detail": "Monthly report PDF for every client, added to their Analytics page"},
    {"title": "Start scheduling strategy calls", "detail": "For week 1 of next month"}]}
]'::jsonb
where slug = 'cali-ko';

-- Team tasks created automatically for every new client. Days are counted from
-- the day the client is added. "account_manager" goes to the client's AM.
update agencies set new_client_tasks = '[
  {"title": "Send the contract and invoice through Dubsado", "days": 0, "assignee": "account_manager"},
  {"title": "Send the portal welcome email and confirm they can sign in", "days": 1, "assignee": "account_manager"},
  {"title": "Schedule the kickoff call on Google Meet", "days": 2, "assignee": "account_manager"},
  {"title": "Review brand assets and content once uploaded", "days": 7, "assignee": "account_manager"},
  {"title": "Write their full content strategy", "days": 10, "assignee": "account_manager"},
  {"title": "Set KPIs and Good / Better / Best goals on the Account health tab", "days": 10, "assignee": "account_manager"},
  {"title": "Create their content calendar", "days": 14, "assignee": "account_manager"},
  {"title": "Set up the strategy review call", "days": 14, "assignee": "account_manager"}
]'::jsonb
where slug = 'cali-ko';

with a as (select id from agencies where slug = 'cali-ko')
insert into onboarding_steps (agency_id, position, kind, title, help, action_label)
select a.id, s.position, s.kind, s.title, s.help, s.action_label
from a, (values
  (1, 'contract',        'Sign your contract',                    'Sent to your email from Dubsado. It checks off here once it''s signed.', 'Open contract'),
  (2, 'questionnaire',   'Fill out your onboarding questionnaire', '14 questions, about 20 minutes. You can stop and come back any time.', 'Start'),
  (3, 'upload_branding', 'Upload your branding',                   'Logos, fonts, colors and any brand guide you have.', 'Upload'),
  (4, 'upload_content',  'Upload your content',                    'Photos and videos of your products, space and team.', 'Upload'),
  (5, 'booking',         'Book your kickoff call',                 '30 minutes on Google Meet with your account manager.', 'Pick a time')
) as s(position, kind, title, help, action_label)
on conflict do nothing;

with a as (select id from agencies where slug = 'cali-ko')
insert into questions (agency_id, position, prompt, hint)
select a.id, q.position, q.prompt, q.hint
from a, (values
  (1,  'Who are the main points of contact in your business, and what are their email addresses?', 'List each person''s name, role and email.'),
  (2,  'Who is your perfect customer?', 'Include demographics, income, location, beliefs and anything else that describes them.'),
  (3,  'What are your ideal clients'' fears?', 'Things that haven''t happened yet, but they''re worried about.'),
  (4,  'What are their pains?', 'Problems they''re dealing with right now.'),
  (5,  'What BIG problem is your audience looking to solve?', 'The one thing they most want fixed.'),
  (6,  'What are your ideal customer''s hopes, dreams and goals?', 'Where do they want to be?'),
  (7,  'What is your transformational offer?', 'The product or service that changes things for them.'),
  (8,  'How does this solve their pains or help them reach their goals?', 'Connect your offer to what they need.'),
  (9,  'What is your unique selling proposition?', 'What makes you different from everyone else who does what you do?'),
  (10, 'Are they aware of any other solutions for the problem?', 'Competitors, alternatives or workarounds they might try.'),
  (11, 'What is your company''s discovery story?', 'How did your business start? What made you begin?'),
  (12, 'Why should they trust you?', 'Experience, results, reviews, credentials. Anything that builds trust.'),
  (13, 'Please share links to your branding and other brand assets.', 'Brand photos, colors, typography and guidelines. You can also upload files in the next step.'),
  (14, 'Link all of your offers.', 'Paste a link to each product, service or booking page.')
) as q(position, prompt, hint)
on conflict do nothing;
