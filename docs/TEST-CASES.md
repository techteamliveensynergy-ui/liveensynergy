# Live·En·Synergy — Test cases

Manual + automated test cases for the V1 MVP. Test accounts are in
[`qa-creds.md`](./qa-creds.md).

**Legend**
- ✅ **Automated** — covered by the Playwright suite (`fullflow.mjs`)
- 🔲 **Manual** — needs a human, or blocked on an unbuilt integration
- ⛔ **Blocked** — depends on something not built yet (noted inline)

The core cross-role happy path (§5) is the one that must always pass before a
release — it's the whole product loop in a single run.

---

## 1. Public / marketing pages

| # | Case | Expected | Status |
|---|---|---|---|
| 1.1 | Visit `/` | Landing renders: hero, value props, how-it-works, stats, featured events, pricing, testimonials, FAQ, CTA, footer | ✅ |
| 1.2 | Visit `/about`, `/events`, `/faqs`, `/terms`, `/privacy` | All 200, styled consistently, footer present | ✅ |
| 1.3 | FAQ accordion on `/faqs` and landing | Clicking a question expands its answer | ✅ |
| 1.4 | Header nav links | How it works / Events / About / Contact all navigate correctly | 🔲 |
| 1.5 | Legal tab switcher | `/terms` ↔ `/privacy` tabs highlight the active page | 🔲 |
| 1.6 | Landing CTA "Join as Brand" | Goes to `/auth/sign-up?role=brand` with role preselected (step 2) | ✅ |
| 1.7 | Landing CTA "Join as Artist / Organiser" | Goes to sign-up with artist role preselected | ✅ |
| 1.8 | Responsive check at 375px / 768px / 1440px | No horizontal scroll; nav collapses; cards stack | 🔲 |

## 2. Contact form

| # | Case | Expected | Status |
|---|---|---|---|
| 2.1 | Submit valid contact form | Success message shown; row inserted into `contact_messages` | ✅ |
| 2.2 | Submit with empty required fields | Browser validation blocks submit | 🔲 |
| 2.3 | Submit with invalid email | Browser validation blocks submit | 🔲 |
| 2.4 | Admin views submissions | ⛔ No admin inbox screen built yet (roadmap) | ⛔ |

## 3. Authentication

| # | Case | Expected | Status |
|---|---|---|---|
| 3.1 | Sign up — step 1 role picker | 4 roles selectable; Continue disabled until one is picked | ✅ |
| 3.2 | Sign up — step 2 shows chosen role + "Change" | Returns to step 1 | ✅ |
| 3.3 | Sign up with new email | Account created; confirmation-email notice OR redirect to `/onboarding` | 🔲 |
| 3.4 | Sign up with password < 8 chars | Inline error, no account created | 🔲 |
| 3.5 | Sign up with an already-registered email | Supabase error surfaced, no duplicate | 🔲 |
| 3.6 | Sign in with valid credentials | Redirects to `/dashboard` (or `/onboarding` if incomplete) | ✅ |
| 3.7 | Sign in with wrong password | "Invalid login credentials" shown, stays signed out | ✅ |
| 3.8 | Sign out | Session cleared, redirected to `/`, protected routes blocked again | ✅ |
| 3.9 | Visit `/auth/sign-in` while already signed in | Redirected away to `/dashboard` | ✅ |
| 3.10 | Visit `/dashboard` signed out | Redirected to `/auth/sign-in?redirectTo=…` | ✅ |
| 3.11 | Forgot password → email link | ⛔ Needs a real mail provider configured | ⛔ |
| 3.12 | Reset password with valid link | Password updated, signed in | ⛔ |

## 4. Onboarding

| # | Case | Expected | Status |
|---|---|---|---|
| 4.1 | Brand onboarding saves | `brands` row created; redirect to `/dashboard`; sidebar shows brand name | ✅ |
| 4.2 | Artist onboarding saves | `artists` row created; redirect to dashboard | ✅ |
| 4.3 | Event-organiser onboarding saves | `event_organisers` row created | 🔲 |
| 4.4 | Audience onboarding saves | `audience_members` row created | ✅ |
| 4.5 | Onboarding router `/onboarding` | Sends user to the form for their role | ✅ |
| 4.6 | Completed user visits `/onboarding` | Redirected to `/dashboard` | 🔲 |
| 4.7 | Wrong-role onboarding URL | Redirected to the correct role's form | 🔲 |
| 4.8 | Required-field validation | Cannot submit without brand/artist/event name | 🔲 |
| 4.9 | Audience "interests" + "payout" placeholders | Visibly marked *Coming soon*; submit no data | ✅ |

## 5. ⭐ Core cross-role happy path (the product loop)

Run against a clean DB (`participations`, `sponsored_events`, `event_listings`,
`campaigns`, `conversations`, `messages` truncated).

| # | Case | Expected | Status |
|---|---|---|---|
| 5.1 | **Artist** creates an event listing | Saved as `draft`; visible in My events | ✅ |
| 5.2 | **Artist** publishes it | Status flips `draft` → `available` | ✅ |
| 5.3 | **Brand** creates a campaign | Saved; reference `CMP-…` generated | ✅ |
| 5.4 | Platform fee maths | £4,000 budget → £3,568 net shown on dashboard & campaign form | ✅ |
| 5.5 | **Brand** sees the published listing in Discover | Only `available` listings appear | ✅ |
| 5.6 | **Brand** contacts organiser | `conversations` row created; appears in Messages for both sides | ✅ |
| 5.7 | **Brand** creates the sponsored event | Links listing + campaign; auto-sets `brand_agreed = true`; status `in_progress` | ✅ |
| 5.8 | **Artist** sees it in Sponsor offers | Pending proposal listed | ✅ |
| 5.9 | **Artist** agrees to terms | `artist_agreed = true` → status becomes `confirmed` | ✅ |
| 5.10 | **Audience** sees the confirmed event in Discover | Only `confirmed`/`completed` events are visible | ✅ |
| 5.11 | **Audience** registers | `participations` row, status `registered` | ✅ |
| 5.12 | **Audience** submits ticket proof | Status → `ticket_uploaded`; confirmation shown | ✅ |
| 5.13 | **Artist** sees the participant | Participants (1) on the sponsored event | ✅ |
| 5.14 | **Artist** selects the participant | `selected = true` | ✅ |
| 5.15 | **Artist** verifies attendance | Status → `attendance_verified`, timestamp set | ✅ |
| 5.16 | **Artist** releases the reward with an amount | Status → `reward_released`, timestamp + `reward_amount_gbp` set | ✅ |
| 5.17 | Remaining budget draws down | Sponsored event `remaining_budget_gbp` decreases by the released amount | ✅ |
| 5.18 | **Audience** sees the reward | Appears in My rewards with the amount; running total updates | ✅ |
| 5.19 | **Audience** dashboard metrics update | Verified attendances / rewarded-to-date reflect the flow | ✅ |

### Bugs this suite caught (both fixed)

1. **Organiser could not manage participants at all.** `participations` had a
   SELECT policy for the event's brand/artist but **no UPDATE policy**, so
   Select / Verify attendance / Release reward ran without error while RLS
   matched zero rows — the whole verification-and-reward half of the product
   loop silently did nothing. Fixed in
   `supabase/migrations/0004_participation_management.sql`.
2. **Rewards always released as £0.** The release control posted no
   `reward_amount_gbp`, so every reward stored `null` — the audience's "My
   rewards" total and "Rewarded to date" metric were permanently £0 and the
   sponsored event's remaining budget never moved. Fixed by adding an amount
   input to the release form and drawing the amount down from the event budget.
3. **Completed participations could be regressed.** The "Verify attendance"
   button rendered for any selected participant whose status wasn't exactly
   `attendance_verified` — including `reward_released`, so an organiser could
   knock an already-paid participant back a step. Now only shown while the
   status is `registered` or `ticket_uploaded`.

> Both bugs passed a naive body-text assertion on the first run (the
> participants blurb contains the words "selected" and "verified"). Assert on
> the **next control appearing** or on the DB, not on loose page copy.

## 6. Brand portal

| # | Case | Expected | Status |
|---|---|---|---|
| 6.1 | Dashboard home metrics | Active campaigns / confirmed sponsorships / verified attendees / budget remaining are accurate | ✅ |
| 6.2 | "Suggested for you" panel | Shows up to 3 available listings | ✅ |
| 6.3 | Edit a campaign | Changes persist | 🔲 |
| 6.4 | Delete a campaign | Row removed; list refreshes | 🔲 |
| 6.5 | Campaign requires description + budget | Inline error when missing | 🔲 |
| 6.6 | Brand cannot see another brand's campaigns | RLS blocks cross-tenant reads | 🔲 |
| 6.7 | Brand profile edit | Saves; sidebar workspace name updates | 🔲 |

## 7. Artist / Event-organiser portal

| # | Case | Expected | Status |
|---|---|---|---|
| 7.1 | Dashboard home metrics | Published events / pending offers / confirmed / verified attendees accurate | ✅ |
| 7.2 | Edit a listing | Changes persist | 🔲 |
| 7.3 | Unpublish a listing | `available` → `draft`; disappears from brand Discover | 🔲 |
| 7.4 | Delete a listing | Removed from list | 🔲 |
| 7.5 | Artist cannot see another artist's listings | RLS blocks cross-tenant reads | 🔲 |
| 7.6 | Event-organiser role sees the same portal | Nav + pages work identically to artist | 🔲 |

## 8. Audience portal

| # | Case | Expected | Status |
|---|---|---|---|
| 8.1 | Dashboard home + reward tracker | Metrics and recent participations render | ✅ |
| 8.2 | Withdraw from an event | Participation removed | 🔲 |
| 8.3 | Consent / payout preferences (once selected) | Checkboxes persist | 🔲 |
| 8.4 | Cannot register for the same event twice | Unique constraint prevents duplicate | 🔲 |
| 8.5 | Rewards total | Sum of released rewards is correct | ✅ |
| 8.6 | QR / box-office check-in | ⛔ Not built — verification is manual by the organiser | ⛔ |

## 9. Messaging

| # | Case | Expected | Status |
|---|---|---|---|
| 9.1 | Conversation appears for both parties | Brand and artist both see the thread | ✅ |
| 9.2 | Send a message | Appears in thread; visible to the counterparty | 🔲 |
| 9.3 | Non-participant cannot read a thread | RLS blocks | 🔲 |
| 9.4 | Realtime updates | ⛔ Not wired — requires page refresh | ⛔ |

## 10. Admin console & user management

| # | Case | Expected | Status |
|---|---|---|---|
| 10.1 | Admin signs in | `/dashboard` routes on to `/dashboard/admin` | ✅ |
| 10.2 | Users list | Every account listed with role, last seen, last login | ✅ |
| 10.3 | Filter by user type | Only that role shown | ✅ |
| 10.4 | Search by name / email | List narrows to matches | ✅ |
| 10.5 | Filter by last-active bucket | today / week / month / inactive / never | ✅ |
| 10.6 | User detail shows activity | Last seen, last login, joined, onboarding state | ✅ |
| 10.7 | Admin edits account fields | Name / email label / role / plan / onboarding flag persist | ✅ |
| 10.8 | Admin edits the role profile | All role-profile fields persist (brand/artist/event/audience) | ✅ |
| 10.9 | Profile links surfaced | Website + socials shown as outbound links | 🔲 |
| 10.10 | Non-admin hits `/dashboard/admin/*` | Redirected away | ✅ |
| 10.11 | Overview counts | Match DB totals | 🔲 |
| 10.12 | Create / edit / deactivate a plan | Persists in `plans` | 🔲 |
| 10.13 | Events monitor | Lists listings + sponsored events with counts | 🔲 |

## 10b. ⭐ Blocking enforcement (platform-wide)

Enforced once in middleware so it covers every route, not per-page.

| # | Case | Expected | Status |
|---|---|---|---|
| 10b.1 | Admin blocks a user with a reason | `is_active=false`, `blocked_at` + `blocked_reason` recorded | ✅ |
| 10b.2 | Blocked user mid-session | Signed out and sent to `/auth/blocked` on their next navigation | ✅ |
| 10b.3 | Blocked user tries to sign in | Rejected with an explanation; session torn back down | ✅ |
| 10b.4 | Blocked user hits a protected URL directly | Cannot reach it | ✅ |
| 10b.5 | Admin restores access | User can sign in and use the platform again | ✅ |
| 10b.6 | Instant revocation of an *open idle tab* | ⛔ Needs the service-role key — currently the tab survives until the next request | ⛔ |

## 10c. Notifications (Phase A)

| # | Case | Expected | Status |
|---|---|---|---|
| 10c.1 | Catalogue lists the seeded events | 31 events across 6 categories | ✅ |
| 10c.2 | Category filter | Only that category's events shown | ✅ |
| 10c.3 | Editor shows declared `{{variables}}` | Click-to-copy chips per event | ✅ |
| 10c.4 | Live preview | Substitutes realistic sample data as you type, for both channels | ✅ |
| 10c.5 | Save template + CC | Persists and survives a reload | ✅ |
| 10c.6 | Real action fires a notification | Audience registers → in-app row created | ✅ |
| 10c.7 | Email queued to the outbox | Row with recipient, subject, body and configured CC | ✅ |
| 10c.8 | Unread badge | Sidebar badges the Notifications entry | ✅ |
| 10c.9 | Mark all read | Badge clears immediately, no manual refresh | ✅ |
| 10c.10 | Channel toggle from the catalogue | Disabling persists and suppresses that channel | ✅ |
| 10c.11 | Email actually sends | ⛔ No provider wired — rows stay `queued` by design | ⛔ |
| 10c.12 | Per-user notification preferences | ⛔ Not built — admin-level control only this phase | ⛔ |

> The unread badge lives in the dashboard **layout**, which Next keeps in the
> client router cache across soft navigations — `revalidatePath` alone left a
> stale count. "Mark all read" is a client component calling `router.refresh()`
> for that reason; don't convert it back to a plain form action.

## 11. Security / access control (RLS)

| # | Case | Expected | Status |
|---|---|---|---|
| 11.1 | Role-scoped routes | Brand can't open `/dashboard/events`; artist can't open `/dashboard/campaigns` | 🔲 |
| 11.2 | Direct URL to another user's record | Blocked / not found | 🔲 |
| 11.3 | Deactivated account | Blocked from the whole dashboard | 🔲 |
| 11.4 | Anon key exposure | Only `NEXT_PUBLIC_*` keys client-side; RLS enforces data access | 🔲 |
| 11.5 | Contact form insert as anon | Allowed by policy; anon cannot read submissions back | 🔲 |

## 12. Build / infrastructure

| # | Case | Expected | Status |
|---|---|---|---|
| 12.1 | `npx tsc --noEmit` | No type errors | ✅ |
| 12.2 | `npm run build` | Production build succeeds, all routes compile | ✅ |
| 12.3 | `npm audit` | No critical/high vulnerabilities in direct deps | ✅ |
| 12.4 | Vercel deploy | Build green; env vars set; no middleware crash | 🔲 |
| 12.5 | Missing Supabase env vars | ⚠️ Currently 500s in middleware — should fail more gracefully | 🔲 |

---

## Known gaps (not yet built — flows to be decided)

These are deliberately stubbed or absent; see `<Placeholder>` components in the
codebase for the UI-level markers.

- Audience **interests** and **payout details** capture (placeholders in onboarding)
- Email **OTP verification** step from the onboarding mocks
- **QR / box-office** attendance check-in (verification is manual today)
- **Stripe** fund-in and payouts
- **KYC / identity** verification
- **File uploads** to Supabase Storage (logos, banners, ticket images — currently a URL field)
- **Realtime** chat updates
- **Transactional email** (confirmations, reset links, branded templates)
- Admin **customer-queries inbox** and **payments console**
- Analytics / funnel dashboards

---

## Running the automated suite

The Playwright scripts live in the session scratchpad (not committed). To
re-run the core loop against a local dev server:

```bash
# 1. Truncate transactional tables (participations, sponsored_events,
#    event_listings, campaigns, conversations, messages)
# 2. Ensure the test accounts from qa-creds.md exist and are onboarded,
#    and that none of them are left blocked from a previous run
# 3. BASE=http://localhost:3000 node fullflow.mjs      # 24 cross-role checks
#    BASE=http://localhost:3000 node admin.mjs         # 17 admin + blocking checks
#    BASE=http://localhost:3000 node notifications.mjs # 14 notification checks
```

Each step prints `PASS`/`FAIL` and writes a screenshot, so a failure points at
the exact stage of the loop that broke.

> **Do not run `npm run build` while `next dev` is running.** The build
> rewrites `.next` underneath the dev server and corrupts its client bundle —
> the symptom is `__webpack_require__.n is not a function` in the browser,
> React failing to hydrate, and form fields vanishing mid-test (which looks
> exactly like an app bug but isn't). Restart the dev server to recover.
