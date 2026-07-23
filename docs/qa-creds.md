# QA test accounts

Local/dev-only test accounts, seeded directly into the Supabase `auth.users`
table (bypassing email confirmation) for manual and automated (Playwright)
testing of the authenticated app. All accounts have completed onboarding.

**Do not use in production.** These exist only in the dev Supabase project
wired up in `.env.local` (project ref `oalqfzaejflgrtyfrrrb`).

| Role     | Email                          | Password       | Workspace / name          |
| -------- | ------------------------------- | --------------- | -------------------------- |
| Brand    | `brand.tester@example.com`      | `TestPass123!`  | Northwave Coffee            |
| Artist   | `artist.tester@example.com`     | `TestPass123!`  | The Midnight Collective     |
| Audience | `audience.tester@example.com`   | `TestPass123!`  | Priya Shah                  |
| Admin    | `admin.tester@example.com`      | `TestPass123!`  | Sakshi Admin                |

The **admin** account lands on `/dashboard/admin` and can manage every other
account from `/dashboard/admin/users` — including blocking them. If you block
one of the other test accounts, remember to restore it before re-running the
automated suites, or their sign-in steps will fail.

Sign in at `/auth/sign-in`. Brand/artist have a seeded campaign / event
listing so the dashboard home, campaigns/events lists, and discover pages
have real data to render. There's also a `sponsored_events` row (status
`confirmed`, linking that campaign + listing) so the audience account can
register, upload proof, and see the reward tracker populate on its dashboard
home.

To add another test account (e.g. for the `event` or `audience` role), run
against the project via the Supabase SQL editor / MCP `execute_sql`:

```sql
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  '<email>', crypt('<password>', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"<name>","role":"<brand|artist|event|audience>"}'::jsonb,
  now(), now(), '', '', '', ''
);
```

The `handle_new_user` trigger creates the matching `profiles` row
automatically; the role-specific profile row (`brands` / `artists` / etc.) is
created the first time that account completes onboarding.
