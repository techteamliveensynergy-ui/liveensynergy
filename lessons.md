# Lessons learned

A running log of issues that reached the client, what actually caused them, and
the rule that stops each one recurring. Add to this whenever something gets
reported that a check could have caught first.

The pre-push checklist at the bottom is the practical output of this file — run
it before anything goes live.

---

## Quick reference: where things live

| Thing | Value |
|---|---|
| Live site | https://liveensynergy-rho.vercel.app |
| **Deploys from** | remote `liveensynergy` (`techteamliveensynergy-ui/liveensynergy`), branch **`main`** |
| Working repo | remote `origin` (`Ketankham/live-en-sync`) — **deploys nothing** |
| Local working branch | `claude/landing-signin-onboarding-ts0n3p` |
| Supabase project | `oalqfzaejflgrtyfrrrb` (`.env.local` → `NEXT_PUBLIC_SUPABASE_URL`) |
| Migrations | `supabase/migrations/*.sql`, applied **manually** — see `docs/database-migrations.md` |
| Issue tracker | https://github.com/techteamliveensynergy-ui/liveensynergy/issues |

Ship command:

```bash
git push liveensynergy HEAD:main
```

---

## L1 — "The new changes aren't showing" was a deploy gap, not a bug

**Reported:** [issue #1](https://github.com/techteamliveensynergy-ui/liveensynergy/issues/1),
1 Aug 2026 — *"if I login to an existing audience portal, the new changes won't
show there. For example, on the overview section having 5 cards."*

**What happened.** The 31 Jul Admin/Audience Portal review batch (commit
`4044474`) was committed locally and pushed to `origin`. It was never pushed to
`liveensynergy`, whose `main` was still on 29 Jul's `280a6e7`. The live site had
been serving two-day-old code the whole time. Every audience account saw the old
4-card overview — new accounts included.

**Why the report was misleading.** It was framed as an existing-account problem,
which points you straight at data, RLS, or caching. All three were fine. Pushing
to `origin` *feels* like shipping because the push succeeds and the branch
updates — but nothing downstream watches that remote.

**How it was actually diagnosed — the two techniques worth reusing:**

1. **Find static text that changed.** The screenshot's bottom tile read
   "My events"; the missing commit had renamed it to "My participated events"
   (`src/app/dashboard/AudienceHome.tsx`). Hardcoded copy cannot vary by account,
   by role, or by database state. If the deployed copy differs from the source,
   the build is old — no further investigation needed.
2. **Probe a route the commit added.** `/attend/[token]` was new in `4044474`.
   On the live site it returned `404`, while `/` and `/dashboard` responded
   normally — so the app was healthy but that route didn't exist in the build.
   After the push it returned `307 → /auth/sign-in?redirectTo=/attend/<token>`,
   matching the new source exactly. This is a public, unauthenticated,
   five-second check.

   ```bash
   curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
     https://liveensynergy-rho.vercel.app/attend/00000000-0000-0000-0000-000000000000
   ```

**Rules.**

- Pushing to `origin` is not shipping. `git push liveensynergy HEAD:main` is.
- Before debugging *any* "it's not showing on live" report, run
  `git log liveensynergy/main..HEAD --oneline`. If it prints anything, that's
  your answer — stop and check nothing else.
- After every push to `main`, verify the deploy actually swapped (see the
  post-deploy section below). A green push is not a green deploy.

---

## L2 — Code and schema deploy on separate tracks

Vercel deploys code. It does **not** run `supabase/migrations/*.sql` — those are
applied by hand via the Supabase SQL editor or `supabase db push`. So a push can
ship code that queries columns the production database doesn't have yet, and the
failure shows up as a runtime error in the client's face, not a build failure.

`4044474` happened to be safe because `0018_portal_fixes.sql` had already been
applied. That was luck, not process.

**Rules.**

- If the commits you're pushing touch `supabase/migrations/`, apply the migration
  **before** pushing the code, not after. Additive migrations (new
  nullable-or-defaulted columns, new tables/indexes) are safe to apply ahead of
  the code that uses them; that's why they're written that way.
- Verify the columns actually exist in production rather than assuming — see the
  checklist.
- Log every new migration in `docs/database-migrations.md` in the same commit.

~~**Open item:** the Vercel deployment's own env vars have never been checked
against `.env.local`.~~ **Settled 1 Aug 2026:** the seeded QA account
`audience.tester@example.com` — which exists only in project
`oalqfzaejflgrtyfrrrb` — signs in successfully on the live site, so the
deployment does use the same Supabase project as `.env.local`. Worth
re-confirming with `vercel env pull` if the Vercel CLI ever gets installed.

---

## L3 — "Resolved" in a review doc meant "code written", not "works on screen"

**Found:** 1 Aug 2026, verifying the `Admin Portal.docx` / `Audience Portal.docx`
items on the live site after L1.

Every audience item in the docx was marked *Resolved (31 Jul 2026)*, and the
code genuinely implemented each one. But the phone-split item (U1) shipped
**visibly broken** and nobody caught it, because "resolved" was assessed from
the diff rather than from the rendered page.

**The defect.** On `/dashboard/profile`, the "Phone number *" field renders the
country-code dropdown at full row width and collapses the actual number input to
a 29px stub — there is nowhere to type a phone number.

```
select.select.w-[8rem].shrink-0  →  computed width: 459.2px   ← w-[8rem] (128px) ignored
input.input.flex-1               →  computed width:  28.8px   ← padding+border only,
                                                                 content box ≈ 0px
```

**Root cause — a Tailwind v4 cascade trap worth internalising.** `src/app/globals.css`
defines the shared primitives as plain, *unlayered* CSS:

```css
.input, .textarea, .select { width: 100%; ... }
```

Tailwind v4 emits its utilities inside `@layer utilities`. In the CSS cascade,
**unlayered rules beat layered ones regardless of specificity or source order**.
So `.select { width: 100% }` wins over the `w-[8rem]` utility, every time. Add
`shrink-0` and the select refuses to shrink back, so it eats the whole flex row
and its sibling collapses.

This is not a one-off — it silently affects every call site that tries to
constrain a `.input`/`.select` with a width utility:

| File | Class | Intended | Actual |
|---|---|---|---|
| `src/components/ui/PhoneInput.tsx:40` | `select w-[8rem] shrink-0` | 128px | full width — **breaks the number input** |
| `src/app/dashboard/admin/participants/EventFilterSelect.tsx:17` | `select w-auto` | hug content | full width |
| `src/app/dashboard/admin/users/UserFilters.tsx:138` | `select w-auto` | hug content | full width |
| `src/app/dashboard/admin/campaigns/page.tsx:181` | `select w-auto` | hug content | full width |
| `src/app/dashboard/admin/events/page.tsx:229` | `select w-auto` | hug content | full width |
| `src/app/dashboard/admin/events/sponsored/[id]/page.tsx:214` | `select w-auto` | hug content | full width |
| `src/app/dashboard/admin/events/sponsored/[id]/page.tsx:416` | `input w-20` | 80px | full width |
| `src/app/dashboard/sponsored/[id]/page.tsx:573` | `input w-24` | 96px | full width |

Only the `PhoneInput` one is functionally broken; the rest are cosmetic. But
they all share a single root cause, so they all get fixed by one change.

**The fix.** Wrap the primitives in `@layer components` in `globals.css` so
Tailwind utilities can override them:

```css
@layer components {
  .input, .textarea, .select { width: 100%; ... }
}
```

**Rules.**

- A width/flex utility on `.input`, `.select`, `.textarea`, `.btn` or `.card`
  **does nothing** until `globals.css` moves those rules into `@layer components`.
  Until then, don't trust the class you wrote — look at the rendered element.
- "Implemented" is not "verified". Before writing *Resolved* against a review
  item, open the actual screen in a browser and look at it. A diff cannot show
  you a collapsed input.
- For any item that changes a form, the verification is *use the form*, not
  *see the form*. The country dropdown was plainly visible in the screenshot;
  only the missing sibling revealed the bug.

**Status:** fixed 1 Aug 2026 — `globals.css` now wraps the form primitives in
`@layer components`. This also restores the intended padding on the small admin
inputs (`px-2 py-1` was being beaten by `.input`'s own padding for the same
reason). Re-check those screens after deploying.

---

## L4 — A migration that reinterprets an existing column needs a backfill

**Found:** 1 Aug 2026, same sweep as L3.

`0018_portal_fixes.sql` added `audience_members.phone_country_code` with
`default '+44'` and the UI started treating `phone` as *the local part only*.
Nothing rewrote the existing `phone` values, which still contain the dialling
code — so the two fields now double up:

| Account | `phone_country_code` | `phone` | Renders / exports as |
|---|---|---|---|
| Abhishek Sharma | `+44` | `07775199436` | `+44 07775199436` (trunk `0` kept) |
| Jordan Avery | `+44` | `+44 7700 900123` | `+44 +44 7700 900123` |
| Priya Shah | `+44` | `+44 7700 900123` | `+44 +44 7700 900123` |

The admin CSV export concatenates them (`${phone_country_code} ${phone}` —
`participants/export/route.ts:88`), so every exported number is malformed. That
export is the artefact the client filters to run reward selection, so this is
data they'd actually act on.

**Why the migration doc's safety claim didn't cover it.** `docs/database-migrations.md`
correctly states 0018 is "additive only — nothing existing is renamed, dropped,
or has its type or constraints changed." That's true and still missed this:
**the column was additive, but the *meaning* of a neighbouring column changed.**
Additive DDL is about schema safety, not semantic safety.

**Status:** fixed 1 Aug 2026 — `0019_phone_backfill.sql` written, dry-run
against live data first, then applied. All three rows corrected
(`+44 7700 900123` → `7700 900123`, `07775199436` → `7775199436`) and verified
in the admin UI. Note the migration was **applied by hand after the deploy** —
pushing the file does nothing on its own (L2).

**Rules.**

- When a migration changes how an existing column is *interpreted*, ship a
  backfill `update` in the same migration — additive DDL is not sufficient.
- Ask of every migration: "is there a row already in this table for which the
  new code reads the old data wrongly?" Schema-compatible ≠ data-correct.
- Check the *rendered* value for a pre-existing record, not just a newly created
  one. A fresh sign-up would have looked perfect here.

---

## L5 — `NEXT_PUBLIC_SITE_URL` points at an SSO-walled domain

**Found:** 1 Aug 2026, verifying admin item A4 (QR check-in).

The QR code and check-in link generated for a sponsored event pointed at
`liveensynergy-liveensynergy.vercel.app`, not the live host
`liveensynergy-rho.vercel.app`. That domain has Vercel deployment protection on:

```
liveensynergy-liveensynergy.vercel.app/attend/<token> → 302 → vercel.com/sso-api  ← login wall
liveensynergy-rho.vercel.app/attend/<token>           → 307 → /auth/sign-in       ← correct
```

An audience member scanning the QR at a venue gets a Vercel SSO page. The
feature is fully built and completely unusable in production.

**Blast radius is wider than the QR.** The same env var builds the links inside
transactional auth emails:

| Site | Uses `NEXT_PUBLIC_SITE_URL` for |
|---|---|
| `src/lib/attendance.ts:3` | QR code + check-in link |
| `src/app/auth/actions.ts:42` | sign-up email confirmation link |
| `src/app/auth/actions.ts:139` | password reset link |

So new sign-ups confirming their email, and anyone resetting a password, are
also being sent to the login wall. This went unnoticed because the seeded QA
accounts are inserted pre-confirmed and never exercise either email.

**Fix:** it's a Vercel config change, not a code change — set
`NEXT_PUBLIC_SITE_URL` to the real public origin and redeploy.

**Status:** fixed 1 Aug 2026 — `NEXT_PUBLIC_SITE_URL` repointed at
`https://liveensynergy-rho.vercel.app` and redeployed. Verified: the admin
page's check-in link and the QR image (both from `attendUrl()`) now use the
live host, and a logged-out hit on that URL 307s to sign-in with `redirectTo`
preserved instead of bouncing to `vercel.com/sso-api`. Sign-up confirmation and
password-reset emails are fixed by the same change but were **not** re-tested —
worth one manual pass.

**Rules.**

- Any env var that ends up in a **user-facing URL** must equal the origin real
  users browse. Verify by loading a generated link in a logged-out context, not
  by reading the setting.
- Preview/protected deployment URLs must never leak into QR codes, emails, or
  anything that outlives the session that produced it.
- Seeded QA accounts skip email flows entirely, so email-borne links have *no*
  test coverage here. Exercise them manually after any change to site URL,
  auth, or email templates.

---

## L6 — A server action that redirects to its own route must revalidate first

**Found:** 1 Aug 2026, running the QR check-in end to end on the live site.

Tapping **Confirm my attendance** wrote the correct data — status
`ticket_uploaded → attendance_verified`, `attendance_verified_at` stamped — but
the screen did not change. It re-rendered the same "Confirm you're here" prompt
with the button still there. Only a manual reload revealed "Attendance
confirmed".

At a venue that reads as a failed scan: the attendee taps again, or gives up and
queues for manual verification — defeating the point of the feature. The bug is
invisible to any check that only looks at the database.

**Cause.** `confirmAttendance` did `update(...)` then `redirect('/attend/'+token)`
with no `revalidatePath`, so Next's client router cache re-served the stale RSC
payload for a route whose data had just changed. `CLAUDE.md` already documents
the convention — *"On success: `revalidatePath(...)` then `redirect(...)`"* — and
this action was the one place that skipped it.

**Fixed** 1 Aug 2026 (`src/app/attend/[token]/actions.ts`): revalidates
`/attend/[token]` and `/dashboard/participations` before redirecting.

**Rules.**

- Any server action that redirects **back to a route it just mutated** needs
  `revalidatePath` on that route. Redirecting to a *different* page usually
  masks the problem, which is why this pattern is the one that bites.
- Verify a write by looking at **the screen the user is left on**, not just the
  row in the database. Both were needed here to see the whole bug.
- End-to-end means driving the real UI as the real role. Reading the action's
  source would not have surfaced this.

---

## L7 — RLS is not a `where` clause: a read left unscoped showed rival brands' deals

**Found:** 11 Aug 2026, writing a Playwright check for the 10 Aug batch. The
test opened "the first sponsorship in the brand's list" and then couldn't find
the participants panel — because the sponsorship it had opened **belonged to a
different brand**.

`src/app/dashboard/sponsored/page.tsx` selected every row and left the
filtering to the database:

```ts
// RLS returns only the sponsored events this user is a party to.   ← wrong
const { data } = await supabase.from("sponsored_events").select("*")
```

The comment was the bug. `0002_policies.sql` has **two** policies on that
table, and they're additive:

```sql
create policy "sponsored_events: parties or admin" …   -- the one the comment means
create policy "sponsored_events: public read confirmed"
  on sponsored_events for select
  using (status in ('confirmed', 'completed'));        -- the one it forgot
```

The second exists so the **audience** can discover events. It also applies to
brands and artists, because a policy has no idea which page is asking. So
Northwave Coffee's own "Sponsored events" page listed Fire X's confirmed
deals — name, date, and *"£7,036 for rewards"* — and `/dashboard/sponsored/<id>`
rendered a rival's budget, service fee and remaining pool to anyone with the
link. Terms and the participant list were correctly gated on being a party;
the money was not.

Verified with real data before fixing: signed in as Northwave Coffee, two of
the five rows returned belonged to Fire X, carrying £8,000 and £4,000 budgets.

**Fixed** 11 Aug 2026 — the list is scoped by `brand_id` / `artist_profile_id`
like every other page in the codebase already was, and the detail page
`notFound()`s for anyone who isn't a party. Regression tests `D2` / `D2b` in
`tests/standup-0810-brand.spec.ts`; the rival's id is handed to the brand
project by the admin project, because the brand deliberately can't discover it.

**Rules.**

- `CLAUDE.md` says mutations are scoped by owner id "in the query itself — RLS
  is the backstop, not the only check." **That applies to reads.** This page was
  the one place that didn't, and it's the one that leaked.
- Before trusting a policy, count the policies on that table. `PERMISSIVE`
  policies are OR-ed: a second, wider one silently defeats the first. Grep the
  migrations for the table name rather than recalling "there's a policy on it".
- A comment asserting a security property is a claim that needs a test, not
  documentation. This one was wrong for months and read as reassuring.
- Deliberately-wide read policies (`public read confirmed`, `status =
  'available'`) exist for one audience and one screen. Write down which, and
  scope every *other* screen explicitly.

**Still open — the API-level exposure.** The fix is at the page level. The RLS
policy is unchanged, so a signed-in brand can still read another brand's
confirmed sponsorship — budget columns included — by calling PostgREST
directly. Closing that properly means either column privileges or an
audience-facing view that omits the money (the pattern `open_campaigns`
already uses to hide campaign-manager contact details). Worth doing before
launch; it wasn't in the 10 Aug scope.

---

## L8 — Don't report a result from the component the result destroys

**Found:** 11 Aug 2026, testing the new random selection draw.

Running the draw worked — the right participant was selected, `selected_at`
stamped, the notification sent. The screen said **nothing at all**. The draw
panel simply vanished.

`runSelectionDraw` returned `{ message: "Drew 1 of 1 waiting…" }` through
`useActionState`, and `SelectionDrawForm` rendered it. But the parent only
renders that form `{waiting > 0 && …}`, and the draw is what takes `waiting` to
zero. So the successful path revalidated, the form unmounted, and the message
went with it. The admin is left looking at a control that disappeared, with no
statement of what it did.

This is L6's family — a correct write with nothing on screen to show for it —
but a different cause. L6 was a stale cache; this is a *fresh* render that
correctly no longer contains the messenger.

**Fixed** 11 Aug 2026: the action redirects to `?notice=draw&drawn=N&pool=M`
and the page renders the result, so it survives the form going away.

**Rules.**

- If a successful action changes the condition that renders its own form, the
  confirmation cannot live inside that form. Put it on the page — the
  `?notice=` pattern this codebase already uses in `sponsored/[id]`,
  `participations` and `messages`.
- Ask of every success message: *what does this action change, and does that
  change remove the thing displaying the message?* Emptying a list, completing
  the last item, transitioning out of a status — all of these hide their own
  form.
- Test the **last** one, not the first. Drawing 1 of 5 would have shown the
  message perfectly; it was drawing the last of the pool that broke it. Same
  for "delete the last row", "approve the final request".

---

## L9 — Naming people by their login name makes an admin picker useless

**Found:** 11 Aug 2026, testing the new admin "start a chat" control.

The picker listed `profiles.full_name`. On real data that produced two entries
reading **"Sakshi Gulati"** (one a brand, one an artist), an entry called
"Artist Tester", and nothing anywhere called "Northwave Coffee" or "The
Midnight Collective" — the names the team actually uses for these accounts.
Choosing the right one was guesswork. The same was true of the thread list,
which is what the 10 Aug standup asked to be made readable in the first place.

**Fixed** 11 Aug 2026: the picker and the thread labels lead with the act or
brand, falling back to the person's name.

The first attempt read the role tables directly, which are owner-only under
RLS — so it worked for an admin and nobody else, and an artist still saw
"Brand Tester" instead of "Northwave Coffee". The `public_*_profiles` views
already expose `profile_id` + the display name and are granted to `anon,
authenticated` (they back the public profile pages), so reading through those
gives every viewer the right label with **no new permission and no migration**.

**Rules.**

- A platform account has two names: the person who logs in, and the thing they
  represent. Anywhere staff pick or scan accounts, lead with the workspace
  name — that's the one on the campaign, the listing and the invoice.
- Seeded test data hides this. "Brand Tester" and "Artist Tester" are
  unambiguous precisely because they're fake; the duplicate "Sakshi Gulati"
  rows are what real data looks like. Check a picker against production-shaped
  names, not fixtures.
- Before adding a policy to reach data you're missing, check whether a view
  already exposes the safe subset. This codebase has three
  (`public_artist_profiles`, `public_brand_profiles`,
  `public_organiser_profiles`) plus `open_campaigns`, all built for exactly
  this: the display fields without the contact details.

---

## L10 — The evidence suite had been red for a week and nobody knew

**Found:** 11 Aug 2026, running `--project=artist` and `--project=brand` for the
first time since the 3 Aug batch.

Four tests failed, none of them because of the 10 Aug work:

| Spec | Broken by | Since |
|---|---|---|
| `artist.spec.ts` A-PROF-01 | the `ConfirmSubmit` dialog | 3 Aug |
| `brand.spec.ts` B-PROF-01 | same | 3 Aug |
| `standup-fixes.spec.ts` S-URL-01 / S-URL-02 | same | 3 Aug |

Item 3 of the 3 Aug batch put a confirmation dialog in front of every profile
save. Every spec that saved a profile carried on clicking "Save changes" and
waiting for a success banner that could no longer appear without a second
click. One of them (S-URL-02) didn't even fail cleanly — it hit a strict-mode
violation, because "Save changes" and "Yes, save changes" both match
`/Save changes/i`.

Nothing caught it, because the 3 Aug pass only ran the *new* specs and there's
no CI. So the suite that exists to prove the app works had itself stopped
working, quietly, for a week — and would have been the thing we reached for the
next time something looked wrong.

**Fixed** 11 Aug 2026 — all four updated to click through the confirmation.
`S-URL-03`'s assertion was also inverted deliberately: it asserted the field
rewrites itself to `https://…/` on blur, which the 10 Aug standup reversed.
It now asserts the display form, and `S-URL-01` asserts the *stored* value is
still canonical by checking the public profile's link `href` — which is the
guarantee that actually matters.

**Rules.**

- A change to a **shared UI primitive** (`ConfirmSubmit`, `UnsavedChangesGuard`,
  `FileDrop`, `.input`) breaks every spec that drives it. Grep the specs for
  the affected interaction before assuming a batch is done.
- Run the **whole** suite after a batch, not just the specs you wrote for it.
  `npx playwright test` with no `--project` is the check; it takes minutes.
- `getByRole("button", { name: /Save changes/i })` matches "Yes, save changes"
  too. Use `{ exact: true }` for a button whose label is a prefix of another's.
- An untested capture suite is worse than none: it looks like a safety net
  right up to the moment you need it.
- **Running the July suites overwrites the July evidence.** `brand` / `artist`
  write into `docs/client-review/screenshots/`, which is committed and dated.
  Run them to check the specs pass, then
  `git checkout -- docs/client-review/screenshots/` unless you actually meant
  to re-date that review. A capture suite that doubles as a regression suite
  needs its output separated from its archive — the `s0810-*` projects write
  to their own folder for this reason.

---

## Pre-push checklist

Run through this before `git push liveensynergy HEAD:main`. Most of it is a
couple of minutes.

### 1. Know exactly what you're shipping

```bash
git log liveensynergy/main..HEAD --oneline          # commits going live
git diff liveensynergy/main..HEAD --stat            # files touched
```

- [ ] Every commit listed is one you intend to release. A single push to `main`
      ships *everything* that's ahead — issue #1's push carried the QR check-in
      flow, ticket upload, and no-show suspension alongside the five cards.
- [ ] `git fetch liveensynergy` first, so you're diffing against the real tip.

### 2. Database

```bash
git diff liveensynergy/main..HEAD --stat -- supabase/migrations/
```

- [ ] If that's empty, skip to step 3.
- [ ] Otherwise: migration applied to production **before** pushing code.
- [ ] Columns verified present, not assumed — query
      `information_schema.columns` for the specific new columns (via the
      Supabase MCP `execute_sql`, or the SQL editor).
- [ ] Migration documented in `docs/database-migrations.md`.
- [ ] Migration is additive. If it renames, drops, or retypes anything, stop and
      plan the rollout properly — existing rows and the running old build both
      depend on the current shape.
- [ ] **Backfill considered.** Does the new code read any *existing* column
      differently than the old code did? If yes, the migration needs an `update`
      to match, and additive-DDL safety does not cover it (L4).
- [ ] Opened one **pre-existing** record in the UI, not just a freshly created
      one, and checked the affected field renders correctly.

### 2b. User-facing URLs

- [ ] If the change generates a link that leaves the app — QR code, email,
      share link, webhook callback — confirm the origin it's built from is the
      public one users actually browse (L5).
- [ ] Load one generated link in a logged-out/incognito window. A protected
      preview origin will redirect to an SSO wall rather than your page.

### 3. Build health

```bash
npm run typecheck
npm run build
```

- [ ] Both clean. `typecheck` alone is not enough — `next build` catches
      route-level and server/client boundary errors that `tsc` doesn't.
- [ ] Note: `npm run lint` is **not usable** — the repo has no ESLint config, so
      `next lint` drops into an interactive setup prompt and lints nothing.
      Treat the script as absent until someone configures it.
- [ ] **Every functional project**, not just the specs for this batch (L10):

      ```bash
      npm run build && npm run start      # dev-mode compilation blows the timeouts
      npx playwright test --project=brand --project=artist \
        --project=s0810-admin --project=s0810-brand \
        --project=s0810-artist --project=s0810-audience
      ```

      A change to a shared primitive (`ConfirmSubmit`, `FileDrop`, `.input`)
      breaks every spec that drives it, in files you didn't open.

      ⚠️ **Not bare `npx playwright test`.** That also runs `standup-video`,
      which points at the **deployed** site by default, and `audience-video`,
      which creates an account. Neither belongs in a pre-push check.

### 3b. Exercise the change as the affected role

- [ ] Drove the real UI, signed in as the role the change affects — not just
      read the diff, and not just checked the database row (L3, L6).
- [ ] For a write action: looked at **the screen the user is left on**
      afterwards. A correct DB row with a stale screen is still a broken
      feature (L6).
- [ ] For a write that empties a list or completes the last item: ran it on the
      **last** one and checked the confirmation still appears. A message
      rendered inside a form the action removes goes with it (L8).
- [ ] For anything showing a list of records: signed in as a **second account
      of the same role** and confirmed it can't see the first one's rows.
      Fixtures with one brand cannot surface a scoping bug (L7).

### 3c. Reads are scoped too

- [ ] Any new or edited `.from(table).select(...)` that isn't inherently
      global: does it filter by owner id, or is it trusting RLS? Trusting RLS
      is only safe if you've read **every** policy on that table — permissive
      policies are OR-ed, and this codebase deliberately has wide ones
      (`sponsored_events` confirmed/completed, `event_listings` available) for
      the audience (L7).

      ```bash
      grep -n "on <table>" supabase/migrations/*.sql     # count them, don't recall them
      ```
- [ ] A detail page reached by id: does it check the viewer is entitled to it,
      or only that the row loaded? `notFound()` beats rendering a stranger's
      figures (L7).

### 4. New env vars or dependencies

- [ ] Any new `process.env.*` reference added? It must exist in the Vercel
      project settings *before* the deploy, or the build ships broken.
- [ ] New packages are in both `package.json` and `package-lock.json`, and
      `package-lock.json` is committed.

### 5. Sanity-check the actual change

- [ ] Ran it locally (`npm run dev`) and looked at the screen that changed, in
      the role that's affected.
- [ ] Where the change is data-dependent (empty state, existing account, brand
      new account), checked more than one case.

---

## Post-deploy verification

A push is not a deploy. Confirm the new build is actually serving:

- [ ] Pick something in the diff that's publicly observable — a new route, or a
      page whose static copy changed — and check it against the live URL.
      New route:

      ```bash
      curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
        https://liveensynergy-rho.vercel.app/<new-route>
      ```

      A `404` where the source says otherwise means the old build is still live.
- [ ] For an authenticated screen, log in as a seeded QA account
      (`docs/qa-creds.md`) and look at it — don't rely on the client to be your
      smoke test.
- [ ] If a migration went out with it, exercise the feature that uses the new
      columns once.
- [ ] Reply on the GitHub issue with what shipped and how to verify, so the
      client checks the right thing.

---

## Anti-patterns worth naming

- **Trusting a green push.** `280a6e7..4044474 HEAD -> main` tells you git
  accepted the objects. It says nothing about whether the build succeeded.
- **Debugging the app before checking the build.** Cheapest check first: is the
  deployed code even the code you're reading?
- **Taking the reporter's framing at face value.** "Existing accounts don't see
  it" and "the deploy is stale" produce identical symptoms for an existing
  account. Find the observation that distinguishes them (static copy, a new
  route) rather than starting from the stated hypothesis.
- **Verifying against `.env.local` and calling it production.** They're the same
  project until someone proves otherwise — and nobody has.
- **Believing a comment about a security property.** `// RLS returns only the
  sponsored events this user is a party to` was wrong for months and read as
  reassuring, which is precisely why nobody checked it (L7). A claim like that
  needs a test next to it or it's decoration.
- **Testing the first item instead of the last.** Drawing 1 of 5 works; drawing
  the last of 5 is what removes the form showing the result (L8). Empty the
  list, complete the final step, delete the last row.
- **One fixture per role.** A single brand cannot reveal that the page shows
  every *other* brand's rows. Scoping bugs need a second account of the same
  role to be visible at all (L7).
