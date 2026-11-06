-- Website and branding project tasks: a month-long timeline for each, posted to the account
-- manager when a project starts (with dates that stretch or shrink to fit the scope).

alter table agencies add column if not exists project_tasks jsonb not null default '{}'::jsonb;

-- The starting timeline. Days count from the project's start date; edit it in Settings.
update agencies set project_tasks = '{
 "website": [
  {
   "title": "Kickoff call",
   "days": 0,
   "assignee": "account_manager",
   "note": "Confirm scope, page list, launch date and who signs off. Share the timeline with the client."
  },
  {
   "title": "Send the website questionnaire and collect logins",
   "days": 1,
   "assignee": "account_manager",
   "note": "Send it from their client page (Send a questionnaire). Ask for domain, hosting and current site logins on the Logins page."
  },
  {
   "title": "Review questionnaire answers, brand assets and sites they like",
   "days": 3,
   "assignee": "account_manager",
   "note": "Note goals, must-have features and any gaps to ask about."
  },
  {
   "title": "Sitemap and page outline",
   "days": 5,
   "assignee": "account_manager",
   "note": "List every page and what goes on it. Get the client''s OK before design starts."
  },
  {
   "title": "Design the homepage",
   "days": 8,
   "assignee": "account_manager",
   "note": "Layout, fonts, colors and photos, using their brand assets."
  },
  {
   "title": "Write homepage and core page copy",
   "days": 10,
   "assignee": "account_manager",
   "note": "Headlines, services, about and calls to action, in their brand voice."
  },
  {
   "title": "Client review: homepage design and copy",
   "days": 12,
   "assignee": "account_manager",
   "note": "Send it for feedback with a clear date to reply by."
  },
  {
   "title": "Homepage revisions and inner page designs",
   "days": 15,
   "assignee": "account_manager",
   "note": "Make the homepage changes, then design the rest of the pages to match."
  },
  {
   "title": "Build every page",
   "days": 18,
   "assignee": "account_manager",
   "note": "Build the full site in the website platform, with forms, booking and any integrations."
  },
  {
   "title": "Client review: full site",
   "days": 21,
   "assignee": "account_manager",
   "note": "Send the preview link. Ask for all feedback in one round."
  },
  {
   "title": "Revisions from client feedback",
   "days": 24,
   "assignee": "account_manager"
  },
  {
   "title": "SEO setup",
   "days": 26,
   "assignee": "account_manager",
   "note": "Page titles, meta descriptions, image alt text, Google Analytics and Search Console."
  },
  {
   "title": "Quality check",
   "days": 27,
   "assignee": "account_manager",
   "note": "Test on phone, tablet and desktop. Check every link, form, booking flow and page speed."
  },
  {
   "title": "Final client approval",
   "days": 28,
   "assignee": "account_manager",
   "note": "Get written sign-off before launch."
  },
  {
   "title": "Launch",
   "days": 29,
   "assignee": "account_manager",
   "note": "Connect the domain, check SSL, set up redirects from old pages and submit the sitemap."
  },
  {
   "title": "Hand off and ask for a review",
   "days": 30,
   "assignee": "account_manager",
   "note": "Send a walkthrough video, hand over logins and ask for a Google review."
  }
 ],
 "branding": [
  {
   "title": "Kickoff call",
   "days": 0,
   "assignee": "account_manager",
   "note": "Confirm scope (logo, palette, fonts, brand guide), timeline and who signs off."
  },
  {
   "title": "Send the branding questionnaire",
   "days": 1,
   "assignee": "account_manager",
   "note": "Send it from their client page (Send a questionnaire)."
  },
  {
   "title": "Review questionnaire answers, competitors and inspiration",
   "days": 3,
   "assignee": "account_manager",
   "note": "Note words, colors and logo types they love and don''t."
  },
  {
   "title": "Brand strategy",
   "days": 5,
   "assignee": "account_manager",
   "note": "Positioning, audience, personality and voice in one page."
  },
  {
   "title": "Mood board",
   "days": 7,
   "assignee": "account_manager",
   "note": "Send it to the client for feedback."
  },
  {
   "title": "Mood board revisions and approval",
   "days": 10,
   "assignee": "account_manager",
   "note": "Lock the direction before logo work starts."
  },
  {
   "title": "Logo concepts",
   "days": 13,
   "assignee": "account_manager",
   "note": "Two or three directions based on the mood board."
  },
  {
   "title": "Client review: logo concepts",
   "days": 15,
   "assignee": "account_manager",
   "note": "Present the concepts and have them pick one direction."
  },
  {
   "title": "Refine the chosen logo",
   "days": 18,
   "assignee": "account_manager"
  },
  {
   "title": "Color palette and fonts",
   "days": 20,
   "assignee": "account_manager",
   "note": "Primary, secondary and accent colors with codes. Heading and body fonts."
  },
  {
   "title": "Logo suite",
   "days": 22,
   "assignee": "account_manager",
   "note": "Primary logo, secondary logo and submark, in color, black and white."
  },
  {
   "title": "Client review: full brand identity",
   "days": 24,
   "assignee": "account_manager",
   "note": "Logo suite, palette and fonts together."
  },
  {
   "title": "Final revisions",
   "days": 26,
   "assignee": "account_manager"
  },
  {
   "title": "Brand guide",
   "days": 28,
   "assignee": "account_manager",
   "note": "Logo use, colors, fonts, voice and examples."
  },
  {
   "title": "Export final files",
   "days": 29,
   "assignee": "account_manager",
   "note": "Every logo in PNG, SVG and PDF, in each color version. Save them to their Drive Branding folder."
  },
  {
   "title": "Deliver and ask for a review",
   "days": 30,
   "assignee": "account_manager",
   "note": "Walk them through the brand guide and files, and ask for a Google review."
  }
 ]
}'::jsonb
where project_tasks = '{}'::jsonb;
