# Client Portal

A branded client portal and team workspace for marketing agencies. Cali & Ko Marketing is the first agency on it. It's built so other agencies can subscribe later.

**Clients** sign in with email and password. They work through onboarding (contract, questionnaire, uploads, kickoff call), read strategy and monthly-report PDFs, approve their monthly Rella content calendar, and message the team.

**The team** gets a task board that fills itself from client activity. They also get each client's page for sending content calendars and PDFs, and email alerts when clients do something.

## How it's built

| Piece | What it does |
| --- | --- |
| Next.js (App Router) | Web app: portal, team workspace, API routes |
| Supabase | Database, logins, file storage. Row-level security keeps agencies apart and limits account managers to their own clients. |
| Vercel | Hosting, plus an hourly job that sends approval reminders and auto-approves late calendars |
| Resend | Notification emails |
| Slack app | Two-way messages between the portal and each client's channel |
| Zapier | Tells the portal when a Dubsado contract is signed |

Key files:

- `supabase/migrations/0001_init.sql`: every table and access rule
- `supabase/seed.sql`: Cali & Ko's brand, onboarding steps and 14 questions
- `src/lib/approval.ts`: the 48-hour approval window, weekends skipped (tests in `approval.test.ts`)
- `src/app/portal`: client portal
- `src/app/team`: team workspace
- `src/app/api`: hourly approval job, Slack events, Dubsado webhook

## Roles

| Role | Access |
| --- | --- |
| Admin (Andie, Shayla) | Every client. Can edit or delete anything, change client info, and manage the team and settings. |
| Account manager (Doni) | Only the clients they're added to. Can make changes there. |
| Creator | Only the clients they're added to. View only. |
| Client contact | Their own portal. Up to 2 people per client. Of the team, they only see their account manager. |

Admins invite teammates and choose their role from **Team** in the workspace. They add people to specific clients from each client's page. The rules are enforced in the database (`can_edit_client`, `is_client_staff`), not just hidden in the screens.

## Setup

### 1. Supabase

1. Create a free project at supabase.com.
2. In **SQL Editor**, run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.
3. In **Authentication → URL Configuration**, set the Site URL to your portal address. Add `http://localhost:3000/**` and `https://<your portal>/**` to Redirect URLs.
4. In **Authentication → Emails**, brand the "Invite user" and "Reset password" templates.
5. Copy the project URL, the anon key and the service_role key from **Project Settings → API**.

### 2. Local app

```bash
cp .env.example .env.local   # then fill in the Supabase values
npm install
npm run dev                  # http://localhost:3000
npm test
```

### 3. Add the first admin

```bash
node --env-file=.env.local scripts/invite-admin.mjs you@agency.com "Your Name" "CEO"
```

This emails an invite, and the link lets them set a password. After that, admins invite everyone else from **Team** in the workspace.

In **Supabase → Authentication → URL Configuration**, set the Site URL to your portal address. Also add `http://localhost:3000/**` and `https://<your portal>/**` as redirect URLs.

### 4. Deploy (Vercel)

1. Import the GitHub repo in Vercel and add every variable from `.env.example`.
2. In **Domains**, add `clients.cali-ko.com`. Then add the CNAME record Vercel shows you at your domain provider.
3. `vercel.json` schedules two jobs: approval reminders and auto-approvals every hour, and client task reminders every morning at 10 AM Eastern. The hourly job needs Vercel Pro.

### 5. Slack (two-way messages)

1. Create an app at api.slack.com/apps in the Cali & Ko workspace.
2. Add these bot token scopes: `chat:write`, `channels:history`, `groups:history`, `users:read`.
3. Under **Event Subscriptions**, set the Request URL to `https://<your portal>/api/slack/events`. Subscribe to `message.channels` and `message.groups`.
4. Install the app to the workspace. Put the Bot Token in `SLACK_BOT_TOKEN` and the Signing Secret in `SLACK_SIGNING_SECRET`.
5. Invite the app to each client channel (`/invite @YourApp`). Then paste the channel ID on the client's page.

### 6. Dubsado via Zapier

Set up a Zap with trigger **Dubsado → Contract Signed** and action **Webhooks by Zapier → POST**:

- URL: `https://<your portal>/api/webhooks/dubsado`
- Header: `x-webhook-secret: <ZAPIER_WEBHOOK_SECRET>`
- Data: `email` = the client's email from Dubsado

The client's contract step checks itself off, and the team gets an email.

### 7. Google Calendar (monthly due dates)

The Tasks page shows upcoming due dates from a Google Calendar you choose (Cali & Ko uses **C&K Due Dates**). Repeating events, and any single dates you move, come through exactly as they appear in Google.

1. Go to console.cloud.google.com and create a project, for example "Client Portal."
2. In **APIs & Services → Library**, enable **Google Calendar API**.
3. In **OAuth consent screen**, choose **Internal**. That means only cali-ko.com accounts can use it, and Google doesn't need to review it. Then add the scope `calendar.readonly`.
4. In **Credentials → Create credentials → OAuth client ID**, choose **Web application**. Add the redirect URI `https://<your portal>/api/google/callback`, plus `http://localhost:3000/api/google/callback` for testing.
5. Put the Client ID and Client secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. In the portal, open **Agency settings → Google Calendar → Connect Google**, sign in, and choose the due-dates calendar.

The portal only reads that calendar. Changes in Google show up within 15 minutes.

When other agencies subscribe, the consent screen will need to switch to **External** and go through Google's verification.

### 8. Email

Sign up at resend.com, verify the domain you'll send from, then set `RESEND_API_KEY` and `NOTIFY_FROM`. Until then, emails are printed to the server log instead of being sent.

## Not built yet

- Copying client uploads into Google Drive. Uploads are stored in Supabase for now.
- Google Calendar sync and automatic detection of booked kickoff calls. For now, clients click "I've booked it."
- Editing brand, questions, steps and team from Agency settings. For now these are changed in the database.
- Sign-up and billing for other agencies (Stripe).
