# 3 Aug 2026 standup — issue tracker & test plan

Source: `Daily Standup - 2026_08_03 21_39 IST - Notes by Gemini.md`
(Decisions + Next steps sections, merged and de-duplicated — several decisions
and next-step items describe the same piece of work.)

Status recorded as of the implementation pass on **4 Aug 2026**.

Legend: **Done** · **Deferred** (needs Ketan's input before it can be built) ·
**No change needed** (a decision, not a build item) · **Pre-existing** (already
worked; verified, and in some cases extended).

---

## Before testing any of this

1. **Apply the migrations, in order.** Nothing below works without them.
   - `supabase/migrations/0020_sponsorship_withdrawn.sql`
   - `supabase/migrations/0021_standup_0803.sql`

   They are two files on purpose — Postgres refuses to *use* a newly added enum
   value inside the transaction that added it, so 0020 must commit first.
   Watch the output of 0021 for a `NOTICE` about skipped phone indexes (see
   T9.4).

2. **Optional env vars** for the GitHub mirror, in `.env.local`:
   `GITHUB_FEEDBACK_REPO`, `GITHUB_TOKEN`, `GITHUB_FEEDBACK_LABELS`.
   Without them the feedback widget still works; reports just stay in the admin
   inbox.

3. **Accounts needed** (see `docs/qa-creds.md`): one brand, two artists, one
   audience member, one admin. Two artists matter — several tests need a
   campaign with more than one suggested event.

4. `npm run dev`, or test against a preview deploy.

---

## 1. Status summary

| # | Issue (as raised in the standup) | Status | Remarks |
|---|---|---|---|
| 1 | Multiple events per campaign; admin sees which was selected, can edit it, confirmation if the user already chose | **Done** | Admin now ticks several listings at once. `matched_listing_id` narrows to the winner on acceptance. |
| 2 | Sponsorship acceptance closes the campaign; no undo; confirm popup before accepting | **Done** | Losing proposals move to a new `withdrawn` status and their listings return to `available`. |
| 3 | Popup confirmation when editing/saving a user profile | **Done** | Confirmation on save **and** a warning when navigating away with unsaved edits. Covers the user's own profile page and the admin user editor. |
| 4 | Beta tester feedback form → raises a GitHub issue (Raising Club pattern) | **Done** | Minimised tab on every dashboard/onboarding page. GitHub mirror is optional and degrades safely. |
| 5 | All communication stays platform-based (no third-party white-label email) | **No change needed** | A decision to *not* build something. Existing platform email/outbox is unchanged. |
| 6 | Ticket proof viewable on the admin dashboard | **Pre-existing** | Already worked. Extended: the audience member now sees their own uploaded ticket too. |
| 7 | Admin can edit event details before completion; status must not move backward | **Done** | Full edit form on the admin event page. `completed` locks the record. |
| 8 | Location access (GPS / Google Maps) required when scanning event QR codes | **Deferred** | Needs your input — Maps API key, the 5 km radius rule, and where event coordinates get captured. Not started. |
| 9 | Step-based progress indicator on the audience overview | **Done** | Registered → Selected → Ticket uploaded → Attended → Reward released, with ticks and a ticket thumbnail. |
| 10 | Gender field with a "prefer to self-describe" open text option | **Done** | Two columns so the standard options stay countable. |
| 11 | Country of residence as a searchable dropdown | **Done** | Type-to-filter list of ~195 countries, UK pinned first. |
| 12 | Merge Artist and Event Organiser registration | **Done** | Copy-only. One sign-up card mapping to the `artist` role; existing `event` accounts untouched. |
| 13 | Reward release restricted to admins; participant names visible | **Done** | Control removed from brand/artist **and** the server action's `release` branch deleted. New RLS policy exposes participant names to the event's parties. |
| 14 | Sponsorship reference numbers shortened and made sequential | **Done** | `SPE-3F9A1C0B` → `SPE-00001`. Existing rows renumbered in creation order. |
| 15 | Terms & conditions agreement customised per party | **Done** | Role-specific summary + required checkbox at sign-up; acceptance date and version stored on the profile. |
| 16 | Readable "registered at" dates in the admin CSV export | **Done** | `DD/MM/YYYY HH:mm`. Gender and country columns added while there. |
| 17 | Budget logic — deduct VAT/fees rather than showing the gross everywhere | **Done** | The headline bug. Remaining budget now starts net of the fee inc VAT; existing rows recomputed. |
| 18 | Forgot / reset password page | **Pre-existing** | `/auth/forgot-password` and `/auth/reset-password` already existed and work. Verify only — see T18. |
| 19 | Phone number uniqueness enforced at account creation | **Done** | Across all four role tables, with DB indexes as a backstop. |
| 20 | Clear instructions that either party can create a sponsored event | **Done** | Explanatory card on the creation form. |
| 21 | Branded email templates (logo, fonts) | **Deferred** | You asked to keep this pending and plan it separately. Not started. |
| 22 | Contact form submissions stored in the backend rather than emailed | **No change needed** | Confirmed acceptable in the meeting. Existing admin Enquiries inbox unchanged. |

Sakshi's action items (Google Workspace addresses, payment, drafting the terms
copy) are not development work and are out of scope for this pass. Note that
item 15 ships **summary** wording per party — the full legal copy is still
placeholder text on `/terms` pending that draft.

---

## 2. Detail, remarks and test cases

Fill in the **Result** column as you go. Anything that fails, note the
reference and I'll pick it up.

### 1 — Multiple events per campaign

**What changed:** `matchCampaign` accepts several listings and creates one
sponsored event per listing. The admin campaign card lists every suggestion,
ticks the accepted one, and links each to its edit page.
**Files:** `admin/campaigns/MatchForm.tsx`, `admin/campaigns/page.tsx`,
`admin/marketplace-actions.ts`.

**Remarks:** A campaign stays open for further suggestions until one is
accepted. `matched_listing_id` is set by the first batch (so "needs matching"
clears) and narrows to the accepted listing on confirmation.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T1.1 | Admin → Campaigns → pick an unmatched campaign. Tick **two** available listings, submit. | Button reads "Suggest 2 events". Both events are created; you land back on the campaigns list. |  |
| T1.2 | Look at that campaign's card. | A "Suggested events (2)" block lists both, each with status, agreement ticks, date and an "Edit →" affordance. |  |
| T1.3 | Click one suggestion. | Opens the admin sponsored-event page for that event. |  |
| T1.4 | Submit the match form with nothing ticked. | Submit button is disabled; nothing is created. |  |
| T1.5 | As the brand, accept one of the two (see T2). Return to the admin campaign card. | The accepted one is highlighted with a ✓ and "selected by the sponsor"; the other reads **withdrawn**. |  |
| T1.6 | After acceptance, look for the match form on that campaign. | Gone — the campaign is closed and no longer takes suggestions. |  |
| T1.7 | Admin → Events → Listings, find the *losing* event's listing. | Status is back to **available**, not stuck on "matched". |  |

### 2 — Acceptance closes the campaign, no undo

**What changed:** `toggleAgreement` refuses to act unless the event is still
`in_progress`, and on confirmation calls the new `close_campaign_on_acceptance`
RPC. Agreeing goes through a confirmation dialog.
**Files:** `dashboard/sponsored/actions.ts`, `dashboard/sponsored/[id]/page.tsx`,
migrations 0020 + 0021.

**Remarks:** The RPC is `security definer` on purpose — the person clicking the
final "I agree" is a party to *their* event only, so under normal RLS the
campaign row and the sibling proposals would silently match zero rows. That was
the exact failure 0004 was written to fix, so authorisation is checked
explicitly inside the function instead.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T2.1 | As the artist on a suggested event, click "I agree to these terms" (brand has **not** agreed yet). | Dialog: "Agree to these terms?" — explains it confirms once the other party agrees too. |  |
| T2.2 | Cancel that dialog. | Nothing is saved; the button still reads "I agree to these terms". |  |
| T2.3 | Confirm. Then click "Withdraw my agreement". | Withdrawal works — nothing is locked until *both* sides have agreed. |  |
| T2.4 | Re-agree, then as the brand click "I agree to these terms". | Dialog wording changes to "Confirm this sponsorship?" and says **this can't be undone**; the confirm button is the dark/danger variant. |  |
| T2.5 | Confirm. | Status → confirmed. Both agree buttons disappear; the terms block reads "locked — contact the team". |  |
| T2.6 | Check the campaign's other suggested event as its artist. | Status **withdrawn**, with copy explaining the sponsor chose a different event. No agree button. |  |
| T2.7 | Check the losing artist's Notifications. | A "Sponsorship proposal withdrawn" notification naming the event. |  |
| T2.8 | Admin → Campaigns → that campaign. | Status **closed**. |  |

### 3 — Profile edit confirmation + unsaved-changes warning

**What changed:** New `ConfirmSubmit` and `UnsavedChangesGuard` components.
Wired into all four role forms in profile mode, plus the admin Account and Role
Profile forms.
**Files:** `components/ui/ConfirmSubmit.tsx`,
`components/ui/UnsavedChangesGuard.tsx`, `components/onboarding/parts.tsx`,
`admin/users/[id]/AccountForm.tsx`, `admin/users/[id]/RoleProfileForm.tsx`.

**Remarks:** `ConfirmSubmit` deliberately renders no `type="submit"` control —
with one, pressing Enter in a text field would submit and skip the
confirmation. It calls `requestSubmit()` on the parent form instead, so HTML
validation still runs.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T3.1 | Dashboard → Profile, change a field, click Save changes. | Dialog: "Save these changes?" explaining it overwrites what's on the profile. |  |
| T3.2 | Cancel, then reload the page. | The edit was not saved. |  |
| T3.3 | Edit again, confirm the dialog. | Saves; the green "Your changes have been saved" banner appears. |  |
| T3.4 | Edit a field, then press **Enter** inside a text input. | The form does **not** submit silently — you still get the dialog via the button. |  |
| T3.5 | Edit a field, then click a sidebar link without saving. | Browser confirm: "You have unsaved changes… Leave without saving?" Cancelling keeps you on the page with the edit intact. |  |
| T3.6 | Edit a field, then close the tab / hard-refresh. | The browser's own "Leave site?" prompt appears. |  |
| T3.7 | Repeat T3.1–T3.5 as admin on Admin → Users → a user, for both the Account and the Profile form. | Same behaviour; wording refers to overwriting *the user's* profile. |  |
| T3.8 | On the **onboarding** version of the same form (a brand-new account). | No confirmation — there's nothing to overwrite. Saves in one click. |  |

### 4 — Feedback widget → GitHub issue

**What changed:** Floating tab on every dashboard and onboarding page, opening
the same report form as `/dashboard/feedback`. `submitFeedback` mirrors each
report to a GitHub issue when configured, storing the URL/number on the row.
**Files:** `components/FeedbackWidget.tsx`, `lib/github.ts`,
`dashboard/feedback/actions.ts`, `dashboard/layout.tsx`,
`components/OnboardingShell.tsx`, `admin/feedback/page.tsx`, `.env.example`.

**Remarks:** Screenshots are deliberately **not** pushed to GitHub — they
routinely contain other people's personal data, so they stay in the private
bucket and are viewed from the admin inbox. The mirror never blocks a report:
a missing token or a failing API call is logged and swallowed.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T4.1 | Sign in as any role. Look at the bottom-right of any dashboard page. | A "🐞 Feedback" tab. |  |
| T4.2 | Sign out and browse the public site. | No tab (reporting needs an account). |  |
| T4.3 | Click the tab. | Panel expands with Type / Title / Details / Screenshot. |  |
| T4.4 | Press Escape, and separately click the ×. | Panel closes both ways. |  |
| T4.5 | Submit a report with a title and details. | Green confirmation quoting a reference like `FB-00007`. |  |
| T4.6 | Admin → Feedback. | The report is listed with its reference, reporter, and the page URL it was sent from. |  |
| T4.7 | Attach a screenshot and submit. Then open the report in the admin inbox. | "View screenshot →" opens the image via a signed URL. |  |
| T4.8 | **With** `GITHUB_TOKEN` + `GITHUB_FEEDBACK_REPO` set, submit a report. | An issue appears on the repo titled `[FB-000NN] <title>`, labelled `feedback` + a type label, with the reference/reporter/page in the body. Admin inbox shows "GitHub issue #N ↗". |  |
| T4.9 | **Without** those env vars, submit a report. | Report still saves and appears in the admin inbox; no GitHub link, no error shown to the user. |  |
| T4.10 | Set `GITHUB_TOKEN` to a deliberately invalid value and submit. | Same as T4.9 — the user sees success, and the failure is logged server-side only. |  |
| T4.11 | Open the widget on an onboarding page (a part-registered account). | Tab is present and works there too. |  |

### 6 — Ticket proof visibility (pre-existing, extended)

**Remarks:** Already worked on the admin side; noted in the meeting as "already
there". The extension is on the audience side — people couldn't tell whether
their upload had landed.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T6.1 | As audience, upload a ticket image. Admin → that sponsored event. | "Ticket proof ↗" opens the file. |  |
| T6.2 | Back as the audience member, Dashboard → My events. | A thumbnail of your own ticket with "Open full size ↗". |  |
| T6.3 | Upload a **PDF** ticket instead. | Audience side shows a 🎟️ placeholder rather than a broken image; the link still opens the PDF. |  |

### 7 — Admin event editing, one-way status

**What changed:** `adminUpdateSponsoredEvent` action + `EventEditForm`.
`setSponsoredStatus` now refuses a lower-ranked status, and the picker only
offers the current status and later ones.
**Files:** `admin/actions.ts`,
`admin/events/sponsored/[id]/EventEditForm.tsx`,
`admin/events/sponsored/[id]/page.tsx`.

**Remarks:** This is the escape hatch for the deadline Sakshi couldn't move —
the parties themselves can't edit a confirmed deal by design, so the admin
console is the only route. Changing the budget re-derives the remaining amount
as net-of-fee minus what's already been released.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T7.1 | Admin → Events → a **confirmed** sponsored event. Scroll to "Edit event details". | The form is present and populated. |  |
| T7.2 | Set the participation deadline to a date **in the past**, save. | Confirmation dialog naming both parties; on confirm it saves without complaint. |  |
| T7.3 | Reload, and check the same event as the brand. | The new deadline shows on both the admin and the brand/artist view. |  |
| T7.4 | Change the budget from e.g. £5,000 to £8,000 and save. | "Available for rewards" recalculates as £8,000 − fee inc VAT, less anything already released. |  |
| T7.5 | On a confirmed event, open the status picker. | Only **confirmed** and **completed** are offered — `in_progress` is absent. Button reads "Move status on". |  |
| T7.6 | Move it to completed. Reload. | No status picker; message says it can't move on further. The edit form is replaced by "details are locked". |  |
| T7.7 | *(Server-side check)* On a confirmed event, POST `status=in_progress` to `setSponsoredStatus` by hand. | Rejected — the status does not change. |  |
| T7.8 | Open a **withdrawn** event as admin. | Explains another event was chosen; no status picker. |  |

### 9 — Audience progress tracker

**What changed:** `ParticipationProgress` component on both the audience
overview and My events.
**Files:** `components/dashboard/ParticipationProgress.tsx`,
`dashboard/AudienceHome.tsx`, `dashboard/participations/page.tsx`.

**Remarks:** The step names follow the platform's real flow rather than the
meeting shorthand — registering and being selected are separate things here,
and only selected participants are asked for a ticket.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T9.1 | Register for an event as audience. Dashboard → Overview. | Tracker shows **Registered** ticked, **Selected** as the current step, the rest greyed. |  |
| T9.2 | Admin selects that participant. Reload the audience overview. | Registered + Selected ticked; "Ticket uploaded" is now current with the hint "Upload your ticket as proof". |  |
| T9.3 | Upload a ticket. | Three ticks, thumbnail appears below the steps. |  |
| T9.4 | Admin verifies attendance, then releases the reward. | Four then five ticks. |  |
| T9.5 | On a **rejected** participation. | Tracker is replaced by "You weren't selected for the reward this time" — and that message appears only **once** on the page. |  |
| T9.6 | Check the same tracker on Dashboard → My events. | Present there too, with the per-step hint on the current step. |  |
| T9.7 | View on a narrow phone width. | Steps wrap without horizontal scrolling. |  |

### 10 & 11 — Gender and country fields

**What changed:** `GenderField` (with self-describe branch) and `CountrySelect`
(type-to-filter datalist) on the audience form; both added to the admin user
editor and the CSV export.
**Files:** `components/ui/GenderField.tsx`, `components/ui/CountrySelect.tsx`,
`lib/countries.ts`, `lib/constants.ts`, `onboarding/audience/AudienceForm.tsx`,
`onboarding/actions.ts`, `lib/admin-user-fields.ts`.

**Remarks:** Gender is stored in two columns so the standard options stay
countable without pattern matching free text. The country field is a native
`input list` — you can type to filter, and it works without JavaScript.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T10.1 | Audience onboarding → Gender dropdown. | Options: Woman, Man, Non-binary, Prefer to self-describe, Prefer not to say — plus a blank "Prefer not to answer". |  |
| T10.2 | Pick "Prefer to self-describe". | A free-text box appears below it. |  |
| T10.3 | Type a value, save, reload the profile page. | Both the selection and the free text persist. |  |
| T10.4 | Change the selection to "Woman" and save. | The free-text value is cleared, not left lingering behind the new answer. |  |
| T11.1 | Country of residence: type "uni". | Suggestions filter to United Kingdom / United Arab Emirates / United States. |  |
| T11.2 | Pick one, save, reload. | Value persists. |  |
| T11.3 | Admin → Users → that audience member → Profile tab. | Gender, self-described gender and country are all editable there. |  |
| T11.4 | Admin → Participants → Export CSV. | New **Gender** and **Country of residence** columns; gender shows the self-described text when one was given. |  |

### 12 — Artist / Event Organiser merged

**What changed:** One sign-up card ("Artist / Event Organiser") mapping to the
`artist` role; `ROLE_LABELS.artist` relabelled; artist onboarding copy widened
to cover organisations.
**Files:** `lib/constants.ts`, `onboarding/artist/ArtistForm.tsx`,
`onboarding/artist/page.tsx`, `auth/actions.ts`.

**Remarks:** Copy-only and reversible — no data migration. The `event` role is
still in the enum, and existing organiser accounts keep their nav, forms and
data exactly as they were.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T12.1 | Go to sign-up. | **Three** cards: Brand / Sponsor, Artist / Event Organiser, Audience. No separate Event Organiser card. |  |
| T12.2 | Pick Artist / Event Organiser and continue. | Step 2 header reads "Joining as Artist / Event Organiser". |  |
| T12.3 | Finish sign-up, reach onboarding. | Title "Set up your profile", subtitle mentions artist *or* event organiser; the first field is "Artist / organisation name". |  |
| T12.4 | Sign in as an **existing** `event`-role account. | Dashboard, nav and profile form are unchanged and still work. |  |
| T12.5 | Visit `/auth/sign-up?role=event` directly (an old link). | Still valid — goes straight to step 2 as an Event Organiser. |  |
| T12.6 | Admin → Users → a user → Role dropdown. | Both "Artist / Event Organiser" and "Event Organiser" are listed, so legacy accounts can still be identified. |  |

### 13 — Reward release restricted to admins

**What changed:** Release control removed from the brand/artist page, and the
`release` branch deleted from their server action entirely. New RLS policy
`profiles: read my event participants` exposes participant names to the event's
parties.
**Files:** `dashboard/sponsored/[id]/page.tsx`,
`dashboard/sponsored/actions.ts`, `admin/marketplace-actions.ts`,
migration 0021 step 6.

**Remarks:** Hiding the control is not authorisation — the point of this change
is that the brand/artist action has no `release` branch to reach, so a
hand-crafted POST does nothing.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T13.1 | As brand or artist, open a confirmed event with a participant at "attendance verified". | No amount box, no "Release reward" button. Instead: "Awaiting reward payout by the team". |  |
| T13.2 | Read the participants intro copy on that page. | Says selection/verification are yours, payout is handled by the Live·En·Synergy team. |  |
| T13.3 | *(Server-side check)* POST `op=release` with an amount to `updateParticipation` as the brand. | Nothing changes — status stays `attendance_verified`, no reward amount, budget untouched. |  |
| T13.4 | Admin → the same event. | Amount box + Release button are present and work. |  |
| T13.5 | Back on the brand/artist page, look at the participant list. | Participants show **real names**, not "Participant #3f9a1c0b". |  |
| T13.6 | As a brand with no relationship to some other audience member, confirm you can't see them. | Only participants of *your* events are visible. |  |
| T13.7 | After an admin release, reload the brand/artist page. | The paid amount is shown next to that participant. |  |

### 14 — Sequential reference numbers

**What changed:** Sequences + new `reference` defaults on `campaigns`,
`event_listings`, `sponsored_events`, `feedback_reports`; existing rows
renumbered in creation order.
**Files:** migration 0021 step 4.

**Remarks:** ⚠️ This **rewrites existing references**. They're display-only —
every link and foreign key uses the uuid — but anyone holding an old
`SPE-3F9A1C0B` will find it has changed. Doing it before launch is much cheaper
than after.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T14.1 | After migrating, open any existing sponsored event. | Ref reads `SPE-00001`-style, not hex. |  |
| T14.2 | Check campaigns, event listings and feedback reports. | `CMP-`, `EVT-`, `FB-` with the same 5-digit format. |  |
| T14.3 | Sort a few by creation date. | Reference order matches creation order. |  |
| T14.4 | Create a new campaign. | Gets the next number in sequence, and no unique-constraint error. |  |
| T14.5 | Create several in a row. | Numbers increment with no gaps or collisions. |  |

### 15 — Per-party terms at sign-up

**What changed:** Role-specific summary + required checkbox on sign-up step 2;
acceptance timestamp and version carried through `raw_user_meta_data` into
`profiles` by the updated `handle_new_user` trigger; per-party sections with
anchors on `/terms`.
**Files:** `lib/terms.ts`, `auth/sign-up/SignUpForm.tsx`, `auth/actions.ts`,
`(marketing)/terms/page.tsx`, `admin/users/[id]/page.tsx`, migration 0021 step 2.

**Remarks:** With email confirmation on there's no session immediately after
sign-up for the app to write with — hence routing the acceptance through the
sign-up metadata and the trigger rather than an app-side update. The summaries
describe how the platform actually behaves; the **full legal copy on `/terms`
is still placeholder** pending Sakshi's draft.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T15.1 | Sign up as a Brand. Reach step 2. | A "Terms for Brands & Sponsors" panel with bullets about budget commitment and the fee coming out of it. |  |
| T15.2 | Go back and switch to Audience. | Panel changes to "Terms for Audience Members" — one account per person, rewards after verification, etc. |  |
| T15.3 | Try to submit without ticking the box. | Blocked; the browser flags the required checkbox. |  |
| T15.4 | *(Server-side check)* Submit the form with the checkbox omitted entirely. | Error: "Please confirm you agree to the Terms & Conditions for your account type." No account created. |  |
| T15.5 | Click the "Terms & Conditions for …" link. | Opens `/terms` in a new tab, scrolled to that party's section. |  |
| T15.6 | Complete sign-up, then Admin → Users → that user. | "Terms accepted" tile shows the date and version (`v2026-07-12`). |  |
| T15.7 | Check an account created **before** this change. | Reads "Not recorded" rather than erroring. |  |

### 16 — CSV date formatting

**What changed:** `csvDateTime` / `csvDate` helpers in the participants export.
**Files:** `admin/participants/export/route.ts`.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T16.1 | Admin → Participants → Export CSV. Open in Excel/Sheets. | "Registered at" and "Attendance confirmed at" read `03/08/2026 21:39`, not a raw ISO timestamp. |  |
| T16.2 | Check the "Event date" column. | `03/08/2026` — date only, no time. |  |
| T16.3 | Let the spreadsheet auto-detect column types. | The date columns are recognised as dates and sort correctly. |  |
| T16.4 | Check a participant with no verification yet. | Blank cell, not "Invalid Date". |  |
| T16.5 | Export with a status filter active. | The filter is still honoured. |  |

### 17 — Budget / VAT deduction ⭐ (the platform-wide bug)

**What changed:** `netSponsorshipBudget()` is now the single source of truth.
Both creation paths seed `remaining_budget_gbp` from it; the drawdown rounds to
pence; every display distinguishes gross from net. Existing rows recomputed.
**Files:** `lib/constants.ts`, `dashboard/sponsored/actions.ts`,
`admin/marketplace-actions.ts`, `admin/actions.ts`, `sponsored/[id]/page.tsx`,
`SponsoredEventForm.tsx`, `sponsored/page.tsx`, `offers/page.tsx`,
`events/page.tsx`, `BrandHome.tsx`, `admin/events/*`, migration 0021 step 5.

**Remarks:** Fee model unchanged — the greater of £315 or 9% of gross, plus 20%
VAT. On a £5,000 budget: fee ex VAT £450, inc VAT £540, **available for rewards
£4,460**. Use those numbers for the arithmetic checks below.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T17.1 | Create a sponsored event with a £5,000 budget. | The live breakdown under the budget field reads fee £540 inc. VAT, £4,460 for rewards. |  |
| T17.2 | Open that event. | Five tiles: Budget (gross) £5,000 · Service fee £540 · Available for rewards £4,460 · People this can sponsor · Participation deadline. |  |
| T17.3 | With a £25 ticket price on the linked listing, check "People this can sponsor". | 178 (£4,460 ÷ £25), **not** 200. |  |
| T17.4 | Admin releases a £50 reward on that event. | Available for rewards drops to £4,410. |  |
| T17.5 | Release an odd amount like £33.33. | Remaining is exact to the penny — no floating-point drift like £4,376.669999. |  |
| T17.6 | Brand dashboard → Overview. | Tile reads "Available for rewards" and sums the net figures. |  |
| T17.7 | Sponsored events list, Sponsor offers, My events lists. | All read "£X for rewards" / "available for rewards" — none quote a bare gross "Budget". |  |
| T17.8 | Check an event that existed **before** the migration. | Its remaining budget is now net-of-fee, less anything already released — not reset, and not still gross. |  |
| T17.9 | Admin → the same event. | Tiles read "Budget (gross)" and "Available for rewards". |  |
| T17.10 | Admin edits the budget to £10,000. | Available for rewards becomes £8,920 minus anything already released. |  |
| T17.11 | Admin matches a campaign to a listing (the other creation path). | The resulting event's remaining budget is net, not gross. |  |

### 18 — Password reset (pre-existing — verify only)

**Remarks:** Reported in the meeting as missing, but `/auth/forgot-password`
and `/auth/reset-password` already exist and work. Supabase's own default link
expiry applies (one hour, single use) — check it in
**Supabase → Authentication → Email templates / URL configuration** if you want
to confirm the setting rather than the behaviour.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T18.1 | Sign-in page → "Forgot password". | Reaches the request form. |  |
| T18.2 | Submit a real address. | Neutral message that doesn't confirm whether the account exists. |  |
| T18.3 | Submit an address with no account. | The **same** message — no account enumeration. |  |
| T18.4 | Follow the emailed link. | Reset page with password + confirm fields. |  |
| T18.5 | Enter two different passwords. | "Those passwords don't match." |  |
| T18.6 | Enter a 7-character password. | "Your password must be at least 8 characters." |  |
| T18.7 | Set a valid password. | Signed in and redirected to the dashboard; the new password works on a fresh sign-in. |  |
| T18.8 | Re-use the same reset link a second time. | Refused as expired/already used. |  |

### 19 — Phone uniqueness

**What changed:** `phone_digits()` / `phone_in_use()` in the database, called
from all four onboarding save actions; four partial unique indexes as a
backstop.
**Files:** `onboarding/actions.ts`, migration 0021 step 3.

**Remarks:** Numbers are compared on their **last 10 digits**, so
"+44 7700 900123", "07700900123" and "7700900123" all collide — which is the
intent. Two things to be aware of:
- ⚠️ It spans **all four** role tables, including a brand's manager phone. An
  agency managing two brand accounts from one number would be blocked. Say the
  word and I'll narrow it to audience accounts only.
- If your database already contains duplicates, migration 0021 raises a
  `NOTICE` and **skips** that index rather than failing the whole migration.
  The application-level check still applies; create the index by hand once the
  duplicates are cleaned up.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T19.1 | Complete audience onboarding with `+44 7700 900123`. | Saves. |  |
| T19.2 | On a second audience account, enter the same number. | Rejected: "That phone number is already registered to another account." |  |
| T19.3 | On that second account, enter `07700900123` (trunk zero, no country code). | Also rejected — same number in a different format. |  |
| T19.4 | Watch the migration output when applying 0021. | Either no notice, or a clear "Skipped … duplicate phone numbers" naming the table. Record which. |  |
| T19.5 | Re-save the **first** account's profile without changing the number. | Saves fine — it doesn't collide with itself. |  |
| T19.6 | Use the same number on an **artist** account. | Rejected — uniqueness is cross-table. |  |
| T19.7 | Enter a distinct number on the second account. | Saves. |  |

### 20 — "Either side can create this" instructions

**What changed:** Explanatory card at the top of the sponsored-event creation
form, worded differently for a brand and for an artist.
**Files:** `dashboard/sponsored/new/page.tsx`.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T20.1 | As a brand, Sponsored events → create. | Card: "Either side can start this", explaining the other party reviews and both must agree. |  |
| T20.2 | As an artist, same page. | Same card, with the second paragraph pointing at choosing the brand's campaign brief. |  |
| T20.3 | Read the closing line. | Notes that terms lock on confirmation and only the team can change them afterwards. |  |

---

## 3. Regression checks after the migrations

Worth running once, because 0021 touches existing rows and RLS.

| ID | Steps | Expected | Result |
|---|---|---|---|
| R1 | Sign in as each of brand / artist / event / audience / admin. | All dashboards load; sidebar nav is unchanged per role. |  |
| R2 | Audience → Discover events. | Confirmed and completed sponsored events still listed. Withdrawn ones do **not** appear. |  |
| R3 | Register for an event as audience. | Works; lands on My events with the confirmation banner. |  |
| R4 | Brand ↔ artist Messages. | Threads load and send. |  |
| R5 | Admin → Users list, filters and CSV. | Load without error (the new `profiles` policy sits alongside the old one, it doesn't replace it). |  |
| R6 | Public marketing pages (`/`, `/about`, `/events`, `/terms`). | Load; `/terms` now has per-party sections. |  |
| R7 | Attendance QR check-in at `/attend/[token]`. | Still confirms attendance. |  |
| R8 | Admin → Notifications setup. | The new `sponsorship.withdrawn` event appears in the catalogue with its templates. |  |
| R9 | `npm run typecheck && npm run build`. | Both pass. |  |

---

## 4. Still open

| Item | Blocked on |
|---|---|
| Location / GPS verification on QR scan (5 km radius, event coordinates) | Your input: Google Maps API key, whether the radius is fixed or per-event, and where organisers capture event coordinates. Also needs a UX decision for attendees who deny location permission. |
| Branded email templates (logo, fonts) | You asked to plan this separately. |
| Full legal copy on `/terms` | Sakshi's drafting task. Item 15 ships the per-party summaries and the agreement mechanism; the long-form sections are still placeholder. |
| Narrowing phone uniqueness to audience accounts only | Your call — see the remark under item 19. |
