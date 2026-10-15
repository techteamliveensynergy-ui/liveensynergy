# 14 Oct standup — agreed plan

Source: Daily Standup 14 Oct 2026 (Gemini notes) plus Ketan's follow-up on
15 Oct. Three pieces of work, in build order.

## Status (15 Oct)

| Part | Built | Migration | Still needed |
|---|---|---|---|
| 1. Upcoming → Open | ✅ | `0070_campaign_opening.sql` — **applied 15 Oct** | Deploy |
| 2. Skip logic | ✅ | `0071_survey_skip_logic.sql` — **applied 15 Oct** | Deploy |
| 3. Analysis playground | ✅ (figures, charts, PDF, Word) | `0072_analysis_reports.sql` — **applied 15 Oct** | Deploy; `OPENAI_API_KEY` in Vercel for the write-up; privacy wording; Google Docs button (OAuth) later |

What changed from the first draft below:
- The open/close switch lives on the **campaign** (`campaigns.opens_at`), not
  the sponsored event — surveys belong to campaigns, and public surveys
  (Fire X, Northwave) run before any event is agreed.
- Only **pre-event** surveys are gated. Post-event surveys are answered by
  people already registered, and closing registration after the event must
  not stop their feedback.
- No "notify me when it opens" yet (needs a scheduled job for timed openings).
- Google Docs: download the .docx and open it in Drive with Google Docs; a
  one-click button needs a Google Cloud OAuth client.

---

## 1. Upcoming → Open: events are visible on payment, not joinable

**Decision.** Once the brand has paid, the campaign's event shows publicly as
**Upcoming** with all its details (date, time, venue, artist, brand). Nobody
can **register** or **take a survey** until the team opens it. The team opens
it once the discount codes are confirmed and the pre/post surveys are final —
and, per Sakshi, typically timed to the social-media promotion, so possibly
weeks later.

**Why a manual switch and not automatic.** "Codes confirmed + survey
published" is already what the derived **Live** badge means
(`src/lib/campaign-stage.ts`). That is the *earliest* it may open, not when it
should: the team wants a gap for promotion. So readiness is automatic, opening
is a deliberate admin action.

**Note.** Before an event is agreed (stage *Needs matching*) there is no event
to show. "Upcoming" starts when the sponsored event exists and its campaign is
paid.

### Data (migration 0070)
- `sponsored_events.opens_at timestamptz null` — null = not open yet. A future
  value = scheduled opening ("opens 1 Nov 09:00").
- `sponsored_events.opened_by uuid null` for the audit trail.
- `admin_open_sponsored_event(p_id, p_opens_at default now())` — admin-only;
  refuses unless codes are confirmed and a pre-event survey for the campaign is
  published, unless the admin gives a written override reason (e.g. a campaign
  with no survey). `admin_close_registrations(p_id)` to undo.
- **Enforced in Postgres, not just hidden in the UI:**
  - `BEFORE INSERT` trigger on `participations`: refuse when the sponsored
    event's `opens_at` is null or in the future (`REGISTRATION_NOT_OPEN`).
  - `submit_survey_response` / `submit_public_survey_response`: refuse when the
    template's campaign has no open event (`SURVEY_NOT_OPEN`) — same pattern as
    `SURVEY_CLOSED` from 0056.
  - **Backfill:** every sponsored event already running (codes confirmed, or
    has participants or responses) gets `opens_at = created_at`, so nothing
    live today closes (L4).

### App
- Badge: new stage **Ready to open** between *Awaiting survey* and **Live**;
  **Live** now means `opens_at <= now()`. The brand checklist gets a last step
  "Registrations open" with the date.
- Admin sponsored-event page: checklist (paid / codes / survey) and
  **Open now**, **Schedule opening…**, **Close registrations**.
- Audience pages (`/dashboard/discover`, `/dashboard/discover/[id]`, public
  survey link, QR attend page): Upcoming events show their details plus
  "Registration opens soon" (or "Opens 1 Nov") in place of Register / Take the
  survey. A direct survey link shows a polite "not open yet" page, not an error.
- Optional "Notify me when it opens" → stores interest, emails on opening
  (new notification key `event.registrations_open`, seeded in the migration).
- Brand and artist are notified when it opens.

---

## 2. Survey skip logic (branching inside one survey)

**Decision.** Skip logic in a single survey, not chained forms — one response,
one quality score, one results page, one response cap.

### How it works for the respondent
Each question can carry rules: *if the answer is X → go to question N* (or
*end of survey*). With no matching rule, carry on to the next question. Two
paths re-join by both jumping to the same later question:

```
Q1 Have you been to one of our events?
   Yes → Q2   No → Q5
Q2–Q4  (returning-visitor path)  → Q8
Q5–Q7  (first-timer path)        → Q8
Q8 onward: everyone
```

Rules apply to single choice, yes/no, dropdown, scale (ranges, e.g. 1–3 / 4–5)
and multiple choice ("includes X"). Text and number questions just continue.

### Data (same migration or 0071)
- Stored in `survey_questions.config.logic`:
  `[{ "when": { "op": "equals" | "includes" | "between", "value": … }, "goto": "<question id>" | "end" }]`.
  No new table. Jumps can only go **forward** (no loops), checked on save.
- `submit_survey_response` / `submit_public_survey_response` re-walk the path
  from the submitted answers: questions off the path are **not required**, and
  answers sent for them are **rejected**, so the raw SDK can't fill skipped
  questions. Quality scoring ignores attention checks the respondent never saw.
- Results: each question's "n" is the people who saw it ("answered by 42 of
  120 — shown to returning visitors only").

### Builder
- Question inspector gets a **Logic** tab: per option, "go to ▾" (later
  questions + End).
- Canvas shows a small "↳ jumps to Q8" marker; a reorder that would make a jump
  point backwards is flagged.
- Preview follows the logic, so the team can click through each path.

---

## 3. AI survey analysis playground (OpenAI)

**Decision.** A separate page, outside the live survey pipeline, so heavy AI
work never slows the app.

### Flow
1. Admin opens **Admin → Analysis playground**.
2. Picks the **campaign** (brand and event fill in from it). This context goes
   to the model so it knows what event, for which brand, which audience.
3. Uploads an **anonymised CSV** (the platform's own export, or one from
   elsewhere). Columns that look personal (email, phone, name, IP) are detected
   and dropped before anything is sent; the admin sees what was dropped.
4. Optional extra instructions. Our **system prompt** lives server-side.
5. The report renders on the page: written analysis with embedded charts and
   tables, some interactive (hover, filter).
6. **Download**: PDF, Word (.docx), or **Open in Google Docs**.

### Design points
- **Numbers are computed by us, not the model.** We aggregate the CSV (counts,
  %, averages, cross-tabs) in code. The model receives those figures, a sample
  of free-text answers and the campaign context, and returns structured JSON:
  sections of text plus chart specs that reference *our* figures. Charts are
  drawn from our data so they can't be made up, and token cost stays small
  however big the CSV is.
- Reports are saved (`analysis_reports`, admin-only) so they can be reopened
  and re-exported.
- Limits: CSV ≤ 5 MB, per-admin rate limit via `rate_limit_hit()`, request
  well inside Vercel's 300 s function limit.
- Exports: PDF and .docx generated server-side. **Google Docs** = upload the
  .docx to the user's Drive with conversion (Google sign-in, `drive.file` scope
  only — it sees just the files it created). Needs a Google Cloud OAuth client;
  until then the button is hidden and .docx → "Open with Google Docs" works by
  hand.
- Admin-only first. Sharing a finished report read-only with the brand (their
  Reporting & Analysis module) is a follow-up.

### Needed before build
- `OPENAI_API_KEY` in Vercel, and which model (default: current flagship).
- Sakshi's privacy-policy wording / OpenAI terms link — respondent data leaves
  the platform, so the policy must cover it before this goes live.
- A Google Cloud OAuth client (only for the Google Docs button).

---

## Still open / waiting
- Turnstile keys + `SURVEY_IP_SALT` in Vercel — surveys refuse submissions in
  production until set.
- The small survey-campaign fixes from the meeting — list not recorded; to come.
- Further emails and fixes Ketan is sending separately.
