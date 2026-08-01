# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies
npm run dev        # start dev server (Next.js, localhost:3000)
npm run build       # production build
npm run start       # run the production build
npm run lint        # next lint
npm run typecheck    # tsc --noEmit
```

There is no test suite/runner configured (no `test` script, no test files).

### Database

Schema lives in `supabase/migrations/*.sql`, applied in numeric order. Apply via the Supabase SQL editor, or with the CLI:

```bash
supabase db push
```

Env vars go in `.env.local` (copy from `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `NEXT_PUBLIC_SITE_URL`.

Seeded QA test accounts (dev project only) are documented in `docs/qa-creds.md`.

## Architecture

Live-En-Synergy is a sponsorship platform connecting Brands/Sponsors, Artists, Event Organisers and Audience members. Next.js 15 App Router + React 19 + TypeScript, Supabase (Postgres/Auth/RLS), Tailwind CSS v4.

### Roles are the organizing principle

Everything branches on `Role` (`brand | artist | event | audience | admin`, defined in `src/lib/constants.ts`). A user picks their role at sign-up (`ROLES`/`SIGNUP_ROLE_OPTIONS`); `admin` is assigned manually and never chosen at sign-up. Role drives:
- Which onboarding form renders (`src/app/onboarding/{brand,artist,event,audience}/`)
- Dashboard sidebar nav (`navForRole()` in `src/lib/dashboard-nav.ts`)
- Which role-specific table a profile joins to (`brands` / `artists` / `event_organisers` / `audience_members`), see `WORKSPACE_TABLE` in `src/app/dashboard/layout.tsx`
- RLS policies and server-action authorization (see below)

### Supabase client pattern (3 entry points)

- `src/lib/supabase/client.ts` — browser client, for Client Components.
- `src/lib/supabase/server.ts` — server client for Server Components/Route Handlers/Server Actions; reads/writes cookies via `next/headers`.
- `src/lib/supabase/middleware.ts` (`updateSession`) — refreshes the auth session on every request and redirects unauthenticated users away from `/dashboard` and `/onboarding`; signed-in users away from `/auth/sign-in|sign-up`. Wired into `src/middleware.ts`.

`src/lib/profile.ts` layers on top of the server client:
- `requireProfile()` — gets the auth user + `profiles` row, redirecting to sign-in if unauthenticated. The `profiles` row itself is created by the `handle_new_user` Postgres trigger (`supabase/migrations/0001_schema.sql`), not application code.
- `requireRole(allowed)` — like above, plus redirects to `/dashboard` if the profile's role isn't in `allowed`. Use this to scope a page/action to specific roles.

`src/app/dashboard/layout.tsx` additionally redirects to `/onboarding` if there's no profile or `onboarding_completed` is false, and shows a locked-out screen if `profile.is_active` is false (admin-deactivated accounts).

### Server actions convention

Each dashboard domain has its own `actions.ts` (e.g. `src/app/dashboard/campaigns/actions.ts`, `.../events/actions.ts`, `.../sponsored/actions.ts`) following the same shape:
1. A private `requireX()` helper that calls `createClient()`, checks auth, and fetches the caller's owned row (e.g. `requireBrand()` looks up the `brands` row for `user.id`, redirecting to onboarding if missing).
2. Actions accept `(prevState, formData)` and return `{ error?: string; message?: string }`, matching React's `useActionState` and shared `*State` interfaces (e.g. `CampaignState`, `AuthState`).
3. Mutations are always additionally scoped by owner id in the query itself (e.g. `.eq("brand_id", brandId)`) — RLS is the backstop, not the only check.
4. On success: `revalidatePath(...)` then `redirect(...)`.

Auth actions (`src/app/auth/actions.ts`) follow the same `(prevState, formData) -> AuthState` shape for sign-up/sign-in/sign-out/password reset.

### Data model & RLS

Tables (see `supabase/migrations/0001_schema.sql`, `0003_admin_plans.sql`): `profiles`, `brands`, `artists`, `event_organisers`, `audience_members`, `plans`, `campaigns` (brand-authored sponsorship proposals), `event_listings` (artist/organiser-owned, sponsorable events), `sponsored_events` (confirmed brand↔artist/listing sponsorship, budget/terms/dual-agreement), `participations` (audience sign-ups to a sponsored event, selection → ticket proof → attendance verification → reward release), `conversations`/`messages` (brand↔artist chat), `contact_messages` (public contact form).

RLS is enabled on every table (`0002_policies.sql`): owner-only read/write via `profile_id = auth.uid()`, `is_admin()` (a `security definer` function, used to avoid recursive policy checks) grants admins full access, and a few tables have deliberately wider read access — `event_listings` with `status = 'available'` is publicly readable, `sponsored_events` with `status in ('confirmed','completed')` is readable by any signed-in user (for audience discovery), `contact_messages` allows public insert.

TypeScript shapes in `src/lib/types.ts` mirror this schema by hand (no generated types checked in); run `supabase gen types typescript` if the CLI is linked and types drift.

### Fee model

`computePlatformFee()` in `src/lib/constants.ts` implements the platform's take: the greater of £315+VAT or 9%+VAT of the sponsorship budget. Used anywhere a budget/available-for-sponsorship preview is shown (e.g. campaign creation).

### Styling

Tailwind v4 via `@theme` tokens in `src/app/globals.css` (single global stylesheet, no CSS modules/CSS-in-JS). Brand tokens: `--color-brand` (CTA orange), `--color-ink`/`--color-ink-soft` (text), `--color-mist` (cream background), plus per-portal accent tints (`lavender`/`purple`, `olive`, `gold`, `sage`, `mint`, `pink`). Reusable primitives are plain CSS classes, not React components: `.btn`/`.btn-primary`/`.btn-ghost`/`.btn-dark`/`.btn-white`, `.input`/`.textarea`/`.select`, `.card`, `.chip`, `.field-label`/`.field-hint`.

`docs/STYLE_GUIDE.md` describes a different, unrelated project's ("The Raising Club") theme and file layout (`src/app/[locale]/layout.tsx`, `src/components/app/`, etc.) — none of that matches this repo's actual structure. Don't use it as a reference for this codebase; treat `src/app/globals.css` as the source of truth for tokens/primitives.

### Route structure

- `src/app/(marketing)/` — public pages (about, contact, events, faqs, terms, privacy), own layout.
- `src/app/auth/` — sign-in/up, password reset, email confirmation callback (`auth/callback/route.ts`), sign-out (`auth/sign-out/route.ts`).
- `src/app/onboarding/` — role router (`onboarding/page.tsx`) + one form per role; the same form components are reused by the dashboard profile-edit page.
- `src/app/dashboard/` — shared shell (`layout.tsx`, `Sidebar`), one subfolder per domain (`campaigns`, `events`, `sponsored`, `discover`, `offers`, `participations`, `rewards`, `messages`, `profile`, `settings`, `admin/*`). Not every domain folder is relevant to every role — nav visibility is what scopes it, actual access is enforced by `requireRole`/ownership-scoped queries/RLS.

Path alias: `@/*` → `./src/*`.

## Reference docs

- `README.md` — setup/getting-started, tech stack, project structure, key flows.
- `docs/PLATFORM.md` — full screens list, per-role user journeys, planned integrations (Stripe, KYC, QR attendance, transactional email, realtime chat), V1 status vs. roadmap.
- `docs/qa-creds.md` — seeded dev-only test accounts and how to add more.
- `lessons.md` — post-mortems of issues that reached the client, plus the pre-push / post-deploy checklist. **Read the checklist before pushing to `main`.** Key fact it records: the live site deploys from the `liveensynergy` remote's `main`, not from `origin`.
- `docs/database-migrations.md` — running log of what every numbered migration does; migrations are applied manually, not by the deploy.
