# Live-En-Synergy

A performance-based sponsorship platform for live events. Brands fund real
attendance, artists and organisers secure confirmed audiences, and fans get
their tickets reimbursed through sponsor-funded rewards.

This repository ships the working platform: **landing + marketing pages,
role-first authentication, role-based onboarding, editable profiles, and the
full dashboard loop** — brand campaigns, artist/event listings, event
discovery, sponsor↔artist chat, the sponsored-event workspace (terms, dual
agreement, participant selection → verification → reward release), audience
participation & rewards, and an admin console — all backed by the Postgres
schema with Row Level Security.

## Tech stack

- **Next.js 15** (App Router, React 19, TypeScript)
- **Supabase** — Postgres, Auth, Row Level Security
- **Tailwind CSS v4**

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project, then copy the env template and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Description |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Your project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-only) |
   | `NEXT_PUBLIC_SITE_URL` | e.g. `http://localhost:3000` |

3. Apply the database schema. Either run the SQL files in
   `supabase/migrations` in order via the Supabase SQL editor, or use the CLI:

   ```bash
   supabase db push
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

## Project structure

```
src/
  app/
    page.tsx                 Landing page
    (marketing)/             About, Contact, FAQs, Terms, Privacy, Events
    auth/                    Sign in / sign up (role-first) / callback / sign-out
    onboarding/              Role-based onboarding forms + server actions
    dashboard/               Responsive dashboard shell, overview, profile editor
  components/                UI kit, landing sections, dashboard sidebar
  lib/
    supabase/                Browser / server / middleware clients
    constants.ts             Categories, roles, pricing model
    types.ts                 Table shapes
    dashboard-nav.ts         Role-based navigation
supabase/
  migrations/
    0001_schema.sql          Enums, tables, triggers
    0002_policies.sql        Row Level Security policies
docs/
  PLATFORM.md                Screens list, user journeys, integrations, roadmap
```

## Key flows

- **Role-first sign-up** — new users choose whether they're a Brand/Sponsor,
  Artist, Event Organiser or Audience member *before* creating an account.
- **Onboarding** — each role gets a tailored, multi-section form collecting the
  fields from the concept doc. A Postgres trigger creates the `profiles` row
  from the sign-up metadata.
- **Editable profiles** — the same forms power the dashboard **Profile** page in
  edit mode, so every field stays editable.

See [`docs/PLATFORM.md`](docs/PLATFORM.md) for the full screens list, user
journeys and planned integrations.
