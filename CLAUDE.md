# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies
npm run dev        # start dev server (Next.js, localhost:3000)
npm run build       # production build
npm run start       # run the production build
npm run typecheck    # tsc --noEmit
```

`npm run lint` is **not usable** — the repo has no ESLint config, so `next lint`
drops into an interactive setup prompt and lints nothing. Treat it as absent.
`npm run typecheck` alone is not enough before shipping: `next build` catches
route-level and server/client boundary errors that `tsc` doesn't.

### Playwright

There is no `test` script; run the suite directly. The specs are **evidence
capture for client review**, not an assertion suite — most of what they do is
drive a role's screens and write screenshots + a `manifest.json` under
`docs/client-review/screenshots` or `docs/standup-2026-08-10/screenshots`.

```bash
npx playwright test --project=brand           # needs `npm run dev` running
npx playwright test --project=artist          # also runs standup-fixes.spec.ts
npx playwright test --project=standup-video   # records a walkthrough video
npx playwright test --project=audience-video  # signed-out audience journey
```

- `workers: 1`, `fullyParallel: false` on purpose — captures build on state the
  previous ones set up.
- `tests/auth.setup.ts` (the `setup` project) signs the QA accounts in and
  writes `tests/.auth/*.json`; `brand`/`artist` depend on it. `audience-video`
  deliberately has no storageState — it starts from account creation.
- `tests/helpers.ts` reads `.env.local` itself (Playwright doesn't load it) and
  can mint confirmed users via the Supabase admin API, because the dev project
  has email confirmation on and a rate-limited mailer.
- `standup-video` runs against the **deployed** site by default
  (`WALKTHROUGH_URL` overrides). Everything else runs against localhost and the
  dev Supabase project — never production.

### Database

Schema lives in `supabase/migrations/*.sql`, applied in numeric order. Apply via
the Supabase SQL editor, the Supabase MCP `apply_migration`, or:

```bash
supabase db push
```

Env vars go in `.env.local` (copy from `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only),
`NEXT_PUBLIC_SITE_URL`, and optionally `GITHUB_FEEDBACK_REPO` / `GITHUB_TOKEN` /
`GITHUB_FEEDBACK_LABELS` for the feedback→GitHub mirror.

`NEXT_PUBLIC_SITE_URL` must equal the origin real users browse — it builds the
attendance QR code and the links inside confirmation/password-reset emails, so a
preview origin here sends attendees and new sign-ups to a Vercel SSO wall (L5 in
`lessons.md`).

Seeded QA test accounts (dev project only) are documented in `docs/qa-creds.md`.

## Shipping

**The live site deploys from the `liveensynergy` remote's `main`, not `origin`.**
Pushing to `origin` updates nothing anyone can see.

```bash
git push liveensynergy HEAD:main
```

Vercel deploys code; it does **not** run migrations. Those are applied by hand,
so a push can ship code querying columns production doesn't have yet — apply the
migration *before* pushing the code, and log it in `docs/database-migrations.md`
in the same commit. Read the pre-push checklist in `lessons.md` before any push
to `main`.

## Architecture

Live-En-Synergy is a sponsorship platform connecting Brands/Sponsors, Artists /
Event Organisers and Audience members. Next.js 15 App Router + React 19 +
TypeScript, Supabase (Postgres/Auth/RLS/Storage), Tailwind CSS v4.

### Roles are the organizing principle

Everything branches on `Role` (`brand | artist | event | audience | admin`,
defined in `src/lib/constants.ts`). Role drives which onboarding form renders,
the dashboard sidebar (`navForRole()` in `src/lib/dashboard-nav.ts`), which
role-specific table a profile joins to (`WORKSPACE_TABLE` in
`src/app/dashboard/layout.tsx`), RLS policies and server-action authorization.

Two things about the enum that the code does not make obvious:

- **`event` is legacy.** Artists and event organisers were merged (3 Aug
  standup) — they used the platform identically. `SIGNUP_ROLE_OPTIONS` offers
  three cards (brand / artist / audience); new organisers sign up as `artist`.
  `event`, `event_organisers` and the `onboarding/event/` form all still exist
  and must keep working for accounts created before the merge, and `event` gets
  nav identical to `artist`. Don't remove it; don't add new user-facing paths to it.
- **`admin` is assigned manually**, never chosen at sign-up.

### Supabase client pattern (3 entry points)

- `src/lib/supabase/client.ts` — browser client, for Client Components.
- `src/lib/supabase/server.ts` — server client for Server Components/Route Handlers/Server Actions; reads/writes cookies via `next/headers`.
- `src/lib/supabase/middleware.ts` (`updateSession`) — wired into `src/middleware.ts`. Refreshes the session, redirects unauthenticated users away from `/dashboard` and `/onboarding` (and signed-in users away from `/auth/sign-in|sign-up`), throttles a `touch_last_seen` write to once per 5 minutes via a cookie, and is the **single gate for account blocking**: an `is_active = false` profile is signed out and sent to `/auth/blocked` from wherever it is in the app. An automatic no-show suspension (`suspended_until` in the past) lifts itself here; a manual admin block does not.

`src/lib/profile.ts` layers on top of the server client:
- `requireProfile()` — auth user + `profiles` row, redirecting to sign-in if unauthenticated. The `profiles` row is created by the `handle_new_user` Postgres trigger, not application code — which is also how sign-up-time terms acceptance travels in (via `auth.users.raw_user_meta_data`).
- `requireRole(allowed)` — as above, plus redirects to `/dashboard` if the role isn't allowed.

`src/app/dashboard/layout.tsx` additionally redirects to `/onboarding` if there's no profile or `onboarding_completed` is false.

### Server actions convention

Each dashboard domain has its own `actions.ts` (16 of them, e.g.
`src/app/dashboard/campaigns/actions.ts`, `.../sponsored/actions.ts`,
`src/app/attend/[token]/actions.ts`) following the same shape:

1. A private `requireX()` helper that calls `createClient()`, checks auth, and fetches the caller's owned row (e.g. `requireBrand()` looks up the `brands` row for `user.id`, redirecting to onboarding if missing).
2. Actions accept `(prevState, formData)` and return `{ error?: string; message?: string }`, matching React's `useActionState` and shared `*State` interfaces (e.g. `CampaignState`, `AuthState`).
3. Mutations are always additionally scoped by owner id in the query itself (e.g. `.eq("brand_id", brandId)`) — RLS is the backstop, not the only check.
4. On success: `revalidatePath(...)` then `redirect(...)`. **An action that redirects back to a route it just mutated must revalidate that route** or Next's router cache re-serves the stale payload and the screen appears not to have changed (L6 — this cost a live bug).

Auth actions (`src/app/auth/actions.ts`) follow the same `(prevState, formData) -> AuthState` shape.

### Logic that lives in Postgres, not TypeScript

Some operations are `security definer` RPCs because RLS would otherwise make the
caller read or write zero rows, or because they need to be atomic. Call sites
use `supabase.rpc(...)`; changing the behaviour means a new migration, not a
code edit.

| RPC | Why it isn't application code |
|---|---|
| `agree_to_sponsorship()` | Accepting a sponsorship takes a row lock and re-checks conflicts inside the transaction. Doing it in app code with a read-then-write let two people confirm sibling proposals against one campaign budget. Two partial unique indexes back it up (one settled sponsorship per campaign, one per listing). Returns the withdrawn siblings' references so the caller can notify their owners — which it can't look up itself under RLS. |
| `enqueue_notification()` | Writes the in-app row and the `email_outbox` row together. |
| `phone_in_use()` | Answers "is this number taken?" without revealing whose. Scoped to `audience_members` only (0023) — one person, one audience account; artists and brands may reuse a number. |
| `admin_auth_activity()` | Hands admins the `auth.users.last_sign_in_at` mapping RLS hides. |
| `is_admin()`, `is_sponsored_event_party()`, `is_my_event_participant()`, `is_my_conversation_peer()` | Policy helpers. `security definer` so a policy on a table doesn't recurse through that table's own RLS. |

### Notifications

`notify()` / `notifyAdmins()` in `src/lib/notifications.ts` are the single entry
point, used from ~14 call sites. Two rules:

1. **It never throws.** A notification failing must not fail the sponsorship,
   registration or sign-up that triggered it — errors are logged and swallowed.
2. **There is no email provider yet.** Email is queued into `email_outbox`;
   draining it is unbuilt work. The outbox doubles as the audit log admins preview.

Behaviour is data, not code: `notification_events` (catalogue, keyed by a stable
string), `notification_settings` (per-event in-app/email toggles + CC/BCC) and
`notification_templates` (`{{token}}` bodies, editable by admins at
`/dashboard/admin/notifications`) are all rows. `notify()` **no-ops silently on an
unseeded event key**, so a new notification needs a migration inserting all three
rows. Unresolved tokens render literally as `{{reference}}`, so every token a
template uses needs a guaranteed fallback at the call site.

### Storage

Two buckets (migration 0009), wrapped by `src/lib/storage.ts`:

- `media` — public read via CDN; profile/banner images, event and campaign artwork. `uploadImage()` returns a permanent public URL.
- `private-uploads` — no public read; chat attachments, feedback screenshots, ticket proofs. `uploadPrivateFile()` returns a *path*, and `signedUrlFor()` signs it per render.

Every object is keyed `{profileId}/{purpose}/{uuid}.{ext}` — the storage policies
match on that first folder segment, so a user can only write inside their own
namespace. Size/type limits live in `src/lib/upload-limits.ts`. Both upload
helpers return `{}` for an empty file input, so callers treat "left blank" as
"don't change anything".

### Data model & RLS

Tables: `profiles`, `brands`, `artists`, `event_organisers`, `audience_members`,
`plans`, `campaigns` (brand-authored sponsorship proposals), `event_listings`
(artist/organiser-owned, sponsorable events), `sponsored_events` (confirmed
brand↔artist/listing deal), `participations` (audience sign-ups: `registered →
ticket_uploaded → attendance_verified → reward_released`, plus `rejected`),
`campaign_interests`, `conversations`/`messages` (+ attachments),
`sponsored_event_assets`, `notification_events`/`_settings`/`_templates`,
`email_outbox`, `feedback_reports`, `contact_messages`.

RLS is on every table: owner-only read/write via `profile_id = auth.uid()`,
`is_admin()` grants admins full access, plus deliberately wider reads —
`event_listings` with `status = 'available'` is publicly readable,
`sponsored_events` with `status in ('confirmed','completed')` is readable by any
signed-in user (audience discovery), `contact_messages` allows public insert.
Public profile pages read through `public_*_profiles` **views** with explicit
column lists — adding a profile column that should be public means re-declaring
the view too (that's what 0016 was).

`campaigns`, `event_listings`, `sponsored_events` and `feedback_reports` each
carry a human-facing sequential `reference` (`CMP-00001`, `EVT-`, `SPE-`,
`FB-`). References are **display-only** — every link and foreign key uses the
uuid.

TypeScript shapes in `src/lib/types.ts` mirror this schema by hand (no generated
types checked in); run `supabase gen types typescript` if the CLI is linked and
types drift.

`docs/database-migrations.md` logs what every numbered migration does and why —
read it before writing a new one. Migrations should be **additive** (new
nullable-or-defaulted columns, new tables/indexes) so a live database can always
pick up the latest file safely. Additive DDL is not the same as semantic safety:
if new code reads an *existing* column differently, the migration needs a
backfill `update` too (L4).

### Money

`src/lib/constants.ts`:

- `computePlatformFee(gross)` — the platform's take: greater of £315+VAT or 9%+VAT. The flat minimum dominates below £3,500, so small budgets are mostly fee. That's the model.
- `MIN_SPONSORSHIP_BUDGET_GBP` (£378) — below this the fee consumes the whole budget and `availableForSponsorship` goes negative, so campaigns are rejected at that floor.
- `netSponsorshipBudget(gross)` — gross minus fee inc. VAT. **This, not the gross figure, is what `sponsored_events.remaining_budget_gbp` starts at** and what every "remaining budget" / "people this can sponsor" number derives from.
- `roundMoney()` — use it for repeated arithmetic so pence don't drift.

### Event dates and times

Listings store a local calendar date, an optional local clock time, and the IANA
zone (0013) — wall-clock + zone, deliberately not a UTC instant, so "doors
19:30" stays 19:30 across a GMT/BST change. Always format through
`formatEventDateTime()` in `src/lib/event-time.ts`; it resolves the right
abbreviation for that specific date (July reads BST, December GMT).

### URLs in forms

Profile/listing web-address fields are plain text, not `<input type="url">` —
the native validation blocked whole forms when someone typed `example.com`.
`normaliseUrl()` / `normaliseUrlFields()` / `displayUrl()` in `src/lib/urls.ts`
add the scheme on the way in and strip it for display. Use them rather than
storing raw input.

### Styling

Tailwind v4 via `@theme` tokens in `src/app/globals.css` (single global
stylesheet, no CSS modules/CSS-in-JS). Brand tokens: `--color-brand` (CTA
orange), `--color-ink`/`--color-ink-soft`, `--color-mist` (cream background),
plus per-portal accent tints (`lavender`/`purple`, `olive`, `gold`, `sage`,
`mint`, `pink`). Reusable primitives are plain CSS classes, not React
components: `.btn`/`.btn-primary`/`.btn-ghost`/`.btn-dark`/`.btn-white`,
`.input`/`.textarea`/`.select`, `.card`, `.chip`, `.field-label`/`.field-hint`.

Those primitives are wrapped in `@layer components` — **keep them there.**
Unlayered CSS beats Tailwind's `@layer utilities` regardless of specificity, so
outside a layer `.select { width: 100% }` silently defeats every `w-[8rem]` /
`w-auto` on a call site. That shipped a phone field with nowhere to type (L3).

`docs/STYLE_GUIDE.md` describes a different, unrelated project's ("The Raising
Club") theme and file layout — none of it matches this repo. Treat
`src/app/globals.css` as the source of truth.

### Route structure

- `src/app/(marketing)/` — public pages (about, contact, events, faqs, terms, privacy), own layout.
- `src/app/auth/` — sign-in/up, password reset, `blocked`, email confirmation callback (`auth/callback/route.ts`), sign-out (`auth/sign-out/route.ts`).
- `src/app/onboarding/` — role router (`page.tsx`) + one form per role; the same form components are reused by the dashboard profile-edit page.
- `src/app/attend/[token]/` — public QR self-check-in. The artist displays the QR at the venue (one stable `sponsored_events.attendance_qr_token`); attendees scan it and confirm their own attendance. Reachable signed-out, which redirects to sign-in preserving `redirectTo`.
- `src/app/dashboard/` — shared shell (`layout.tsx`, `Sidebar`), one subfolder per domain (`campaigns`, `events`, `sponsored`, `discover`, `discover-campaigns`, `offers`, `participations`, `rewards`, `messages`, `notifications`, `feedback`, `resources`, `profile`, `settings`, `admin/*`). Not every domain folder is relevant to every role — nav visibility scopes it, `requireRole`/ownership-scoped queries/RLS enforce it.

Path alias: `@/*` → `./src/*`.

## Reference docs

- `README.md` — setup/getting-started, tech stack, project structure, key flows.
- `docs/PLATFORM.md` — full screens list, per-role user journeys, planned integrations (Stripe, KYC, transactional email, realtime chat), V1 status vs. roadmap.
- `lessons.md` — post-mortems of issues that reached the client, plus the **pre-push / post-deploy checklist. Read it before pushing to `main`.**
- `docs/database-migrations.md` — running log of every numbered migration; migrations are applied manually, not by the deploy.
- `docs/qa-creds.md` — seeded dev-only test accounts and how to add more.
- `docs/TEST-CASES.md`, `docs/standup-*-tracker.md`, `docs/standup-*-testing-log.md` — client review items and their status; the standup trackers are what recent commits are working through.
- `docs/payments-kyc-strategy.md`, `docs/email-branding-research.md` — design notes for work not yet built.
