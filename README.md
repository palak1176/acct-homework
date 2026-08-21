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
8. [Running Locally](#running-locally)
9. [Deployment to Vercel](#deployment-to-vercel)
10. [Troubleshooting](#troubleshooting)

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

### Not included

- No automated tests.
- No email notifications.
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
│   └── export/
│       ├── csv/route.ts            Raw submissions CSV (TA-only)
│       └── completion-csv/route.ts Per-student completion summary CSV (TA-only)
└── globals.css                     All styling (CSS custom properties, no component library)

lib/
├── types.ts                        Shared TypeScript interfaces (User, Question, Submission, MatchPair)
├── supabase-client.ts               Browser Supabase client (PKCE)
├── supabase-server.ts                Server/route-handler Supabase client (cookie-based)
└── supabase-proxy.ts                 Session refresh + role-gate logic used by proxy.ts

proxy.ts                             Next 16 middleware entry point; matches /instructor/* and /student/*
supabase/
├── schema.sql                       Base schema + RLS policies (run first)
├── add_available_at.sql             Adds available_at + fixes questions_public view (run after schema.sql)
├── fix_questions_public_order_index.sql  Adds order_index back to questions_public (run after the above)
├── add_matching_labeling_types.sql  Allows matching/labeling question types
├── merge_labeling_into_matching.sql Collapses labeling into matching
├── fix_ta_submissions_policy.sql    Grants + SECURITY DEFINER fix for TA-wide reads (see file for why)
└── drop_unused.sql                  Drops unused tables/columns (question_images, study_groups, study_group_members, time_limit_sec, difficulty)
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
same Supabase project). Then **Deploy**.

### 4. No redirect URI changes needed for new domains

Because Google OAuth is configured against Supabase's fixed callback URL (not
your app's domain), a new Vercel deployment domain does **not** require any
changes in Google Cloud Console. If you add a **custom domain** in Vercel, no
Google/Supabase config changes are needed either — only your app's own
`redirectTo` (already computed from `window.location.origin` in
`app/login/page.tsx`) needs the domain to be reachable, which it is automatically.

### 5. Test production

Visit the deployed URL, sign in, and run through the checklist above.

---

## Troubleshooting

### Stuck on `/login?error=user_not_setup`

No `public.users` row exists for this account yet. See
[Provisioning Users & Roles](#provisioning-users--roles).

### `/login?error=missing_code` or `auth_failed`

The OAuth handshake didn't complete. Check that Google is enabled as a provider
in Supabase (**Authentication → Providers**) and that the Supabase callback URL
is registered in Google Cloud Console's **Authorized redirect URIs**.

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

### Image questions fail to submit

Confirm `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` matches an actual bucket name and
that the bucket allows the uploads/reads your policies need.

### Environment variable changes not taking effect on Vercel

**Settings → Environment Variables**, confirm values, then
**Deployments → (latest) → Redeploy**.
