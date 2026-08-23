# Accounting Homework Tracker

A full-stack web app for managing accounting homework. The instructor ("TA") creates
chapter-organized questions of several types; students answer them and get feedback,
either auto-graded or manually graded by the TA. Built on Next.js 16 (App Router) and
Supabase (Postgres + Auth).

**Tech stack:** Next.js 16 • React 19 • TypeScript • Supabase (Postgres, Auth, RLS) • plain CSS (custom properties in `app/globals.css`)

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Supabase Setup](#supabase-setup)
5. [Google OAuth Setup](#google-oauth-setup)
6. [Environment Variables](#environment-variables)
7. [Provisioning Users & Roles](#provisioning-users--roles)
8. [Email Notifications (Resend)](#email-notifications-resend)
9. [Running Locally](#running-locally)
10. [Deployment to Vercel](#deployment-to-vercel)
11. [Troubleshooting](#troubleshooting)

---

## Features

- **Google OAuth login** via Supabase Auth (PKCE flow), with role-based routing
  (`/instructor` for TAs, `/student` for students). Unauthenticated or wrong-role
  access is redirected by `proxy.ts` (Next's middleware) and by in-page checks.
- **12 fixed chapters** for organizing questions.
- **Multiple question types:** `text`, `multiple_choice`, `fill_blank`, `image`,
  `matching` (a `labeling` type existed briefly and was merged into `matching`).
- **Question scheduling:** `available_at` (opens) and `due_at` (closes) timestamps,
  settable per-question or in bulk across a chapter from the instructor page.
- **Drag-and-drop question reordering** within a chapter (persists to `order_index`).
- **Attempt limits** (`max_attempts`) and **points** per question.
- **Tagging** (`tags`) for questions.
- **Image-upload questions:** students submit an `image_url` (uploaded to a Supabase
  Storage bucket) as their answer.
- **Auto-grading** for text/multiple-choice/fill-blank/matching answers, plus
  **manual grading** by the TA (`is_correct`, `score`, `grader_note`) via
  `PATCH /api/grade` — used for types that need human judgment (e.g. free-response).
- **Re-submission:** students can edit and resubmit; `attempt_count` is tracked.
- **Flagging:** students can flag their own submissions, TAs can flag any
  (`PATCH /api/flag`) — e.g. to mark something for review.
- **CSV export** for the TA: raw submissions (`/api/export/csv`) and a
  per-student completion summary (`/api/export/completion-csv`).
- **Analytics page** (`/analytics`, TA-only): KPI overview and per-question
  performance breakdown.
- **Progress page** (`/progress`, student-facing): per-chapter completion stats.
- **Row-Level Security (RLS)** on every table — students can only see their own
  submissions; only the TA role can create questions or read all submissions.
- **Email notifications via Resend** (optional, off by default): a daily
  scheduled job emails students their unanswered questions due within 24
  hours, and every API route emails the TA when a request fails server-side.
  See [Email Notifications (Resend)](#email-notifications-resend).

### Not included

- No automated tests.
- No self-service signup flow — user accounts and roles are provisioned manually
  (see [Provisioning Users & Roles](#provisioning-users--roles)).

---

## Architecture

```
app/
├── page.tsx                        Root: checks session, redirects to /login, /instructor, or /student
├── login/page.tsx                  "Continue with Google" (Supabase OAuth)
├── auth/callback/route.ts          Exchanges OAuth code for a session, routes by role
├── instructor/page.tsx             TA dashboard: create/edit/reorder/schedule questions, grade, flag, view submission counts
├── student/page.tsx                Student view: answer questions by chapter, see feedback, edit/resubmit
├── progress/page.tsx               Student-facing per-chapter completion stats
├── analytics/page.tsx              TA-only KPI + per-question performance breakdown
├── api/
│   ├── questions/route.ts          GET/POST/PATCH/DELETE questions (TA-guarded for writes)
│   ├── submit/route.ts             POST a student answer, runs auto-grading where applicable
│   ├── submission-result/route.ts  GET a student's own result for a question
│   ├── grade/route.ts              PATCH manual grade (TA-only)
│   ├── flag/route.ts               PATCH flagged status
│   ├── export/
│   │   ├── csv/route.ts            Raw submissions CSV (TA-only)
│   │   └── completion-csv/route.ts Per-student completion summary CSV (TA-only)
│   └── cron/
│       └── due-reminders/route.ts  Vercel Cron target: emails students their questions due within 24h
└── globals.css                     All styling (CSS custom properties, no component library)

lib/
├── types.ts                        Shared TypeScript interfaces (User, Question, Submission, MatchPair)
├── supabase-client.ts               Browser Supabase client (PKCE)
├── supabase-server.ts                Server/route-handler Supabase client (cookie-based)
├── supabase-proxy.ts                 Session refresh + role-gate logic used by proxy.ts
├── supabase-admin.ts                  Service-role Supabase client for cron + cross-user error notifications
├── resend.ts                          Resend wrapper; no-ops with a warning if RESEND_API_KEY/FROM_EMAIL are unset
└── notify-ta.ts                       Emails every TA when an API route hits a server error

proxy.ts                             Next 16 middleware entry point; matches /instructor/* and /student/*
vercel.json                          Vercel Cron schedule for /api/cron/due-reminders
supabase/
├── schema.sql                       Base schema + RLS policies (run first)
├── add_available_at.sql             Adds available_at + fixes questions_public view (run after schema.sql)
├── fix_questions_public_order_index.sql  Adds order_index back to questions_public (run after the above)
├── add_matching_labeling_types.sql  Allows matching/labeling question types
├── merge_labeling_into_matching.sql Collapses labeling into matching
├── fix_ta_submissions_policy.sql    Grants + SECURITY DEFINER fix for TA-wide reads (see file for why)
├── drop_unused.sql                  Drops unused tables/columns (question_images, study_groups, study_group_members, time_limit_sec, difficulty)
├── grant_service_role.sql           Grants service_role base table privileges (needed for the cron job + error notifications)
└── grant_ta_delete_submissions.sql  Grants DELETE + RLS policy for TAs resetting their own test submissions
```

### Auth & role model

- Supabase Auth handles Google sign-in. There is **no database trigger that
  auto-creates a `public.users` row** on signup — a row must exist in `users`
  (with `role` set to `ta` or `student`) or the callback route redirects back
  to `/login?error=user_not_setup`. See
  [Provisioning Users & Roles](#provisioning-users--roles).

---

## Prerequisites

- **Node.js 18+**
- **npm**
- **Git**
- A **Supabase** account (free tier is fine) — https://supabase.com
- A **Google Cloud** project with OAuth 2.0 credentials
- A **Vercel** account, for deployment — https://vercel.com

---

## Supabase Setup

### 1. Create a project

Go to https://supabase.com → **New Project** → pick a name, database password, and
region → **Create**. Wait ~2 minutes for provisioning.

### 2. Run the schema and migrations, in order

Open **SQL Editor** → **New Query** in Supabase, and run each file from `supabase/`
**in this exact order** (later files alter or replace what earlier ones create):

1. `supabase/schema.sql`
2. `supabase/add_available_at.sql`
3. `supabase/fix_questions_public_order_index.sql`
4. `supabase/add_matching_labeling_types.sql`
5. `supabase/merge_labeling_into_matching.sql`
6. `supabase/fix_ta_submissions_policy.sql`
7. `supabase/drop_unused.sql`
8. `supabase/grant_service_role.sql`
9. `supabase/grant_ta_delete_submissions.sql`

Verify in **Table Editor**: you should see `users`, `questions`, `submissions`,
and a `questions_public` view.

### 3. Create a Storage bucket (for image questions)

**Storage** → **New Bucket** → name it (default expected: `homework-images`, or
whatever you set `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` to) → make it public (or
add appropriate access policies) so uploaded `image_url`s are viewable. Skip this
if you won't use `image`-type questions.

### 4. Get your API credentials

**Settings → API**, copy:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key** (secret) → `SUPABASE_SERVICE_ROLE_KEY`

**Never commit the service role key.**

### 5. Enable Google as an Auth provider

**Authentication → Providers → Google** → toggle on → paste in the Client ID and
Client Secret from the Google Cloud project you'll create next → **Save**. Supabase
will show you a callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`)
— you'll need it in the next step.

---

## Google OAuth Setup

1. Go to https://console.cloud.google.com → create/select a project.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. **Authorized redirect URIs**, add:
   - The Supabase callback URL from the previous step
     (`https://<project-ref>.supabase.co/auth/v1/callback`)
5. **Create**, then copy the **Client ID** and **Client secret** into Supabase's
   Google provider settings (previous section).

> Note: the app's own `/auth/callback` route (`app/auth/callback/route.ts`)
> receives the code *after* Supabase completes the OAuth handshake — it is not
> the redirect URI you register with Google. Only the Supabase callback URL
> goes in Google Cloud Console.

---

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Required | Used for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (client + server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only privileged Supabase key |
| `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` | Only if using image questions | Storage bucket name for uploaded answer images |
| `RESEND_API_KEY` | Only for email notifications | Resend API key |
| `FROM_EMAIL` | Only for email notifications | Verified sender, e.g. `Homework Tracker <onboarding@resend.dev>` |
| `APP_URL` | Only for email notifications | Used to build the "Go to your homework" link in reminder emails |
| `CRON_SECRET` | Only for email notifications | Shared secret Vercel Cron sends as `Authorization: Bearer <value>`; the cron route rejects requests without it |

`.env.local` is gitignored — verify before committing anything.

---

## Provisioning Users & Roles

Because there's no signup trigger, get each person into the system like this:

1. Have the person sign in once at `/login` with **Continue with Google**. This
   creates their row in Supabase's internal `auth.users` table (you'll see them
   under **Authentication → Users**), but sign-in will fail with
   `user_not_setup` because they have no `public.users` row yet.
2. Copy their `auth.users` **UID** and email from the Supabase Authentication tab.
3. In **Table Editor** (or SQL Editor), insert a row into `public.users`:
   ```sql
   insert into public.users (id, email, name, role)
   values ('<uid-from-auth.users>', 'someone@example.com', 'Someone', 'ta');
   -- use role = 'student' for students
   ```
4. Have them sign in again (or refresh) — they'll now land on `/instructor` or
   `/student` per their role.

Repeat step 3 with `role = 'student'` for each student.

---

## Email Notifications (Resend)

Optional. Two things send email once configured:
- **Due-date reminders** — a daily job emails each student their unanswered
  questions due within the next 24 hours (`app/api/cron/due-reminders/route.ts`).
- **TA error alerts** — every API route emails all `ta`-role users when a
  request fails server-side (`lib/notify-ta.ts`), so grading/submission bugs
  get noticed without a student having to report them.

Without `RESEND_API_KEY`/`FROM_EMAIL` set, `lib/resend.ts` no-ops (logs a
warning instead of sending) — the app runs fine with email fully disabled.

### 1. Create a Resend account and get an API key

1. Sign up at https://resend.com.
2. **API Keys** → **Create API Key** → copy it into `RESEND_API_KEY`.
3. For a sender address: either verify your own domain under **Domains** (for
   production use), or use Resend's shared test domain
   `onboarding@resend.dev` as `FROM_EMAIL` to get started immediately — note
   the test domain only delivers to the email address you signed up with, so
   verify a real domain before relying on this for actual students.

### 2. Grant `service_role` table access

The cron job and error notifications run without a logged-in user, so they
use the service-role admin client (`lib/supabase-admin.ts`), which needs base
table privileges independent of RLS. Run `supabase/grant_service_role.sql`
(step 8 in [Supabase Setup](#supabase-setup)) if you haven't already —
without it you'll see `permission denied for table questions` (Postgres code
42501) the moment the cron route or an error-notification runs.

### 3. Set environment variables

Add to `.env.local` (and to Vercel's env vars for production — see
[Deployment to Vercel](#deployment-to-vercel)):

```env
RESEND_API_KEY=re_your_key
FROM_EMAIL=Homework Tracker <onboarding@resend.dev>
APP_URL=http://localhost:3000
CRON_SECRET=some-long-random-string
```

`APP_URL` should be your production URL once deployed (e.g.
`https://your-app.vercel.app`) — it's just used to build the link inside
reminder emails, not for auth. `CRON_SECRET` can be anything long and random;
generate one with `openssl rand -hex 32` or similar.

### 4. Enable the scheduled job on Vercel

`vercel.json` already defines the cron schedule:

```json
{ "crons": [{ "path": "/api/cron/due-reminders", "schedule": "0 13 * * *" }] }
```

Vercel automatically signs cron requests with `Authorization: Bearer
<CRON_SECRET>` when a `CRON_SECRET` env var is set on the project — the route
checks that header itself, so no other setup is needed once the env var is
in place. Cron only runs on deployed (production) environments, not locally.

> **Hobby plan note:** Vercel's free tier limits cron jobs to once per day.
> `0 13 * * *` (13:00 UTC daily) already respects that; if you're on a paid
> plan and want more frequent reminders, you can tighten the schedule.

### 5. Test locally

The cron route can be hit directly for testing (it doesn't require Vercel's
scheduler, just the right header):

```bash
curl http://localhost:3000/api/cron/due-reminders \
  -H "Authorization: Bearer $CRON_SECRET"
```

To test TA error alerts, trigger any of the app's error paths (e.g. submit
with bad data) and confirm an email arrives, or watch the server log for
`[EMAIL] RESEND_API_KEY or FROM_EMAIL not set, skipping send` if it's not
configured yet.

---

## Running Locally

```bash
npm install
npm run dev
```

Visit http://localhost:3000. It redirects to `/login` if you have no session, or
to `/instructor`/`/student` based on your role once signed in.

### Manual test checklist

- [ ] Google sign-in works and lands on the correct role's page
- [ ] TA can create a question of each type (text, multiple choice, fill-blank,
      image, matching)
- [ ] TA can drag-reorder questions within a chapter
- [ ] TA can set `available_at`/`due_at` on a question (individually and in bulk)
- [ ] Student sees only questions that are currently available
- [ ] Student can submit an answer, sees feedback, can edit and resubmit
- [ ] Student and TA can flag a submission
- [ ] TA can manually grade a submission and it reflects on the student's side
- [ ] TA can export both CSVs from `/analytics`
- [ ] `/progress` shows correct per-chapter completion for a student
- [ ] A student cannot reach `/instructor` (redirected by `proxy.ts`)

```bash
# Optional: type-check
npx tsc --noEmit
```

---

## Deployment to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "ready for deployment"
git push origin main
```

### 2. Import into Vercel

**Add New → Project → Import Git Repository** → select this repo → **Import**.
Vercel auto-detects Next.js; no build command changes are needed.

### 3. Add environment variables

In the project's **Settings → Environment Variables**, add the same variables
from your `.env.local` (see [Environment Variables](#environment-variables)) for
Production (and Preview, if you want preview deployments to work against the
same Supabase project). Include the Resend variables if you're using email
notifications (see [Email Notifications (Resend)](#email-notifications-resend)),
and set `APP_URL` to your actual Vercel URL rather than localhost. Then **Deploy**.

### 4. No Google Cloud Console changes needed for new domains

Because Google OAuth is configured against Supabase's fixed callback URL (not
your app's domain), a new Vercel deployment domain does **not** require any
changes in Google Cloud Console. Your app's own `redirectTo` (already computed
from `window.location.origin` in `app/login/page.tsx`) just needs the domain
to be reachable, which it is automatically.

### 5. Add your production domain to Supabase's URL allow-list

This step is easy to miss and causes sign-in to redirect through `localhost`
even on the deployed site. In Supabase, go to **Authentication → URL
Configuration**:

- **Site URL** — change from `http://localhost:3000` to your Vercel URL
  (e.g. `https://your-app.vercel.app`). This is the fallback Supabase uses
  when a requested redirect isn't recognized — if it's still set to
  localhost, that's exactly where production sign-ins get bounced.
- **Redirect URLs** — add `https://your-app.vercel.app/auth/callback` to the
  allow-list. `redirectTo` is only honored if it matches an entry here.
  Keep `http://localhost:3000/auth/callback` in the list too so local dev
  keeps working — both can coexist.
- If you also use Vercel preview deployments and want OAuth to work on those
  per-branch URLs, add a wildcard entry like `https://*.vercel.app/auth/callback`.
  Optional — most setups only need the stable production domain.

### 6. Test production

Visit the deployed URL, sign in, and run through the checklist above. Sign-in
should complete entirely on your Vercel domain with no localhost redirect.

---

## Troubleshooting

### Stuck on `/login?error=user_not_setup`

No `public.users` row exists for this account yet. See
[Provisioning Users & Roles](#provisioning-users--roles).

### `/login?error=missing_code` or `auth_failed`

The OAuth handshake didn't complete. Check that Google is enabled as a provider
in Supabase (**Authentication → Providers**) and that the Supabase callback URL
is registered in Google Cloud Console's **Authorized redirect URIs**.

### Sign-in redirects through `localhost` on the deployed (Vercel) app

Supabase's **Site URL** is still set to `http://localhost:3000`, and/or your
production `/auth/callback` URL isn't in Supabase's **Redirect URLs**
allow-list — see [step 5 of Deployment to Vercel](#5-add-your-production-domain-to-supabases-url-allow-list).
`redirectTo` is computed dynamically from the current domain in
`app/login/page.tsx`, but Supabase only honors it if it matches an allowed
redirect URL; otherwise it falls back to the Site URL.

### Signing in on a browser already logged into the wrong Google account

If the browser has an active Google session, "Continue with Google" will
silently reuse that account instead of prompting you to choose — the app now
passes `prompt: "select_account"` (`app/login/page.tsx`) so the picker always
shows, but this only takes effect after that change is deployed. Incognito/
guest profiles always show the picker since they have no existing Google
session.

### Database errors creating/reading questions

Confirm all seven SQL files under `supabase/` were run, **in order** (see
[Supabase Setup](#supabase-setup)). Running them out of order can leave
`questions_public` missing columns the app expects (`order_index`,
`available_at`, `explanation`).

### `permission denied for table submissions` (Postgres code 42501) on `/analytics`

This is a table-privilege issue, not RLS — make sure
`supabase/fix_ta_submissions_policy.sql` was run; it grants base `SELECT` on
`submissions` to the `authenticated` role (RLS policies alone aren't enough
without this grant).

### Analytics shows 0 active students

Same fix as above — `fix_ta_submissions_policy.sql` also adds a
`SECURITY DEFINER` `is_ta()` function so TA-wide reads on `users` work without
triggering RLS recursion.

### `permission denied for table questions/submissions/users` (Postgres code 42501) from the cron job or error emails

The `service_role` key used by `lib/supabase-admin.ts` bypasses RLS but still
needs base table privileges, same underlying issue as the `authenticated`-role
fix above. Run `supabase/grant_service_role.sql`.

### `permission denied for table submissions` (Postgres code 42501) when a TA clicks Reset

The `authenticated` role was only ever granted `SELECT, INSERT, UPDATE` on
`submissions`, never `DELETE`, and there was no RLS policy allowing deletes.
Run `supabase/grant_ta_delete_submissions.sql`.

### Image questions fail to submit

Confirm `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` matches an actual bucket name and
that the bucket allows the uploads/reads your policies need.

### Environment variable changes not taking effect on Vercel

**Settings → Environment Variables**, confirm values, then
**Deployments → (latest) → Redeploy**.
